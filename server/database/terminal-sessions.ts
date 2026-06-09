import { db } from "./index.js";
import { TerminalSession } from "../sessions.js";

export const terminalSessionDb = {
  upsert(s: TerminalSession): void {
    db.prepare(`
      INSERT INTO terminal_sessions
        (session_id, pid, cwd, title, group_name, group_color, group_order, sort_order, env_id, vars)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        pid         = excluded.pid,
        cwd         = excluded.cwd,
        title       = excluded.title,
        group_name  = excluded.group_name,
        group_color = excluded.group_color,
        group_order = excluded.group_order,
        sort_order  = excluded.sort_order,
        env_id      = excluded.env_id,
        vars        = excluded.vars
    `).run(
      s.sessionId,
      s.pid,
      s.cwd,
      s.title      ?? null,
      s.groupName  ?? null,
      s.groupColor ?? null,
      s.groupOrder ?? null,
      s.sortOrder  ?? null,
      s.envId      ?? null,
      JSON.stringify(s.vars ?? {}),
    );
  },

  delete(sessionId: string): void {
    db.prepare("DELETE FROM terminal_sessions WHERE session_id = ?").run(sessionId);
  },

  deleteAll(): void {
    db.prepare("DELETE FROM terminal_sessions").run();
  },
};
