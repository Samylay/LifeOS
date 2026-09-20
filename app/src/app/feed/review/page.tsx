"use client";

/* eslint-disable @next/next/no-img-element -- private corpus images have no reliable intrinsic dimensions */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Bookmark, Check, ExternalLink, RotateCcw, X } from "lucide-react";
import { Page, PageHeader } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import type { FeedCard } from "@/lib/feed";

const SKIPPED_KEY = "lifeos-ui-inspiration-skipped";

export default function InspirationReviewPage() {
  const [cards, setCards] = useState<FeedCard[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/feed/inspiration");
      if (!response.ok) throw new Error("inspiration unavailable");
      const data: { cards: FeedCard[] } = await response.json();
      setCards(data.cards);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SKIPPED_KEY) || "[]");
      if (Array.isArray(stored)) setSkipped(new Set(stored.filter((id): id is string => typeof id === "string")));
    } catch {
      // A malformed local preference should not prevent the review flow.
    }
    void load();
  }, [load]);

  const pending = useMemo(
    () => cards.filter((card) => card.status === "fresh" && !skipped.has(card.id)),
    [cards, skipped],
  );
  const card = pending[index];
  const reviewed = cards.length - pending.length;

  const moveNext = useCallback(() => {
    // One item leaves the pending list after each action. Clamp to the new
    // last index so acting on the final visible item does not hide remaining
    // skipped items behind an empty state.
    setIndex((value) => Math.min(value, Math.max(pending.length - 2, 0)));
  }, [pending.length]);

  const skip = useCallback(() => {
    if (!card) return;
    const next = new Set(skipped).add(card.id);
    setSkipped(next);
    localStorage.setItem(SKIPPED_KEY, JSON.stringify([...next]));
    moveNext();
  }, [card, moveNext, skipped]);

  const keep = useCallback(async () => {
    if (!card || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/feed/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, type: "keep" }),
      });
      if (!response.ok) throw new Error("save failed");
      setCards((current) => current.map((item) => item.id === card.id ? { ...item, status: "kept" } : item));
      moveNext();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }, [card, moveNext, saving]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); skip(); }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "s") { event.preventDefault(); void keep(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keep, skip]);

  return (
    <Page narrow className="max-w-2xl">
      <PageHeader
        kicker="Feed · inspiration"
        title="Review UI inspiration"
        description="Keep the ideas worth returning to. Skip only hides an item on this device."
        actions={<Link href="/feed" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-transform duration-[var(--dur-fast)] active:scale-[0.97]"><ArrowLeft size={15} /> Back to feed</Link>}
      />

      {loading ? <div className="shimmer rounded-xl bg-card p-10 text-center text-sm text-muted-foreground">Loading inspiration…</div> : error ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load the inspiration set.</p>
          <button onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-transform duration-[var(--dur-fast)] active:scale-[0.97]"><RotateCcw size={15} /> Retry</button>
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">No UI inspiration items are available.</div>
      ) : !card ? (
        <section className="rounded-xl border border-border bg-card p-8 text-center">
          <Check className="mx-auto h-7 w-7 text-primary" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">Review complete</h2>
          <p className="mt-2 text-sm text-muted-foreground">You reviewed all {cards.length} inspiration items.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button onClick={() => { localStorage.removeItem(SKIPPED_KEY); setSkipped(new Set()); setIndex(0); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-transform duration-[var(--dur-fast)] active:scale-[0.97]"><RotateCcw size={15} /> Review skipped again</button>
            <Link href="/feed" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-transform duration-[var(--dur-fast)] active:scale-[0.97]">Back to feed <ArrowRight size={15} /></Link>
          </div>
        </section>
      ) : (
        <section aria-labelledby="inspiration-title" className="space-y-4">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <p aria-live="polite"><span className="font-medium text-foreground">{index + 1}</span> of {pending.length} remaining</p>
            <p>{reviewed} reviewed</p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-label={`${reviewed} of ${cards.length} reviewed`} role="progressbar" aria-valuemin={0} aria-valuemax={cards.length} aria-valuenow={reviewed}>
            <div className="h-full origin-left rounded-full bg-primary transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-custom)]" style={{ transform: `scaleX(${cards.length ? reviewed / cards.length : 0})` }} />
          </div>

          <article className="enter overflow-hidden rounded-xl border border-border bg-card shadow-card">
            {card.images?.[0] && <figure className="border-b border-border bg-surface-2"><img src={card.images[0].url} alt={card.images[0].alt || card.hook} className="max-h-[46vh] w-full object-contain" /></figure>}
            <div className="space-y-5 p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="rounded-full bg-secondary px-2 py-1 text-secondary-foreground">{card.company || "abtest.design"}</span>{card.category && <span className="rounded-full border border-border px-2 py-1">{card.category}</span>}</div>
              <div><h2 id="inspiration-title" className="text-2xl font-semibold tracking-tight">{card.hook}</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{card.body}</p></div>
              {card.results?.length ? <div><p className="text-xs font-medium uppercase tracking-wider text-primary">Observed result</p><ul className="mt-2 space-y-1 text-sm">{card.results.map((result) => <li key={result}>· {result}</li>)}</ul></div> : null}
              {card.source && <a href={card.source.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground underline decoration-border underline-offset-4 transition-transform duration-[var(--dur-fast)] active:scale-[0.97]">Open source <ExternalLink size={14} /></a>}
            </div>
          </article>

          <div className="grid grid-cols-2 gap-3" aria-label="Review actions">
            <button onClick={skip} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-transform duration-[var(--dur-fast)] active:scale-[0.97]" aria-label="Skip this inspiration"><X size={17} /> Skip <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] sm:inline">←</kbd></button>
            <button onClick={() => void keep()} disabled={saving} className={cn("inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-medium text-accent-foreground transition-transform duration-[var(--dur-fast)] active:scale-[0.97]", saving && "opacity-60")} aria-label="Save this inspiration"><Bookmark size={17} /> {saving ? "Saving…" : "Save & next"} <kbd className="hidden rounded border border-accent-foreground/30 px-1.5 py-0.5 text-[10px] sm:inline">→</kbd></button>
          </div>
          <p className="text-center text-xs text-muted-foreground">Keyboard: ← skip · → or S save</p>
        </section>
      )}
    </Page>
  );
}
