/**
 * Risky command patterns — checked when saving Quick Commands.
 * Each entry has a pattern and a human-readable reason.
 */
const RISKY_PATTERNS: { pattern: RegExp; reason: string }[] = [
  // ── Destructive file deletion ───────────────────────────────────────────────
  { pattern: /rm\s+.*-[a-z]*r[a-z]*f|rm\s+.*-[a-z]*f[a-z]*r/i,           reason: "Recursive force delete (rm -rf)" },
  { pattern: /rm\s+-rf?\s+(\/|~|\$HOME|\*)/i,                              reason: "Recursive delete of root, home, or wildcard" },
  { pattern: /rm\s+--no-preserve-root/i,                                   reason: "Delete without preserving root" },

  // ── Disk / block device writes ──────────────────────────────────────────────
  { pattern: /dd\s+.*of=\/dev\/(sd|hd|vd|nvme|xvd|disk)/i,                reason: "Writing directly to a block device (dd)" },
  { pattern: />\s*\/dev\/(sd|hd|vd|nvme|xvd|sda|disk)/i,                  reason: "Redirecting output to a block device" },
  { pattern: /mkfs/i,                                                       reason: "Formatting a filesystem (mkfs)" },
  { pattern: /fdisk|gdisk|parted|partprobe/i,                              reason: "Disk partitioning tool" },
  { pattern: /shred\s+.*\/dev\//i,                                         reason: "Shredding a block device" },
  { pattern: /wipefs/i,                                                     reason: "Wiping filesystem signatures" },

  // ── Fork bomb / resource exhaustion ────────────────────────────────────────
  { pattern: /:\(\)\s*\{.*:\|.*&.*\}/,                                     reason: "Fork bomb" },
  { pattern: /fork\s*bomb/i,                                               reason: "Fork bomb (literal)" },
  { pattern: /yes\s*>/i,                                                   reason: "Infinite output redirect (yes >)" },

  // ── Dangerous chmod / chown ─────────────────────────────────────────────────
  { pattern: /chmod\s+.*-R\s+[0-7]*7{3}\s+\//i,                          reason: "Recursive world-writable chmod on root" },
  { pattern: /chmod\s+777\s+-R\s+\//i,                                    reason: "Recursive 777 on root" },
  { pattern: /chown\s+.*-R\s+.*\s+\//i,                                   reason: "Recursive chown on root" },

  // ── Overwriting critical system files ──────────────────────────────────────
  { pattern: />\s*\/etc\/(passwd|shadow|sudoers|hosts|fstab|crontab)/i,   reason: "Overwriting critical system file" },
  { pattern: /truncate.*\/etc\/(passwd|shadow|sudoers)/i,                 reason: "Truncating critical system file" },

  // ── Kernel / boot tampering ─────────────────────────────────────────────────
  { pattern: />\s*\/boot\//i,                                              reason: "Writing to /boot" },
  { pattern: />\s*\/proc\/sysrq-trigger/i,                                reason: "Triggering sysrq" },
  { pattern: /echo\s+[0-9]\s*>\s*\/proc\/sysrq-trigger/i,                reason: "sysrq trigger" },
  { pattern: />\s*\/sys\/kernel/i,                                         reason: "Writing to kernel sysfs" },

  // ── Network backdoors ───────────────────────────────────────────────────────
  { pattern: /nc\s+.*-e\s+\/(bin|sh|bash)/i,                             reason: "Netcat reverse shell" },
  { pattern: /bash\s+-i\s+>&\s*\/dev\/tcp/i,                             reason: "Bash reverse shell" },
  { pattern: /python.*socket.*exec|perl.*socket.*exec/i,                  reason: "Script-based reverse shell" },

  // ── Pipe to shell (remote code execution) ──────────────────────────────────
  { pattern: /curl\s+.*\|\s*(ba)?sh/i,                                    reason: "curl piped to shell" },
  { pattern: /wget\s+.*-O\s*-\s*\|\s*(ba)?sh/i,                         reason: "wget piped to shell" },
  { pattern: /fetch\s+.*\|\s*(ba)?sh/i,                                   reason: "fetch piped to shell" },

  // ── History / audit tampering ───────────────────────────────────────────────
  { pattern: /history\s+-[cw]|>\s*~\/\.bash_history|unset\s+HISTFILE/i,  reason: "Clearing or disabling shell history" },

  // ── Privilege escalation shortcuts ─────────────────────────────────────────
  { pattern: /sudo\s+su\s*$|sudo\s+-s\s*$/i,                             reason: "Dropping to root shell via sudo" },
  { pattern: /sudo\s+chmod\s+.*\/etc\/sudoers/i,                         reason: "Modifying sudoers via sudo" },
];

/**
 * Returns a reason string if the command is risky, null if it's safe.
 */
export function checkRiskyCommand(command: string): string | null {
  // Normalize: collapse all whitespace sequences to a single space
  const normalized = command.trim().replace(/\s+/g, " ");
  for (const { pattern, reason } of RISKY_PATTERNS) {
    if (pattern.test(normalized)) return reason;
  }
  return null;
}
