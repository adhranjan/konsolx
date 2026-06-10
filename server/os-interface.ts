import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import os from "os";
import { exec as execCb } from "child_process";

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

export class OSInterface {
  static get isWindows(): boolean {
    return os.platform() === "win32";
  }

  static get defaultShell(): string {
    return OSInterface.isWindows ? "cmd.exe" : (process.env.SHELL ?? "bash");
  }

  static exec(cmd: string): Promise<ExecResult> {
    return new Promise(resolve => {
      execCb(cmd, (err, stdout) => {
        resolve({ stdout: stdout ?? "", code: err?.code ?? 0 });
      });
    });
  }

  static spawnShell(opts: SpawnShellOptions): ChildProcessWithoutNullStreams {
    const {
      cwd   = process.cwd(),
      env   = {},
      cols  = 80,
      rows  = 24,
      shell = OSInterface.defaultShell,
    } = opts;

    const spawnEnv = {
      ...process.env as Record<string, string>,
      ...env,
      TERM:      "xterm-256color",
      COLORTERM: "truecolor",
      LANG:      process.env.LANG ?? "en_US.UTF-8",
      COLUMNS:   String(cols),
      LINES:     String(rows),
    };

    // Use python3 pty.spawn for proper PTY support
    const py = `import pty, signal; signal.signal(signal.SIGINT, signal.SIG_IGN); pty.spawn("${shell}")`;

    console.log(`[OSInterface] spawn shell | cwd=${cwd}`);

    return spawn("python3", ["-c", py], { cwd, env: spawnEnv, detached: true });
  }
}
