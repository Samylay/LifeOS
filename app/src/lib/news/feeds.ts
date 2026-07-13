// Server-side feed management over the local doc store. Feeds seed themselves
// from DEFAULT_FEEDS the first time they're read, so a fresh install has a
// working lineup without a migration step.
import { listDocs, createDoc, updateDoc, deleteDoc } from "@/lib/server-db";
import { DEFAULT_FEEDS, FEEDS_COLLECTION, type Bucket, type Feed } from "./types";

function seedIfEmpty(): void {
  const existing = listDocs(FEEDS_COLLECTION);
  if (existing.length > 0) return;
  const addedAt = new Date().toISOString();
  for (const f of DEFAULT_FEEDS) createDoc(FEEDS_COLLECTION, { ...f, addedAt });
}

export function listFeeds(): Feed[] {
  seedIfEmpty();
  return listDocs(FEEDS_COLLECTION).map((d) => ({
    id: d.id,
    name: String(d.name ?? ""),
    url: String(d.url ?? ""),
    bucket: (d.bucket as Bucket) ?? "tech",
    french: Boolean(d.french),
    active: d.active !== false,
    addedAt: String(d.addedAt ?? ""),
  }));
}

export function activeFeeds(): Feed[] {
  return listFeeds().filter((f) => f.active);
}

export function addFeed(input: { name: string; url: string; bucket?: Bucket; french?: boolean }): string {
  const name = input.name.trim();
  const url = input.url.trim();
  if (!name || !/^https?:\/\//.test(url)) throw new Error("feed needs a name and an http(s) url");
  return createDoc(FEEDS_COLLECTION, {
    name,
    url,
    bucket: input.bucket ?? "tech",
    french: Boolean(input.french),
    active: true,
    addedAt: new Date().toISOString(),
  });
}

export function updateFeed(id: string, patch: Partial<Omit<Feed, "id" | "addedAt">>): void {
  updateDoc(FEEDS_COLLECTION, id, patch);
}

export function removeFeed(id: string): void {
  deleteDoc(FEEDS_COLLECTION, id);
}
