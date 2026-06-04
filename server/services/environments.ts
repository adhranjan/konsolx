import crypto from "crypto";
import { environmentDb, Environment } from "../database/environments.js";

export function listEnvironments(): Environment[] {
  return environmentDb.list();
}

export function saveEnvironment(data: Partial<Environment> & { name: string; variables: any }): void {
  environmentDb.save({
    id:        data.id ?? crypto.randomUUID(),
    name:      data.name,
    groupName: data.groupName,
    variables: data.variables,
  });
}

export function deleteEnvironment(id: string): void {
  environmentDb.delete(id);
}
