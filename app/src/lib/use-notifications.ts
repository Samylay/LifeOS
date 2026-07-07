"use client";

// Pager messages (homelab notifications ingested via /api/notify).
import { useCollection } from "./use-collection";

export const PAGER_STREAMS = ["alerts", "nightly", "weekly", "capture", "system"] as const;
export type PagerStream = (typeof PAGER_STREAMS)[number];
export type PagerSeverity = "page" | "info" | "low";

export interface PagerMessage {
  id: string;
  stream: PagerStream;
  severity: PagerSeverity;
  title?: string | null;
  body: string;
  createdAt: Date;
  readAt?: Date | null;
}

export function useNotifications() {
  const { items, loading, update, remove } = useCollection<PagerMessage>("notifications", {
    orderByField: "createdAt",
    orderDir: "desc",
    fallbackDates: ["createdAt"],
  });

  const markRead = (id: string) => update(id, { readAt: new Date() } as Partial<PagerMessage>);
  const markAllRead = async (messages: PagerMessage[]) => {
    await Promise.all(messages.filter((m) => !m.readAt).map((m) => markRead(m.id)));
  };

  return { messages: items, loading, markRead, markAllRead, remove };
}
