import { execFileSync } from "child_process";
import { db } from "../database/index.js";
import { sessions, findInteractiveShell } from "../sessions.js";
import { OS } from "../os/index.js";

// ── Secret scrubbing ──────────────────────────────────────────────────────────
// If a typed command looks like it carries a credential, we DROP it entirely —
// better to lose a suggestion than to persist a secret to disk.
const SECRET_PATTERNS: RegExp[] = [
  /\b(password|passwd|secret|token|apikey|api[-_]?key|access[-_]?key|private[-_]?key|bearer|credential)\b/i,
  /-p\S/,                              // mysql -psecret
  /--password[=\s]/i,
  /\bexport\s+\w*(KEY|TOKEN|SECRET|PASS|PWD|CRED)\w*=/i,
  /Authorization:\s*\S/i,
  /\b[A-Za-z0-9_]*(SECRET|TOKEN|PASSWORD|APIKEY)[A-Za-z0-9_]*=\S/i,
  /\bAKIA[0-9A-Z]{16}\b/,             // AWS access key id
  /eyJ[A-Za-z0-9_-]{10,}\./,         // JWT
];

function looksLikeSecret(cmd: string): boolean {
  return SECRET_PATTERNS.some(re => re.test(cmd));
}

// ── Project key resolution (live, server-side, cross-platform) ────────────────
// Find the interactive shell, read its live cwd via the OS layer, then resolve
// the git root (or fall back to the cwd / the session's initial cwd).
async function resolveProjectKey(sessionId: string): Promise<string | null> {
  const session = sessions.get(sessionId);
  if (!session) return null;
  try {
    const shellPid = (await findInteractiveShell(session.pid)) ?? session.pid;
    const cwd = await OS.getProcessCwd(shellPid);
    if (!cwd) return session.cwd;
    try {
      const root = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
        encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      return root || cwd;
    } catch {
      return cwd;   // not a git repo
    }
  } catch {
    return session.cwd;
  }
}

// ── Per-session last command (in memory) for sequence edges ────────────────────
const lastCommand = new Map<string, string>();

// ── Record a typed command ────────────────────────────────────────────────────
export async function recordCommand(sessionId: string, raw: string): Promise<void> {
  const command = raw.trim();
  if (!command) return;
  if (command.length < 2 || command.length > 500) return;
  if (looksLikeSecret(command)) return;          // drop credentials, never store

  const project = await resolveProjectKey(sessionId);
  if (!project) return;

  const now = Date.now();

  db.prepare(`
    INSERT INTO command_history (project, command, count, last_used)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(project, command) DO UPDATE SET count = count + 1, last_used = ?
  `).run(project, command, now, now);

  const prev = lastCommand.get(sessionId);
  if (prev && prev !== command) {
    db.prepare(`
      INSERT INTO command_sequences (project, prev, next, count, last_used)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(project, prev, next) DO UPDATE SET count = count + 1, last_used = ?
    `).run(project, prev, command, now, now);
  }
  lastCommand.set(sessionId, command);
}

// ── Fetch the suggestion dataset for a session's current project ───────────────
export interface SuggestionData {
  project:   string;
  lastCommand: string | null;
  commands:  { command: string; count: number; lastUsed: number }[];
  sequences: { prev: string; next: string; count: number }[];
}

export async function getSuggestions(sessionId: string): Promise<SuggestionData> {
  const project = (await resolveProjectKey(sessionId)) ?? "";
  const commands = db.prepare(
    "SELECT command, count, last_used as lastUsed FROM command_history WHERE project = ? ORDER BY last_used DESC LIMIT 500"
  ).all(project) as any[];
  const sequences = db.prepare(
    "SELECT prev, next, count FROM command_sequences WHERE project = ? ORDER BY count DESC LIMIT 500"
  ).all(project) as any[];
  return { project, lastCommand: lastCommand.get(sessionId) ?? null, commands, sequences };
}

export function clearCommandHistory(): void {
  db.prepare("DELETE FROM command_history").run();
  db.prepare("DELETE FROM command_sequences").run();
  lastCommand.clear();
}
