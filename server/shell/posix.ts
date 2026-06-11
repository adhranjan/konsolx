import { ShellDialect } from "./types.js";

/** bash, zsh, sh, dash, ksh, ash, mksh, yash — the POSIX family. */
export class PosixDialect implements ShellDialect {
  readonly name = "posix";
  readonly promptPattern = /[\$#%>]\s*$/m;

  exportVar(key: string, value: string): string { return `export ${key}=${JSON.stringify(value)}`; }
  unsetVar(key: string): string                 { return `unset ${key}`; }
  changeDir(path: string): string               { return `cd "${path}"`; }
  echo(text: string): string                    { return `echo ${text}`; }
}
