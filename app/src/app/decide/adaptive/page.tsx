"use client";

// PROTOTYPE — adaptive UI for approved cards. Question under test: when a
// card Samy approves in /decide opens into a workspace GENERATED from its own
// suggestion (instead of him opening the link and doing the legwork), what
// does that look like? Tap a card → it expands into its template's workspace.
// Throwaway: no persistence beyond the pre-generated specs; delete or absorb
// after the architecture conversation.
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import type { TriageQueueItem } from "@/components/decide/triage-card";
import { AdaptiveWorkspace } from "@/components/decide/adaptive-prototype/templates";
import { ExpandingWorkspace } from "@/components/decide/adaptive-prototype/expanding-card";
import { fallbackSpec, TEMPLATE_REGISTRY, type AdaptiveSpec } from "@/lib/adaptive-prototype";

interface Row {
  item: TriageQueueItem & { filedAs?: string };
  spec: (AdaptiveSpec & { itemId?: string }) | null;
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  "business-idea": { label: "💰 Business idea", color: "#F59E0B" },
  "ai-tip": { label: "✨ AI tip", color: "#8B5CF6" },
  "ai-project": { label: "🛠 AI project", color: "#8B5CF6" },
  swe: { label: "⌨️ SWE", color: "var(--accent)" },
  other: { label: "Link", color: "var(--text-tertiary)" },
};

export default function AdaptivePrototypePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [fromRect, setFromRect] = useState<DOMRect | null>(null);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    fetch("/api/triage/adaptive")
      .then((r) => r.json())
      .then((d) => setRows(d.items ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const open = useCallback((id: string) => {
    const el = cardRefs.current.get(id);
    setFromRect(el ? el.getBoundingClientRect() : null);
    setOpenId(id);
  }, []);

  const active = rows.find((r) => r.item.id === openId);
  const activeSpec: AdaptiveSpec | null = active
    ? (active.spec ?? fallbackSpec(active.item))
    : null;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-1 flex items-center gap-3">
        <Link href="/decide" aria-label="Back to Decide"
          className="rounded-lg p-1.5 transition-transform duration-150 active:scale-[0.9]"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
          <ArrowLeft size={18} />
        </Link>
        <Sparkles size={20} style={{ color: "var(--accent)" }} />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Approved</h1>
        <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ background: "#F59E0B22", color: "#F59E0B" }}>
          prototype
        </span>
      </div>
      <p className="mb-5 text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
        Each card you approved opens into a workspace shaped by its own suggestion —
        tap one to try it.
      </p>

      {loading ? (
        <div className="animate-pulse rounded-xl p-10 text-center text-sm"
          style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}>
          loading approved cards…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl p-10 text-center text-sm"
          style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}>
          Nothing approved yet — swipe right on some cards in Decide first.
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map(({ item, spec }) => {
            const p = item.proposal ?? {};
            const resolved = spec ?? fallbackSpec(item);
            const cat = CATEGORY_META[p.category ?? "other"] ?? CATEGORY_META.other;
            const tpl = TEMPLATE_REGISTRY[resolved.template] ?? TEMPLATE_REGISTRY.file;
            return (
              <button key={item.id}
                ref={(el) => { if (el) cardRefs.current.set(item.id, el); }}
                onClick={() => open(item.id)}
                className="w-full rounded-xl p-4 text-left transition-transform duration-150 active:scale-[0.98]"
                style={{
                  background: "var(--bg-secondary)",
                  opacity: openId === item.id ? 0.35 : 1,
                  transition: "opacity var(--dur-base) var(--ease-out-custom), transform 150ms",
                }}>
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className="font-medium" style={{ color: cat.color }}>{cat.label}</span>
                  <span className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}>
                    {tpl.label}
                  </span>
                </div>
                <div className="text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
                  {resolved.headline ?? p.title ?? item.url}
                </div>
                <div className="mt-0.5 truncate text-xs" style={{ color: "var(--text-tertiary)" }}>
                  filed → {item.filedAs}{p.destination ? ` · ${p.destination}` : ""}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <ExpandingWorkspace open={openId !== null} fromRect={fromRect} onClose={() => setOpenId(null)}>
        {active && activeSpec && <AdaptiveWorkspace spec={activeSpec} item={active.item} />}
      </ExpandingWorkspace>
    </div>
  );
}
