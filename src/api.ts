import type { Workspace, Environment, QuickCommand } from "./types";

// ── Generic helper ────────────────────────────────────────────────────────────
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const message = body.error ?? res.statusText;
    window.dispatchEvent(new CustomEvent("api:error", { detail: { message, status: res.status, path } }));
    throw new Error(message);
  }
  return res.json();
}

// ── Config ────────────────────────────────────────────────────────────────────
export interface ServerConfig {
  platform:        string;
  isDev:           boolean;
  updateAvailable: string | null;
}

export const configApi = {
  get: () => request<ServerConfig>("/api/config"),
};

// ── Workspaces ────────────────────────────────────────────────────────────────
export const workspacesApi = {
  list:   ()                  => request<Workspace[]>("/api/workspaces"),
  create: (data: Workspace)   => request<{ success: boolean }>("/api/workspaces", { method: "POST", body: JSON.stringify(data) }),
  update: (data: Workspace)   => request<{ success: boolean }>(`/api/workspaces/${data.id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string)        => request<{ success: boolean }>(`/api/workspaces/${id}`, { method: "DELETE" }),
  open:   (id: string)        => request<TerminalState[]>(`/api/workspaces/${id}/open`, { method: "POST" }),
};

// ── Environments ──────────────────────────────────────────────────────────────
export const environmentsApi = {
  list:   ()                   => request<Environment[]>("/api/environments"),
  create: (data: Environment)  => request<{ success: boolean }>("/api/environments", { method: "POST", body: JSON.stringify(data) }),
  update: (data: Environment)  => request<{ success: boolean }>(`/api/environments/${data.id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string)         => request<{ success: boolean }>(`/api/environments/${id}`, { method: "DELETE" }),
};

// ── Quick Commands ────────────────────────────────────────────────────────────
export const quickCommandsApi = {
  list:   ()                    => request<QuickCommand[]>("/api/quick-commands"),
  create: (data: QuickCommand)  => request<{ success: boolean }>("/api/quick-commands", { method: "POST", body: JSON.stringify(data) }),
  update: (data: QuickCommand)  => request<{ success: boolean }>(`/api/quick-commands/${data.id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string)          => request<{ success: boolean }>(`/api/quick-commands/${id}`, { method: "DELETE" }),
};

// ── Terminals ─────────────────────────────────────────────────────────────────
export interface TerminalState {
  sessionId:   string;
  pid:         number;
  cwd:         string;
  clientCount: number;
  busy:        boolean;
  title?:      string;
  groupName?:  string;
  groupColor?: string;
  envId?:      string;
  vars:        Record<string, string>;
  groupOrder?: number;
  sortOrder?:  number;
}

export interface CreateTerminalOptions {
  cwd?:            string;
  shell?:          string;
  cols?:           number;
  rows?:           number;
  initialCommand?: string;
  title?:          string;
  groupName?:      string;
  groupColor?:     string;
  envId?:          string;
  vars?:           Record<string, string>;
  sortOrder?:      number;
}

export const terminalsApi = {
  list:   ()                             => request<TerminalState[]>("/api/terminals"),
  get:    (id: string)                   => request<TerminalState>(`/api/terminals/${id}`),
  create: (opts: CreateTerminalOptions)  => request<{ sessionId: string }>("/api/terminals", { method: "POST", body: JSON.stringify(opts) }),
  update: (id: string, meta: Partial<Pick<TerminalState, 'title' | 'groupName' | 'groupColor' | 'envId' | 'sortOrder'>>) =>
    request<{ success: boolean }>(`/api/terminals/${id}`, { method: "PUT", body: JSON.stringify(meta) }),
  delete:   (id: string)                   => request<{ success: boolean }>(`/api/terminals/${id}`, { method: "DELETE" }),
  killAll:   ()                                      => request<{ success: boolean }>("/api/terminals", { method: "DELETE" }),
  patchVars: (id: string, vars: Record<string, string>) => request<{ success: boolean }>(`/api/terminals/${id}/vars`, { method: "PATCH", body: JSON.stringify(vars) }),
  applyEnv:  (id: string, envId: string)             => request<{ success: boolean }>(`/api/terminals/${id}/env/${envId}`, { method: "PUT" }),
};

// ── Kill Port ─────────────────────────────────────────────────────────────────
export const killPortApi = {
  kill: (port: number) =>
    request<{ success: boolean; message: string }>("/api/kill-port", {
      method: "POST",
      body: JSON.stringify({ port }),
    }),
};

// ── Bulk Import / Export ──────────────────────────────────────────────────────
export interface BulkExport {
  version:       number;
  exportedAt:    string;
  workspaces:    Workspace[];
  environments:  Environment[];
  quickCommands: QuickCommand[];
}

export const bulkApi = {
  export: () => request<BulkExport>("/api/bulk/export"),
  import: (data: BulkExport) =>
    request<{ success: boolean; imported: Record<string, number> }>("/api/bulk/import", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
