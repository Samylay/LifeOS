"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, ExternalLink, ChevronDown, Settings2, Sparkles } from "lucide-react";
import { BUCKET_LABELS, type Bucket, type Edition, type NewsItem } from "@/lib/news/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const BUCKET_ORDER: Bucket[] = ["tech", "sec", "video", "news"];

const POLL_MS = 20_000;

// Editions written before the tldr/summary split have no tldr — fall back to
// the long summary rather than rendering an empty card.
function NewsCard({ item }: { item: NewsItem }) {
  const [open, setOpen] = useState(false);
  const line = item.tldr || item.summary;
  // Nothing more to reveal when the summary adds nothing over the one-liner.
  const expandable = Boolean(item.summary) && item.summary !== line;

  return (
    <Card
      className={`p-4 gap-0 border-l-2 ${item.score >= 5 ? "border-l-primary" : "border-l-border"}`}
    >
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-1 flex items-start gap-2 transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.99]"
      >
        <span className="flex-1 font-medium leading-snug">{item.title}</span>
        <ExternalLink size={14} className="mt-1 shrink-0 text-muted-foreground/70" />
      </a>

      <p className="text-sm leading-relaxed text-muted-foreground">
        {line}
      </p>

      {expandable && open && (
        <p className="enter pt-2 text-sm leading-relaxed text-muted-foreground/70">
          {item.summary}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-muted-foreground/70">
          {item.source}
          {item.degraded && (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground/70">
              unsplit issue
            </span>
          )}
        </span>
        {expandable && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-transform duration-150 active:scale-[0.95] text-muted-foreground/70"
          >
            {open ? "Less" : "More"}
            <ChevronDown
              size={13}
              style={{
                transform: open ? "rotate(180deg)" : "none",
                transition: "transform var(--duration-normal) var(--ease-out-custom)",
              }}
            />
          </button>
        )}
      </div>
    </Card>
  );
}

function EditionSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-32" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

export default function NewsPage() {
  const [edition, setEdition] = useState<Edition | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshArmed, setRefreshArmed] = useState(false);
  // generatedAt of the edition we had when generation started — polling stops
  // once GET returns something newer (or anything, if we had nothing).
  const baselineRef = useRef<string | null>(null);
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchEdition = useCallback(async (): Promise<Edition | null> => {
    const r = await fetch("/api/news/run");
    const j = await r.json();
    return j.edition ?? null;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setEdition(await fetchEdition());
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchEdition]);

  // While generating, poll for the new edition every 20s.
  useEffect(() => {
    if (!generating) return;
    const id = setInterval(async () => {
      try {
        const e = await fetchEdition();
        if (e && e.generatedAt !== baselineRef.current) {
          setEdition(e);
          setGenerating(false);
        }
      } catch {
        // transient — keep polling
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [generating, fetchEdition]);

  // Fire-and-forget: the POST runs for minutes server-side; the poll above
  // picks the result up. Don't block the page on the response.
  const generate = useCallback(() => {
    baselineRef.current = edition?.generatedAt ?? null;
    setGenerating(true);
    fetch("/api/news/run", { method: "POST" }).catch(() => {});
  }, [edition]);

  // Two-tap armed confirm for the multi-minute regeneration.
  const refresh = () => {
    if (!refreshArmed) {
      setRefreshArmed(true);
      if (disarmTimer.current) clearTimeout(disarmTimer.current);
      disarmTimer.current = setTimeout(() => setRefreshArmed(false), 4000);
      return;
    }
    if (disarmTimer.current) clearTimeout(disarmTimer.current);
    setRefreshArmed(false);
    generate();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 text-foreground">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">News</h1>
          <p className="text-sm text-muted-foreground/70">
            {edition
              ? `${edition.items.length} article${edition.items.length === 1 ? "" : "s"} · ${edition.date}`
              : "Personalised digest — security & dev"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-sm font-medium text-muted-foreground">
            <Link href="/news/feeds">
              <Settings2 size={15} /> Manage feeds
            </Link>
          </Button>
          {edition && (
            <Button
              onClick={refresh}
              disabled={generating}
              variant={refreshArmed ? "destructive" : "default"}
              size="sm"
              className="gap-2 text-sm font-medium"
            >
              <RefreshCw size={15} className={generating ? "animate-spin" : ""} />
              {generating ? "Generating…" : refreshArmed ? "Tap again — takes minutes" : "Refresh"}
            </Button>
          )}
        </div>
      </header>

      {loading ? (
        <EditionSkeleton />
      ) : !edition ? (
        <Card className="flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {generating
              ? "Generating today's edition — this takes a few minutes. Leave the page open or come back."
              : "No edition yet today."}
          </p>
          {!generating && (
            <Button onClick={generate} size="sm" className="gap-2 text-sm font-medium">
              <Sparkles size={15} /> Generate today&rsquo;s edition
            </Button>
          )}
          {generating && (
            <RefreshCw size={16} className="animate-spin text-muted-foreground/70" />
          )}
        </Card>
      ) : edition.items.length === 0 ? (
        <p className="text-muted-foreground/70">
          Nothing relevant today. Refresh to regenerate the edition.
        </p>
      ) : (
        BUCKET_ORDER.map((bucket) => {
          const items = edition.items.filter((it) => it.bucket === bucket);
          if (items.length === 0) return null;
          return (
            <section key={bucket} className="mb-6">
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
                {BUCKET_LABELS[bucket]} <Badge variant="secondary" className="ml-1 align-middle">{items.length}</Badge>
              </h2>
              <div className="space-y-3">
                {items.map((it) => (
                  <NewsCard key={`${it.source}:${it.link}:${it.title}`} item={it} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
