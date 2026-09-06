// T-voice-rework-01 — decide where a spoken transcript lands, as a pure
// function. Pure module: no recorder, no HTTP, no filesystem, no database —
// "where does this land" must be answerable in a test with nothing running,
// and this is what stops routing logic from being smeared across a route
// handler later (spec.md "New module: voice routing").
//
// The closed destination set mirrors the four surfaces the spec names, each
// already owned by another part of the app: the vault inbox, Todoist, the
// content idea bank, and the /decide queue. Vault is the fallback — never
// "unrouted" — so every transcript, including empty or unclassifiable ones,
// resolves to exactly one destination.
//
// Spoken destinations ("content idea:", "task:", "decide:", "note:") are
// recognised with plain string matching, not a model call, so explicit
// intent can never be second-guessed by a classifier that had a bad day.

export type VoiceDestination = "vault" | "todoist" | "idea-bank" | "decide";

// Typed per destination — the only structured output besides the transcript
// text itself. Nothing free-form is emitted here that a downstream agent
// could be handed as an instruction (spec.md "Trust boundary").
export type NoParams = Record<string, never>;
export interface TodoistParams {
  // Todoist's own API accepts natural-language due strings ("tomorrow",
  // "Friday") directly, so the words Samy spoke travel unchanged rather than
  // being parsed into a date this module would have to get right.
  due?: string;
}
export interface IdeaBankParams {
  pillar?: string;
}

const NO_PARAMS: NoParams = {};

// How sure the module is about a destination it reached by classifying —
// always 1 for a spoken destination, since naming a destination out loud is
// never a guess (spec.md "Spoken destinations are recognised deterministically").
export type VoiceConfidence = 1 | "high" | "low";

export type VoiceRoute =
  | { destination: "vault"; text: string; params: NoParams; confidence: VoiceConfidence }
  | { destination: "todoist"; text: string; params: TodoistParams; confidence: VoiceConfidence }
  | { destination: "idea-bank"; text: string; params: IdeaBankParams; confidence: VoiceConfidence }
  | { destination: "decide"; text: string; params: NoParams; confidence: VoiceConfidence };

// Every phrase a spoken transcript can open with to name its destination
// explicitly. Order matters only in that each key is matched independently —
// the phrases don't overlap, so match order never changes the outcome.
const SPOKEN_PREFIXES: ReadonlyArray<[string, VoiceDestination]> = [
  ["content idea", "idea-bank"],
  ["task", "todoist"],
  ["decide", "decide"],
  ["note", "vault"],
];

// Someone speaking a prefix says it, then a beat, then the rest — whisper
// renders that beat as a colon, a dash, a comma, or nothing at all. This
// matches all of those so the feature works regardless of how the sentence
// was actually spoken.
function buildPrefixPattern(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escaped}\\s*[:,\\-–—]?\\s*`, "i");
}

/**
 * Recognises a transcript that opens by naming its destination out loud.
 * Returns the destination and the remainder of the transcript with the
 * spoken prefix removed — the prefix is never allowed to survive into the
 * text that reaches the destination. Returns null when the transcript names
 * no destination, so the caller falls through to classify().
 */
export function parseSpokenDestination(
  transcript: string,
): { destination: VoiceDestination; text: string } | null {
  for (const [phrase, destination] of SPOKEN_PREFIXES) {
    const pattern = buildPrefixPattern(phrase);
    const match = transcript.match(pattern);
    if (match) {
      return { destination, text: transcript.slice(match[0].length).trim() };
    }
  }
  return null;
}

// Phrases that hint at a time-bound action. Multi-word phrases are checked
// before the single words they contain ("next friday" before "friday") so
// the longer, more specific phrase is what gets captured as the due param.
const DUE_PHRASES = [
  "next monday",
  "next tuesday",
  "next wednesday",
  "next thursday",
  "next friday",
  "next saturday",
  "next sunday",
  "next week",
  "next month",
  "tomorrow",
  "tonight",
  "today",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

// Pulls a Todoist-ready due phrase out of spoken text, verbatim as spoken
// (case preserved) — this module structures, it does not rewrite. Exported
// so voice-reroute.ts (T-voice-rework-05) can reuse the exact same due
// extraction when re-routing an existing take to Todoist, instead of
// re-running full classification against a destination the user already
// picked explicitly.
export function extractDue(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const phrase of DUE_PHRASES) {
    const index = lower.indexOf(phrase);
    if (index !== -1) return text.slice(index, index + phrase.length);
  }
  return undefined;
}

// Cue phrases used only to classify free speech that named no destination.
// These are deliberately narrow and literal — a heuristic, not a model call —
// so classify() stays a pure function with no I/O.
const DECIDE_CUES = [
  "should i",
  "should we",
  "do i keep",
  "do i sell",
  "do i go",
  "or should i",
  "trying to decide",
  "need to decide",
  "not sure if i should",
  "not sure whether",
];
const TODOIST_CUES = [
  "remind me to",
  "need to",
  "have to",
  "gotta",
  "don't forget to",
  "todo",
  "pick up",
];
const IDEA_BANK_CUES = [
  "content idea",
  "video idea",
  "post idea",
  "reel idea",
  "idea for a video",
  "idea for a post",
  "idea for a reel",
  "should make a video",
  "make a video about",
  "post about",
];

function containsAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

/**
 * Classifies a transcript that named no destination out loud. Always
 * returns a route — vault is the fallback for anything it cannot place, so
 * there is no "unknown" outcome (spec.md story 5, a hard rule not a default).
 */
export function classify(transcript: string): VoiceRoute {
  const text = transcript.trim();
  const lower = text.toLowerCase();

  if (text === "") {
    return { destination: "vault", text, params: NO_PARAMS, confidence: "low" };
  }

  // Decision language is checked first: "should I keep the bike or sell it"
  // also contains action-shaped words ("keep", "sell") that could otherwise
  // read as a todoist cue, but the question shape is the stronger signal.
  if (containsAny(lower, DECIDE_CUES)) {
    return { destination: "decide", text, params: NO_PARAMS, confidence: "high" };
  }

  if (containsAny(lower, IDEA_BANK_CUES)) {
    return { destination: "idea-bank", text, params: {}, confidence: "high" };
  }

  if (containsAny(lower, TODOIST_CUES)) {
    return { destination: "todoist", text, params: { due: extractDue(text) }, confidence: "high" };
  }

  return { destination: "vault", text, params: NO_PARAMS, confidence: "low" };
}

/**
 * The single entry point: given the words Samy spoke, decide where they
 * land and what structured parameters travel with them. A spoken
 * destination always wins over the classifier, even when the rest of the
 * words point somewhere else — explicit intent is never second-guessed.
 */
export function route(transcript: string): VoiceRoute {
  const spoken = parseSpokenDestination(transcript);
  if (!spoken) return classify(transcript);

  const { destination, text } = spoken;
  switch (destination) {
    case "vault":
      return { destination, text, params: NO_PARAMS, confidence: 1 };
    case "decide":
      return { destination, text, params: NO_PARAMS, confidence: 1 };
    case "idea-bank":
      return { destination, text, params: {}, confidence: 1 };
    case "todoist":
      return { destination, text, params: { due: extractDue(text) }, confidence: 1 };
  }
}
