import { spawn, execSync } from "child_process";
import fs from "fs";
import { BaseOS } from "./base.js";
import { KillPortResult, PortNotFoundError } from "./types.js";

export class LinuxOS extends BaseOS {
  get isWindows() { return false; }
  get defaultShell() { return process.env.SHELL ?? "bash"; }

  // ── Process introspection (GNU ps + /proc) ─────────────────────────────────
  getChildPids(pid: number): Promise<number[]> {
    return new Promise(resolve => {
      const p = spawn("ps", ["-o", "pid=", "--ppid", String(pid)]);
      let out = "";
      p.stdout.on("data", d => out += d.toString());
      p.on("close", () => resolve(out.trim().split("\n").filter(Boolean).map(Number)));
      p.on("error", () => resolve([]));
    });
  }

  getComm(pid: number): Promise<string> {
    return new Promise(resolve => {
      const p = spawn("ps", ["-o", "comm=", "-p", String(pid)]);
      let out = "";
      p.stdout.on("data", d => out += d.toString());
      p.on("close", () => resolve(out.trim()));
      p.on("error", () => resolve(""));
    });
  }

  getProcessGroup(pid: number): Promise<number> {
    return new Promise(resolve => {
      const p = spawn("ps", ["-o", "pgid=", "-p", String(pid)]);
      let out = "";
      p.stdout.on("data", d => out += d.toString());
      p.on("close", () => resolve(Number(out.trim()) || 0));
      p.on("error", () => resolve(0));
    });
  }

  async getProcessCwd(pid: number): Promise<string | null> {
    try { return fs.readlinkSync(`/proc/${pid}/cwd`); } catch { return null; }
  }

  killProcessGroup(pgid: number): void {
    try { process.kill(-pgid, "SIGKILL"); } catch { /* gone */ }
  }

  // ── Utilities ──────────────────────────────────────────────────────────────
  detectShells(): string[] {
    const candidates = ["bash", "zsh", "fish", "sh", "dash", "ksh", "nu", "elvish", "xonsh", "pwsh", "tcsh", "csh", "ash", "mksh", "yash", "osh"];
    return candidates.filter(sh => {
      try { execSync(`command -v ${sh}`, { stdio: "ignore", shell: "/bin/sh" }); return true; }
      catch { return false; }
    });
  }

  async killPort(port: number): Promise<KillPortResult> {
    const { stdout } = await this.exec(`lsof -t -i :${port} 2>/dev/null`);
    const pids = stdout.trim().split("\n").filter(Boolean);
    if (pids.length === 0) throw new PortNotFoundError(`Nothing found on port ${port}`);
    await this.exec(`kill -9 ${pids.join(" ")} 2>/dev/null; true`);
    return { pids, message: `Killed PIDs ${pids.join(", ")} on port ${port}` };
  }
}
