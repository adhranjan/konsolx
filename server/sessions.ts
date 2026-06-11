import { WebSocket } from "ws";
import type { IPty } from "node-pty";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { OS, SpawnShellOptions, SHELL_NAMES } from "./os/index.js";
import { terminalSessionDb } from "./database/terminal-sessions.js";

// ── Stale PID tracking ───────────────────────────────────────────────────────
// PIDs are written to DATA_DIR/shell_pids.json so they survive a Docker restart.
// On startup we kill anything left from the previous run.
const dataDir = process.env.DATA_DIR || ".";
const SHELL_PIDS_FILE = path.join(dataDir, "shell_pids.json");

const readTrackedPids = (): number[] => {
  try { return JSON.parse(fs.readFileSync(SHELL_PIDS_FILE, "utf8")); }
  catch { return []; }
};

const trackedPids = new Set<number>();

const flushPids = () => {
  try { fs.writeFileSync(SHELL_PIDS_FILE, JSON.stringify([...trackedPids])); }
  catch {}
};

// Kill stale shells from previous run on module load
const stale = readTrackedPids();
if (stale.length > 0) {
  console.log(`[sessions] Cleaning up ${stale.length} stale shell(s) from previous run...`);
  for (const pid of stale) OS.killProcess(pid);
  fs.unlink(SHELL_PIDS_FILE, () => {});
}
// ────────────────────────────────────────────────────────────────────────────

export interface TerminalSession {
  sessionId:   string;
  shell:       IPty;
  shellName:   string;   // resolved shell (e.g. "bash", "pwsh") — picks the dialect
  pid:         number;
  cwd:         string;
  clients:     Set<WebSocket>;
  buffer:      string;
  // Display metadata — set by the frontend, returned on GET /api/terminals
  title?:      string;
  groupName?:  string;
  groupColor?: string;
  envId?:      string;
  vars:        Record<string, string>;
  pins:        { id: string; text: string; addedAt: number }[];
  groupOrder?: number;
  sortOrder?:  number;
}

const BUFFER_MAX = 50_000;

export const sessions = new Map<string, TerminalSession>();

// ── Process tree helpers (delegate OS-specifics to the OS layer) ──────────────
export const findInteractiveShell = async (rootPid: number, depth = 0): Promise<number | null> => {
  if (depth > 10) return null;
  const children = await OS.getChildPids(rootPid);
  for (const child of children) {
    const found = await findInteractiveShell(child, depth + 1);
    if (found) return found;
  }
  const comm = await OS.getComm(rootPid);
  return SHELL_NAMES.has(comm) ? rootPid : null;
};

export const isBusy = async (sessionId: string): Promise<boolean> => {
  const session = sessions.get(sessionId);
  if (!session) return false;
  const shellPid = await findInteractiveShell(session.pid);
  if (!shellPid) return false;
  const children = await OS.getChildPids(shellPid);
  return children.length > 0;
};
// ────────────────────────────────────────────────────────────────────────────

export interface CreateSessionOptions extends SpawnShellOptions {
  title?:      string;
  groupName?:  string;
  groupColor?: string;
  envId?:      string;
  vars?:       Record<string, string>;
  groupOrder?: number;
  sortOrder?:  number;
}

export function createSession(opts: CreateSessionOptions): TerminalSession {
  const sessionId = crypto.randomUUID();
  const shellName = opts.shell ?? OS.defaultShell;
  const shell     = OS.spawnShell({ ...opts, shell: shellName });

  if (!shell.pid) throw new Error("Failed to spawn shell — no PID assigned");

  const session: TerminalSession = {
    sessionId,
    shell,
    shellName,
    pid:        shell.pid,
    cwd:        opts.cwd ?? process.cwd(),
    clients:    new Set(),
    buffer:     "",
    title:      opts.title,
    groupName:  opts.groupName,
    groupColor: opts.groupColor,
    envId:      opts.envId,
    vars:       opts.vars ?? {},
    pins:       [],
    groupOrder: opts.groupOrder,
    sortOrder:  opts.sortOrder,
  };

  sessions.set(sessionId, session);
  trackedPids.add(shell.pid);
  flushPids();
  terminalSessionDb.upsert(session);

  // node-pty merges stdout+stderr into a single onData stream
  shell.onData((text: string) => {
    session.buffer += text;
    if (session.buffer.length > BUFFER_MAX) session.buffer = session.buffer.slice(-BUFFER_MAX);
    broadcast(session, { type: "output", data: text });
  });

  shell.onExit(({ exitCode }) => {
    let msg = "\r\n[Terminal session ended]\r\n";
    if (exitCode === 127) msg += "[Error: Command not found]\r\n";
    if (exitCode === 126) msg += "[Error: Permission denied]\r\n";
    broadcast(session, { type: "exit", code: exitCode, message: msg });
    for (const ws of session.clients) ws.close();
    deleteSession(sessionId);
  });

  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;

  sessions.delete(sessionId);
  trackedPids.delete(session.pid);
  flushPids();
  terminalSessionDb.delete(sessionId);

  // Kill the whole subtree — platform-specific strategy lives in the OS layer.
  await OS.killProcessTree(session.pid);
}

export function broadcast(session: TerminalSession, msg: object): void {
  const str = JSON.stringify(msg);
  for (const ws of session.clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(str);
  }
}

export function attachClient(sessionId: string, ws: WebSocket): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.clients.add(ws);
  // Replay buffer so the new tab isn't blank
  if (session.buffer && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "output", data: session.buffer }));
  }
  return true;
}

export function detachClient(sessionId: string, ws: WebSocket): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.clients.delete(ws);
  // Sessions persist even with no connected clients — explicit kill required
}
