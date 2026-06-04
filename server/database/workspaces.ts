import { db } from "./index.js";

export interface WorkspaceDir {
  name: string;
  path: string;
}

export interface Workspace {
  id: string;
  name: string;
  basePath?: string;
  directories: WorkspaceDir[];
}

export const workspaceDb = {
  list(): Workspace[] {
    const rows = db.prepare("SELECT * FROM workspaces").all() as any[];
    return rows.map(r => ({ ...r, directories: JSON.parse(r.directories) }));
  },

  save(w: Workspace): void {
    const dirs = typeof w.directories === "string" ? w.directories : JSON.stringify(w.directories ?? []);
    db.prepare(
      "INSERT OR REPLACE INTO workspaces (id, name, basePath, directories) VALUES (?, ?, ?, ?)"
    ).run(w.id, w.name ?? "Untitled Workspace", w.basePath ?? null, dirs);
  },

  delete(id: string): void {
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
  },
};
