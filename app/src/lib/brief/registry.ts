// Fetcher registry for the in-app morning-brief builder (took over from the
// retired ~/services/brief host service — see docs/morning-brief-takeover.md).
//
// Each fetcher is a zero-arg async callable returning a card, a list of cards,
// or null to omit its card from today's brief (e.g. no digest edition exists).
// Fetchers must not catch their own top-level errors — the builder wraps each
// call and turns exceptions into an error card, so one broken source never
// takes down the brief.

import type { BriefCard, CardPriority, CardStatus } from "@/lib/brief-types";

export function card(c: {
  id: string;
  type: string;
  priority: CardPriority;
  status: CardStatus;
  title: string;
  body: Record<string, unknown>;
  link?: string | null;
  error?: string | null;
}): BriefCard {
  return { link: null, error: null, ...c };
}

export type FetchResult = BriefCard | BriefCard[] | null;

export interface FetcherMeta {
  id: string;
  type: string;
  priority: CardPriority;
  title: string;
}

export interface RegisteredFetcher {
  fetch: () => Promise<FetchResult>;
  meta: FetcherMeta; // fallback used to build the error card when fetch throws
}

import * as work from "./fetchers/work";
import * as fuite from "./fetchers/fuite";
import * as ft from "./fetchers/ft";
import * as digest from "./fetchers/digest";
import * as planning from "./fetchers/planning";
import * as triage from "./fetchers/triage";

// Surviving set (today-brief-rework 01): planning, work, triage, then the
// digest cards. Removed: ships (data source destroyed by the /projects
// rework), workout and objectives (dropped on Samy's call), prompt
// (superseded by /prime leading the delivery), homelab (relocated to
// /status, which already owns getStandingGoals()). This order is the
// contract registry.test.ts asserts — add/remove a card here and nowhere
// else.
export const REGISTRY: RegisteredFetcher[] = [
  { fetch: planning.fetch, meta: { id: "planning", type: "planning", priority: "action", title: "Today's plan" } },
  { fetch: work.fetch, meta: { id: "work", type: "work", priority: "action", title: "Today's work" } },
  { fetch: triage.fetch, meta: { id: "triage", type: "triage", priority: "action", title: "Triage" } },
  { fetch: fuite.fetch, meta: { id: "fuite", type: "fuite", priority: "state", title: "Fuite du jour" } },
  { fetch: ft.fetch, meta: { id: "ft_headlines", type: "ft_headlines", priority: "state", title: "FT headlines" } },
  { fetch: digest.fetch, meta: { id: "quorky_digest", type: "quorky_digest", priority: "state", title: "Quorky Digest" } },
];
