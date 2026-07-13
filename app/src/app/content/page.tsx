"use client";

import { useState } from "react";
import {
  Clapperboard,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Download,
  AlertTriangle,
  Wand2,
  FileText,
  Loader2,
} from "lucide-react";
import { useContentIdeas } from "@/lib/use-content";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ContentIdea, ContentIdeaStatus, ContentPillar } from "@/lib/types";
import {
  PILLARS,
  PILLAR_META,
  HOOK_FORMULAS,
  WEEKLY_RHYTHM,
  POSTING_MAP,
  QUALITY_BAR,
  NON_NEGOTIABLES,
  KILL_SCALE_RULES,
} from "@/lib/content-os";

const STATUSES: { status: ContentIdeaStatus; label: string; color: string }[] = [
  { status: "idea", label: "Idea", color: "#64748B" },
  { status: "scripted", label: "Scripted", color: "#7C9E8A" },
  { status: "recorded", label: "Recorded", color: "#6366F1" },
  { status: "edited", label: "Edited", color: "#FFB454" },
  { status: "posted", label: "Posted", color: "#334155" },
];

const STATUS_META = Object.fromEntries(STATUSES.map((s) => [s.status, s])) as Record<
  ContentIdeaStatus,
  (typeof STATUSES)[number]
>;

const inputStyle = {
  color: "var(--text-primary)",
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border-primary)",
};

const cardStyle = {
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
};

function PillarBadge({ pillar }: { pillar: ContentPillar | "" }) {
  const meta = pillar ? PILLAR_META[pillar] : undefined;
  if (!meta) {
    return (
      <span
        className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
        style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}
        title="No pillar assigned — sort this idea into a pillar"
      >
        unsorted
      </span>
    );
  }
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
      style={{ background: `${meta.color}20`, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

function HookBadge({ n }: { n?: number }) {
  if (!n) {
    return (
      <span
        className="text-[10px] font-medium px-2 py-0.5 rounded-full"
        style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}
        title="No hook formula assigned — a topic, not a post"
      >
        no hook
      </span>
    );
  }
  const f = HOOK_FORMULAS.find((h) => h.n === n);
  return (
    <span
      className="text-[10px] font-medium px-2 py-0.5 rounded-full"
      style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
      title={f ? `${f.name}: ${f.template}` : undefined}
    >
      Hook {n}{f ? ` · ${f.name}` : ""}
    </span>
  );
}

// --- Idea Bank ----------------------------------------------------------------

type IdeaDraft = Omit<ContentIdea, "id" | "createdAt" | "updatedAt">;
const EMPTY_IDEA: IdeaDraft = { title: "", pillar: "workflow-win", status: "idea" };

function IdeaEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ContentIdea;
  onSave: (d: IdeaDraft) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<IdeaDraft>(initial ? { ...initial } : { ...EMPTY_IDEA });
  const set = (patch: Partial<IdeaDraft>) => setD((prev) => ({ ...prev, ...patch }));

  return (
    <div className="rounded-xl p-4 space-y-3" style={cardStyle}>
      <input
        type="text"
        value={d.title}
        onChange={(e) => set({ title: e.target.value })}
        placeholder="Idea (a claim or tension, not a topic)…"
        autoFocus
        className="w-full text-sm font-medium outline-none rounded-lg px-3 py-2"
        style={inputStyle}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          Pillar
        </span>
        {PILLARS.map((p) => (
          <button
            key={p.pillar}
            onClick={() => set({ pillar: p.pillar })}
            className="text-xs font-medium rounded-full px-3 py-1 transition-colors"
            style={{
              color: d.pillar === p.pillar ? "#fff" : "var(--text-secondary)",
              background: d.pillar === p.pillar ? p.color : "var(--bg-tertiary)",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
          <span className="font-semibold uppercase tracking-wider">Hook #</span>
          <select
            value={d.hookFormula ?? ""}
            onChange={(e) => set({ hookFormula: e.target.value ? Number(e.target.value) : undefined })}
            className="text-sm outline-none rounded-lg px-2 py-1.5"
            style={inputStyle}
          >
            <option value="">— none —</option>
            {HOOK_FORMULAS.map((h) => (
              <option key={h.n} value={h.n}>
                {h.n} · {h.name}
              </option>
            ))}
          </select>
        </label>
        {d.pillar === "build-log" && (
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
            <span className="font-semibold uppercase tracking-wider">Episode</span>
            <input
              type="number"
              min={1}
              value={d.episode ?? ""}
              onChange={(e) => set({ episode: e.target.value ? Number(e.target.value) : undefined })}
              className="w-16 text-sm outline-none rounded-lg px-2 py-1.5"
              style={inputStyle}
            />
          </label>
        )}
      </div>
      <textarea
        value={d.notes || ""}
        onChange={(e) => set({ notes: e.target.value })}
        rows={2}
        placeholder="Notes / script beats (optional)"
        className="w-full text-sm outline-none rounded-lg px-3 py-2 resize-none"
        style={inputStyle}
      />
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
          style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}
        >
          <X size={14} /> Cancel
        </button>
        <button
          onClick={() => d.title.trim() && onSave({ ...d, title: d.title.trim(), notes: d.notes?.trim() || undefined })}
          disabled={!d.title.trim()}
          className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors disabled:opacity-50"
        >
          <Check size={14} /> Save
        </button>
      </div>
    </div>
  );
}

function IdeaBank() {
  const { ideas, loading, createIdea, updateIdea, deleteIdea, seedIdeas, scriptIdea, scriptWeeklyBatch } =
    useContentIdeas();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pillarFilter, setPillarFilter] = useState<ContentPillar | "all">("all");
  const [hidePosted, setHidePosted] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [scriptingId, setScriptingId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [openScriptIds, setOpenScriptIds] = useState<Set<string>>(new Set());
  const busy = scriptingId !== null || batchProgress !== null;

  const toggleScript = (id: string) =>
    setOpenScriptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runScriptIdea = async (id: string) => {
    setScriptingId(id);
    try {
      await scriptIdea(id);
      setOpenScriptIds((prev) => new Set(prev).add(id));
      toast("Script drafted — review, read aloud, cut 15%");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Script draft failed", "error");
    } finally {
      setScriptingId(null);
    }
  };

  const runBatch = async () => {
    setBatchProgress({ done: 0, total: 0 });
    try {
      const result = await scriptWeeklyBatch((done, total) => setBatchProgress({ done, total }));
      if (result.scripted.length > 0) {
        setOpenScriptIds((prev) => {
          const next = new Set(prev);
          for (const i of result.scripted) next.add(i.id);
          return next;
        });
        toast(`Drafted ${result.scripted.length} script${result.scripted.length === 1 ? "" : "s"} — Monday block done, review before Tuesday`);
      }
      for (const f of result.failed) toast(`"${f.idea.title}": ${f.error}`, "error");
      if (result.blocked.length > 0) {
        const floorBlocked = result.blocked.filter((b) => b.reason.startsWith("bank floor"));
        if (floorBlocked.length > 0) {
          toast(
            `${floorBlocked.length} held back — bank floor is 12 unscripted ideas (${result.unscripted} in bank). Brainstorm first.`,
            "warning"
          );
        }
        for (const b of result.blocked.filter((x) => !x.reason.startsWith("bank floor"))) {
          toast(b.reason, "warning");
        }
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Batch draft failed", "error");
    } finally {
      setBatchProgress(null);
    }
  };

  const visible = ideas.filter(
    (i) => (pillarFilter === "all" || i.pillar === pillarFilter) && (!hidePosted || i.status !== "posted")
  );
  const unscripted = ideas.filter((i) => i.status === "idea").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setPillarFilter("all")}
            className="text-xs font-medium rounded-full px-3 py-1 transition-colors"
            style={{
              color: pillarFilter === "all" ? "#fff" : "var(--text-secondary)",
              background: pillarFilter === "all" ? "var(--accent)" : "var(--bg-tertiary)",
            }}
          >
            All ({ideas.length})
          </button>
          {PILLARS.map((p) => (
            <button
              key={p.pillar}
              onClick={() => setPillarFilter(p.pillar)}
              className="text-xs font-medium rounded-full px-3 py-1 transition-colors"
              style={{
                color: pillarFilter === p.pillar ? "#fff" : "var(--text-secondary)",
                background: pillarFilter === p.pillar ? p.color : "var(--bg-tertiary)",
              }}
            >
              {p.label} ({ideas.filter((i) => i.pillar === p.pillar).length})
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-xs ml-2" style={{ color: "var(--text-tertiary)" }}>
            <input type="checkbox" checked={hidePosted} onChange={(e) => setHidePosted(e.target.checked)} />
            hide posted
          </label>
        </div>
        <div className="flex items-center gap-2">
          {ideas.length > 0 && (
            <button
              onClick={runBatch}
              disabled={busy}
              title="Monday block: draft 2 Build Log + 1 Workflow Win + 1 carousel from the bank (never drains unscripted ideas below 12)"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
              style={{ color: "var(--accent)", background: "var(--accent-bg)" }}
            >
              {batchProgress ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Drafting{batchProgress.total > 0 ? ` ${batchProgress.done}/${batchProgress.total}` : "…"}
                </>
              ) : (
                <>
                  <Wand2 size={15} /> Draft week&rsquo;s batch
                </>
              )}
            </button>
          )}
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors"
            >
              <Plus size={15} /> New idea
            </button>
          )}
        </div>
      </div>

      {unscripted < 12 && ideas.length > 0 && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
          style={{ background: "#FFB45420", color: "var(--text-secondary)", border: "1px solid #FFB45440" }}
        >
          <AlertTriangle size={16} style={{ color: "#FFB454" }} />
          Bank rule: {unscripted} unscripted idea{unscripted === 1 ? "" : "s"} left (floor is 12). Run a 20-min
          brainstorm against the hook formulas.
        </div>
      )}

      {creating && (
        <IdeaEditor
          onSave={(d) => {
            createIdea(d);
            setCreating(false);
            toast("Idea banked");
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {ideas.length === 0 && !loading && !creating && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl text-center" style={cardStyle}>
          <Clapperboard size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
            Idea bank is empty
          </p>
          <p className="text-sm mt-1 mb-4 max-w-sm" style={{ color: "var(--text-secondary)" }}>
            Import the 60 starter ideas from the vault&rsquo;s idea bank, or add your own.
          </p>
          <button
            onClick={async () => {
              setSeeding(true);
              await seedIdeas();
              setSeeding(false);
              toast("Imported 60 starter ideas");
            }}
            disabled={seeding}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors disabled:opacity-50"
          >
            <Download size={15} /> {seeding ? "Importing…" : "Import 60 starter ideas"}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {visible.map((idea) =>
          editingId === idea.id ? (
            <IdeaEditor
              key={idea.id}
              initial={idea}
              onSave={(d) => {
                updateIdea(idea.id, d);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={idea.id} className="rounded-xl px-4 py-3" style={cardStyle}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <PillarBadge pillar={idea.pillar} />
                    {idea.episode != null && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
                        Ep {idea.episode}
                      </span>
                    )}
                    <HookBadge n={idea.hookFormula} />
                  </div>
                  <p className="text-sm font-medium mt-1.5" style={{ color: "var(--text-primary)" }}>
                    {idea.title}
                  </p>
                  {idea.notes && (
                    <p className="text-xs mt-1 whitespace-pre-wrap" style={{ color: "var(--text-tertiary)" }}>
                      {idea.notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {idea.status === "idea" && (
                    <button
                      onClick={() => runScriptIdea(idea.id)}
                      disabled={busy || !idea.hookFormula}
                      title={
                        !idea.hookFormula
                          ? "Assign a hook formula first — a topic isn't a post"
                          : "Draft script + caption with Claude"
                      }
                      className="p-1.5 rounded-lg disabled:opacity-40"
                      style={{ color: "var(--accent)" }}
                    >
                      {scriptingId === idea.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Wand2 size={14} />
                      )}
                    </button>
                  )}
                  {idea.script && (
                    <button
                      onClick={() => toggleScript(idea.id)}
                      title={openScriptIds.has(idea.id) ? "Hide script" : "Show script"}
                      className="p-1.5 rounded-lg"
                      style={{ color: openScriptIds.has(idea.id) ? "var(--accent)" : "var(--text-tertiary)" }}
                    >
                      <FileText size={14} />
                    </button>
                  )}
                  <button onClick={() => setEditingId(idea.id)} title="Edit" className="p-1.5 rounded-lg" style={{ color: "var(--text-tertiary)" }}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setConfirmId(idea.id)} title="Delete" className="p-1.5 rounded-lg" style={{ color: "var(--text-tertiary)" }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                {STATUSES.map((s) => (
                  <button
                    key={s.status}
                    onClick={() => updateIdea(idea.id, { status: s.status })}
                    className="text-[11px] font-medium rounded-full px-2.5 py-0.5 transition-colors"
                    style={{
                      color: idea.status === s.status ? "#fff" : "var(--text-tertiary)",
                      background: idea.status === s.status ? s.color : "var(--bg-tertiary)",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {idea.script && openScriptIds.has(idea.id) && (
                <div className="mt-3 space-y-3 rounded-lg p-3" style={{ background: "var(--bg-tertiary)" }}>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
                      Script — read aloud once, cut 15%
                    </p>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                      {idea.script}
                    </p>
                  </div>
                  {idea.caption && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
                        Caption
                      </p>
                      <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                        {idea.caption}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        )}
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete idea?"
        message="This removes the idea from the bank."
        onConfirm={() => {
          if (confirmId) deleteIdea(confirmId);
          setConfirmId(null);
        }}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}

// --- Playbook -------------------------------------------------------------------

function Playbook() {
  const section = (title: string, children: React.ReactNode) => (
    <div className="rounded-xl p-4" style={cardStyle}>
      <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
        {title}
      </h2>
      {children}
    </div>
  );

  const th = "text-left text-[11px] font-semibold uppercase tracking-wider px-2 py-1.5";
  const td = "text-sm px-2 py-1.5 align-top";

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        Condensed from the vault playbook (<code>01-Inbox/content-os/</code>) — the vault stays the source of truth.
      </p>

      {section(
        "Non-negotiables",
        <ul className="space-y-1.5">
          {NON_NEGOTIABLES.map((r) => (
            <li key={r} className="text-sm flex gap-2" style={{ color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--accent)" }}>•</span> {r}
            </li>
          ))}
        </ul>
      )}

      {section(
        "The three pillars",
        <div className="space-y-3">
          {PILLARS.map((p) => (
            <div key={p.pillar}>
              <div className="flex items-center gap-2">
                <PillarBadge pillar={p.pillar} />
                <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                  {p.cadence}
                </span>
              </div>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                {p.job}
              </p>
            </div>
          ))}
        </div>
      )}

      {section(
        "Weekly rhythm (≈8.5h)",
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-tertiary)" }}>
                <th className={th}>Day</th>
                <th className={th}>Block</th>
                <th className={th}>Time</th>
                <th className={th}>What</th>
              </tr>
            </thead>
            <tbody style={{ color: "var(--text-secondary)" }}>
              {WEEKLY_RHYTHM.map((r) => (
                <tr key={r.day + r.block} style={{ borderTop: "1px solid var(--border-primary)" }}>
                  <td className={`${td} font-medium whitespace-nowrap`}>{r.day}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.block}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.time}</td>
                  <td className={td}>{r.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section(
        "Posting map",
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-tertiary)" }}>
                <th className={th}>Day</th>
                <th className={th}>TikTok</th>
                <th className={th}>Instagram</th>
                <th className={th}>YT Shorts</th>
              </tr>
            </thead>
            <tbody style={{ color: "var(--text-secondary)" }}>
              {POSTING_MAP.map((r) => (
                <tr key={r.day} style={{ borderTop: "1px solid var(--border-primary)" }}>
                  <td className={`${td} font-medium`}>{r.day}</td>
                  <td className={td}>{r.tiktok}</td>
                  <td className={td}>{r.instagram}</td>
                  <td className={td}>{r.youtube}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section(
        "12 hook formulas",
        <div className="space-y-1.5">
          {HOOK_FORMULAS.map((h) => (
            <p key={h.n} className="text-sm" style={{ color: "var(--text-secondary)" }}>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                {h.n} · {h.name}
              </span>{" "}
              — {h.template}
            </p>
          ))}
        </div>
      )}

      {section(
        "Quality bar (before export)",
        <ul className="space-y-1.5">
          {QUALITY_BAR.map((r) => (
            <li key={r} className="text-sm flex gap-2" style={{ color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--accent)" }}>☐</span> {r}
            </li>
          ))}
        </ul>
      )}

      {section(
        "Kill / scale rules",
        <ul className="space-y-1.5">
          {KILL_SCALE_RULES.map((r) => (
            <li key={r} className="text-sm flex gap-2" style={{ color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--accent)" }}>•</span> {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Page -----------------------------------------------------------------------

const TABS = [
  { id: "ideas", label: "Idea Bank" },
  { id: "playbook", label: "Playbook" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function ContentPage() {
  const [tab, setTab] = useState<TabId>("ideas");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <Clapperboard size={22} style={{ color: "var(--accent)" }} /> Content OS
        </h1>
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
          Build-in-public content system — idea bank and the playbook.
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="text-sm font-medium rounded-lg px-3 py-1.5 transition-colors"
            style={{
              color: tab === t.id ? "var(--accent)" : "var(--text-secondary)",
              background: tab === t.id ? "var(--accent-bg)" : "transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ideas" && <IdeaBank />}
      {tab === "playbook" && <Playbook />}
    </div>
  );
}
