// T-voice-rework-04 — a spoken decision becomes a card in the /decide deck:
// the SAME collection ("users/local/triageQueue") every bookmark-triage card
// comes from, so it sits in the deck Samy already clears rather than a
// second inbox he has to learn (spec.md "sitting in the same deck as
// everything else").
//
// THE TRUST BOUNDARY (issue 04, spec.md "Trust boundary"): `legacyDestinationToAction`
// (lib/decide/actions.ts) exists because a `proposal.destination` STRING can
// carry ingested text into a typed param — the review fix there was to
// validate whatever follows a `backlog:`/`roadmap:` prefix against a closed
// vocabulary instead of capturing it verbatim. This module takes the safer
// route of never building that string from the transcript at all: a voice
// card is always written with NO `destination`. `proposedAction()` then
// resolves it to `null`, so the deck shows "Pick an action" instead of a
// pre-chosen one (triage-card.tsx already renders that state for any item
// with no resolvable proposal) — exactly what the ticket asks for when
// nothing in the closed set fits what Samy said. What Samy spoke travels
// only as `proposal.summary`/`title`: inert display text that is never fed
// back through legacyDestinationToAction or parseActionRequest, so it can
// never become an action id or a typed parameter, however instruction-shaped
// it reads (see voice-decide.test.ts's hostile cases, parameterised the way
// the STATE.md review lesson requires — not just the bare transcript).
import { createDoc } from "@/lib/server-db";
import type { TriageSource } from "@/lib/triage";

export const VOICE_DECIDE_COLLECTION = "users/local/triageQueue";
const TITLE_MAX = 120;

export interface VoiceDecideDoc {
  url: string;
  rawUrl: string;
  source: TriageSource;
  savedAt: { __date: string };
  status: "proposed";
  createdAt: { __date: string };
  proposal: {
    title: string;
    summary: string;
    why_relevant: string;
    confidence: "low";
    rationale: string;
    // NOTE: deliberately no `destination` key here. See the trust-boundary
    // comment above — this is the one field a transcript must never fill in.
  };
}

/**
 * Pure builder: the text Samy spoke (already stripped of any "decide:"
 * prefix by voice-routing.ts's route()) plus the capture moment, produce the
 * exact document that lands in the deck. No I/O, so "what does a spoken
 * decision look like as a card" is answerable in a test with nothing
 * running (spec.md story 20).
 */
export function buildVoiceDecideDoc(text: string, now: Date): VoiceDecideDoc {
  const trimmed = text.trim();
  const title = (trimmed || "spoken decision").slice(0, TITLE_MAX);
  const iso = now.toISOString();
  return {
    // An id, not a fetchable link — there is no source URL for a spoken
    // decision. Kept prefixed and namespaced so it can never collide with a
    // real http(s) url from a grabber.
    url: `voice:decide:${now.getTime()}`,
    rawUrl: trimmed,
    source: "voice",
    savedAt: { __date: iso },
    status: "proposed",
    createdAt: { __date: iso },
    proposal: {
      title,
      summary: trimmed,
      why_relevant: "Captured by voice — you said this needed a call.",
      confidence: "low",
      rationale:
        "Spoken decision. No action from the closed set was guessed automatically — pick one to approve.",
    },
  };
}

/**
 * Files one spoken decision as a card and reports its id. Throws on I/O
 * failure — the caller (api/voice/save) must not mark the capture landed
 * when this throws, so a failed write stays recoverable rather than being
 * silently lost (spec.md story 22, issue 04's last checklist item).
 */
export function fileVoiceDecision(text: string, now: Date = new Date()): { id: string } {
  const doc = buildVoiceDecideDoc(text, now);
  const id = createDoc(VOICE_DECIDE_COLLECTION, doc as unknown as Record<string, unknown>);
  return { id };
}
