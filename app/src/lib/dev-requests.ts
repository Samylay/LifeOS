// T29 / R-C — dev-request queue. The in-app chat (src/app/api/chat/route.ts)
// can queue a `devRequests` doc when Samy asks for a build/fix/change —
// deliberately WRITE-ONLY from chat's perspective: no shell, no file, no code
// execution. Requests are reviewed and marked done here or in settings.
//
// Storage follows the same local-db doc-store pattern as every other
// collection (server-db.ts over data/lifeos.db).
import { createDoc, listDocs, updateDoc } from "./server-db";

export const DEV_REQUESTS_COLLECTION = "users/local/devRequests";

export type DevRequestStatus = "queued" | "done";

export interface DevRequest {
  id: string;
  project?: string;
  title: string;
  description: string;
  status: DevRequestStatus;
  createdAt: string; // ISO timestamp
  completedAt?: string;
}

export interface DevRequestInput {
  project?: string;
  title: string;
  description: string;
}

/**
 * Pure validation for the queue_dev_request tool schema.
 * Returns an error message on invalid input, null when valid.
 */
export function validateDevRequestInput(input: unknown): string | null {
  if (typeof input !== "object" || input === null) {
    return "Invalid input: expected an object with title and description.";
  }
  const { project, title, description } = input as Record<string, unknown>;
  if (project !== undefined && typeof project !== "string") {
    return "Invalid input: project must be a string.";
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    return "Tool error: title is required and cannot be empty.";
  }
  if (typeof description !== "string" || description.trim().length === 0) {
    return "Tool error: description is required and cannot be empty.";
  }
  return null;
}

/** Persist a queued dev request. Returns the stored doc. */
export function addDevRequest(input: DevRequestInput): DevRequest {
  const createdAt = new Date().toISOString();
  const id = createDoc(DEV_REQUESTS_COLLECTION, {
    ...(input.project ? { project: input.project } : {}),
    title: input.title,
    description: input.description,
    status: "queued" as const,
    createdAt,
  });
  return { id, ...input, status: "queued", createdAt };
}

/** All dev requests, oldest first (stable reading order). */
export function listDevRequests(): DevRequest[] {
  return listDocs(DEV_REQUESTS_COLLECTION, {
    orderBy: ["createdAt", "asc"],
  }) as unknown as DevRequest[];
}

/** Queued-only view for the review surface. */
export function listQueuedDevRequests(): DevRequest[] {
  return listDevRequests().filter((r) => r.status === "queued");
}

/** Mark a request done. No-op (returns false) if the id doesn't exist. */
export function completeDevRequest(id: string): boolean {
  const existing = listDocs(DEV_REQUESTS_COLLECTION, {
    where: [["id", "==", id]],
  });
  if (existing.length === 0) return false;
  updateDoc(DEV_REQUESTS_COLLECTION, id, {
    status: "done",
    completedAt: new Date().toISOString(),
  });
  return true;
}
