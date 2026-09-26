import { getDoc, listDocs, setDoc } from "@/lib/server-db";
import { INBOX_COLLECTION, ISSUES_COLLECTION, type InboxItem } from "./types";

export function preserveIssue(email: InboxItem): void {
  if (!getDoc(ISSUES_COLLECTION, email.id)) {
    setDoc(ISSUES_COLLECTION, email.id, email as unknown as Record<string, unknown>);
  }
}

export function listIssues(): InboxItem[] {
  const issues = new Map<string, InboxItem>();
  for (const collection of [ISSUES_COLLECTION, INBOX_COLLECTION]) {
    for (const doc of listDocs(collection)) issues.set(doc.id, doc as unknown as InboxItem);
  }
  return [...issues.values()].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export function getIssue(id: string): InboxItem | null {
  return (getDoc(ISSUES_COLLECTION, id) ?? getDoc(INBOX_COLLECTION, id)) as unknown as InboxItem | null;
}
