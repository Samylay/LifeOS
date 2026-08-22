"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { BUCKET_LABELS, type Bucket, type Feed } from "@/lib/news/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BUCKET_ORDER: Bucket[] = ["tech", "sec", "video", "news"];

// Feed CRUD, moved off the /news reading surface (same components/logic).
export default function NewsFeedsPage() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
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
    loadFeeds();
  }, [loadFeeds]);

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
      <header className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground">
          <Link href="/news" aria-label="Back to News">
            <ArrowLeft size={16} />
          </Link>
        </Button>
        <div>
          <h1 className="">Manage feeds</h1>
          <p className="text-sm text-muted-foreground/70">
            {feeds.length} feed{feeds.length === 1 ? "" : "s"} in the daily edition
          </p>
        </div>
      </header>

      <Card className="p-4 gap-0">
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
    </div>
  );
}
