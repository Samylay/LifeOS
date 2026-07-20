// Nightly feed-card generation — spec: .scratch/feed/MAP.md §Generation.
//
// Per eligible topic: concept-map (once ever) → draft (schema-validated, one
// retry, salvage) → judge (atomic SuperMemo-derived checklist; reject on
// one-fact / traceable-cue / wrong-answer) → contentHash dedupe → insert.
// Coverage of the concept map is the freshness mechanism (cover the next
// node), NOT novelty detection; the hash is only a backstop.
import { createDoc, getDoc, listDocs, updateDoc } from "./server-db";
import { generateJson } from "./claude-cli";
import { isTagTombstoned } from "./teach";
import {
  CARDS,
  CONCEPT_MAPS,
  contentHash,
  dateMarker,
  exploreKeepCounts,
  exploreKilledDomains,
  listCards,
  normalizeConceptMap,
  type FeedCard,
  type FeedConceptMap,
  type FeedQuiz,
} from "./feed";

const TOPICS = "users/local/teachTopics";
const TOPIC_FRESH_CAP = 15;
const GLOBAL_FRESH_CAP = 60;
const CARDS_PER_TOPIC_PER_RUN = 5;

function log(msg: string) {
  console.log(`[feed-generator] ${new Date().toISOString()} ${msg}`);
}

interface TopicRow {
  id: string;
  topic: string;
  mission: string;
  status: string;
  tags: string[];
  learningRecords: string[];
}

function eligibleTopics(): TopicRow[] {
  return (listDocs(TOPICS) as unknown as Array<{ id: string } & Record<string, unknown>>)
    .filter((t) => t.status === "active" || t.status === "queued")
    .map((t) => ({
      id: t.id,
      topic: String(t.topic ?? ""),
      mission: String(t.mission ?? ""),
      status: String(t.status ?? ""),
      tags: Array.isArray(t.tags) ? (t.tags as string[]) : [],
      learningRecords: Array.isArray(t.learningRecords) ? (t.learningRecords as string[]) : [],
    }));
}

// --- Stage 2: concept map (once ever per topic) ------------------------------

async function ensureConceptMap(topic: TopicRow): Promise<FeedConceptMap> {
  const raw = getDoc(CONCEPT_MAPS, topic.id) as Record<string, unknown> | null;
  if (raw) {
    const existing = normalizeConceptMap(topic.id, raw);
    if (existing.subConcepts.length > 0) return existing;
  }
  const res = await generateJson<{ subConcepts: string[] }>(
    `You are decomposing a personal learning topic into a concept map for a microlearning feed.

TOPIC: ${topic.topic}
WHY THE LEARNER WANTS THIS (mission): ${topic.mission}
WHAT THEY ALREADY KNOW (learning records, may be empty):
${topic.learningRecords.slice(-15).join("\n") || "(none)"}

Produce 15-30 sub-concepts that together cover this topic for a motivated adult
learner. Each sub-concept is ONE teachable idea (e.g. for logical fallacies:
"strawman", "ad hominem", "base-rate neglect"), named in 2-6 words. Order from
foundational to advanced. Skip anything the learning records show is mastered.

Reply with JSON only: {"subConcepts": ["...", "..."]}`
  );
  const names = (res.subConcepts ?? [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 30);
  if (names.length < 5) throw new Error(`concept map too small (${names.length}) for "${topic.topic}"`);
  const map = { topicId: topic.id, subConcepts: names.map((name) => ({ name, covered: 0 })), createdAt: dateMarker() };
  // Doc id == topicId (spec) — upsert via updateDoc, which inserts on absence.
  updateDoc(CONCEPT_MAPS, topic.id, map);
  log(`concept map created for "${topic.topic}": ${names.length} sub-concepts`);
  return { id: topic.id, ...map };
}

// --- Stage 3/4: draft + validate --------------------------------------------

interface DraftCard {
  subConcept: string;
  format: FeedCard["format"];
  hook: string;
  body: string;
  quiz?: FeedQuiz;
}

/** Returns an error string, or null if the card is structurally valid. */
export function validateDraftCard(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return "card is not an object";
  const c = raw as Record<string, unknown>;
  if (typeof c.subConcept !== "string" || !c.subConcept.trim()) return "missing subConcept";
  if (!["concept", "quiz", "wild_example", "misconception"].includes(c.format as string))
    return `bad format "${c.format}"`;
  if (typeof c.hook !== "string" || !c.hook.trim()) return "missing hook";
  if (typeof c.body !== "string" || !c.body.trim()) return "missing body";
  if (c.body.split(/\s+/).length > 80) return "body over length budget";
  if (c.format === "quiz") {
    const q = c.quiz as Record<string, unknown> | undefined;
    if (!q) return "quiz format without quiz";
    if (!["recognition", "discrimination"].includes(q.kind as string)) return "bad quiz.kind";
    if (typeof q.question !== "string" || !q.question.trim()) return "missing quiz.question";
    if (!Array.isArray(q.options) || q.options.length !== 4) return "quiz needs exactly 4 options";
    if (q.options.some((o) => typeof o !== "string" || !String(o).trim())) return "empty quiz option";
    const ai = Number(q.answerIndex);
    if (!Number.isInteger(ai) || ai < 0 || ai > 3) return "answerIndex out of range";
    if (typeof q.why !== "string" || !q.why.trim()) return "missing quiz.why";
  } else if (c.quiz) {
    return "non-quiz card carries a quiz";
  }
  return null;
}

function draftPrompt(topic: TopicRow, targets: { name: string; hooks: string[] }[], retryError?: string): string {
  const schema = `[{"subConcept": string (one of the target sub-concepts, verbatim),
  "format": "concept" | "quiz" | "wild_example" | "misconception",
  "hook": string (one line, a scroll-stopper),
  "body": string (markdown, <=60 words, exactly ONE claim + one example),
  "quiz": ONLY when format=="quiz": {"kind": "recognition"|"discrimination",
    "question": string, "options": [4 strings], "answerIndex": 0-3,
    "why": string (why the answer is right AND why each distractor is wrong),
    "misconceptions": [3 strings — the named misconception behind each distractor]}}]`;
  return `You write cards for a personal TikTok-style learning feed. One card = one
viewport = one idea. The reader is a smart CS student scrolling on his phone.

TOPIC: ${topic.topic}
MISSION (ground every card in this): ${topic.mission}
DO NOT RE-TEACH (learning records): ${topic.learningRecords.slice(-10).join("; ") || "(none)"}

TARGET SUB-CONCEPTS (cover these, one or two cards each):
${targets
  .map((t) => `- ${t.name}${t.hooks.length ? ` — already covered by: ${t.hooks.join(" / ")}` : ""}`)
  .join("\n")}

Write exactly ${CARDS_PER_TOPIC_PER_RUN} cards. Rules:
- At least 1 and at most 2 cards have format "quiz". Mix both quiz kinds across
  cards when possible: "recognition" (identify the concept) and
  "discrimination" (spot the concept in a realistic example among lookalikes).
- Quiz distractors: each of the 3 wrong options embodies a DISTINCT common
  misconception (name it in "misconceptions", same order as the distractors).
  Never a random or trivially-eliminable wrong answer.
- "why" must justify the correct answer AND say why each distractor is wrong.
- Bodies <=60 words, ONE claim + one concrete example, no enumerations.
- Never duplicate an "already covered by" hook's angle.
${retryError ? `\nYour previous reply failed validation: ${retryError}\nFix that and reply again.` : ""}
Reply with a JSON array only, schema:
${schema}`;
}

async function draftCards(topic: TopicRow, map: FeedConceptMap): Promise<DraftCard[]> {
  const existing = listCards().filter((c) => c.topicId === topic.id);
  const hooksBySub = new Map<string, string[]>();
  for (const c of existing) {
    hooksBySub.set(c.subConcept, [...(hooksBySub.get(c.subConcept) ?? []), c.hook].slice(-4));
  }
  const targets = [...map.subConcepts]
    .sort((a, b) => a.covered - b.covered)
    .slice(0, 4)
    .map((s) => ({ name: s.name, hooks: hooksBySub.get(s.name) ?? [] }));

  let raw = await generateJson<unknown[]>(draftPrompt(topic, targets));
  let errors = (Array.isArray(raw) ? raw : []).map(validateDraftCard);
  if (!Array.isArray(raw) || errors.every((e) => e !== null)) {
    const firstError = Array.isArray(raw) ? errors.find((e) => e) : "reply was not a JSON array";
    raw = await generateJson<unknown[]>(draftPrompt(topic, targets, firstError ?? "invalid"));
    errors = (Array.isArray(raw) ? raw : []).map(validateDraftCard);
  }
  if (!Array.isArray(raw)) return [];
  // Salvage individually-valid cards; never lose the night to one bad card.
  const valid = raw.filter((_, i) => errors[i] === null) as unknown as DraftCard[];
  const dropped = raw.length - valid.length;
  if (dropped > 0) log(`"${topic.topic}": dropped ${dropped} invalid draft(s): ${errors.filter(Boolean).join("; ")}`);
  // Constrain subConcept to real map nodes (model sometimes invents one).
  const nodeNames = new Set(map.subConcepts.map((s) => s.name));
  return valid.filter((c) => {
    if (nodeNames.has(c.subConcept)) return true;
    log(`"${topic.topic}": dropped card with unknown sub-concept "${c.subConcept}"`);
    return false;
  });
}

// --- Stage 5: judge ----------------------------------------------------------

interface JudgeVerdict {
  index: number;
  oneFact: boolean;
  traceableCue: boolean;
  noEnumeration: boolean;
  answerCorrect: boolean;
  distractorsPlausible: boolean;
}

async function judgeCards(topic: TopicRow, drafts: DraftCard[]): Promise<DraftCard[]> {
  if (drafts.length === 0) return [];
  const verdicts = await generateJson<JudgeVerdict[]>(
    `You are a strict flashcard-quality judge (SuperMemo's rules for formulating
knowledge). Judge each card INDEPENDENTLY against atomic pass/fail criteria.
Do not be lenient: a wrong quiz answer poisons learning.

TOPIC: ${topic.topic}

CARDS:
${JSON.stringify(drafts, null, 1)}

For each card, output:
- "index": its position in the input array
- "oneFact": true iff the body teaches exactly ONE claim (no smuggled lists)
- "traceableCue": true iff hook+body+question are unambiguous — one defensible reading
- "noEnumeration": true iff no set/enumeration is crammed into one card
- "answerCorrect": for quiz cards, VERIFY the stated answerIndex is factually
  the right option and no distractor is also defensibly correct; true for
  non-quiz cards
- "distractorsPlausible": for quiz cards, true iff distractors map to real
  misconceptions and none is trivially eliminable; true for non-quiz cards

Reply with a JSON array of verdicts only.`
  );
  const byIndex = new Map<number, JudgeVerdict>();
  for (const v of Array.isArray(verdicts) ? verdicts : []) byIndex.set(Number(v.index), v);
  const survivors: DraftCard[] = [];
  const failCounts: Record<string, number> = {};
  const HARD = ["oneFact", "traceableCue", "answerCorrect"] as const;
  const SOFT = ["noEnumeration", "distractorsPlausible"] as const;
  drafts.forEach((d, i) => {
    const v = byIndex.get(i);
    // Judge said nothing about a card → fail closed (don't insert unverified).
    if (!v) {
      failCounts.unjudged = (failCounts.unjudged ?? 0) + 1;
      return;
    }
    // Log EVERY failed criterion (P2 prompt tuning reads these), but only the
    // hard criteria reject: soft fails ship with a note in the log.
    for (const k of [...HARD, ...SOFT]) if (!v[k]) failCounts[k] = (failCounts[k] ?? 0) + 1;
    if (HARD.every((k) => v[k])) survivors.push(d);
  });
  if (Object.keys(failCounts).length > 0)
    log(
      `"${topic.topic}": judge fails ${JSON.stringify(failCounts)} — rejected ${drafts.length - survivors.length}`
    );
  return survivors;
}

// --- Stage 6: dedupe + insert ------------------------------------------------

function insertCards(topic: TopicRow, map: FeedConceptMap, drafts: DraftCard[]): number {
  const existingHashes = new Set(
    listCards()
      .filter((c) => c.topicId === topic.id)
      .map((c) => c.contentHash)
  );
  let inserted = 0;
  const coveredDelta = new Map<string, number>();
  for (const d of drafts) {
    const hash = contentHash(d.hook, d.body);
    if (existingHashes.has(hash)) {
      log(`"${topic.topic}": deduped "${d.hook}"`);
      continue;
    }
    existingHashes.add(hash);
    createDoc(CARDS, {
      topicId: topic.id,
      origin: "queue",
      subConcept: d.subConcept,
      format: d.format,
      hook: d.hook,
      body: d.body,
      ...(d.quiz ? { quiz: d.quiz } : {}),
      status: "fresh",
      timesShown: 0,
      intervalIndex: 0,
      postable: false,
      contentHash: hash,
      createdAt: dateMarker(),
    });
    coveredDelta.set(d.subConcept, (coveredDelta.get(d.subConcept) ?? 0) + 1);
    inserted++;
  }
  if (coveredDelta.size > 0) {
    const subConcepts = map.subConcepts.map((s) => ({
      ...s,
      covered: s.covered + (coveredDelta.get(s.name) ?? 0),
    }));
    updateDoc(CONCEPT_MAPS, topic.id, { subConcepts });
  }
  return inserted;
}

// --- Explore lane (Samy, 2026-07-20: "feed the homelab with new centers of
// interest") ------------------------------------------------------------------
//
// One extra call per night: 3 cards from domains OUTSIDE the topic queue,
// adjacent to Samy's standing interests. Kept explore cards promote their
// domain into the T58 proposal deck (proposals.ts reads exploreKeepCounts);
// 2 kills cool a domain out of generation. Same judge, no quizzes (a quiz on
// first contact with an unfamiliar domain is noise, not recall).

const EXPLORE_FRESH_CAP = 8;
const EXPLORE_CARDS_PER_RUN = 3;
// Interest anchors from Samy's profile (persona.txt isn't mounted in the
// container; sourced from the 2026-07-14 interest audit — edit freely).
const INTEREST_ANCHORS =
  "game design & interactive narrative (not engines), solarpunk & sustainable tech, CS theory, Rust, typography & UI craft, self-hosting, learning science";

async function generateExploreCards(): Promise<number> {
  const cards = listCards();
  const exploreFresh = cards.filter((c) => c.origin === "explore" && c.status === "fresh");
  if (exploreFresh.length >= EXPLORE_FRESH_CAP) {
    log(`explore skipped: ${exploreFresh.length} fresh explore cards buffered`);
    return 0;
  }
  const topics = eligibleTopics().map((t) => t.topic);
  // Domains already decided leave the steering prompt: accepted → they're a
  // topic now (owned tag, would contradict "do NOT overlap"); "never"
  // tombstoned → asking for more of it defies the verdict.
  const ownedTags = new Set(
    (listDocs(TOPICS) as unknown as Array<Record<string, unknown>>).flatMap((t) =>
      Array.isArray(t.tags) ? (t.tags as string[]) : []
    )
  );
  const kept = [...exploreKeepCounts(cards).keys()].filter(
    (d) => !ownedTags.has(d) && !isTagTombstoned(d)
  );
  const cooled = [...exploreKilledDomains(cards)];
  const recentDomains = [
    ...new Set(cards.filter((c) => c.origin === "explore" && c.domain).map((c) => c.domain)),
  ].slice(-12);

  const drafts = await generateJson<unknown[]>(
    `You scout NEW interests for a personal learning feed. The reader already
has a learning queue — your job is the unexpected-but-resonant card from
OUTSIDE it that might become a new center of interest.

STANDING INTERESTS (anchor adjacency, don't repeat them verbatim): ${INTEREST_ANCHORS}
CURRENT QUEUE (do NOT overlap): ${topics.join("; ") || "(none)"}
DOMAINS HE KEPT (more like these, different angles): ${kept.join(", ") || "(none yet)"}
DOMAINS TO AVOID (he killed these): ${cooled.join(", ") || "(none)"}
DOMAINS ALREADY TRIED RECENTLY (pick fresh ones): ${recentDomains.join(", ") || "(none)"}

Write exactly ${EXPLORE_CARDS_PER_RUN} cards in 2-3 DISTINCT new domains.
Rules:
- "domain": lowercase, 2-4 words, tag-shaped (e.g. "information theory",
  "biomimicry", "type systems") — it may become a learning-topic name.
- format: "concept" | "wild_example" | "misconception" (never quiz).
- hook: one line that earns the stop mid-scroll. body: <=60 words, ONE claim
  + one concrete example. No listicles, no "did you know" filler.
- Surprise beats syllabus: pick the single most captivating idea in the
  domain, not its introduction.
Reply with a JSON array only:
[{"domain": string, "subConcept": string (the specific idea), "format": ...,
  "hook": string, "body": string}]`
  );
  if (!Array.isArray(drafts)) return 0;
  const valid = drafts.filter((d) => {
    const c = d as Record<string, unknown>;
    const domain = typeof c.domain === "string" ? c.domain.trim() : "";
    return (
      // Tag-shaped domain, enforced (it flows into proposal ids and topic
      // tags): ≤4 words, ≤40 chars, no separators the id scheme uses.
      domain.length > 0 && domain.length <= 40 &&
      domain.split(/\s+/).length <= 4 && !/[:,;\n]/.test(domain) &&
      typeof c.subConcept === "string" && c.subConcept.trim() &&
      ["concept", "wild_example", "misconception"].includes(c.format as string) &&
      typeof c.hook === "string" && c.hook.trim() &&
      typeof c.body === "string" && c.body.trim() && c.body.split(/\s+/).length <= 80
    );
  }) as Array<{ domain: string; subConcept: string; format: FeedCard["format"]; hook: string; body: string }>;

  // Same judge as queue cards (quiz criteria auto-pass on non-quiz). Verdicts
  // are matched back by object identity — judgeCards returns the same draft
  // objects it was given, so no lossy hash round-trip.
  const draftObjs = valid.map((c) => ({
    subConcept: c.subConcept,
    format: c.format,
    hook: c.hook,
    body: c.body,
  }));
  const judged = new Set(
    await judgeCards(
      { id: "", topic: "exploration lane", mission: "", status: "", tags: [], learningRecords: [] },
      draftObjs
    )
  );

  const existingHashes = new Set(cards.map((c) => c.contentHash));
  let inserted = 0;
  for (let i = 0; i < valid.length; i++) {
    const d = valid[i];
    const hash = contentHash(d.hook, d.body);
    if (!judged.has(draftObjs[i]) || existingHashes.has(hash)) continue;
    existingHashes.add(hash);
    createDoc(CARDS, {
      topicId: "",
      origin: "explore",
      domain: d.domain.trim().toLowerCase(),
      subConcept: d.subConcept,
      format: d.format,
      hook: d.hook,
      body: d.body,
      status: "fresh",
      timesShown: 0,
      intervalIndex: 0,
      postable: false,
      contentHash: hash,
      createdAt: dateMarker(),
    });
    inserted++;
  }
  log(`explore: drafted ${drafts.length}, valid ${valid.length}, judged-in ${judged.size}, inserted ${inserted}`);
  return inserted;
}

// --- Entry -------------------------------------------------------------------

export interface FeedGenResult {
  topics: number;
  inserted: number;
  skipped: string[];
}

export async function runFeedGeneration(): Promise<FeedGenResult> {
  const topics = eligibleTopics();
  const result: FeedGenResult = { topics: topics.length, inserted: 0, skipped: [] };
  for (const topic of topics) {
    const fresh = listCards().filter((c) => c.status === "fresh");
    if (fresh.length >= GLOBAL_FRESH_CAP) {
      result.skipped.push(`${topic.topic} (global fresh cap)`);
      continue;
    }
    if (fresh.filter((c) => c.topicId === topic.id).length >= TOPIC_FRESH_CAP) {
      result.skipped.push(`${topic.topic} (topic fresh cap)`);
      continue;
    }
    try {
      const map = await ensureConceptMap(topic);
      const drafts = await draftCards(topic, map);
      const judged = await judgeCards(topic, drafts);
      const inserted = insertCards(topic, map, judged);
      result.inserted += inserted;
      log(`"${topic.topic}": drafted ${drafts.length}, judged-in ${judged.length}, inserted ${inserted}`);
    } catch (e) {
      log(`"${topic.topic}" crashed: ${e instanceof Error ? e.message : e}`);
      result.skipped.push(`${topic.topic} (error)`);
    }
  }
  try {
    result.inserted += await generateExploreCards();
  } catch (e) {
    log(`explore lane crashed: ${e instanceof Error ? e.message : e}`);
    result.skipped.push("exploration lane (error)");
  }
  return result;
}
