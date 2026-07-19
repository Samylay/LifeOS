"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plus, Trash2, ExternalLink, ChevronDown } from "lucide-react";
import { BUCKET_LABELS, type Bucket, type Edition, type Feed, type NewsItem } from "@/lib/news/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BUCKET_ORDER: Bucket[] = ["tech", "sec", "video", "news"];

function scoreMark(score: number): string {
  return score >= 5 ? "🔥" : score >= 4 ? "⭐" : "•";
}

// Editions written before the tldr/summary split have no tldr — fall back to
// the long summary rather than rendering an empty card.
function NewsCard({ item }: { item: NewsItem }) {
  const [open, setOpen] = useState(false);
  const line = item.tldr || item.summary;
  // Nothing more to reveal when the summary adds nothing over the one-liner.
  const expandable = Boolean(item.summary) && item.summary !== line;

  return (
    <Card className="p-4 gap-0">
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-1 flex items-start gap-2 transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.99]"
      >
        <span aria-hidden>{scoreMark(item.score)}</span>
        <span className="flex-1 font-medium leading-snug">{item.title}</span>
        <ExternalLink size={14} className="mt-1 shrink-0 text-muted-foreground/70" />
      </a>

      <p className="text-sm leading-relaxed text-muted-foreground">
        {line}
      </p>

      {expandable && (
        <div
          className="grid"
          style={{
            gridTemplateRows: open ? "1fr" : "0fr",
            transition: "grid-template-rows var(--duration-normal) var(--ease-out-custom)",
          }}
        >
          <div className="overflow-hidden">
            <p className="pt-2 text-sm leading-relaxed text-muted-foreground/70">
              {item.summary}
            </p>
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground/70">
          {item.source}
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

export default function NewsPage() {
  const [edition, setEdition] = useState<Edition | null>(null);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFeeds, setShowFeeds] = useState(false);
  const [form, setForm] = useState<{ name: string; url: string; bucket: Bucket; french: boolean }>({
    name: "",
    url: "",
    bucket: "tech",
    french: false,
  });

  const loadFeeds = useCallback(async () => {
    const r = await fetch("/api/news/feeds");
    const j = await r.json();
    setFeeds(j.feeds ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const [er] = await Promise.all([fetch("/api/news/run"), loadFeeds()]);
      const j = await er.json();
      setEdition(j.edition ?? null);
      setLoading(false);
    })();
  }, [loadFeeds]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await fetch("/api/news/run", { method: "POST" });
      const j = await r.json();
      setEdition(j.edition ?? null);
    } finally {
      setRefreshing(false);
    }
  };

  const addFeed = async () => {
    const r = await fetch("/api/news/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (r.ok) {
      setForm({ name: "", url: "", bucket: "tech", french: false });
      await loadFeeds();
    }
  };

  const toggleFeed = async (f: Feed) => {
    await fetch("/api/news/feeds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id, active: !f.active }),
    });
    await loadFeeds();
  };

  const deleteFeed = async (f: Feed) => {
    await fetch("/api/news/feeds", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id }),
    });
    await loadFeeds();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 text-foreground">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">News</h1>
          <p className="text-sm text-muted-foreground/70">
            {edition
              ? `${edition.items.length} article${edition.items.length === 1 ? "" : "s"} · ${edition.date}`
              : "Digest personnalisé — cybersécurité & dev"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowFeeds((s) => !s)}
            variant="secondary"
            size="sm"
            className="gap-2 text-sm font-medium"
          >
            Feeds ({feeds.length})
          </Button>
          <Button
            onClick={refresh}
            disabled={refreshing}
            size="sm"
            className="gap-2 text-sm font-medium"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Génération…" : "Refresh"}
          </Button>
        </div>
      </header>

      {showFeeds && (
        <Card className="mb-6 p-4 gap-0">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Manage feeds
          </h2>
          <ul className="mb-4 space-y-1.5">
            {feeds.map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-sm">
                <button
                  onClick={() => toggleFeed(f)}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition-transform duration-150 active:scale-[0.95] border ${
                    f.active ? "bg-accent text-primary border-transparent" : "bg-transparent text-muted-foreground/70 border-border"
                  }`}
                  title={f.active ? "Active — click to pause" : "Paused — click to activate"}
                >
                  {f.active ? "on" : "off"}
                </button>
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground/70">
                  {BUCKET_LABELS[f.bucket]}
                </span>
                <button
                  onClick={() => deleteFeed(f)}
                  className="rounded p-1 transition-transform duration-150 active:scale-[0.9] text-muted-foreground/70"
                  aria-label={`Remove ${f.name}`}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Name"
              className="h-auto py-1 text-sm"
              style={{ minWidth: 120 }}
            />
            <Input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://…/feed"
              className="flex-1 h-auto py-1 text-sm"
              style={{ minWidth: 180 }}
            />
            <Select value={form.bucket} onValueChange={(v) => setForm({ ...form, bucket: v as Bucket })}>
              <SelectTrigger size="sm" className="text-sm h-auto py-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUCKET_ORDER.map((b) => (
                  <SelectItem key={b} value={b}>
                    {BUCKET_LABELS[b]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1 text-xs text-muted-foreground/70">
              <input
                type="checkbox"
                checked={form.french}
                onChange={(e) => setForm({ ...form, french: e.target.checked })}
              />
              FR
            </label>
            <Button
              onClick={addFeed}
              disabled={!form.name || !form.url}
              size="sm"
              className="gap-2 text-sm font-medium"
            >
              <Plus size={15} /> Add
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-muted-foreground/70">Loading…</p>
      ) : !edition || edition.items.length === 0 ? (
        <p className="text-muted-foreground/70">
          Rien de pertinent pour l’instant. Hit Refresh to generate today’s edition.
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
