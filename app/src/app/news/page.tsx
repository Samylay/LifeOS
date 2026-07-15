"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plus, Trash2, ExternalLink, ChevronDown } from "lucide-react";
import { BUCKET_LABELS, type Bucket, type Edition, type Feed, type NewsItem } from "@/lib/news/types";

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
    <article
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--border-primary)", background: "var(--bg-secondary)" }}
    >
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-1 flex items-start gap-2 transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.99]"
      >
        <span aria-hidden>{scoreMark(item.score)}</span>
        <span className="flex-1 font-medium leading-snug">{item.title}</span>
        <ExternalLink size={14} className="mt-1 shrink-0" style={{ color: "var(--text-tertiary)" }} />
      </a>

      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
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
            <p className="pt-2 text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              {item.summary}
            </p>
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {item.source}
        </span>
        {expandable && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-transform duration-150 active:scale-[0.95]"
            style={{ color: "var(--text-tertiary)" }}
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
    </article>
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

  const btn =
    "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-transform duration-150 active:scale-[0.97]";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6" style={{ color: "var(--text-primary)" }}>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">News</h1>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            {edition
              ? `${edition.items.length} article${edition.items.length === 1 ? "" : "s"} · ${edition.date}`
              : "Digest personnalisé — cybersécurité & dev"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFeeds((s) => !s)}
            className={btn}
            style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}
          >
            Feeds ({feeds.length})
          </button>
          <button
            onClick={refresh}
            disabled={refreshing}
            className={btn}
            style={{ background: "var(--accent)", color: "white", opacity: refreshing ? 0.6 : 1 }}
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Génération…" : "Refresh"}
          </button>
        </div>
      </header>

      {showFeeds && (
        <section
          className="mb-6 rounded-xl border p-4"
          style={{ borderColor: "var(--border-primary)", background: "var(--bg-secondary)" }}
        >
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            Manage feeds
          </h2>
          <ul className="mb-4 space-y-1.5">
            {feeds.map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-sm">
                <button
                  onClick={() => toggleFeed(f)}
                  className="rounded px-2 py-0.5 text-xs font-medium transition-transform duration-150 active:scale-[0.95]"
                  style={{
                    background: f.active ? "var(--accent-bg)" : "transparent",
                    color: f.active ? "var(--accent)" : "var(--text-tertiary)",
                    border: "1px solid var(--border-primary)",
                  }}
                  title={f.active ? "Active — click to pause" : "Paused — click to activate"}
                >
                  {f.active ? "on" : "off"}
                </button>
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {BUCKET_LABELS[f.bucket]}
                </span>
                <button
                  onClick={() => deleteFeed(f)}
                  className="rounded p-1 transition-transform duration-150 active:scale-[0.9]"
                  style={{ color: "var(--text-tertiary)" }}
                  aria-label={`Remove ${f.name}`}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Name"
              className="rounded-lg border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border-primary)", background: "var(--bg-primary)", minWidth: 120 }}
            />
            <input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://…/feed"
              className="flex-1 rounded-lg border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border-primary)", background: "var(--bg-primary)", minWidth: 180 }}
            />
            <select
              value={form.bucket}
              onChange={(e) => setForm({ ...form, bucket: e.target.value as Bucket })}
              className="rounded-lg border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border-primary)", background: "var(--bg-primary)" }}
            >
              {BUCKET_ORDER.map((b) => (
                <option key={b} value={b}>
                  {BUCKET_LABELS[b]}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
              <input
                type="checkbox"
                checked={form.french}
                onChange={(e) => setForm({ ...form, french: e.target.checked })}
              />
              FR
            </label>
            <button
              onClick={addFeed}
              disabled={!form.name || !form.url}
              className={btn}
              style={{ background: "var(--accent)", color: "white", opacity: !form.name || !form.url ? 0.5 : 1 }}
            >
              <Plus size={15} /> Add
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <p style={{ color: "var(--text-tertiary)" }}>Loading…</p>
      ) : !edition || edition.items.length === 0 ? (
        <p style={{ color: "var(--text-tertiary)" }}>
          Rien de pertinent pour l’instant. Hit Refresh to generate today’s edition.
        </p>
      ) : (
        BUCKET_ORDER.map((bucket) => {
          const items = edition.items.filter((it) => it.bucket === bucket);
          if (items.length === 0) return null;
          return (
            <section key={bucket} className="mb-6">
              <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                {BUCKET_LABELS[bucket]} <span style={{ color: "var(--text-tertiary)" }}>({items.length})</span>
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
