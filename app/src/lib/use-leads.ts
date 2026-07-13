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

  const setStatus = (id: string, status: LeadStatus) =>
    update(id, { status, updatedAt: new Date() } as Partial<Lead>);

  return { leads: items, loading, setStatus, remove };
}
