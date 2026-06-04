import crypto from "crypto";
import { workspaceDb, Workspace } from "../database/workspaces.js";

export function listWorkspaces(): Workspace[] {
  return workspaceDb.list();
}

export function saveWorkspace(data: Partial<Workspace> & { name: string; directories: any }): void {
  workspaceDb.save({
    id:          crypto.randomUUID(),
    name:        data.name,
    basePath:    data.basePath,
    directories: data.directories,
  });
}

export function deleteWorkspace(id: string): void {
  workspaceDb.delete(id);
}
