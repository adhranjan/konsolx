/**
 * A shell dialect describes how to express common operations in a particular
 * shell language. Orthogonal to the OS: a Windows box running Git Bash speaks
 * Posix; a Linux box could run fish. Keyed by the shell, never the platform.
 */
export interface ShellDialect {
  readonly name: string;

  /** Set an environment variable. */
  exportVar(key: string, value: string): string;
  /** Remove an environment variable. */
  unsetVar(key: string): string;
  /** Change the working directory. */
  changeDir(path: string): string;
  /** Echo a literal string (used for sentinel confirmation). */
  echo(text: string): string;

  /** Regex that matches this shell's prompt at end of output. */
  readonly promptPattern: RegExp;
}
