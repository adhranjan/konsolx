import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { WebSocket } from "ws";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { OSInterface, SpawnShellOptions } from "./os-interface.js";

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
  for (const pid of stale) { try { process.kill(pid, "SIGKILL"); } catch {} }
  fs.unlink(SHELL_PIDS_FILE, () => {});
}
// ────────────────────────────────────────────────────────────────────────────

export interface TerminalSession {
  sessionId:   string;
  shell:       ChildProcessWithoutNullStreams;
  pid:         number;
  cwd:         string;
  clients:     Set<WebSocket>;
  buffer:      string;
  // Display metadata — set by the frontend, returned on GET /api/terminals
  title?:      string;
  groupName?:  string;
  groupColor?: string;
  envId?:      string;
  vars:        Record<string, string>;  // ad-hoc per-terminal overrides
  sortOrder?:  number;
}

const BUFFER_MAX = 50_000;

export const sessions = new Map<string, TerminalSession>();

// ── Process tree helpers ─────────────────────────────────────────────────────
const getChildPids = (pid: number): Promise<number[]> =>
  new Promise(resolve => {
    const p = spawn("ps", ["-o", "pid=", "--ppid", String(pid)]);
    let out = "";
    p.stdout.on("data", d => out += d.toString());
    p.on("close", () => resolve(out.trim().split("\n").filter(Boolean).map(Number)));
    p.on("error", () => resolve([]));
  });

const SHELL_NAMES = new Set(["bash", "zsh", "sh", "fish", "ksh", "dash"]);

const getComm = (pid: number): Promise<string> =>
  new Promise(resolve => {
    const p = spawn("ps", ["-o", "comm=", "-p", String(pid)]);
    let out = "";
    p.stdout.on("data", d => out += d.toString());
    p.on("close", () => resolve(out.trim()));
    p.on("error", () => resolve(""));
  });

export const findInteractiveShell = async (rootPid: number, depth = 0): Promise<number | null> => {
  if (depth > 10) return null;
  const children = await getChildPids(rootPid);
  for (const child of children) {
    const found = await findInteractiveShell(child, depth + 1);
    if (found) return found;
  }
  const comm = await getComm(rootPid);
  return SHELL_NAMES.has(comm) ? rootPid : null;
};

export const isBusy = async (sessionId: string): Promise<boolean> => {
  const session = sessions.get(sessionId);
  if (!session) return false;
  const shellPid = await findInteractiveShell(session.pid);
  if (!shellPid) return false;
  const children = await getChildPids(shellPid);
  return children.length > 0;
};
// ────────────────────────────────────────────────────────────────────────────

export interface CreateSessionOptions extends SpawnShellOptions {
  title?:      string;
  groupName?:  string;
  groupColor?: string;
  envId?:      string;
  vars?:       Record<string, string>;
  sortOrder?:  number;
}

export function createSession(opts: CreateSessionOptions): TerminalSession {
  const sessionId = crypto.randomUUID();
  const shell     = OSInterface.spawnShell(opts);

  if (!shell.pid) throw new Error("Failed to spawn shell — no PID assigned");

  const session: TerminalSession = {
    sessionId,
    shell,
    pid:        shell.pid,
    cwd:        opts.cwd ?? process.cwd(),
    clients:    new Set(),
    buffer:     "",
    title:      opts.title,
    groupName:  opts.groupName,
    groupColor: opts.groupColor,
    envId:      opts.envId,
    vars:       opts.vars ?? {},
    sortOrder:  opts.sortOrder,
  };

  sessions.set(sessionId, session);
  trackedPids.add(shell.pid);
  flushPids();

  shell.stdout.on("data", (data: Buffer) => {
    const text = data.toString();
    session.buffer += text;
    if (session.buffer.length > BUFFER_MAX) session.buffer = session.buffer.slice(-BUFFER_MAX);
    broadcast(session, { type: "output", data: text });
  });

  shell.stderr.on("data", (data: Buffer) => {
    const text = data.toString();
    session.buffer += text;
    if (session.buffer.length > BUFFER_MAX) session.buffer = session.buffer.slice(-BUFFER_MAX);
    broadcast(session, { type: "output", data: text });
  });

  shell.on("exit", (code) => {
    let msg = "\r\n[Terminal session ended]\r\n";
    if (code === 127) msg += "[Error: Command not found]\r\n";
    if (code === 126) msg += "[Error: Permission denied]\r\n";
    broadcast(session, { type: "exit", code, message: msg });
    // Close all attached WebSockets — cleanup handled by their close handlers
    for (const ws of session.clients) ws.close();
    deleteSession(sessionId);
  });

  shell.on("error", (err: any) => {
    broadcast(session, { type: "output", data: `\r\n[Error: ${err.message}]\r\n` });
  });

  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;

  sessions.delete(sessionId);
  trackedPids.delete(session.pid);
  flushPids();

  const pid = session.pid;

  // Collect full tree first, then kill — avoids re-parenting to init hiding grandchildren
  const collectTree = async (rootPid: number): Promise<number[]> => {
    const children = await getChildPids(rootPid);
    const subtrees = await Promise.all(children.map(collectTree));
    return [rootPid, ...subtrees.flat()];
  };

  try {
    const allPids = await collectTree(pid);
    for (const p of [...allPids].reverse()) { try { process.kill(p, "SIGKILL"); } catch {} }

    // Also kill by process group in case any child escaped the tree
    const pgid = await new Promise<number>(resolve => {
      const p = spawn("ps", ["-o", "pgid=", "-p", String(pid)]);
      let out = "";
      p.stdout.on("data", d => out += d.toString());
      p.on("close", () => resolve(Number(out.trim()) || 0));
      p.on("error", () => resolve(0));
    });
    if (pgid > 1) { try { process.kill(-pgid, "SIGKILL"); } catch {} }
  } catch {
    try { process.kill(pid, "SIGKILL"); } catch {}
  }
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
