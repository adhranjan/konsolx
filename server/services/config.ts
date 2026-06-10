import os from "os";

const currentSha = process.env.GIT_SHA ?? "undefined";

export interface ServerConfig {
  platform:        string;
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
    platform:        os.platform(),
    isDev:           process.env.NODE_ENV === "development",
    updateAvailable,
  };
}
