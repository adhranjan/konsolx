import { OS } from "../os/index.js";

export interface ServerConfig {
  platform:          string;
  isDev:             boolean;
  availableShells:   string[];
  canSpawnTerminal:  boolean;   // already encodes the python/ConPTY check
}

let cachedShells: string[] | null = null;

export function getConfig(): ServerConfig {
  if (!cachedShells) cachedShells = OS.detectShells();   // platform-specific detection
  return {
    platform:         OS.platform,
    isDev:            process.env.NODE_ENV === "development",
    availableShells:  cachedShells,
    canSpawnTerminal: OS.canSpawnTerminal(),
  };
}
