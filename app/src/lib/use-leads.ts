"use client";

// Website-build leads (ingested from scout/demand_scout.py via /api/leads).
// Persistent, status-tracked — the counterpart to the ephemeral /pager.
//
// Reads go through GET /api/leads, not the generic useCollection/`/api/data`
// path every other collection uses: that endpoint is the one place the cap
// (ticket 02) is enforced, so the client can never see more than a handful no
// matter how it's queried. Mutations (status changes, delete) still go
// through the normal by-id document writes — those don't grow the visible
// set, they only ever remove from it.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth, LOCAL_USER } from "./auth-context";
import { updateDocument, deleteDocument } from "./firestore";
import { ADMISSION_CAP } from "./leads/admission";
import { buildOutcomeUpdate, buildPassUpdate, isPassReason, type LeadOutcome, type PassReason } from "./leads/outcomes";
import type { RelatedWorkNote } from "./leads/related-work";

const LEADS_PATH = "leads";
const POLL_MS = 4000;

// "lost" (ticket 04) sits alongside "won" as the other resolution a contacted
// lead can reach — recorded so the filter can eventually be judged against
// money, never shown anywhere as a status a lead starts in.
export const LEAD_STATUSES = ["new", "contacted", "won", "lost", "passed"] as const;
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
  // Stamped once, the moment each outcome is recorded (ticket 04, story 11) —
  // never touched again, so "when" stays truthful even if status is somehow
  // re-read later.
  wonAt?: Date;
  lostAt?: Date;
  /** Set only when status is "passed" — one of the closed PASS_REASONS, never free text. */
  passReason?: PassReason;
  passedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  /** Why admission let this one through — the one line every card shows. */
  admissionReason: string;
  /** Ticket 01's contract fields, as delivered — never invented client-side. */
  counterparty: string;
  requirement: string;
  deadline: Date | null;
  /** Samy's own relevant prior work (lib/leads/related-work.ts); empty when none matched. */
  relatedWork: RelatedWorkNote[];
}

interface ApiLead {
  id: string;
  source?: string;
  extId?: string;
  title?: string;
  url?: string;
  budget?: string;
  budgetFloor?: number;
  categories?: string;
  brief?: string;
  postedAt?: unknown;
  status?: LeadStatus;
  contactedAt?: unknown;
  wonAt?: unknown;
  lostAt?: unknown;
  passReason?: unknown;
  passedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  admissionReason: string;
  counterparty?: string;
  requirement?: string;
  deadline?: unknown;
  relatedWork?: RelatedWorkNote[];
}

function toDate(v: unknown): Date {
  const iso = v && typeof v === "object" && "__date" in (v as Record<string, unknown>) ? (v as { __date: string }).__date : v;
  const d = typeof iso === "string" ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d : new Date();
}

function toOptionalDate(v: unknown): Date | undefined {
  if (v === undefined || v === null) return undefined;
  const d = toDate(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function reviveLead(raw: ApiLead): Lead {
  return {
    id: raw.id,
    source: raw.source ?? "unknown",
    extId: raw.extId ?? "",
    title: raw.title ?? "(untitled)",
    url: raw.url ?? "",
    budget: raw.budget ?? "non précisé",
    budgetFloor: typeof raw.budgetFloor === "number" ? raw.budgetFloor : 0,
    categories: raw.categories ?? "",
    brief: raw.brief ?? "",
    postedAt: toDate(raw.postedAt),
    status: raw.status ?? "new",
    contactedAt: toOptionalDate(raw.contactedAt),
    wonAt: toOptionalDate(raw.wonAt),
    lostAt: toOptionalDate(raw.lostAt),
    passReason: isPassReason(raw.passReason) ? raw.passReason : undefined,
    passedAt: toOptionalDate(raw.passedAt),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
    admissionReason: raw.admissionReason,
    counterparty: raw.counterparty ?? "",
    requirement: raw.requirement ?? "",
    deadline: toOptionalDate(raw.deadline) ?? null,
    relatedWork: Array.isArray(raw.relatedWork) ? raw.relatedWork : [],
  };
}

export function useLeads() {
  const uid = (useAuth().user ?? LOCAL_USER).uid;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [cap, setCap] = useState<number>(ADMISSION_CAP);
  const [lastDeliveredAt, setLastDeliveredAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const cancelled = useRef(false);

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/leads");
      if (!res.ok || cancelled.current) return;
      const data = (await res.json()) as { leads: ApiLead[]; cap: number; lastDeliveredAt: string | null };
      if (cancelled.current) return;
      setLeads(data.leads.map(reviveLead));
      setCap(data.cap);
      setLastDeliveredAt(data.lastDeliveredAt ? new Date(data.lastDeliveredAt) : null);
    } catch {
      // Server unreachable — leave last state in place, same as the local-db poll.
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelled.current = false;
    fetchLeads();
    const interval = setInterval(fetchLeads, POLL_MS);
    return () => {
      cancelled.current = true;
      clearInterval(interval);
    };
  }, [fetchLeads]);

  // Optimistic: an acted-on lead leaves the surface immediately rather than
  // waiting out the next poll (house doctrine — optimistic UI on frequent
  // mutations), then a refetch reconciles against the server. Every mutation
  // below only ever removes a lead from the visible list, never adds one —
  // the cap can't be grown from here.
  const setOutcome = (id: string, outcome: LeadOutcome) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    const update = buildOutcomeUpdate(outcome, new Date());
    updateDocument(uid, LEADS_PATH, id, { ...update, updatedAt: new Date() }).finally(fetchLeads);
  };

  // One gesture (the tap that opens the closed set) plus one choice (the
  // reason itself) — never a second screen, never free text.
  const pass = (id: string, reason: PassReason) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    const update = buildPassUpdate(reason, new Date());
    updateDocument(uid, LEADS_PATH, id, { ...update, updatedAt: new Date() }).finally(fetchLeads);
  };

  const remove = (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    deleteDocument(uid, LEADS_PATH, id).finally(fetchLeads);
  };

  return { leads, loading, cap, lastDeliveredAt, setOutcome, pass, remove };
}
