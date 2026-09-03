"use client";

// /decide/dispatch — queue instructions for a Claude Code session on the
// homelab and send the batch as one merged brief (T-decide-rework-08).
//
// This restores the bulk send-to-Claude path that went out with the adaptive
// prototype (ROADMAP T78). It is only that path: no adaptive workspace, no
// templates, no nightly per-item minting call — the triage killed those on
// purpose.
//
// Two rules hold this surface up:
//
// 1. QUEUING NEVER LAUNCHES. Adding a prompt writes a queued doc and nothing
//    else. Starting a session is the separate Send button — Samy's deliberate
//    tap (T47, 2026-07-14), which is why chat cannot launch one.
// 2. SAMY WRITES THE INSTRUCTION. A dispatched prompt is executed by an agent,
//    and a triage item is text ingested from the internet, so none of the
//    item's own text is sent. The card's title is shown here for context
//    while he writes; what crosses is his words plus the item's id.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Send, Terminal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Page, PageHeader } from "@/components/ui/page";

interface QueuedPrompt {
  id: string;
  title?: string;
  prompt?: string;
  itemId?: string;
}

interface Dispatchable {
  id: string;
  url: string;
  title: string;
  filedAs: string;
}

async function post(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(String(data.error ?? `HTTP ${res.status}`));
  return data;
}

// The queued title is derived from Samy's own instruction, never the item —
// it becomes a heading inside the merged prompt an agent executes.
function titleFrom(instruction: string): string {
  return instruction.trim().split("\n")[0].slice(0, 80);
}

export default function DispatchPage() {
  const [queued, setQueued] = useState<QueuedPrompt[]>([]);
  const [candidates, setCandidates] = useState<Dispatchable[]>([]);
  const [windowDays, setWindowDays] = useState(7);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    const [q, c] = await Promise.all([
      fetch("/api/triage/prompt-queue").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/triage/dispatchable").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setQueued((q?.items as QueuedPrompt[]) ?? []);
    setCandidates((c?.items as Dispatchable[]) ?? []);
    if (typeof c?.windowDays === "number") setWindowDays(c.windowDays);
    setLoading(false);
  }, []);

  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);

  const queuePrompt = async (item: Dispatchable) => {
    const instruction = (drafts[item.id] ?? "").trim();
    if (!instruction) {
      toast.error("write the instruction first — the item's own text is never sent");
      return;
    }
    try {
      await post("/api/triage/prompt-queue", {
        itemId: item.id,
        title: titleFrom(instruction),
        prompt: instruction,
      });
      setDrafts((d) => ({ ...d, [item.id]: "" }));
      toast.success("queued — nothing runs until you send");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "could not queue");
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/triage/prompt-queue?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "could not remove");
    }
  };

  // The one launching gesture on this surface. Everything above only queues.
  const send = async () => {
    setSending(true);
    try {
      const d = await post("/api/triage/dispatch", {});
      const batches = Number(d.batchCount ?? 1);
      toast.success(
        `sent ${d.itemCount} to Claude${batches > 1 ? ` in ${batches} briefs` : ""}`,
      );
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "dispatch failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <Page narrow className="max-w-lg">
      <PageHeader
        kicker="Hand work over"
        title="Send to Claude"
        description="Queue instructions, then send them as one brief. Queuing never starts a session."
        icon={Terminal}
      />
      <Link
        href="/decide"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-transform duration-150 active:scale-[0.97]"
      >
        ← Saved items
      </Link>

      {loading ? (
        <div className="shimmer rounded-xl bg-card p-10 text-center text-sm text-muted-foreground">
          loading…
        </div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              Queued{queued.length > 0 && <span className="ml-1.5 text-xs text-primary">{queued.length}</span>}
            </h2>
            {queued.length === 0 ? (
              <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Nothing queued. Write an instruction below, or ask the assistant to queue one.
              </p>
            ) : (
              <>
                <ul className="space-y-2">
                  {queued.map((q) => (
                    <li key={q.id} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {q.title || "untitled"}
                          </p>
                          <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                            {q.prompt}
                          </p>
                        </div>
                        <button
                          onClick={() => remove(q.id)}
                          aria-label="Remove from the queue"
                          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-transform duration-150 hover:text-destructive active:scale-[0.97]"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={send}
                  disabled={sending}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm font-semibold text-success transition-transform duration-150 active:scale-[0.97] disabled:opacity-40 max-lg:[min-height:44px]"
                >
                  {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  Send {queued.length} to Claude
                </button>
              </>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Filed in the last {windowDays} days</h2>
            {candidates.length === 0 ? (
              <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Nothing recent to hand over. Filing is the action now — older items are done.
              </p>
            ) : (
              <ul className="space-y-2">
                {candidates.map((item) => (
                  <li key={item.id} className="space-y-2 rounded-lg border border-border bg-card p-3">
                    <p className="text-sm font-medium leading-snug text-foreground">{item.title}</p>
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer"
                        className="block truncate text-xs text-primary">
                        {item.url}
                      </a>
                    )}
                    <textarea
                      value={drafts[item.id] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                      rows={2}
                      placeholder="What should Claude do about this? Your words are what gets sent."
                      className="w-full rounded-md border border-border bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground"
                    />
                    <button
                      onClick={() => queuePrompt(item)}
                      className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-transform duration-150 active:scale-[0.97] max-lg:[min-height:36px]"
                    >
                      Queue
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Page>
  );
}
