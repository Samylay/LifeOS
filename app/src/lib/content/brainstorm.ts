// T-content-rework-01 — the AI helps Samy write; it never writes for him.
//
// This module replaces buildScriptPrompt/draftScriptForIdea. The vertical it
// belongs to was built, complete and working, and used almost not at all: 18
// ideas, one ever scripted, none ever posted. The cause was not a missing
// feature, it was a rejected premise — Samy will not post content he did not
// write by hand, so the headline capability produced exactly the thing he
// refuses to ship.
//
// So the rule here is enforced, not trusted. validateBrainstorm rejects any
// response carrying postable text, which means a prompt edit two months from
// now cannot quietly bring the generator back: the tests below fail first.
//
// Pure — no I/O. claude-cli stays the only boundary.

export interface BrainstormIdea {
  title: string;
  body: string;
  // "" when the idea has not been sorted yet, which is normal: /decide files
  // idea-bank cards with no type.
  contentType: string;
}

export interface ContentTypeRef {
  key: string;
  label: string;
}

export interface HookRef {
  n: number;
  name: string;
  template: string;
}

export interface BrainstormCatalog {
  types: ContentTypeRef[];
  hooks: HookRef[];
}

export interface Brainstorm {
  angles: string[];
  questions: string[];
  // A suggestion Samy accepts or overrides — never a demand.
  contentType: string | null;
  hooks: number[];
}

export type BrainstormResult =
  | { ok: true; value: Brainstorm }
  | { ok: false; reason: string };

export function buildBrainstormPrompt(idea: BrainstormIdea, catalog: BrainstormCatalog): string {
  const lines = [
    "You are helping a solo developer think through a short-form post idea for",
    "his build-in-public channel. He writes every word he posts himself.",
    "",
    "YOUR HARD LIMIT: you do not write anything he could post. No script, no",
    "spoken lines, no opening line written out, no closing line, no tags. If you",
    "catch yourself drafting the post, stop and ask him a question instead.",
    "",
    "Give him back four things:",
    "1. ANGLES — two to four different ways into this idea, one line each,",
    "   described from the outside (\"frame it as a debugging story\"), not",
    "   performed (\"So here's the thing...\").",
    "2. QUESTIONS — what he needs to answer before he can write it. The gaps",
    "   only he can fill: what actually happened, what surprised him, numbers.",
    "3. CONTENT TYPE — which of his types this fits best, by key.",
    "4. HOOKS — the numbers of the hook formulas worth trying, no more than three.",
    "",
    `IDEA: ${idea.title}`,
  ];

  if (idea.body.trim()) {
    lines.push("", "WHAT HE HAS WRITTEN SO FAR:", idea.body.trim());
  }
  if (idea.contentType) {
    lines.push("", `He has sorted this as: ${idea.contentType}`);
  } else {
    lines.push("", "He has not sorted this into a type yet.");
  }

  if (catalog.types.length > 0) {
    lines.push("", "HIS CONTENT TYPES:");
    for (const t of catalog.types) lines.push(`- ${t.key}: ${t.label}`);
  }
  if (catalog.hooks.length > 0) {
    lines.push("", "HIS HOOK FORMULAS:");
    for (const h of catalog.hooks) lines.push(`- #${h.n} ${h.name}: "${h.template}"`);
  }

  lines.push(
    "",
    "Reply as JSON: { angles: string[], questions: string[],",
    "contentType: string | null, hooks: number[] }.",
    "Every angle and question is one short line. Do not write prose he could read out.",
  );
  return lines.join("\n");
}

// --- the house law, mechanically -------------------------------------------

// Fields that only exist to carry postable text. Their presence is the
// generator returning, whatever the values look like.
const POSTABLE_FIELDS = ["script", "caption", "hashtags", "post", "voiceover", "captions"];

// Shapes that mean "this is the post, not help writing it".
const POSTABLE_PATTERNS: Array<[RegExp, string]> = [
  [/#\w/, "hashtags"],
  [/^\s*(hook|beat\s*\d|cta|outro|intro)\s*[:\-]/im, "script beats"],
  [/\((?:read aloud|to camera|voiceover|vo)\)/i, "a performance direction"],
];

// An angle is a line. Anything this long is a draft, not a direction.
const MAX_LINE = 400;

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function validateBrainstorm(response: unknown): BrainstormResult {
  if (typeof response !== "object" || response === null || Array.isArray(response)) {
    return { ok: false, reason: "response was not an object" };
  }
  const r = response as Record<string, unknown>;

  for (const field of POSTABLE_FIELDS) {
    if (r[field] !== undefined) {
      // Deliberately does not echo the value: a rejected response must not
      // reach the caller as content by way of an error message.
      return { ok: false, reason: `response carried a "${field}" field — the app does not write posts` };
    }
  }

  const angles = isStringArray(r.angles) ? r.angles : [];
  const questions = isStringArray(r.questions) ? r.questions : [];

  for (const line of [...angles, ...questions]) {
    if (line.length > MAX_LINE) {
      return { ok: false, reason: "response contained prose long enough to be a script" };
    }
    for (const [pattern, what] of POSTABLE_PATTERNS) {
      if (pattern.test(line)) {
        return { ok: false, reason: `response contained ${what}` };
      }
    }
  }

  // An empty shell is a failure. The done bar is that Samy gets back
  // something he did not have.
  if (angles.length === 0 && questions.length === 0) {
    return { ok: false, reason: "response had no angles or questions" };
  }

  const hooks = Array.isArray(r.hooks)
    ? r.hooks.filter((h): h is number => typeof h === "number").slice(0, 3)
    : [];

  return {
    ok: true,
    value: {
      angles,
      questions,
      contentType: typeof r.contentType === "string" && r.contentType ? r.contentType : null,
      hooks,
    },
  };
}
