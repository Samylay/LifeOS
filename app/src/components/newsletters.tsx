"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InboxItem } from "@/lib/news/types";

type IssuePreview = Omit<InboxItem, "text"> & { preview: string; minutes: number };

export function Newsletters({ search, initialId }: { search: string; initialId?: string | null }) {
  const [issues, setIssues] = useState<IssuePreview[]>([]);
  const [issue, setIssue] = useState<InboxItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch("/api/news/issues").then(async (response) => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then((data) => { if (!cancelled) setIssues(data.issues); })
      .catch(() => { if (!cancelled) setError("Couldn't load newsletters. Try again."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => { if (initialId) void open(initialId); else setIssue(null); }, [initialId]);

  async function open(id: string) {
    setOpening(true);
    setError("");
    try {
      const response = await fetch(`/api/news/issues/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error();
      setIssue((await response.json()).issue);
    } catch { setError("Couldn't open this newsletter. Try again."); }
    finally { setOpening(false); }
  }

  if (issue) return (
    <article className="enter mx-auto max-w-3xl">
      <Button variant="ghost" onClick={() => setIssue(null)} className="mb-5 gap-2"><ArrowLeft size={16} /> All newsletters</Button>
      <p className="mb-2 text-xs text-muted-foreground">{issue.from} · {new Date(issue.receivedAt).toLocaleDateString()}</p>
      <h2 className="mb-5 text-2xl font-semibold leading-tight">{issue.subject}</h2>
      {/^https?:\/\//i.test(issue.link) && <Button asChild variant="outline" size="sm" className="mb-6"><a href={issue.link} target="_blank" rel="noopener noreferrer">Open original <ExternalLink size={14} /></a></Button>}
      <div className="whitespace-pre-wrap break-words text-base leading-8 text-foreground/90">{issue.text || "This email contained no text. Use the original link above if available."}</div>
    </article>
  );

  const filtered = issues.filter((item) => `${item.subject} ${item.from} ${item.preview}`.toLowerCase().includes(search.toLowerCase()));
  return <section aria-label="Full newsletters">
    <p className="mb-5 text-sm text-muted-foreground">Full email text, including stories outside the digest. New arrivals are kept here automatically.</p>
    {error && <div role="alert" className="mb-4 flex items-center gap-3 text-sm">{error}<Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={14} /> Retry</Button></div>}
    {loading ? <p className="text-sm text-muted-foreground">Loading newsletters…</p> : filtered.length === 0 ? <p className="text-sm text-muted-foreground">{search ? "No newsletters match your search." : "Full text will appear with the next newsletter arrival. Older emails were removed after summarizing."}</p> : <div className="divide-y divide-border">
      {filtered.map((item) => <button key={item.id} disabled={opening} onClick={() => void open(item.id)} className="w-full rounded-lg px-3 py-5 text-left transition-transform duration-150 [transition-timing-function:var(--ease-out-custom)] hover:bg-surface-2 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-primary">
        <p className="mb-1 text-xs text-muted-foreground">{item.from} · {new Date(item.receivedAt).toLocaleDateString()} · {item.minutes} min read</p>
        <h3 className="mb-2 text-lg font-semibold leading-snug">{item.subject}</h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{item.preview}</p>
        <span className="mt-3 inline-block text-xs font-medium text-primary">{opening ? "Opening…" : "Read full newsletter →"}</span>
      </button>)}
    </div>}
  </section>;
}
