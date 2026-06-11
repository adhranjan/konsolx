import path from "path";
import Database from "better-sqlite3";

const dataDir = process.env.DATA_DIR || ".";
export const db = new Database(path.join(dataDir, "terminal.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS terminal_sessions (
    session_id   TEXT PRIMARY KEY,
    pid          INTEGER NOT NULL,
    cwd          TEXT NOT NULL,
    title        TEXT,
    group_name   TEXT,
    group_color  TEXT,
    group_order  INTEGER,
    sort_order   INTEGER,
    env_id       TEXT,
    vars         TEXT NOT NULL DEFAULT '{}',
    pins         TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    basePath TEXT,
    directories TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS environments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    groupName TEXT,
    variables TEXT NOT NULL
  );
  -- Local-only command learning. NEVER included in bulk export. Stays on this machine.
  CREATE TABLE IF NOT EXISTS command_history (
    project    TEXT NOT NULL,
    command    TEXT NOT NULL,
    count      INTEGER NOT NULL DEFAULT 1,
    last_used  INTEGER NOT NULL,
    PRIMARY KEY (project, command)
  );
  CREATE TABLE IF NOT EXISTS command_sequences (
    project    TEXT NOT NULL,
    prev       TEXT NOT NULL,
    next       TEXT NOT NULL,
    count      INTEGER NOT NULL DEFAULT 1,
    last_used  INTEGER NOT NULL,
    PRIMARY KEY (project, prev, next)
  );
  CREATE TABLE IF NOT EXISTS quick_commands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    cwd TEXT,
    envId TEXT,
    grp TEXT
  );
`);

// Migrations — add columns that didn't exist in older schemas
const workspaceCols = db.prepare("PRAGMA table_info(workspaces)").all() as any[];
if (!workspaceCols.some(c => c.name === "basePath")) {
  db.exec("ALTER TABLE workspaces ADD COLUMN basePath TEXT");
}

const envCols = db.prepare("PRAGMA table_info(environments)").all() as any[];
if (!envCols.some(c => c.name === "groupName")) {
  db.exec("ALTER TABLE environments ADD COLUMN groupName TEXT");
}

const qcCols = db.prepare("PRAGMA table_info(quick_commands)").all() as any[];
if (!qcCols.some(c => c.name === "grp")) {
  db.exec("ALTER TABLE quick_commands ADD COLUMN grp TEXT");
}

// Migration: add pins column if not present
const tscols = db.prepare("PRAGMA table_info(terminal_sessions)").all() as any[];
if (tscols && !tscols.some((c: any) => c.name === "pins")) {
  db.exec("ALTER TABLE terminal_sessions ADD COLUMN pins TEXT NOT NULL DEFAULT '[]'");
}

db.prepare("DELETE FROM workspaces WHERE id = 'sample-work'").run();
