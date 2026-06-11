import path from "path";
import { ShellDialect } from "./types.js";
import { PosixDialect } from "./posix.js";
import { FishDialect } from "./fish.js";
import { PowerShellDialect } from "./powershell.js";
import { CmdDialect } from "./cmd.js";

// Each dialect is instantiated lazily on first use, then cached — so a machine
// that only ever runs bash never allocates the cmd/PowerShell objects.
const cache = new Map<string, ShellDialect>();

function create(name: string): ShellDialect {
  switch (name) {
    case "fish":                    return new FishDialect();
    case "pwsh":
    case "powershell":              return new PowerShellDialect();
    case "cmd":                     return new CmdDialect();
    default:                        return new PosixDialect();   // bash/zsh/sh/… + unknown
  }
}

/** Resolve a shell name (or full path) to its dialect. Unknown → Posix. */
export function getDialect(shell?: string): ShellDialect {
  const name = shell ? path.basename(shell).toLowerCase().replace(/\.exe$/, "") : "";
  let dialect = cache.get(name);
  if (!dialect) {
    dialect = create(name);
    cache.set(name, dialect);
  }
  return dialect;
}

export * from "./types.js";
