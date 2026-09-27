import { createDoc, getDoc, listDocs, runInTransaction, updateDoc } from "@/lib/server-db";
import { parseBrief, type MicroApp } from "./model";

const COLLECTION = "users/local/microApps";
export class StudioError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function readApp(id: string): MicroApp {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new StudioError("App not found.", 404);
  const doc = getDoc(COLLECTION, id);
  if (!doc) throw new StudioError("App not found.", 404);
  return doc as unknown as MicroApp;
}
export function listApps(): MicroApp[] {
  return listDocs(COLLECTION, { orderBy: ["updatedAt", "desc"] }) as unknown as MicroApp[];
}
export function createApp(value: unknown): MicroApp {
  const brief = parseBrief(value);
  const now = new Date().toISOString();
  const id = createDoc(COLLECTION, { ...brief, revision: 1, createdAt: now, updatedAt: now });
  return readApp(id);
}
export function saveApp(id: string, value: unknown, revision: unknown): MicroApp {
  const brief = parseBrief(value);
  return runInTransaction(() => {
    const current = readApp(id);
    if (current.revision !== revision) throw new StudioError("This brief changed in another window. Reload before saving.", 409);
    updateDoc(COLLECTION, id, { ...brief, revision: current.revision + 1, updatedAt: new Date().toISOString() });
    return readApp(id);
  });
}
export function attachSession(id: string, kind: "researchSession" | "workspaceSession", session: string) {
  // Session metadata must never write an old copy of the user's brief back.
  return runInTransaction(() => {
    readApp(id);
    updateDoc(COLLECTION, id, { [kind]: session });
    return readApp(id);
  });
}
