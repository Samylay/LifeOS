"use client";

// Website-build leads (ingested from scout/demand_scout.py via /api/leads).
// Persistent, status-tracked — the counterpart to the ephemeral /pager.
import { useCollection } from "./use-collection";

export const LEAD_STATUSES = ["new", "contacted", "won", "passed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface Lead {
  id: string;
  source: string;
  extId: string;
  title: string;
  url: string;
  budget: string;
  budgetFloor: number;
  categories: string;
  brief: string;
  postedAt: Date;
  status: LeadStatus;
  // Stamped the first time a lead is marked contacted (rendered as "contacted Nd ago").
  contactedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function useLeads() {
  const { items, loading, update, remove } = useCollection<Lead>("leads", {
    orderByField: "postedAt",
    orderDir: "desc",
    fallbackDates: ["postedAt", "createdAt", "updatedAt"],
    defaults: { status: "new" } as Partial<Lead>,
  });

  // New leads first, biggest budget first (that's the triage order); everything
  // else falls back to recency.
  const leads = [...items].sort((a, b) => {
    const aNew = a.status === "new";
    const bNew = b.status === "new";
    if (aNew !== bNew) return aNew ? -1 : 1;
    if (aNew && bNew && b.budgetFloor !== a.budgetFloor) return b.budgetFloor - a.budgetFloor;
    return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
  });

  const setStatus = (id: string, status: LeadStatus) =>
    update(id, {
      status,
      updatedAt: new Date(),
      ...(status === "contacted" ? { contactedAt: new Date() } : {}),
    } as Partial<Lead>);

  return { leads, loading, setStatus, remove };
}
