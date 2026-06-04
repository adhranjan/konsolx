import { db } from "./index.js";

export interface QuickCommand {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  group?: string;
}

export const quickCommandDb = {
  list(): QuickCommand[] {
    const rows = db.prepare("SELECT id, name, command, cwd, grp FROM quick_commands").all() as any[];
    return rows.map(r => ({ ...r, group: r.grp ?? undefined, grp: undefined }));
  },

  save(c: QuickCommand): void {
    db.prepare(
      "INSERT OR REPLACE INTO quick_commands (id, name, command, cwd, grp) VALUES (?, ?, ?, ?, ?)"
    ).run(c.id, c.name ?? "Untitled Command", c.command ?? "", c.cwd ?? null, c.group ?? null);
  },

  delete(id: string): void {
    db.prepare("DELETE FROM quick_commands WHERE id = ?").run(id);
  },
};
