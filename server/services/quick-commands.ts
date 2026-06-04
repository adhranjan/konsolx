import crypto from "crypto";
import { quickCommandDb, QuickCommand } from "../database/quick-commands.js";

export function listQuickCommands(): QuickCommand[] {
  return quickCommandDb.list();
}

export function saveQuickCommand(data: Partial<QuickCommand> & { name: string; command: string }): void {
  quickCommandDb.save({
    id:      data.id ?? crypto.randomUUID(),
    name:    data.name,
    command: data.command,
    cwd:     data.cwd,
    group:   data.group,
  });
}

export function deleteQuickCommand(id: string): void {
  quickCommandDb.delete(id);
}
