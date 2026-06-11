import { ShellDialect } from "./types.js";

/** PowerShell / pwsh. */
export class PowerShellDialect implements ShellDialect {
  readonly name = "powershell";
  readonly promptPattern = />\s*$/m;

  exportVar(key: string, value: string): string { return `$env:${key}=${JSON.stringify(value)}`; }
  unsetVar(key: string): string                 { return `Remove-Item Env:\\${key} -ErrorAction SilentlyContinue`; }
  changeDir(path: string): string               { return `Set-Location "${path}"`; }
  echo(text: string): string                    { return `Write-Output ${text}`; }
}
