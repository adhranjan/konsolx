import { spawn, execSync } from "child_process";
import { BaseOS } from "./base.js";
import { KillPortResult, PortNotFoundError } from "./types.js";

export class WindowsOS extends BaseOS {
  get isWindows() { return true; }
  get defaultShell() { return process.env.COMSPEC ?? "powershell.exe"; }

  // ── Process introspection (PowerShell / tasklist) ───────────────────────────
  getChildPids(pid: number): Promise<number[]> {
    return new Promise(resolve => {
      const cmd = `Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | Select-Object -ExpandProperty ProcessId`;
      const p = spawn("powershell.exe", ["-NoProfile", "-Command", cmd]);
      let out = "";
      p.stdout.on("data", d => out += d.toString());
      p.on("close", () => resolve(out.trim().split(/\r?\n/).filter(Boolean).map(Number).filter(n => !isNaN(n))));
      p.on("error", () => resolve([]));
    });
  }

  getComm(pid: number): Promise<string> {
    return new Promise(resolve => {
      const p = spawn("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]);
      let out = "";
      p.stdout.on("data", d => out += d.toString());
      p.on("close", () => {
        // "image.exe","1234","Console",...
        const m = out.match(/^"([^"]+)"/);
        resolve(m ? m[1].replace(/\.exe$/i, "") : "");
      });
      p.on("error", () => resolve(""));
    });
  }

  // Windows has no process-group concept.
  async getProcessGroup(): Promise<number> { return 0; }

  // Windows doesn't expose a process's live cwd without extra tooling.
  async getProcessCwd(): Promise<string | null> { return null; }

  killProcess(pid: number): void {
    try { spawn("taskkill", ["/PID", String(pid), "/F"]); } catch { /* gone */ }
  }

  killProcessGroup(): void { /* no groups on Windows — handled by killProcessTree */ }

  /** taskkill /T kills the whole tree in one call. */
  async killProcessTree(rootPid: number): Promise<void> {
    await new Promise<void>(resolve => {
      const p = spawn("taskkill", ["/PID", String(rootPid), "/T", "/F"]);
      p.on("close", () => resolve());
      p.on("error", () => resolve());
    });
  }

  // ── Utilities ──────────────────────────────────────────────────────────────
  detectShells(): string[] {
    const candidates = ["powershell", "pwsh", "cmd", "bash", "wsl"];
    return candidates.filter(sh => {
      try { execSync(`where ${sh}`, { stdio: "ignore" }); return true; }
      catch { return false; }
    });
  }

  async killPort(port: number): Promise<KillPortResult> {
    const { stdout } = await this.exec("netstat -ano");
    const pids = [...new Set(
      stdout.split("\n")
        .filter(l => l.includes(`:${port} `) || l.includes(`:${port}\t`))
        .map(l => l.trim().split(/\s+/).pop())
        .filter(Boolean) as string[]
    )];
    if (pids.length === 0) throw new PortNotFoundError(`Nothing found on port ${port}`);
    for (const pid of pids) {
      await new Promise(resolve => spawn("taskkill", ["/PID", pid, "/F"]).on("close", resolve));
    }
    return { pids, message: `Killed PIDs ${pids.join(", ")} on port ${port}` };
  }
}
