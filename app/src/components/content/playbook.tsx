"use client";

// T-content-rework-03 — the playbook Samy owns.
//
// Content types and hook formulas are records he adds to and edits, so the
// catalog grows with the channel instead of freezing at three pillars. Below
// them sits the craft material — skeletons, anti-slop, voice, spoken register
// — which used to be fuel for a generator and is now reference he reads. It
// survived the generator's deletion because it is his own accumulated
// judgement about what makes these posts work.
import { useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import type { ContentType, HookFormula } from "@/lib/content/catalog";
import { ANTI_SLOP_RULES, SCRIPT_SKELETONS, SPOKEN_REGISTER_RULES, VOICE_RULES } from "@/lib/content/craft";

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-foreground transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.99] max-lg:[min-height:44px]"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
        {count !== undefined && <span className="text-xs text-muted-foreground">{count}</span>}
      </button>
      {open && <div className="space-y-2 border-t border-border px-3 py-3">{children}</div>}
    </div>
  );
}

function Editable({
  value,
  onSave,
  className = "",
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onSave(draft); }}
      className={`w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-foreground hover:border-border focus:border-border ${className}`}
    />
  );
}

export function Playbook({
  types,
  hooks,
  counts,
  onAddType,
  onUpdateType,
  onAddHook,
  onUpdateHook,
}: {
  types: ContentType[];
  hooks: HookFormula[];
  counts: { key: string; label: string; count: number }[];
  onAddType: (t: Omit<ContentType, "id">) => Promise<unknown>;
  onUpdateType: (id: string, patch: Partial<ContentType>) => Promise<unknown>;
  onAddHook: (h: Omit<HookFormula, "id">) => Promise<unknown>;
  onUpdateHook: (id: string, patch: Partial<HookFormula>) => Promise<unknown>;
}) {
  const addType = async () => {
    const order = types.reduce((m, t) => Math.max(m, t.order), -1) + 1;
    // A new key is derived from a placeholder label and never collides with
    // the three load-bearing pillar keys.
    const key = `type-${Date.now().toString(36)}`;
    await onAddType({ key, label: "New type", short: "NEW", job: "", color: "#8B8B8B", order });
    toast.success("type added — rename it");
  };

  const addHook = async () => {
    const n = hooks.reduce((m, h) => Math.max(m, h.n), 0) + 1;
    await onAddHook({ n, name: "New hook", template: "" });
    toast.success("hook added — write the template");
  };

  return (
    <div className="space-y-2">
      <Section title="Content types" count={types.length}>
        {types.map((t) => {
          const count = counts.find((c) => c.key === t.key)?.count ?? 0;
          return (
            <div key={t.id ?? t.key} className="space-y-1 rounded border border-border p-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color }} />
                <Editable value={t.label} onSave={(label) => t.id && onUpdateType(t.id, { label })} className="font-medium" />
                <span className="shrink-0 text-xs text-muted-foreground">{count} banked</span>
              </div>
              <Editable value={t.job} onSave={(job) => t.id && onUpdateType(t.id, { job })} className="text-muted-foreground" />
              {/* The key is shown, never edited: weekly-batch.ts and 18 live
                  ideas are wired to it. Renaming one orphans the bank. */}
              <p className="px-1 font-mono text-[10px] text-muted-foreground/70">{t.key}</p>
            </div>
          );
        })}
        <button onClick={addType}
          className="inline-flex items-center gap-1 rounded-md px-1 py-1 text-xs font-medium text-primary transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]">
          <Plus size={12} /> Add a type
        </button>
      </Section>

      <Section title="Hook formulas" count={hooks.length}>
        {hooks.map((h) => (
          <div key={h.id ?? h.n} className="space-y-0.5 rounded border border-border p-2">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-muted-foreground">#{h.n}</span>
              <Editable value={h.name} onSave={(name) => h.id && onUpdateHook(h.id, { name })} className="font-medium" />
            </div>
            <Editable value={h.template} onSave={(template) => h.id && onUpdateHook(h.id, { template })} className="text-muted-foreground" />
          </div>
        ))}
        <button onClick={addHook}
          className="inline-flex items-center gap-1 rounded-md px-1 py-1 text-xs font-medium text-primary transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]">
          <Plus size={12} /> Add a hook
        </button>
      </Section>

      <Section title="Craft reference">
        <div className="space-y-3 text-sm">
          <div>
            <p className="section-label">Voice</p>
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
              {VOICE_RULES.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
          <div>
            <p className="section-label">Anti-slop</p>
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
              {ANTI_SLOP_RULES.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
          <div>
            <p className="section-label">Spoken register</p>
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
              {SPOKEN_REGISTER_RULES.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
          <div>
            <p className="section-label">Shapes</p>
            {Object.entries(SCRIPT_SKELETONS).map(([key, sk]) => (
              <div key={key} className="mt-1.5">
                <p className="text-xs font-medium text-foreground">{sk.label} · {sk.length}</p>
                <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {sk.beats.map((b) => <li key={b}>{b}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}
