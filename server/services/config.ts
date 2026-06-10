import os from "os";

export interface ServerConfig {
  platform: string;
  isDev:    boolean;
}

export function getConfig(): ServerConfig {
  return {
    platform: os.platform(),
    isDev:    process.env.NODE_ENV === "development",
  };
}
