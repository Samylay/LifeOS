"use client";

// One pain point, in the words of the person who had it.
//
// The inverse of TriageCard: that card leads with an LLM's verdict because a
// saved bookmark needs one. This card has no verdict anywhere, by design — see
// lib/pain-deck.ts. The hero is the quote; everything else is the thread that
// makes the quote judgeable, because a phrase match without context lies
// ("we do this manually" turned out to be about forum federation).
//
// Context is collapsed by default so the quote is what he reads first, and
// open-able because the follow-ups are where "that already exists, it's called
// Y" lives.
import { ChevronDown, ExternalLink, Quote } from "lucide-react";
import { clampQuote, isoOf, type PainItem, type PainQuote } from "@/lib/pain-deck";
import { ageLabel } from "@/lib/bookmark-backfill";

function Thread({ label, quotes }: { label: string; quotes: PainQuote[] }) {
  if (!quotes.length) return null;
  return (
    <details className="group">
      <summary
        className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold uppercase tracking-wide transition-transform duration-150 active:scale-[0.97] max-lg:[min-height:44px]"
        style={{ color: "var(--text-tertiary)" }}
      >
        <ChevronDown
          size={13}
          className="transition-transform duration-200 group-open:rotate-180"
          style={{ transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)" }}
        />
        {label} · {quotes.length}
      </summary>
      <div className="mt-2 space-y-2">
        {quotes.map((q, i) => (
          <div
            key={`${q.url}-${i}`}
            className="border-l-2 pl-3"
            style={{ borderColor: "var(--bg-tertiary)" }}
          >
            <a
              href={q.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold transition-transform duration-150 active:scale-[0.97]"
              style={{ color: "var(--accent)" }}
            >
              {q.by}
            </a>
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {clampQuote(q.text)}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

/** Cards are absolutely positioned inside a fixed-height stack, so this card
 *  must not outgrow PAIN_STACK_HEIGHT or it paints over the Keep/Drop row.
 *  A long comment scrolls inside the quote block instead of stretching the
 *  card — the stack's axis lock already treats a vertical drag as a scroll.
 *
 *  It's a fixed height, not a max: cards here vary wildly (a 3400-char rant
 *  vs a two-line one) and the under-cards are absolutely positioned too, so a
 *  taller card behind a shorter one pokes out below the top card's edge. */
export const PAIN_STACK_HEIGHT = 560;

export function PainCard({ item }: { item: PainItem }) {
  const iso = isoOf(item.saidAt);
  const age = iso ? ageLabel(iso) : "";

  return (
    <div
      className="flex flex-col space-y-3 p-5"
      style={{ height: PAIN_STACK_HEIGHT }}
    >
      <div className="flex items-center gap-2 text-xs">
        <span
          className="rounded px-1.5 py-0.5 font-mono font-medium"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
        >
          {item.phrase || item.source}
        </span>
        {age && (
          <span className="ml-auto" style={{ color: "var(--text-tertiary)" }}>
            {age} ago
          </span>
        )}
      </div>

      {/* The thread it lives in — the initial ask. */}
      <div>
        <span
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--text-tertiary)" }}
        >
          ask
        </span>
        <h2 className="text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
          {item.storyUrl ? (
            <a
              href={item.storyUrl}
              target="_blank"
              rel="noreferrer"
              className="transition-transform duration-150 active:scale-[0.97]"
              style={{ color: "var(--text-primary)" }}
            >
              {item.storyTitle || "(unknown thread)"}
            </a>
          ) : (
            item.storyTitle || "(unknown thread)"
          )}
        </h2>
        {item.storyText && (
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            {clampQuote(item.storyText, 320)}
          </p>
        )}
      </div>

      <Thread label="replying to" quotes={item.ancestors} />

      {/* The hero: their words, complete. */}
      <div
        className="min-h-0 flex-1 overflow-y-auto rounded-lg border-l-2 p-3"
        style={{ background: "var(--bg-tertiary)", borderColor: "var(--accent)" }}
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          <Quote size={12} style={{ color: "var(--accent)" }} />
          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            {item.author}
          </span>
        </div>
        <p
          className="whitespace-pre-wrap text-sm leading-relaxed"
          style={{ color: "var(--text-primary)" }}
        >
          {item.text}
        </p>
      </div>

      <Thread label="follow-ups" quotes={item.replies} />

      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium transition-transform duration-150 active:scale-[0.97]"
        style={{ color: "var(--accent)" }}
      >
        <ExternalLink size={12} /> open thread
      </a>
    </div>
  );
}
