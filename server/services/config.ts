import os from "os";

const currentSha = process.env.GIT_SHA ?? "undefined";

export interface ServerConfig {
  useHostShell:    boolean;
  useSshShell:     boolean;
  platform:        string;
  hostOs:          string | null;
  isDev:           boolean;
  updateAvailable: string | null;
}

export async function getConfig(): Promise<ServerConfig> {
  let updateAvailable: string | null = null;

  try {
    const res = await fetch("https://api.github.com/repos/adhranjan/konsolx/commits/main", {
      headers: { "User-Agent": "konsolx-update-check" },
    });
    if (res.ok) {
      const data = await res.json() as { sha: string };
      updateAvailable = data.sha !== currentSha ? data.sha : null;
    }
  } catch {}

  return {
    useHostShell:    process.env.USE_HOST_SHELL === "true",
    useSshShell:     process.env.USE_SSH_SHELL  === "true",
    platform:        os.platform(),
    hostOs:          process.env.HOST_OS ?? null,
    isDev:           process.env.KONSOLX_ENV === "dev",
    updateAvailable,
  };
}
