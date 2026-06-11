import { exec as execCb } from "child_process";
import os from "os";
import * as pty from "node-pty";
import type { IPty } from "node-pty";
import {
  OSInterface, SpawnShellOptions, ExecResult, KillPortResult,
} from "./types.js";

/**
 * Shared behaviour for all platforms. Subclasses implement the OS-specific
 * primitives (getChildPids, getComm, killPort, …); the shell spawning (now via
 * node-pty, which is itself cross-platform) and tree-kill orchestration are
 * identical everywhere and live here.
 */
export abstract class BaseOS implements OSInterface {
  get platform(): string { return os.platform(); }
  abstract get isWindows(): boolean;
  abstract get defaultShell(): string;

  abstract getChildPids(pid: number): Promise<number[]>;
  abstract getComm(pid: number): Promise<string>;
  abstract getProcessGroup(pid: number): Promise<number>;
  abstract getProcessCwd(pid: number): Promise<string | null>;
  abstract killProcessGroup(pgid: number): void;
  abstract detectShells(): string[];
  abstract killPort(port: number): Promise<KillPortResult>;

  /** Spawn an interactive shell as a real PTY — node-pty handles ConPTY/forkpty. */
  spawnShell(opts: SpawnShellOptions): IPty {
    const { cwd = process.cwd(), env = {}, cols = 80, rows = 24, shell = this.defaultShell } = opts;
    const spawnEnv = {
      ...process.env as Record<string, string>, ...env,
      TERM: "xterm-256color", COLORTERM: "truecolor",
      LANG: process.env.LANG ?? "en_US.UTF-8",
    };
    return pty.spawn(shell, [], { name: "xterm-256color", cols, rows, cwd, env: spawnEnv });
  }

  /** node-pty supports all three platforms — a real terminal is always possible. */
  canSpawnTerminal(): boolean {
    return true;
  }

  /** Default exec — runs through the platform's default shell via Node. */
  exec(cmd: string): Promise<ExecResult> {
    return new Promise(resolve => {
      execCb(cmd, (err, stdout) => resolve({ stdout: stdout ?? "", code: (err as any)?.code ?? 0 }));
    });
  }

  /** POSIX default — Windows overrides with taskkill. */
  killProcess(pid: number): void {
    try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
  }

  /** Collect every PID in the subtree, root first (depth-first). */
  async collectProcessTree(rootPid: number): Promise<number[]> {
    const children = await this.getChildPids(rootPid);
    const subtrees = await Promise.all(children.map(c => this.collectProcessTree(c)));
    return [rootPid, ...subtrees.flat()];
  }

  /**
   * Kill a whole subtree: collect the full tree first (so re-parenting to init
   * can't hide grandchildren), then kill leaves-first, then sweep the group.
   */
  async killProcessTree(rootPid: number): Promise<void> {
    try {
      const allPids = await this.collectProcessTree(rootPid);
      for (const p of [...allPids].reverse()) this.killProcess(p);

      const pgid = await this.getProcessGroup(rootPid);
      if (pgid > 1) this.killProcessGroup(pgid);
    } catch {
      this.killProcess(rootPid);
    }
  }
}
