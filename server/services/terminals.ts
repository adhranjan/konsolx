import path from "path";
import { OSInterface } from "../os-interface.js";
import {
  sessions,
  createSession,
  deleteSession,
  attachClient,
  detachClient,
  isBusy,
  TerminalSession,
} from "../sessions.js";

export interface TerminalState {
  sessionId:   string;
  pid:         number;
  cwd:         string;
  clientCount: number;
  busy:        boolean;
}

export interface CreateTerminalOptions {
  cwd?:            string;
  env?:            Record<string, string>;
  shell?:          string;
  cols?:           number;
  rows?:           number;
  initialCommand?: string;
}

export async function listTerminals(): Promise<TerminalState[]> {
  return Promise.all(
    [...sessions.entries()].map(async ([sessionId, s]) => ({
      sessionId,
      pid:         s.pid,
      cwd:         s.cwd,
      clientCount: s.clients.size,
      busy:        await isBusy(sessionId),
    }))
  );
}

export async function getTerminal(sessionId: string): Promise<TerminalState | null> {
  const s = sessions.get(sessionId);
  if (!s) return null;
  return {
    sessionId,
    pid:         s.pid,
    cwd:         s.cwd,
    clientCount: s.clients.size,
    busy:        await isBusy(sessionId),
  };
}

export function spawnTerminal(opts: CreateTerminalOptions): TerminalSession {
  const session = createSession(opts);

  // Warnings + connected banner
  const { useSshShell, useHostShell, hostUser } = OSInterface;
  if ((useHostShell || useSshShell) && !hostUser) {
    session.shell.stdout.emit("data", Buffer.from(
      "\x1b[1;33m[Warning: HOST_USER not set — running as root. " +
      "Start with: HOST_USER=$(whoami) docker compose up -d]\x1b[0m\r\n"
    ));
  }
  if (useHostShell || useSshShell) {
    const label = useSshShell ? "Connected via SSH to Mac Host" : "Connected to Host Shell";
    session.shell.stdout.emit("data", Buffer.from(`\x1b[1;32m[${label}]\x1b[0m\r\n`));
  }

  // Send setup commands once the prompt appears
  sendSetupCommands(session, opts);

  return session;
}

export { deleteSession as killTerminal, attachClient, detachClient };

// ── Internal ─────────────────────────────────────────────────────────────────

function sendSetupCommands(session: TerminalSession, opts: CreateTerminalOptions): void {
  const { cwd, env, initialCommand } = opts;
  const hasSetup = (env && Object.keys(env).length > 0) || (cwd && path.isAbsolute(cwd)) || initialCommand;
  if (!hasSetup) return;

  let promptDetected = false;
  const PROMPT_RE = /[\$#%>]\s*$/m;
  let buf = "";

  const onPrompt = () => {
    if (!session.shell.stdin.writable) return;
    if (env && Object.keys(env).length > 0) {
      const exports = Object.entries(env).map(([k, v]) => `export ${k}=${JSON.stringify(v)}`).join("\n");
      session.shell.stdin.write(`${exports}\n`);
    }
    if (cwd && path.isAbsolute(cwd)) session.shell.stdin.write(`cd "${cwd}"\n`);
    if (initialCommand) session.shell.stdin.write(`${initialCommand}\n`);
  };

  const waitForPrompt = (chunk: Buffer) => {
    if (promptDetected) return;
    buf += chunk.toString();
    if (buf.length > 512) buf = buf.slice(-512);
    if (!PROMPT_RE.test(buf)) return;
    promptDetected = true;
    onPrompt();
  };

  session.shell.stdout.once("data", function listen(chunk) {
    waitForPrompt(chunk);
    if (!promptDetected) session.shell.stdout.once("data", listen);
  });

  // Fallback: send anyway after 5s if prompt never detected
  setTimeout(() => {
    if (!promptDetected && session.shell.stdin.writable) {
      promptDetected = true;
      if (cwd && path.isAbsolute(cwd)) session.shell.stdin.write(`cd "${cwd}"\n`);
      if (initialCommand) session.shell.stdin.write(`${initialCommand}\n`);
    }
  }, 5000);
}
