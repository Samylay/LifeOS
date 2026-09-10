// /feed — infinite-scroll learning feed over the teach-topic queue.
//
// Spec: .scratch/feed/MAP.md (validated against learning-science / landscape /
// LLM-quality research, 2026-07-20). The load-bearing rules encoded here:
// - A scrolled-past card is EXPOSURE, never learning. Only a quiz answer
//   moves `intervalIndex` (fluency illusion); keep/scroll never touch it.
// - Quiz cards for a sub-concept are served only after one of its non-quiz
//   cards has been shown (novices need exposure before discrimination).
// - Never two consecutive cards from the same topic — constraints relax in a
//   FIXED order on small pools rather than deadlocking (see planFeedBatch).
import { createHash } from "node:crypto";
import { createDoc, getDoc, listDocs, setDoc, updateDoc } from "./server-db";
import { getTopic } from "./teach";
import { getAbTestImageUrl, loadAbTestCases } from "./abtest-design";

export const CARDS = "users/local/feedCards";
export const CONCEPT_MAPS = "users/local/feedConceptMaps";
export const EVENTS = "users/local/feedEvents";
const TOPICS = "users/local/teachTopics";

/** Resurfacing intervals in days, indexed by `intervalIndex` (SM-2-lite). */
export const INTERVALS_DAYS = [1, 3, 7, 21];
const DAY_MS = 24 * 60 * 60 * 1000;

export type CardFormat = "concept" | "quiz" | "wild_example" | "misconception";
export type QuizKind = "recognition" | "discrimination";

export interface FeedQuiz {
  kind: QuizKind;
  question: string;
  options: string[]; // exactly 4 as stored; shuffled at serve time
  answerIndex: number; // into options AS STORED
  why: string;
  misconceptions?: string[];
}

export interface FeedCard {
  id: string;
  topicId: string; // "" for explore cards (no owning topic yet)
  /** queue = generated from a TeachTopic; explore = the discovery lane —
   * cards from OUTSIDE the queue that scout new centers of interest. */
  origin: "queue" | "explore";
  /** Explore cards only: the candidate interest domain (tag-shaped, lowercase
   * 2-4 words) — 2 keeps promote it into the T58 proposal deck. */
  domain?: string;
  subConcept: string;
  format: CardFormat;
  hook: string;
  body: string;
  quiz?: FeedQuiz;
  status: "fresh" | "kept" | "killed" | "flagged";
  timesShown: number;
  lastShownAt?: unknown; // { __date } marker
  intervalIndex: number; // 0..3 → INTERVALS_DAYS; quiz results only
  lastResult?: "correct" | "wrong";
  keptAt?: unknown;
  postable: boolean;
  contentHash: string;
  createdAt?: unknown;
  /** Optional presentation metadata for imported learning material. */
  company?: string;
  category?: string;
  results?: string[];
  images?: FeedImage[];
  source?: { url: string; label?: string };
}

export interface FeedImage {
  /** Relative manifest path, retained for allowlist checks and diagnostics. */
  file: string;
  /** Same-origin media URL. Never use originalUrl in the browser. */
  url: string;
  originalUrl?: string;
  label?: string;
  alt?: string;
}

const ABTEST_TOPIC = "abtest-design";

/** Map a manifest asset to the allowlisted same-origin media endpoint. */
export function abTestImageUrl(file: string): string {
  return getAbTestImageUrl(file);
}

function safeAbTestImage(file: unknown): file is string {
  return (
    typeof file === "string" &&
    file.startsWith("images/") &&
    !file.startsWith("/") &&
    !file.split("/").some((part) => part === ".." || part === ".")
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeAbTestSourceUrl(value: unknown, slug: string): string | undefined {
  try {
    const url = new URL(text(value));
    const pathname = url.pathname.replace(/\/+$/, "");
    if (url.protocol !== "https:" || url.hostname !== "abtest.design" || pathname !== `/tests/${slug}`) {
      return undefined;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Pure mapping from one imported case to a feed card. */
export function mapAbTestCase(raw: Record<string, unknown>): FeedCard | null {
  const slug = text(raw.slug);
  const title = text(raw.title);
  if (!slug || !title) return null;
  const company = text(raw.company);
  const category = text(raw.category);
  const summary = text(raw.summary);
  const results = Array.isArray(raw.results) ? raw.results.map(text).filter(Boolean) : [];
  const body = [
    summary,
    results.length ? `Results:\n${results.map((result) => `• ${result}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const images = (Array.isArray(raw.images) ? raw.images : [])
    .map((value) => (value ?? {}) as Record<string, unknown>)
    .filter((image) => safeAbTestImage(image.file))
    .map((image) => {
      const file = image.file as string;
      return {
        file,
        url: abTestImageUrl(file),
        originalUrl: text(image.originalUrl) || undefined,
        label: text(image.label) || undefined,
        alt: `${title}${company ? `, ${company}` : ""} experiment image`,
      } satisfies FeedImage;
    });
  const sourceUrl = safeAbTestSourceUrl(raw.sourceUrl, slug);
  const hook = company ? `${title} · ${company}` : title;
  const card: FeedCard = {
    id: `abtest:${slug}`,
    topicId: ABTEST_TOPIC,
    origin: "queue",
    subConcept: category,
    format: "wild_example",
    hook,
    body,
    status: "fresh",
    timesShown: 0,
    intervalIndex: 0,
    postable: false,
    contentHash: contentHash(hook, body),
    company: company || undefined,
    category: category || undefined,
    results: results.length ? results : undefined,
    images: images.length ? images : undefined,
    source: sourceUrl ? { url: sourceUrl, label: "Source: abtest.design" } : undefined,
  };
  return card;
}

/** Read-only imported cards. Malformed/missing corpus degrades to normal feed. */
export function listImportedCards(): FeedCard[] {
  try {
    const cases = loadAbTestCases();
    if (!Array.isArray(cases)) return [];
    return cases
      .map((item) => mapAbTestCase((item ?? {}) as Record<string, unknown>))
      .filter((card): card is FeedCard => card !== null);
  } catch {
    return [];
  }
}

export interface FeedConceptMap {
  id: string; // doc id == topicId
  topicId: string;
  subConcepts: { name: string; covered: number }[];
  createdAt?: unknown;
}

/** Tolerant read for concept maps — a node missing numeric `covered` reads as
 * 0 instead of NaN-poisoning the least-covered sort forever. */
export function normalizeConceptMap(id: string, raw: Record<string, unknown>): FeedConceptMap {
  const nodes = Array.isArray(raw.subConcepts) ? raw.subConcepts : [];
  return {
    id,
    topicId: String(raw.topicId ?? id),
    subConcepts: nodes
      .map((n) => {
        const node = (n ?? {}) as Record<string, unknown>;
        const covered = Number(node.covered);
        return { name: String(node.name ?? ""), covered: Number.isFinite(covered) ? covered : 0 };
      })
      .filter((n) => n.name),
    createdAt: raw.createdAt,
  };
}

export type FeedEventType = "shown" | "keep" | "kill" | "flag" | "quiz_correct" | "quiz_wrong";

export function dateMarker(ms?: number): { __date: string } {
  return { __date: new Date(ms ?? Date.now()).toISOString() };
}

export function markerMs(v: unknown): number | null {
  if (v && typeof v === "object" && "__date" in (v as object)) {
    const t = Date.parse((v as { __date: string }).__date);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** sha256 over normalized text — the v1 dedupe key (no embedding infra). */
export function contentHash(hook: string, body: string): string {
  const norm = `${hook}\n${body}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return createHash("sha256").update(norm).digest("hex");
}

/** Tolerant read — absent fields default, never crash, never migrate on read. */
export function normalizeCard(id: string, raw: Record<string, unknown>): FeedCard {
  const quiz = raw.quiz as FeedQuiz | undefined;
  const images = Array.isArray(raw.images)
    ? raw.images
        .map((value) => (value ?? {}) as Record<string, unknown>)
        .filter((image) => safeAbTestImage(image.file) && typeof image.url === "string")
        .map((image) => ({
          file: image.file as string,
          url: image.url as string,
          originalUrl: text(image.originalUrl) || undefined,
          label: text(image.label) || undefined,
          alt: text(image.alt) || undefined,
        }))
    : undefined;
  return {
    id,
    topicId: String(raw.topicId ?? ""),
    origin: raw.origin === "explore" ? "explore" : "queue",
    domain: typeof raw.domain === "string" && raw.domain ? raw.domain : undefined,
    subConcept: String(raw.subConcept ?? ""),
    format: (raw.format as CardFormat) ?? "concept",
    hook: String(raw.hook ?? ""),
    body: String(raw.body ?? ""),
    quiz:
      quiz && Array.isArray(quiz.options) && quiz.options.length >= 2
        ? {
            kind: quiz.kind === "discrimination" ? "discrimination" : "recognition",
            question: String(quiz.question ?? ""),
            options: quiz.options.map(String),
            answerIndex: Number(quiz.answerIndex ?? 0),
            why: String(quiz.why ?? ""),
            misconceptions: Array.isArray(quiz.misconceptions)
              ? quiz.misconceptions.map(String)
              : undefined,
          }
        : undefined,
    status: (["fresh", "kept", "killed", "flagged"] as const).includes(
      raw.status as FeedCard["status"]
    )
      ? (raw.status as FeedCard["status"])
      : "fresh",
    timesShown: Number(raw.timesShown ?? 0),
    lastShownAt: raw.lastShownAt,
    intervalIndex: Math.min(Math.max(Number(raw.intervalIndex ?? 0), 0), INTERVALS_DAYS.length - 1),
    lastResult:
      raw.lastResult === "correct" || raw.lastResult === "wrong" ? raw.lastResult : undefined,
    keptAt: raw.keptAt,
    postable: Boolean(raw.postable),
    contentHash: String(raw.contentHash ?? ""),
    createdAt: raw.createdAt,
    company: text(raw.company) || undefined,
    category: text(raw.category) || undefined,
    results: Array.isArray(raw.results)
      ? raw.results.map(text).filter(Boolean)
      : undefined,
    images: images?.length ? images : undefined,
    source:
      raw.source && typeof raw.source === "object" && typeof (raw.source as Record<string, unknown>).url === "string"
        ? {
            url: String((raw.source as Record<string, unknown>).url),
            label: text((raw.source as Record<string, unknown>).label) || undefined,
          }
        : undefined,
  };
}

export function listCards(): FeedCard[] {
  const stored = (listDocs(CARDS) as unknown as Array<{ id: string } & Record<string, unknown>>).map((d) =>
    normalizeCard(d.id, d)
  );
  const byId = new Map(stored.map((card) => [card.id, card]));
  // Imported cards are virtual until a user interacts with them. A stored
  // card always wins, retaining its status and learning history.
  for (const card of listImportedCards()) if (!byId.has(card.id)) byId.set(card.id, card);
  return [...byId.values()];
}

export function getCard(cardId: string): FeedCard | null {
  const raw = getDoc(CARDS, cardId) as Record<string, unknown> | null;
  if (raw) return normalizeCard(cardId, raw);
  return listImportedCards().find((card) => card.id === cardId) ?? null;
}

/** Persist an imported card only at the boundary of a user-driven mutation. */
export function materializeCard(cardId: string): FeedCard | null {
  const stored = getDoc(CARDS, cardId) as Record<string, unknown> | null;
  if (stored) return normalizeCard(cardId, stored);
  const imported = listImportedCards().find((card) => card.id === cardId);
  if (!imported) return null;
  const { id: _id, ...data } = imported;
  void _id;
  // Re-read before writing so a card created by another request remains the
  // winner. This path is intentionally absent from list/get/GET operations.
  const raced = getDoc(CARDS, cardId) as Record<string, unknown> | null;
  if (raced) return normalizeCard(cardId, raced);
  setDoc(CARDS, cardId, data);
  return imported;
}

export function logEvent(cardId: string, topicId: string, type: FeedEventType): void {
  createDoc(EVENTS, { cardId, topicId, type, at: dateMarker() });
}

// --- SM-2-lite ---------------------------------------------------------------

/** Correct → advance one interval (cap at last); wrong → reset to 0.
 * This is the ONLY code path that moves `intervalIndex`. */
export function nextIntervalIndex(current: number, correct: boolean): number {
  if (!correct) return 0;
  return Math.min(current + 1, INTERVALS_DAYS.length - 1);
}

export function applyQuizResult(cardId: string, correct: boolean): FeedCard | null {
  const card = materializeCard(cardId);
  // A non-quiz card must never gain quiz history — lastResult would pull it
  // into the due pool (isDue treats history as resurfaceable).
  if (!card || !card.quiz) return null;
  const intervalIndex = nextIntervalIndex(card.intervalIndex, correct);
  updateDoc(CARDS, cardId, {
    intervalIndex,
    lastResult: correct ? "correct" : "wrong",
  });
  logEvent(cardId, card.topicId, correct ? "quiz_correct" : "quiz_wrong");
  return { ...card, intervalIndex, lastResult: correct ? "correct" : "wrong" };
}

// --- Reactions ---------------------------------------------------------------

export function applyReaction(cardId: string, type: "keep" | "kill" | "flag"): FeedCard | null {
  const card = materializeCard(cardId);
  if (!card) return null;
  if (type === "keep") {
    // Idempotent: a resurfaced kept card (or a double-tap) must not append a
    // duplicate learning record — learningRecords feeds the "don't re-teach"
    // prompt and accretes noise otherwise. Kill/flag are forever: keep must
    // not resurrect a removed card.
    if (card.status !== "fresh") return card;
    updateDoc(CARDS, cardId, { status: "kept", postable: true, keptAt: dateMarker() });
    const topic = getTopic(card.topicId);
    if (topic) {
      const day = new Date().toISOString().slice(0, 10);
      updateDoc(TOPICS, card.topicId, {
        learningRecords: [...topic.learningRecords, `${day}: kept feed card — ${card.hook}`],
      });
    }
  } else {
    updateDoc(CARDS, cardId, { status: type === "kill" ? "killed" : "flagged" });
  }
  logEvent(cardId, card.topicId, type);
  return getCard(cardId);
}

export function markShown(cardId: string): void {
  const card = materializeCard(cardId);
  if (!card) return;
  updateDoc(CARDS, cardId, { timesShown: card.timesShown + 1, lastShownAt: dateMarker() });
  logEvent(cardId, card.topicId, "shown");
}

// --- Serving -----------------------------------------------------------------
//
// Pure over an in-memory card list so the constraint set is unit-testable.
// Constraint relaxation on small pools happens in a FIXED order (deadlock
// guard): 1) quiz-slot preference (soft), 2) topic alternation,
// 3) quiz-after-exposure gate. Due cards never resurface early — a short
// batch beats a wrong one.

export function isDue(card: FeedCard, nowMs: number): boolean {
  if (card.status === "killed" || card.status === "flagged") return false;
  const resurfaceable = card.status === "kept" || card.lastResult !== undefined;
  if (!resurfaceable) return false;
  const shownMs = markerMs(card.lastShownAt);
  if (shownMs === null) return false;
  // Quiz cards space on intervalIndex (moved ONLY by answers — the law).
  // Kept non-quiz cards have no answers to move it, so they space on how
  // often they've been shown — otherwise every bookmark reruns daily forever.
  const idx = card.quiz
    ? card.intervalIndex
    : Math.min(Math.max(card.timesShown - 1, 0), INTERVALS_DAYS.length - 1);
  return shownMs + INTERVALS_DAYS[idx] * DAY_MS <= nowMs;
}

/** Sub-concept keys are (topicId, name) — bare names collide across topics
 * (two LLM-generated maps can both have a "framing" node). */
function subKey(c: FeedCard): string {
  return `${c.topicId}::${c.subConcept}`;
}

/** Sub-concepts with ≥1 shown non-quiz card — the quiz exposure gate. */
function exposedSubConcepts(cards: FeedCard[], served: FeedCard[]): Set<string> {
  const set = new Set<string>();
  for (const c of cards) if (c.format !== "quiz" && c.timesShown > 0) set.add(subKey(c));
  for (const c of served) if (c.format !== "quiz") set.add(subKey(c));
  return set;
}

function subConceptsWithCorrect(cards: FeedCard[]): Set<string> {
  const set = new Set<string>();
  for (const c of cards) if (c.quiz && c.lastResult === "correct") set.add(subKey(c));
  return set;
}

export function planFeedBatch(all: FeedCard[], nowMs: number, count = 10): FeedCard[] {
  const hasCorrect = subConceptsWithCorrect(all);
  const due = all
    .filter((c) => isDue(c, nowMs))
    .sort((a, b) => {
      // Prefer quiz cards; among quizzes prefer discrimination once the
      // sub-concept has a correct answer; then oldest-shown first.
      const q = Number(Boolean(b.quiz)) - Number(Boolean(a.quiz));
      if (q !== 0) return q;
      const d =
        Number(b.quiz?.kind === "discrimination" && hasCorrect.has(subKey(b))) -
        Number(a.quiz?.kind === "discrimination" && hasCorrect.has(subKey(a)));
      if (d !== 0) return d;
      return (markerMs(a.lastShownAt) ?? 0) - (markerMs(b.lastShownAt) ?? 0);
    });
  // A card with quiz history belongs to the due population ONLY — serving it
  // through the fresh pool minutes after a wrong answer lets short-term
  // memory fake a correct and advance the interval with zero retention gap.
  const fresh = all
    .filter((c) => c.status === "fresh" && c.lastResult === undefined)
    .sort((a, b) => a.timesShown - b.timesShown || (markerMs(a.createdAt) ?? 0) - (markerMs(b.createdAt) ?? 0));

  const batch: FeedCard[] = [];
  const taken = new Set<string>();
  const exposed = exposedSubConcepts(all, batch);
  let dueTaken = 0;
  let exploreTaken = 0;
  // Exploration stays seasoning, never the meal: ≤~20% of a batch.
  const exploreCap = Math.ceil(count * 0.2);

  const take = (c: FeedCard) => {
    batch.push(c);
    taken.add(c.id);
    if (isDue(c, nowMs)) dueTaken++;
    if (c.origin === "explore") exploreTaken++;
    if (c.format !== "quiz") exposed.add(subKey(c));
  };
  // The explore cap binds EVERY pool, due included — kept explore cards must
  // not turn resurfacing slots into an uncapped explore rerun channel.
  const exploreOk = (c: FeedCard) => c.origin !== "explore" || exploreTaken < exploreCap;

  for (let slot = 0; slot < count; slot++) {
    const prevTopic = batch.length ? batch[batch.length - 1].topicId : null;
    // ~30% due mix, deterministic so it's testable: slots 1, 4, 7, ...
    const wantDue = slot % 3 === 1;
    const wantQuiz = slot % 4 === 3;

    const altOk = (c: FeedCard) => c.topicId !== prevTopic;

    if (wantDue) {
      // Topic alternation applies to due cards too; relax it if the due pool
      // is single-topic rather than skipping the resurfacing slot.
      const d =
        due.find((c) => !taken.has(c.id) && exploreOk(c) && altOk(c)) ??
        due.find((c) => !taken.has(c.id) && exploreOk(c));
      if (d) {
        take(d);
        continue;
      }
    }

    const pool = fresh.filter((c) => !taken.has(c.id) && exploreOk(c));
    const gateOk = (c: FeedCard) => c.format !== "quiz" || exposed.has(subKey(c));

    const pick =
      // Full constraints, honoring the soft quiz-slot preference.
      (wantQuiz ? pool.find((c) => c.format === "quiz" && gateOk(c) && altOk(c)) : undefined) ??
      pool.find((c) => gateOk(c) && altOk(c)) ??
      // Relax 1.5: an off-mix due card that keeps topics alternating beats
      // breaking alternation on fresh — but capped at ~40% of the batch, or a
      // single-topic fresh pool turns the feed into mostly reruns.
      (dueTaken < Math.ceil((slot + 1) * 0.4)
        ? due.find((c) => !taken.has(c.id) && exploreOk(c) && altOk(c))
        : undefined) ??
      // Relax 2: topic alternation.
      pool.find((c) => gateOk(c)) ??
      // Relax 3: exposure gate — a quiz beats an empty feed.
      pool.find(() => true) ??
      // Nothing fresh left: drain due even off-mix (alternating when possible).
      due.find((c) => !taken.has(c.id) && exploreOk(c) && altOk(c)) ??
      due.find((c) => !taken.has(c.id) && exploreOk(c));

    if (!pick) break;
    take(pick);
  }
  return batch;
}

// --- Exploration signals -----------------------------------------------------
//
// The explore lane's feedback loop: keeps promote a domain toward a topic
// proposal (read by proposals.ts, surfaced through the existing T58 deck);
// kills cool a domain out of future generation. Both are pure counts over
// card state — no separate ledger to drift.

/** Keeps per explore domain. 2+ ⇒ eligible as a topic proposal. */
export function exploreKeepCounts(cards?: FeedCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of cards ?? listCards()) {
    if (c.origin === "explore" && c.domain && c.status === "kept") {
      counts.set(c.domain, (counts.get(c.domain) ?? 0) + 1);
    }
  }
  return counts;
}

/** Domains with 2+ killed cards — excluded from explore generation. This is a
 * generation cooldown, NOT a tombstone: only Samy's "never" verdict in the
 * proposal deck tombstones (map 11's single eligibility mechanism). */
export function exploreKilledDomains(cards?: FeedCard[]): Set<string> {
  const kills = new Map<string, number>();
  for (const c of cards ?? listCards()) {
    if (c.origin === "explore" && c.domain && c.status === "killed") {
      kills.set(c.domain, (kills.get(c.domain) ?? 0) + 1);
    }
  }
  return new Set([...kills.entries()].filter(([, n]) => n >= 2).map(([d]) => d));
}

/** Serve-time option shuffle. Returns a NEW quiz with remapped answerIndex —
 * the stored card is never mutated (risk: off-by-one if index isn't remapped). */
export function shuffleQuiz(quiz: FeedQuiz, seed: number): FeedQuiz {
  const idx = quiz.options.map((_, i) => i);
  // Deterministic Fisher–Yates from a numeric seed (mulberry32).
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  // `misconceptions` is distractor-ordered and internal-only (spec) — a
  // shuffled copy must not carry it, or consumers would misattribute
  // misconceptions to the wrong options. The stored card keeps it.
  return {
    kind: quiz.kind,
    question: quiz.question,
    why: quiz.why,
    options: idx.map((i) => quiz.options[i]),
    answerIndex: idx.indexOf(quiz.answerIndex),
  };
}
