import crypto from "crypto";
import path from "path";
import { workspaceDb, Workspace } from "../database/workspaces.js";
import { spawnTerminal, TerminalState } from "./terminals.js";
import { sessions } from "../sessions.js";

let groupOrderCounter = 0;

const COLOR_PALETTE = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#14b8a6", // teal
  "#a855f7", // purple
  "#fb923c", // light orange
];

/** Pick the color least used by currently live sessions. */
function pickGroupColor(): string {
  const usage = new Map<string, number>(COLOR_PALETTE.map(c => [c, 0]));
  for (const s of sessions.values()) {
    if (s.groupColor && usage.has(s.groupColor)) {
      usage.set(s.groupColor, (usage.get(s.groupColor) ?? 0) + 1);
    }
  }
  let picked = COLOR_PALETTE[0];
  let min = Infinity;
  for (const [color, count] of usage) {
    if (count < min) { min = count; picked = color; }
  }
  return picked;
}

export function listWorkspaces(): Workspace[] {
  return workspaceDb.list();
}

export function saveWorkspace(data: Partial<Workspace> & { name: string; directories: any }): void {
  workspaceDb.save({
    id:          data.id ?? crypto.randomUUID(),
    name:        data.name,
    basePath:    data.basePath,
    directories: data.directories,
  });
}

export function deleteWorkspace(id: string): void {
  workspaceDb.delete(id);
}

export function openWorkspace(workspaceId: string): TerminalState[] {
  const ws = workspaceDb.list().find(w => w.id === workspaceId);
  if (!ws) throw new Error("Workspace not found");
  if (!ws.directories?.length) throw new Error("Workspace has no directories");

  const groupColor = pickGroupColor();
  const groupName  = ws.name;
  const groupOrder = ++groupOrderCounter;

  return ws.directories.map((dir, i) => {
    let cwd = dir.path;
    if (!path.isAbsolute(cwd) && ws.basePath) {
      cwd = path.join(ws.basePath, cwd);
    }

    const session = spawnTerminal({
      cwd,
      title:     dir.name || path.basename(cwd),
      groupName,
      groupColor,
      groupOrder,
      sortOrder: i,
    });

    return {
      sessionId:   session.sessionId,
      pid:         session.pid,
      cwd:         session.cwd,
      clientCount: 0,
      busy:        false,
      title:       session.title,
      groupName:   session.groupName,
      groupColor:  session.groupColor,
      envId:       session.envId,
      vars:        session.vars,
      groupOrder:  session.groupOrder,
      sortOrder:   session.sortOrder,
    };
  });
}
