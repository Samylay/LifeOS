"use client";

import { useMemo, useState } from "react";
import {
  Clapperboard,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Download,
  AlertTriangle,
  TrendingUp,
  Wand2,
  FileText,
  Loader2,
} from "lucide-react";
import { useContentIdeas, useContentPosts } from "@/lib/use-content";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ContentIdea, ContentIdeaStatus, ContentPillar, ContentPost } from "@/lib/types";
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

function PillarBadge({ pillar }: { pillar: ContentPillar }) {
  const meta = PILLAR_META[pillar];
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
                      disabled={busy || idea.hookFormula == null}
                      title={
                        idea.hookFormula == null
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

// --- Post Tracker ---------------------------------------------------------------

type PostDraft = Omit<ContentPost, "id" | "createdAt" | "updatedAt">;

function emptyPost(): PostDraft {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { date, title: "", pillar: "build-log" };
}

function numOrUndef(v: string): number | undefined {
  return v === "" ? undefined : Number(v);
}

function PostEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ContentPost;
  onSave: (d: PostDraft) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<PostDraft>(initial ? { ...initial } : emptyPost());
  const set = (patch: Partial<PostDraft>) => setD((prev) => ({ ...prev, ...patch }));

  const metric = (
    label: string,
    key: "retention3s" | "completion" | "sendsPerReach" | "savesPerReach" | "follows",
    hint: string
  ) => (
    <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
      <span className="font-semibold uppercase tracking-wider" title={hint}>
        {label}
      </span>
      <input
        type="number"
        step="0.1"
        min={0}
        value={d[key] ?? ""}
        onChange={(e) => set({ [key]: numOrUndef(e.target.value) } as Partial<PostDraft>)}
        className="w-24 text-sm outline-none rounded-lg px-2 py-1.5"
        style={inputStyle}
      />
    </label>
  );

  return (
    <div className="rounded-xl p-4 space-y-3" style={cardStyle}>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="date"
          value={d.date}
          onChange={(e) => set({ date: e.target.value })}
          className="text-sm outline-none rounded-lg px-2 py-1.5"
          style={inputStyle}
        />
        <input
          type="text"
          value={d.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Post title / hook…"
          autoFocus
          className="flex-1 min-w-48 text-sm font-medium outline-none rounded-lg px-3 py-2"
          style={inputStyle}
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
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
        <select
          value={d.hookFormula ?? ""}
          onChange={(e) => set({ hookFormula: e.target.value ? Number(e.target.value) : undefined })}
          className="text-sm outline-none rounded-lg px-2 py-1.5"
          style={inputStyle}
        >
          <option value="">Hook — none</option>
          {HOOK_FORMULAS.map((h) => (
            <option key={h.n} value={h.n}>
              Hook {h.n} · {h.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end gap-3 flex-wrap">
        {metric("3s ret. %", "retention3s", "Still watching at 3 seconds")}
        {metric("Compl. %", "completion", "Completion rate")}
        {metric("Sends /1k", "sendsPerReach", "Sends per 1000 reached")}
        {metric("Saves /1k", "savesPerReach", "Saves per 1000 reached")}
        {metric("Follows", "follows", "Follows from this post")}
      </div>
      <input
        type="text"
        value={d.note || ""}
        onChange={(e) => set({ note: e.target.value })}
        placeholder="One-sentence diagnosis (why did it win / lose?)"
        className="w-full text-sm outline-none rounded-lg px-3 py-2"
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
          onClick={() => d.title.trim() && onSave({ ...d, title: d.title.trim(), note: d.note?.trim() || undefined })}
          disabled={!d.title.trim()}
          className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors disabled:opacity-50"
        >
          <Check size={14} /> Save
        </button>
      </div>
    </div>
  );
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function PostTracker() {
  const { posts, loading, createPost, updatePost, deletePost } = useContentPosts();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const sendsMedian = useMemo(
    () => median(posts.map((p) => p.sendsPerReach).filter((v): v is number => v != null)),
    [posts]
  );

  const fmt = (v?: number, suffix = "") => (v != null ? `${v}${suffix}` : "—");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Friday review, 20 min: log each post, diagnose best &amp; worst by sends/reach in one sentence, bias next
          week toward what won.
          {sendsMedian != null && (
            <>
              {" "}
              Rolling median sends/1k: <span className="font-semibold">{sendsMedian.toFixed(1)}</span> — anything over{" "}
              <span className="font-semibold">{(2 * sendsMedian).toFixed(1)}</span> earns a v2.
            </>
          )}
        </p>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors"
          >
            <Plus size={15} /> Log post
          </button>
        )}
      </div>

      {creating && (
        <PostEditor
          onSave={(d) => {
            createPost(d);
            setCreating(false);
            toast("Post logged");
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {posts.length === 0 && !loading && !creating && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl text-center" style={cardStyle}>
          <TrendingUp size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
            No posts logged yet
          </p>
          <p className="text-sm mt-1 mb-4 max-w-sm" style={{ color: "var(--text-secondary)" }}>
            The first 10 posts are calibration, not performance. Log them anyway — the tracker is the finding
            mechanism.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors"
          >
            <Plus size={15} /> Log first post
          </button>
        </div>
      )}

      <div className="space-y-2">
        {posts.map((post) =>
          editingId === post.id ? (
            <PostEditor
              key={post.id}
              initial={post}
              onSave={(d) => {
                updatePost(post.id, d);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={post.id} className="rounded-xl px-4 py-3" style={cardStyle}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                      {post.date}
                    </span>
                    <PillarBadge pillar={post.pillar} />
                    <HookBadge n={post.hookFormula} />
                    {sendsMedian != null && post.sendsPerReach != null && post.sendsPerReach > 2 * sendsMedian && (
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                        style={{ background: "#7C9E8A20", color: "#7C9E8A" }}
                        title="More than 2x the rolling median sends/reach — schedule a v2"
                      >
                        scale ↑
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium mt-1.5" style={{ color: "var(--text-primary)" }}>
                    {post.title}
                  </p>
                  {post.note && (
                    <p className="text-xs mt-1 italic" style={{ color: "var(--text-tertiary)" }}>
                      {post.note}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEditingId(post.id)} title="Edit" className="p-1.5 rounded-lg" style={{ color: "var(--text-tertiary)" }}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setConfirmId(post.id)} title="Delete" className="p-1.5 rounded-lg" style={{ color: "var(--text-tertiary)" }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-4 flex-wrap text-xs" style={{ color: "var(--text-secondary)" }}>
                <span>3s ret. <b>{fmt(post.retention3s, "%")}</b></span>
                <span>compl. <b>{fmt(post.completion, "%")}</b></span>
                <span>sends/1k <b>{fmt(post.sendsPerReach)}</b></span>
                <span>saves/1k <b>{fmt(post.savesPerReach)}</b></span>
                <span>follows <b>{fmt(post.follows)}</b></span>
              </div>
            </div>
          )
        )}
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete post?"
        message="This removes the post from the tracker."
        onConfirm={() => {
          if (confirmId) deletePost(confirmId);
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
  { id: "tracker", label: "Post Tracker" },
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
          Build-in-public content system — idea bank, Friday analytics loop, and the playbook.
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
      {tab === "tracker" && <PostTracker />}
      {tab === "playbook" && <Playbook />}
    </div>
  );
}
