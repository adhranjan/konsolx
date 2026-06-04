import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import os from "os";
import path from "path";

export interface SpawnShellOptions {
  cwd?:  string;
  env?:  Record<string, string>;
  cols?: number;
  rows?: number;
  shell?: string;
}

export interface ExecResult {
  stdout: string;
  code:   number;
}

/**
 * OSInterface — static class for all host/OS interaction.
 *
 * Three runtime modes (resolved from env vars):
 *   USE_SSH_SHELL=true   → SSH back to host.docker.internal  (Mac + Docker)
 *   USE_HOST_SHELL=true  → nsenter into host namespaces      (Linux + Docker)
 *   (neither)            → direct spawn                      (local / in-container)
 */
export class OSInterface {
  static get isWindows(): boolean {
    return os.platform() === "win32";
  }

  static get useSshShell(): boolean {
    return process.env.USE_SSH_SHELL === "true";
  }

  static get useHostShell(): boolean {
    return !OSInterface.useSshShell && process.env.USE_HOST_SHELL === "true";
  }

  static get hostUser(): string {
    return process.env.HOST_USER ?? "";
  }

  static get defaultShell(): string {
    return OSInterface.isWindows ? "cmd.exe" : "bash";
  }

  /**
   * Run a single shell command on the host (or locally).
   * Used by kill-port and any other one-shot host commands.
   */
  static exec(cmd: string): Promise<ExecResult> {
    return new Promise(resolve => {
      let bin: string;
      let args: string[];

      if (OSInterface.isWindows) {
        bin  = "cmd.exe";
        args = ["/c", cmd];
      } else if (OSInterface.useHostShell) {
        bin  = "nsenter";
        args = ["-t", "1", "-m", "-n", "-p", "--", "sh", "-c", cmd];
      } else {
        bin  = "sh";
        args = ["-c", cmd];
      }

      const proc = spawn(bin, args);
      let stdout = "";
      proc.stdout.on("data", d => stdout += d.toString());
      proc.on("close", code  => resolve({ stdout, code: code ?? 1 }));
      proc.on("error", ()    => resolve({ stdout: "", code: 1 }));
    });
  }

  /**
   * Spawn an interactive PTY shell appropriate for the current OS / Docker mode.
   */
  static spawnShell(opts: SpawnShellOptions): ChildProcessWithoutNullStreams {
    const {
      cwd,
      env   = {},
      cols  = 80,
      rows  = 24,
      shell = OSInterface.defaultShell,
    } = opts;

    const { isWindows, useSshShell, useHostShell, hostUser } = OSInterface;

    let finalShell: string;
    let finalArgs:  string[];
    let spawnEnv:   Record<string, string>;
    let spawnCwd:   string;

    if (isWindows) {
      finalShell = shell;
      finalArgs  = [];
      spawnEnv   = { ...process.env as any, ...env };
      spawnCwd   = cwd ?? process.cwd();

    } else if (useSshShell) {
      // Mac: SSH back into the host via host.docker.internal
      const target = `${hostUser || "user"}@host.docker.internal`;
      const py     = `import pty, signal; signal.signal(signal.SIGINT, signal.SIG_IGN); ` +
                     `pty.spawn(["ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-t", "${target}"])`;
      finalShell = "python3";
      finalArgs  = ["-c", py];
      spawnEnv   = { TERM: "xterm-256color", COLORTERM: "truecolor", LANG: "en_US.UTF-8", KONSOLX_HOST: "true", ...env };
      spawnCwd   = "/";

    } else if (useHostShell) {
      // Linux Docker: nsenter into host namespaces
      const ptyTarget = hostUser ? `["su", "-", "${hostUser}"]` : `"${shell}"`;
      const py        = `import pty, signal; signal.signal(signal.SIGINT, signal.SIG_IGN); pty.spawn(${ptyTarget})`;
      const cdCmd     = cwd && path.isAbsolute(cwd) ? `cd "${cwd}" 2>/dev/null || cd /; ` : "cd /; ";
      const wrapped   = `export KONSOLX_HOST=true; ${cdCmd}` +
                        `if command -v python3 >/dev/null 2>&1; ` +
                        `then python3 -c '${py}' 2>/dev/null || exec ${shell} -i; ` +
                        `else exec ${shell} -i; fi`;
      finalShell = "nsenter";
      finalArgs  = ["-t", "1", "-m", "-u", "-i", "-n", "-p", "sh", "-c", wrapped];
      spawnEnv   = { TERM: "xterm-256color", COLORTERM: "truecolor", LANG: "en_US.UTF-8", KONSOLX_HOST: "true", ...env };
      spawnCwd   = "/";

    } else {
      // Local / in-container: python3 pty.spawn
      const py   = `import pty, signal; signal.signal(signal.SIGINT, signal.SIG_IGN); pty.spawn("${shell}")`;
      finalShell = "python3";
      finalArgs  = ["-c", py];
      spawnEnv   = { ...process.env as any, ...env, TERM: "xterm-256color", COLORTERM: "truecolor" };
      spawnCwd   = cwd ?? process.cwd();
    }

    spawnEnv.COLUMNS = String(cols);
    spawnEnv.LINES   = String(rows);

    const mode = useSshShell ? "ssh" : useHostShell ? "host" : "local";
    console.log(`[OSInterface] spawn shell | mode=${mode} | cwd=${spawnCwd}`);

    return spawn(finalShell, finalArgs, { cwd: spawnCwd, env: spawnEnv, detached: true });
  }
}
