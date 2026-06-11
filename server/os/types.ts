import type { IPty } from "node-pty";

export interface SpawnShellOptions {
  cwd?:   string;
  env?:   Record<string, string>;
  cols?:  number;
  rows?:  number;
  shell?: string;
}

export interface ExecResult {
  stdout: string;
  code:   number;
}

export interface KillPortResult {
  pids:    string[];
  message: string;
}

/** Shell process names recognised as interactive shells when walking the tree. */
export const SHELL_NAMES = new Set([
  "bash", "zsh", "sh", "fish", "ksh", "dash", "tcsh", "csh", "nu", "elvish", "xonsh", "pwsh",
]);

/**
 * The contract every platform must satisfy. One concrete class per OS
 * (LinuxOS / MacOS / WindowsOS) implements these; a factory picks the right
 * one at runtime. All OS-specific divergence lives behind this interface.
 */
export interface OSInterface {
  readonly platform:     string;
  readonly isWindows:    boolean;
  readonly defaultShell: string;

  /** Run a one-shot command, resolve its stdout + exit code (never throws). */
  exec(cmd: string): Promise<ExecResult>;

  /** Spawn an interactive shell as a real PTY (node-pty). */
  spawnShell(opts: SpawnShellOptions): IPty;

  // ── Process introspection ────────────────────────────────────────────────
  /** Direct child PIDs of a process. */
  getChildPids(pid: number): Promise<number[]>;
  /** The command name (comm) of a process. */
  getComm(pid: number): Promise<string>;
  /** The process-group id (0 if the OS has no concept of it). */
  getProcessGroup(pid: number): Promise<number>;
  /** The live working directory of a process (null if unknowable). */
  getProcessCwd(pid: number): Promise<string | null>;

  // ── Process control ──────────────────────────────────────────────────────
  /** Force-kill a single process. */
  killProcess(pid: number): void;
  /** Force-kill an entire process group (no-op where unsupported). */
  killProcessGroup(pgid: number): void;
  /** Collect every PID in a process subtree (root first). */
  collectProcessTree(rootPid: number): Promise<number[]>;
  /** Kill a whole process subtree cleanly. */
  killProcessTree(rootPid: number): Promise<void>;

  // ── Utilities ────────────────────────────────────────────────────────────
  /** Shells actually installed on this machine. */
  detectShells(): string[];
  /** Whether this runtime can spawn a real interactive terminal. */
  canSpawnTerminal(): boolean;
  /** Kill whatever is listening on a TCP port. */
  killPort(port: number): Promise<KillPortResult>;
}

export class PortNotFoundError extends Error {}
