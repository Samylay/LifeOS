// T58 — tag + topic-cluster proposals on /decide.
//
// Two kinds of card, one deck (map ticket 11: "the same act — him ruling
// yes/no on something Opus noticed"):
//  - "tag" cards: study.py (triage repo) proposed a NEW controlled tag into
//    `users/local/topicTagProposals` — accept adds it to the controlled list
//    (`users/local/topicTags`), "never" tombstones it forever.
//  - "topic" cards: CLUSTER_MIN+ triage items already share a controlled tag
//    that no topic owns yet — accept turns the cluster into a real
//    `TeachTopic` (mission REQUIRED, map 06), "never" tombstones the tag so
//    the cluster stops re-proposing (this is what stops `[humor]`×12
//    proposing "learn humor" — map 11's ONLY eligibility mechanism).
//
// Trigger is count alone, recency-blind by construction: computeCandidates
// never reads a date off anything. A 2023 cluster and a this-week cluster of
// the same size are identical inputs.
import { createDoc, deleteDoc, listDocs } from "./server-db";
import { TRIAGE_COLLECTION } from "./triage-ingest";
import type { TriageItem } from "./triage";
import { addTopic, isTagTombstoned, neverProposeTag, toMs, type TeachTopic } from "./teach";

const TOPICS = "users/local/teachTopics";
const TOPIC_TAGS = "users/local/topicTags";
const TAG_PROPOSALS = "users/local/topicTagProposals";
const SURFACED = "users/local/proposalSurfaced";

// Map ticket 11's resolved answer treats "3 solarpunk saves from 2023" as a
// legitimate cluster standing equal to "6 Rust saves from this week" — 3 is
// the smallest size the resolution itself accepts as real, so it's the floor.
export const CLUSTER_MIN = 3;
// "Matching the existing rhythm of the weekly compost review (≤3
// proposals)" — ticket 11's resolution, copied verbatim (compost.sh has no
// reusable code, only this number — see ROADMAP T58).
export const WEEKLY_CAP = 3;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface TagProposal {
  id: string; // `tag:${tag}`
  kind: "tag";
  tag: string;
}

export interface TopicProposal {
  id: string; // `topic:${tag}`
  kind: "topic";
  tag: string;
  count: number;
}

export type Proposal = TagProposal | TopicProposal;

interface SurfacedDoc {
  id: string;
  key: string;
  firstSeenAt: unknown;
}

function controlledTagSet(): Set<string> {
  return new Set((listDocs(TOPIC_TAGS) as unknown as { tag: string }[]).map((t) => t.tag));
}

function ownedTagSet(): Set<string> {
  const owned = new Set<string>();
  for (const t of listDocs(TOPICS) as unknown as TeachTopic[]) {
    for (const tag of t.tags || []) owned.add(tag);
  }
  return owned;
}

/** Live, recency-blind computation of every currently-eligible candidate.
 * Nothing about eligibility is persisted — recomputed fresh every call, and
 * calling this does not affect the weekly cap (see `getProposals`). Exported
 * so trigger/tombstone/accept behavior is testable independent of the cap's
 * surfaced-tracking side effects. */
export function previewProposals(): Proposal[] {
  const controlled = controlledTagSet();
  const owned = ownedTagSet();

  const tagProposals: TagProposal[] = (listDocs(TAG_PROPOSALS) as unknown as { tag: string }[])
    .filter((p) => p.tag && !controlled.has(p.tag))
    .map((p) => ({ id: `tag:${p.tag}`, kind: "tag", tag: p.tag }));

  const counts = new Map<string, number>();
  for (const item of listDocs(TRIAGE_COLLECTION) as unknown as TriageItem[]) {
    for (const tag of item.topicTags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  const topicProposals: TopicProposal[] = [];
  for (const [tag, count] of counts) {
    if (count < CLUSTER_MIN) continue;
    if (owned.has(tag)) continue; // a topic already owns this tag — map 11
    if (isTagTombstoned(tag)) continue; // he already said never
    topicProposals.push({ id: `topic:${tag}`, kind: "topic", tag, count });
  }

  return [...tagProposals, ...topicProposals];
}

/** Day-one burst uncapped, then ≤WEEKLY_CAP NEW proposals per rolling week
 * (map 11). A candidate already shown before stays visible regardless of the
 * cap — the cap bounds how often he's newly interrupted, not what he can
 * still act on once shown. */
export function getProposals(now: Date = new Date()): Proposal[] {
  const candidates = previewProposals();
  const surfaced = listDocs(SURFACED) as unknown as SurfacedDoc[];
  const veryFirstRun = surfaced.length === 0;
  const seenKeys = new Set(surfaced.map((s) => s.key));
  const nowMs = now.getTime();
  const recentCount = surfaced.filter((s) => {
    const ms = toMs(s.firstSeenAt);
    return ms !== null && nowMs - ms <= WEEK_MS;
  }).length;

  if (veryFirstRun) {
    for (const c of candidates) createDoc(SURFACED, { key: c.id, firstSeenAt: now });
    return candidates;
  }

  const already = candidates.filter((c) => seenKeys.has(c.id));
  const brandNew = candidates.filter((c) => !seenKeys.has(c.id));
  const budget = Math.max(0, WEEKLY_CAP - recentCount);
  const admitted = brandNew.slice(0, budget);
  for (const c of admitted) createDoc(SURFACED, { key: c.id, firstSeenAt: now });

  return [...already, ...admitted];
}

function removePendingTagProposal(tag: string): void {
  for (const d of listDocs(TAG_PROPOSALS, { where: [["tag", "==", tag]] }) as unknown as { id: string }[]) {
    deleteDoc(TAG_PROPOSALS, d.id);
  }
}

export function acceptTagProposal(tag: string): void {
  if (!controlledTagSet().has(tag)) createDoc(TOPIC_TAGS, { tag, neverPropose: false });
  removePendingTagProposal(tag);
}

export function rejectTagProposal(tag: string): void {
  neverProposeTag(tag);
  removePendingTagProposal(tag);
}

/** mission is REQUIRED — addTopic throws "mission is required" if blank,
 * which the verdict route lets surface as a 400 (map 06's refusal). */
export function acceptTopicProposal(tag: string, mission: string, topicSentence?: string): string {
  const sentence = topicSentence?.trim() || `Learn about ${tag}`;
  return addTopic(sentence, mission, [tag], "proposed");
}

export function rejectTopicProposal(tag: string): void {
  neverProposeTag(tag);
}
