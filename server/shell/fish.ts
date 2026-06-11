import { ShellDialect } from "./types.js";

/** Fish — friendly interactive shell with its own syntax. */
export class FishDialect implements ShellDialect {
  readonly name = "fish";
  readonly promptPattern = /[\$#%>]\s*$/m;

  exportVar(key: string, value: string): string { return `set -gx ${key} ${JSON.stringify(value)}`; }
  unsetVar(key: string): string                 { return `set -e ${key}`; }
  changeDir(path: string): string               { return `cd "${path}"`; }
  echo(text: string): string                    { return `echo ${text}`; }
}
