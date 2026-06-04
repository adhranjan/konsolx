import { db } from "../database/index.js";
import { workspaceDb } from "../database/workspaces.js";
import { environmentDb } from "../database/environments.js";
import { quickCommandDb } from "../database/quick-commands.js";
import { Workspace } from "../database/workspaces.js";
import { Environment } from "../database/environments.js";
import { QuickCommand } from "../database/quick-commands.js";

export interface BulkExport {
  version:       1;
  exportedAt:    string;
  workspaces:    Workspace[];
  environments:  Environment[];
  quickCommands: QuickCommand[];
}

export function exportAll(): BulkExport {
  return {
    version:       1,
    exportedAt:    new Date().toISOString(),
    workspaces:    workspaceDb.list(),
    environments:  environmentDb.list(),
    quickCommands: quickCommandDb.list(),
  };
}

export function importAll(data: BulkExport): { imported: Record<string, number> } {
  const counts = { workspaces: 0, environments: 0, quickCommands: 0 };

  // Run all inserts inside a single SQLite transaction.
  // If anything throws, the entire import is rolled back — nothing is partially saved.
  const run = db.transaction(() => {
    for (const w of data.workspaces ?? []) {
      workspaceDb.save(w);
      counts.workspaces++;
    }
    for (const e of data.environments ?? []) {
      environmentDb.save(e);
      counts.environments++;
    }
    for (const c of data.quickCommands ?? []) {
      quickCommandDb.save(c);
      counts.quickCommands++;
    }
  });

  run(); // throws on failure → rolls back automatically

  return { imported: counts };
}
