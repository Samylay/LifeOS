"use client";

import { useEffect, useState } from "react";

type Preset = { id: string; label: string; purpose: string };
type Result = { preset: string; requestedUrl: string; canonicalUrl: string; title: string; markdown: string; fitMarkdown: string; links: Array<{ href: string; text?: string }>; media: Array<{ src: string; type?: string; alt?: string }>; success: boolean; error?: string; durationMs: number; persisted: false };

const DEFAULT_URL = "https://docs.crawl4ai.com/core/quickstart/";

export default function Crawl4AiPocPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [preset, setPreset] = useState("source");
  const [url, setUrl] = useState(DEFAULT_URL);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState("checking");

  useEffect(() => {
    fetch("/api/crawl4ai/poc").then((res) => res.json()).then((data) => {
      setPresets(data.presets || []);
      setHealth(data.health?.reachable ? `connected${data.health.version ? ` · ${data.health.version}` : ""}` : data.health?.error || "unavailable");
    }).catch(() => setHealth("unavailable"));
  }, []);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/crawl4ai/poc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preset, url }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed.");
      setResult(data.result);
    } catch (error) {
      setResult({ preset, requestedUrl: url, canonicalUrl: url, title: "", markdown: "", fitMarkdown: "", links: [], media: [], success: false, error: error instanceof Error ? error.message : "Request failed.", durationMs: 0, persisted: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Internal experiment</p>
        <h1 className="text-3xl font-semibold tracking-tight">Crawl4AI PoC</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Read-only browser crawling for source fetches, evidence, news, brief cards, knowledge, learning material, and UI references. Nothing is persisted.</p>
        <p className="text-xs text-muted-foreground">Service: <span className="font-mono">{health}</span></p>
      </header>

      <section className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-[220px_1fr_auto] md:items-end">
        <label className="space-y-2 text-sm"><span className="text-muted-foreground">PoC</span><select value={preset} onChange={(event) => setPreset(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2">{presets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="space-y-2 text-sm"><span className="text-muted-foreground">Public URL</span><input value={url} onChange={(event) => setUrl(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs" placeholder="https://example.com/article" /></label>
        <button type="button" onClick={run} disabled={busy || !url.trim()} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-transform duration-150 active:scale-[0.97] disabled:opacity-50">{busy ? "Crawling…" : "Run preview"}</button>
      </section>

      {result && <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-medium">{result.title || result.canonicalUrl}</h2><p className="text-xs text-muted-foreground">{result.success ? "Success" : "Failed"} · {result.durationMs}ms · persisted: {String(result.persisted)}</p></div><span className="rounded-full border border-border px-2 py-1 text-xs">{result.preset}</span></div>
        {result.error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{result.error}</p>}
        {result.success && <div className="grid gap-4 lg:grid-cols-[1fr_260px]"><pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-md bg-background p-4 text-xs leading-relaxed">{result.fitMarkdown || result.markdown || "No Markdown returned."}</pre><div className="space-y-4 text-xs"><div><h3 className="mb-2 font-medium">Links ({result.links.length})</h3><ul className="space-y-1">{result.links.slice(0, 20).map((link) => <li key={link.href}><a className="break-all text-primary underline" href={link.href} target="_blank" rel="noreferrer">{link.text || link.href}</a></li>)}</ul></div><div><h3 className="mb-2 font-medium">Media ({result.media.length})</h3><p className="text-muted-foreground">Captured as metadata only in this PoC.</p></div></div></div>}
      </section>}
    </main>
  );
}
