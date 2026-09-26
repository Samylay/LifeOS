"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, ExternalLink, ChevronDown, Settings2, Sparkles, Rows3, LayoutList, Search } from "lucide-react";
import { BUCKET_LABELS, type Bucket, type Edition, type NewsItem } from "@/lib/news/types";
import { Newsletters } from "@/components/newsletters";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Page, PageHeader } from "@/components/ui/page";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

const BUCKET_ORDER: Bucket[] = ["news", "tech", "sec", "video"];

const POLL_MS = 20_000;

// Editions written before the tldr/summary split have no tldr — fall back to
// the long summary rather than rendering an empty card.
type Density = "compact" | "comfortable";

function NewsCard({ item, density, onRead }: { item: NewsItem; density: Density; onRead: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const compact = density === "compact";
  const line = item.tldr || item.summary;
  // Nothing more to reveal when the summary adds nothing over the one-liner.
  const expandable = Boolean(item.summary) && item.summary !== line;

  return (
    <Card
      className={`${compact ? "p-4" : "p-5"} gap-0 border-l-2 ${item.score >= 5 ? "border-l-primary" : "border-l-border"}`}
    >

      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className={`${compact ? "mb-0.5" : "mb-1"} flex items-start gap-2 transition-transform duration-150 [transition-timing-function:var(--ease-out-custom)] hover:-translate-y-0.5 active:scale-[0.97]`}
      >
        <span className="flex-1 font-medium leading-snug">{item.title}</span>
        <ExternalLink size={14} className="mt-1 shrink-0 text-muted-foreground/70" />
      </a>

      <p className={`text-sm leading-relaxed text-muted-foreground ${compact ? "line-clamp-2" : ""}`}>
        {line}
      </p>

      {expandable && open && (
        <p className="enter pt-2 text-sm leading-relaxed text-muted-foreground/70">
          {item.summary}
        </p>
      )}

      <div className={`${compact ? "mt-1" : "mt-2"} flex flex-wrap items-center justify-between gap-2`}>
        <span className="flex items-center gap-2 text-xs text-muted-foreground/70">
          {item.source}
          {item.degraded && (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground/70">
              unsplit issue
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
        {item.newsletterId && <Button variant="ghost" size="sm" onClick={() => onRead(item.newsletterId!)}>Full newsletter</Button>}
        {expandable && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-transform duration-150 [transition-timing-function:var(--ease-out-custom)] active:scale-[0.97] text-muted-foreground/70"
          >
            {open ? "Less" : "Details"}
            <ChevronDown
              size={13}
              style={{
                transform: open ? "rotate(180deg)" : "none",
                transition: "transform var(--dur-base) var(--ease-out-custom)",
              }}
            />
          </button>
        )}
        </div>
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
  const [loadError, setLoadError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refreshArmed, setRefreshArmed] = useState(false);
  const [density, setDensity] = useState<Density>("compact");
  const [view, setView] = useState<"digest" | "full">("digest");
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [bucketFilter, setBucketFilter] = useState("");
  const [pushDevices, setPushDevices] = useState<number | null>(null);
  // generatedAt of the edition we had when generation started — polling stops
  // once GET returns something newer (or anything, if we had nothing).
  const baselineRef = useRef<string | null>(null);
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void fetch("/api/push/subscribe").then((response) => response.json()).then((data) => setPushDevices(data.subs.length)).catch(() => {});
    const saved = window.localStorage.getItem("lifeos-news-density");
    if (saved === "compact" || saved === "comfortable") setDensity(saved);
  }, []);

  const changeDensity = (next: Density) => {
    setDensity(next);
    window.localStorage.setItem("lifeos-news-density", next);
  };

  const fetchEdition = useCallback(async (): Promise<Edition | null> => {
    const r = await fetch("/api/news/run");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    return j.edition ?? null;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setEdition(await fetchEdition());
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchEdition]);

  const retryLoad = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    void fetchEdition()
      .then(setEdition)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
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

  const visibleItems = (edition?.items ?? []).filter((item) =>
    (!bucketFilter || item.bucket === bucketFilter) && (!source || item.source === source) &&
    `${item.title} ${item.tldr} ${item.summary} ${item.source}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Page className="max-w-4xl">
      <PageHeader
        title="News digest"
        actions={
          <>
          <Sheet><SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="News reading options"><Settings2 size={18} /></Button></SheetTrigger>
            <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
              <SheetHeader><SheetTitle>Reading options</SheetTitle><SheetDescription>Card density, sources and notifications.</SheetDescription></SheetHeader>
              <div className="space-y-4 px-4">
                <div className="flex items-center rounded-lg border border-border p-0.5" aria-label="Card density" role="group">
            <button
              type="button"
              onClick={() => changeDensity("compact")}
              aria-label="Compact cards"
              aria-pressed={density === "compact"}
              title="Compact cards"
              className={`rounded-md p-1.5 transition-transform duration-150 [transition-timing-function:var(--ease-out-custom)] active:scale-[0.97] ${density === "compact" ? "bg-surface-3 text-foreground" : "text-muted-foreground/70"}`}
            >
              <Rows3 size={15} />
            </button>
            <button
              type="button"
              onClick={() => changeDensity("comfortable")}
              aria-label="Comfortable cards"
              aria-pressed={density === "comfortable"}
              title="Comfortable cards"
              className={`rounded-md p-1.5 transition-transform duration-150 [transition-timing-function:var(--ease-out-custom)] active:scale-[0.97] ${density === "comfortable" ? "bg-surface-3 text-foreground" : "text-muted-foreground/70"}`}
            >
              <LayoutList size={15} />
            </button>
          </div>
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-sm font-medium text-muted-foreground">
            <Link href="/news/feeds">
              <Settings2 size={15} /> Manage feeds
            </Link>
          </Button>
                <p className="text-sm text-muted-foreground">Daily reminder from 08:00, after quiet hours. {pushDevices === 0 ? <Link className="underline" href="/settings#settings-notifications">Enable device notifications</Link> : pushDevices !== null ? `${pushDevices} device${pushDevices === 1 ? "" : "s"} registered` : <Link className="underline" href="/settings#settings-notifications">Notification settings</Link>}</p>
              </div>
            </SheetContent>
          </Sheet>
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
          </>
        }
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2" role="group" aria-label="Reading view">
            <Button variant={view === "digest" ? "default" : "outline"} aria-pressed={view === "digest"} onClick={() => setView("digest")}>Skim digest</Button>
            <Button variant={view === "full" ? "default" : "outline"} aria-pressed={view === "full"} onClick={() => { setSelectedIssue(null); setView("full"); }}>Full newsletters</Button>
          </div>

        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <label className="col-span-2 flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border px-3 focus-within:ring-2 focus-within:ring-primary/30"><Search size={16} className="text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search headlines, topics, sources…" aria-label="Search news" className="w-full bg-transparent text-sm outline-none" /></label>
          {view === "digest" && <>
            <select aria-label="Filter section" value={bucketFilter} onChange={(event) => setBucketFilter(event.target.value)} className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="">All sections</option>{BUCKET_ORDER.map((bucket) => <option key={bucket} value={bucket}>{BUCKET_LABELS[bucket]}</option>)}</select>
            <select aria-label="Filter source" value={source} onChange={(event) => setSource(event.target.value)} className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="">All sources</option>{[...new Set(edition?.items.map((item) => item.source) ?? [])].sort().map((name) => <option key={name}>{name}</option>)}</select>
          </>}
        </div>
      </div>

      {view === "full" ? <Newsletters search={search} initialId={selectedIssue} /> : loading ? (
        <EditionSkeleton />
      ) : loadError ? (
        <Card className="flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load today&apos;s edition.</p>
          <Button onClick={retryLoad} size="sm" variant="secondary" className="gap-2 text-sm font-medium">
            <RefreshCw size={15} /> Retry
          </Button>
        </Card>
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
        <>{visibleItems.length === 0 && <p className="text-sm text-muted-foreground">No stories match these filters.</p>}{BUCKET_ORDER.map((bucket) => {
          const items = visibleItems.filter((it) => it.bucket === bucket);
          if (items.length === 0) return null;
          return (
            <section key={bucket} className="mb-6">
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
                {BUCKET_LABELS[bucket]} <Badge variant="secondary" className="ml-1 align-middle">{items.length}</Badge>
              </h2>
              <div className={density === "compact" ? "space-y-2" : "space-y-4"}>
                {items.map((it) => (
                  <NewsCard key={`${it.source}:${it.link}:${it.title}`} item={it} density={density} onRead={(id) => { setSelectedIssue(id); setView("full"); window.scrollTo({ top: 0 }); }} />
                ))}
              </div>
            </section>
          );
        })}</>
      )}
    </Page>
  );
}
