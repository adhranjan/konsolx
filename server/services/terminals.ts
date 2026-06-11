import path from "path";
import {
  sessions,
  createSession,
  deleteSession,
  attachClient,
  detachClient,
  isBusy,
  TerminalSession,
} from "../sessions.js";
import { environmentDb } from "../database/environments.js";
import { terminalSessionDb } from "../database/terminal-sessions.js";
import { settingsDb } from "../database/settings.js";
import { getDialect } from "../shell/index.js";

export interface TerminalState {
  sessionId:   string;
  pid:         number;
  cwd:         string;
  clientCount: number;
  busy:        boolean;
  title?:      string;
  groupName?:  string;
  groupColor?: string;
  envId?:      string;
  vars:        Record<string, string>;
  pins:        { id: string; text: string; addedAt: number }[];
  groupOrder?: number;
  sortOrder?:  number;
}

export interface CreateTerminalOptions {
  cwd?:            string;
  shell?:          string;
  cols?:           number;
  rows?:           number;
  initialCommand?: string;
  title?:          string;
  groupName?:      string;
  groupColor?:     string;
  envId?:          string;
  vars?:           Record<string, string>;
  groupOrder?:     number;
  sortOrder?:      number;
}

export function updateTerminalMeta(sessionId: string, meta: Partial<Pick<TerminalState, 'title' | 'groupName' | 'groupColor' | 'envId' | 'sortOrder'>>): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (meta.title      !== undefined) session.title      = meta.title;
  if (meta.groupName  !== undefined) session.groupName  = meta.groupName;
  if (meta.groupColor !== undefined) session.groupColor = meta.groupColor;
  if (meta.envId      !== undefined) session.envId      = meta.envId;
  if (meta.sortOrder  !== undefined) session.sortOrder  = meta.sortOrder;
  terminalSessionDb.upsert(session);
  return true;
}

const toState = async (sessionId: string, s: typeof sessions extends Map<string, infer V> ? V : never): Promise<TerminalState> => ({
  sessionId,
  pid:         s.pid,
  cwd:         s.cwd,
  clientCount: s.clients.size,
  busy:        await isBusy(sessionId),
  title:       s.title,
  groupName:   s.groupName,
  groupColor:  s.groupColor,
  envId:       s.envId,
  vars:        s.vars,
  pins:        s.pins,
  groupOrder:  s.groupOrder,
  sortOrder:   s.sortOrder,
});

export async function listTerminals(): Promise<TerminalState[]> {
  const entries = [...sessions.entries()];
  const states  = await Promise.all(entries.map(([id, s]) => toState(id, s)));
  return states.sort((a, b) => {
    const go = (a.groupOrder ?? 0) - (b.groupOrder ?? 0);
    if (go !== 0) return go;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

export async function getTerminal(sessionId: string): Promise<TerminalState | null> {
  const s = sessions.get(sessionId);
  if (!s) return null;
  return toState(sessionId, s);
}

export function spawnTerminal(opts: CreateTerminalOptions): TerminalSession {
  // Resolve shell: explicit request → stored default → OS default (handled downstream)
  const shell = opts.shell || settingsDb.get("defaultShell") || undefined;
  const session = createSession({ ...opts, shell });

  sendSetupCommands(session, { ...opts, shell });

  return session;
}

/** Apply an env to the live shell — injects its vars and records it as the active env.
 *  Rejects if the shell is busy or if the sentinel echo isn't seen within 5s. */
export async function applyEnvToTerminal(sessionId: string, envId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  const env = environmentDb.list().find(e => e.id === envId);
  if (!env) throw new Error("Environment not found");

  // Refuse if a program is currently running
  if (await isBusy(sessionId)) throw new Error("Terminal is busy");

  const dialect = getDialect(session.shellName);
  const exports = env.variables
    .filter(v => v.key.trim())
    .map(({ key, value }) => dialect.exportVar(key, value))
    .join("\n");

  // Write exports + sentinel in one shot
  const SENTINEL = `__ENV_APPLIED_${Date.now()}__`;

  await new Promise<void>((resolve, reject) => {
    const TIMEOUT_MS = 5000;
    let buf = "";

    const disposable = session.shell.onData((chunk: string) => {
      buf += chunk;
      if (buf.includes(SENTINEL)) {
        disposable.dispose();
        clearTimeout(timer);
        resolve();
      }
    });

    const timer = setTimeout(() => {
      disposable.dispose();
      reject(new Error("Timed out waiting for shell confirmation"));
    }, TIMEOUT_MS);

    // Write exports (if any) then the sentinel echo
    if (exports) session.shell.write(`${exports}\n`);
    session.shell.write(`${dialect.echo(SENTINEL)}\n`);
  });

  session.envId = envId;
  terminalSessionDb.upsert(session);
}

/** Merge patch vars into the session — empty-string value removes the key. Injects into live shell. */
export function patchTerminalVars(sessionId: string, patch: Record<string, string>): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  // Merge: remove keys with empty value, set the rest
  const updated = { ...session.vars };
  for (const [key, value] of Object.entries(patch)) {
    if (value === "") delete updated[key];
    else updated[key] = value;
  }
  session.vars = updated;

  // Inject only the patched keys into the live shell
  const dialect = getDialect(session.shellName);
  const exports = Object.entries(patch)
    .filter(([key]) => key.trim())
    .map(([key, value]) => value === "" ? dialect.unsetVar(key) : dialect.exportVar(key, value))
    .join("\n");

  if (exports) session.shell.write(`${exports}\n`);
  terminalSessionDb.upsert(session);
}

export function patchPins(sessionId: string, pins: { id: string; text: string; addedAt: number }[]): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  session.pins = pins;
  terminalSessionDb.upsert(session);
}

export async function killAllTerminals(): Promise<void> {
  const ids = [...sessions.keys()];
  await Promise.all(ids.map(id => deleteSession(id)));
  terminalSessionDb.deleteAll();
}

export { deleteSession as killTerminal, attachClient, detachClient };

// ── Internal ─────────────────────────────────────────────────────────────────

function sendSetupCommands(session: TerminalSession, opts: CreateTerminalOptions): void {
  const { cwd, envId, vars, initialCommand } = opts;
  const dialect = getDialect(session.shellName);

  // 1. Resolve envId vars from DB
  let envExports = "";
  if (envId) {
    const env = environmentDb.list().find(e => e.id === envId);
    if (env) {
      envExports = env.variables
        .filter(v => v.key.trim())
        .map(({ key, value }) => dialect.exportVar(key, value))
        .join("\n");
    }
  }

  // 2. vars override envId (injected after)
  const varExports = vars && Object.keys(vars).length > 0
    ? Object.entries(vars)
        .filter(([key]) => key.trim())
        .map(([key, value]) => dialect.exportVar(key, value))
        .join("\n")
    : "";

  const hasSetup = envExports || varExports || (cwd && path.isAbsolute(cwd)) || initialCommand;
  if (!hasSetup) return;

  let promptDetected = false;
  let buf = "";

  const writeSetup = () => {
    if (envExports) session.shell.write(`${envExports}\n`);
    if (varExports) session.shell.write(`${varExports}\n`);
    if (cwd && path.isAbsolute(cwd)) session.shell.write(`${dialect.changeDir(cwd)}\n`);
    if (initialCommand) session.shell.write(`${initialCommand}\n`);
  };

  // Watch the pty output until the shell prompt appears, then inject setup
  const disposable = session.shell.onData((chunk: string) => {
    if (promptDetected) return;
    buf += chunk;
    if (buf.length > 512) buf = buf.slice(-512);
    if (!dialect.promptPattern.test(buf)) return;
    promptDetected = true;
    disposable.dispose();
    writeSetup();
  });

  // Fallback: send anyway after 5s if the prompt was never detected
  setTimeout(() => {
    if (promptDetected) return;
    promptDetected = true;
    disposable.dispose();
    writeSetup();
  }, 5000);
}
