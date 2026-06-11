import { ShellDialect } from "./types.js";

/** Windows cmd.exe. */
export class CmdDialect implements ShellDialect {
  readonly name = "cmd";
  readonly promptPattern = />\s*$/m;

  exportVar(key: string, value: string): string { return `set "${key}=${value}"`; }
  unsetVar(key: string): string                 { return `set "${key}="`; }
  changeDir(path: string): string               { return `cd /d "${path}"`; }
  echo(text: string): string                    { return `echo ${text}`; }
}
