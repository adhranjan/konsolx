import { OS, KillPortResult, PortNotFoundError } from "../os/index.js";

// Re-exported so the route keeps its existing 404 mapping + types.
export { PortNotFoundError as NotFoundError };
export type { KillPortResult };

export function killPort(port: number): Promise<KillPortResult> {
  return OS.killPort(port);   // platform-specific implementation
}
