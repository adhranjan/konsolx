import { spawn } from "child_process";
import { OSInterface } from "../os-interface.js";

export interface KillPortResult {
  pids: string[];
  message: string;
}

export async function killPort(port: number): Promise<KillPortResult> {
  if (OSInterface.isWindows) {
    const { stdout } = await OSInterface.exec(`netstat -ano`);
    const pids = [...new Set(
      stdout.split("\n")
        .filter(l => l.includes(`:${port} `) || l.includes(`:${port}\t`))
        .map(l => l.trim().split(/\s+/).pop())
        .filter(Boolean) as string[]
    )];

    if (pids.length === 0) throw new NotFoundError(`Nothing found on port ${port}`);

    for (const pid of pids) {
      await new Promise(resolve => spawn("taskkill", ["/PID", pid, "/F"]).on("close", resolve));
    }

    return { pids, message: `Killed PIDs ${pids.join(", ")} on port ${port}` };
  }

  const { stdout } = await OSInterface.exec(`lsof -t -i :${port} 2>/dev/null`);
  const pids = stdout.trim().split("\n").filter(Boolean);

  if (pids.length === 0) throw new NotFoundError(`Nothing found on port ${port}`);

  await OSInterface.exec(`kill -9 ${pids.join(" ")} 2>/dev/null; true`);

  return { pids, message: `Killed PIDs ${pids.join(", ")} on port ${port}` };
}

export class NotFoundError extends Error {}
