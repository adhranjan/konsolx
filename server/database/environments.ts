import { db } from "./index.js";

export interface EnvVar {
  key: string;
  value: string;
  isPrivate: boolean;
}

export interface Environment {
  id: string;
  name: string;
  groupName?: string;
  variables: EnvVar[];
}

export const environmentDb = {
  list(): Environment[] {
    const rows = db.prepare("SELECT * FROM environments").all() as any[];
    return rows.map(r => ({ ...r, variables: JSON.parse(r.variables) }));
  },

  save(e: Environment): void {
    const vars = typeof e.variables === "string" ? e.variables : JSON.stringify(e.variables ?? []);
    db.prepare(
      "INSERT OR REPLACE INTO environments (id, name, groupName, variables) VALUES (?, ?, ?, ?)"
    ).run(e.id, e.name ?? "Untitled Environment", e.groupName ?? null, vars);
  },

  delete(id: string): void {
    db.prepare("DELETE FROM environments WHERE id = ?").run(id);
  },
};
