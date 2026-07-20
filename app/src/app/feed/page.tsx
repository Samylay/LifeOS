"use client";

// /feed — the infinite-scroll learning feed (spec: .scratch/feed/MAP.md).
// Immersive full-screen overlay (covers sidebar + bottom nav), snap-scroll,
// one card per viewport. All interactions live in the lower half (thumb
// zone), quiz answers are buttons — never hidden gestures. Scrolling past a
// card is exposure only; only quiz answers move a card's interval (server
// enforces; this UI just never pretends otherwise).
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, Check, ChevronUp, Flag, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { FeedCard } from "@/lib/feed";

type ServedCard = FeedCard & { review?: { keptAt?: unknown } };

const FORMAT_LABEL: Record<FeedCard["format"], string> = {
  concept: "concept",
  quiz: "quiz",
  wild_example: "in the wild",
  misconception: "misconception",
};

function daysAgo(marker: unknown): string {
  if (!marker || typeof marker !== "object" || !("__date" in (marker as object))) return "";
  const ms = Date.now() - Date.parse((marker as { __date: string }).__date);
  const d = Math.max(1, Math.round(ms / 86_400_000));
  return `${d}d ago`;
}

export default function FeedPage() {
  const [cards, setCards] = useState<ServedCard[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [generating, setGenerating] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const fetching = useRef(false);
  const exhaustedUntil = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);

  const fetchMore = useCallback(async () => {
    if (fetching.current || Date.now() < exhaustedUntil.current) return;
    fetching.current = true;
    try {
      const res = await fetch("/api/feed/next?count=10");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { cards: ServedCard[] } = await res.json();
      setCards((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        const fresh = data.cards.filter((c) => !seen.has(c.id));
        // All-duplicates ⇒ the pool is drained; back off so the sentinel
        // doesn't hammer the server (each repeat serve mutates timesShown).
        if (fresh.length === 0 && prev.length > 0) exhaustedUntil.current = Date.now() + 60_000;
        const next = [...prev, ...fresh];
        setPhase(next.length === 0 ? "empty" : "ready");
        return next;
      });
    } catch {
      setPhase((p) => (p === "loading" ? "error" : p));
    } finally {
      fetching.current = false;
    }
  }, []);

  useEffect(() => {
    void fetchMore();
    if (!sessionStorage.getItem("feed-hint-shown")) {
      sessionStorage.setItem("feed-hint-shown", "1");
      setShowHint(true);
      const t = setTimeout(() => setShowHint(false), 4000);
      // Also reset on cleanup: under strict-mode double-effects the second
      // run sees the flag and skips, so the timer must not be the only path
      // back to hidden.
      return () => {
        clearTimeout(t);
        setShowHint(false);
      };
    }
  }, [fetchMore]);

  // Refetch when the tail sentinel comes into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && void fetchMore(),
      { rootMargin: "200%" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [fetchMore, cards.length]);

  const generateNow = async () => {
    setGenerating(true);
    try {
      await fetch("/api/feed/generate", { method: "POST" });
      await fetchMore();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <Link
        href="/"
        aria-label="Close feed"
        className="absolute left-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-transform duration-150 active:scale-[0.97]"
      >
        <X className="h-5 w-5" />
      </Link>

      {phase === "loading" && (
        <div className="flex h-full flex-col justify-center px-6">
          <div className="mx-auto w-full max-w-md space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-4/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      )}
      {phase === "error" && (
        <div className="flex h-full items-center justify-center text-sm text-destructive">
          feed unavailable — try again later
        </div>
      )}
      {phase === "empty" && (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-sm text-muted-foreground">
            No cards yet. Generation runs nightly from your Knowledge topics — or run it now.
          </p>
          <button
            onClick={generateNow}
            disabled={generating}
            className="flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-transform duration-150 active:scale-[0.97] disabled:opacity-50"
          >
            {generating && <RotateCw className="h-4 w-4 animate-spin" />}
            {generating ? "generating (takes a few minutes)" : "Generate now"}
          </button>
        </div>
      )}

      {phase === "ready" && (
        <div className="h-dvh snap-y snap-mandatory overflow-y-auto overscroll-contain">
          {cards.map((card) => (
            <CardView key={card.id} card={card} />
          ))}
          <div ref={sentinel} className="h-px" />
          {showHint && (
            <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 text-muted-foreground motion-safe:animate-bounce">
              <ChevronUp className="h-5 w-5" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CardView({ card }: { card: ServedCard }) {
  const [status, setStatus] = useState(card.status);
  const [picked, setPicked] = useState<number | null>(null);

  const react = (type: "keep" | "kill" | "flag") => {
    // Optimistic: state flips instantly, server catches up.
    setStatus(type === "keep" ? "kept" : type === "kill" ? "killed" : "flagged");
    void fetch("/api/feed/react", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, type }),
    });
  };

  const answer = (idx: number) => {
    if (picked !== null) return; // first tap is the answer; the rest is reading
    setPicked(idx);
    void fetch("/api/feed/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, correct: idx === card.quiz!.answerIndex }),
    });
  };

  const answered = picked !== null;
  const dimmed = status === "killed" || status === "flagged";

  return (
    <section className="relative flex h-dvh w-full snap-start flex-col justify-center px-6 pb-28 pt-14">
      <div className={cn("mx-auto w-full max-w-md transition-opacity duration-150", dimmed && "opacity-30")}>
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border px-2 py-0.5">
            {FORMAT_LABEL[card.format]}
          </span>
          <span className="truncate">{card.subConcept}</span>
          {card.review && (
            <span className="rounded-full bg-secondary px-2 py-0.5">
              review · kept {daysAgo(card.review.keptAt)}
            </span>
          )}
        </div>

        <h2 className="text-lg font-semibold leading-snug">{card.hook}</h2>
        {card.format !== "quiz" && (
          <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-foreground/90">
            {card.body}
          </p>
        )}

        {card.quiz && (
          <div className="mt-4">
            <p className="text-base leading-relaxed">{card.quiz.question}</p>
            <div className="mt-3 flex flex-col gap-2">
              {card.quiz.options.map((opt, idx) => {
                const isRight = idx === card.quiz!.answerIndex;
                const isPicked = idx === picked;
                return (
                  <button
                    key={idx}
                    onClick={() => answer(idx)}
                    disabled={answered}
                    className={cn(
                      "min-h-11 rounded-lg border border-border px-4 py-2.5 text-left text-sm transition-transform duration-150 active:scale-[0.97]",
                      !answered && "bg-card",
                      answered && isRight && "border-primary bg-primary/15",
                      answered && isPicked && !isRight && "border-destructive bg-destructive/15"
                    )}
                  >
                    {opt}
                    {answered && isRight && <Check className="ml-2 inline h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
            {answered && (
              <p className="enter mt-3 text-sm leading-relaxed text-muted-foreground">
                {card.quiz.why}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Reactions — bottom-center thumb zone. Kill left, keep right, flag offset. */}
      <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-6">
        <ReactionButton
          label="Kill card"
          onClick={() => react("kill")}
          active={status === "killed"}
          activeClass="text-destructive"
        >
          <X className="h-5 w-5" />
        </ReactionButton>
        <ReactionButton
          label="Keep card"
          onClick={() => react("keep")}
          active={status === "kept"}
          activeClass="text-primary"
        >
          <Bookmark className={cn("h-5 w-5", status === "kept" && "fill-current")} />
        </ReactionButton>
        <ReactionButton
          label="Flag card as wrong"
          onClick={() => react("flag")}
          active={status === "flagged"}
          activeClass="text-destructive"
        >
          <Flag className="h-4 w-4" />
        </ReactionButton>
      </div>
    </section>
  );
}

function ReactionButton({
  label,
  onClick,
  active,
  activeClass,
  children,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  activeClass: string;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={active}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-transform duration-150 active:scale-[0.97]",
        active && activeClass
      )}
    >
      {children}
    </button>
  );
}
