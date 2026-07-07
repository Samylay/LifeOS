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

import * as workout from "./fetchers/workout";
import * as work from "./fetchers/work";
import * as prompt from "./fetchers/prompt";
import * as objectives from "./fetchers/objectives";
import * as homelab from "./fetchers/homelab";
import * as fuite from "./fetchers/fuite";
import * as ft from "./fetchers/ft";
import * as digest from "./fetchers/digest";

export const REGISTRY: RegisteredFetcher[] = [
  { fetch: workout.fetch, meta: { id: "workout", type: "workout", priority: "action", title: "Workout" } },
  { fetch: work.fetch, meta: { id: "work", type: "work", priority: "action", title: "Today's work" } },
  { fetch: prompt.fetch, meta: { id: "prompt", type: "prompt", priority: "action", title: "Morning prompt" } },
  { fetch: objectives.fetch, meta: { id: "objectives", type: "prompt", priority: "action", title: "Objectives" } },
  { fetch: homelab.fetch, meta: { id: "homelab", type: "homelab", priority: "state", title: "Homelab" } },
  { fetch: fuite.fetch, meta: { id: "fuite", type: "fuite", priority: "state", title: "Fuite du jour" } },
  { fetch: ft.fetch, meta: { id: "ft_headlines", type: "ft_headlines", priority: "state", title: "FT headlines" } },
  { fetch: digest.fetch, meta: { id: "quorky_digest", type: "quorky_digest", priority: "state", title: "Quorky Digest" } },
];
