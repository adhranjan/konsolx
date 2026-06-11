import os from "os";
import { execSync } from "child_process";

export interface ServerConfig {
  platform:        string;
  isDev:           boolean;
  availableShells: string[];
}

// Detect which shells are actually installed on this machine.
function detectShells(): string[] {
  const candidates = [
    "bash", "zsh", "fish", "sh", "dash", "ksh",   // mainstream POSIX-ish
    "nu",        // Nushell
    "elvish",    // Elvish
    "xonsh",     // Python-powered shell
    "pwsh",      // PowerShell Core
    "tcsh", "csh",
    "ash", "mksh", "yash",
    "osh",       // Oils
  ];
  const found: string[] = [];
  for (const sh of candidates) {
    try {
      execSync(`command -v ${sh}`, { stdio: "ignore", shell: "/bin/sh" });
      found.push(sh);
    } catch { /* not installed */ }
  }
  return found;
}

let cachedShells: string[] | null = null;

export function getConfig(): ServerConfig {
  if (!cachedShells) cachedShells = detectShells();
  return {
    platform:        os.platform(),
    isDev:           process.env.NODE_ENV === "development",
    availableShells: cachedShells,
  };
}
