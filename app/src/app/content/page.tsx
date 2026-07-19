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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

function PillarBadge({ pillar }: { pillar: ContentPillar | "" }) {
  const meta = pillar ? PILLAR_META[pillar] : undefined;
  if (!meta) {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] font-bold uppercase tracking-widest"
        title="No pillar assigned — sort this idea into a pillar"
      >
        unsorted
      </Badge>
    );
  }
  return (
    <Badge
      className="text-[10px] font-bold uppercase tracking-widest"
      style={{ background: `${meta.color}20`, color: meta.color }}
    >
      {meta.label}
    </Badge>
  );
}

function HookBadge({ n }: { n?: number }) {
  if (!n) {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] font-medium"
        title="No hook formula assigned — a topic, not a post"
      >
        no hook
      </Badge>
    );
  }
  const f = HOOK_FORMULAS.find((h) => h.n === n);
  return (
    <Badge
      variant="secondary"
      className="text-[10px] font-medium text-muted-foreground"
      title={f ? `${f.name}: ${f.template}` : undefined}
    >
      Hook {n}{f ? ` · ${f.name}` : ""}
    </Badge>
  );
}

// --- Idea Bank ----------------------------------------------------------------

type IdeaDraft = Omit<ContentIdea, "id" | "createdAt" | "updatedAt">;
const EMPTY_IDEA: IdeaDraft = { title: "", pillar: "under-the-hood", status: "idea" }; // Concept — the channel's core

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
    <Card className="p-4 gap-3">
      <Input
        type="text"
        value={d.title}
        onChange={(e) => set({ title: e.target.value })}
        placeholder="Idea (a claim or tension, not a topic)…"
        autoFocus
        className="w-full h-auto text-sm font-medium rounded-lg px-3 py-2"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          Pillar
        </span>
        {PILLARS.map((p) => (
          <button
            key={p.pillar}
            onClick={() => set({ pillar: p.pillar })}
            className="text-xs font-medium rounded-full px-3 py-1 transition-colors"
            style={{
              color: d.pillar === p.pillar ? "#fff" : "var(--muted-foreground)",
              background: d.pillar === p.pillar ? p.color : "var(--muted)",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-xs text-muted-foreground/70">
          <span className="font-semibold uppercase tracking-wider">Hook #</span>
          <Select
            value={d.hookFormula ? String(d.hookFormula) : "none"}
            onValueChange={(v) => set({ hookFormula: v === "none" ? undefined : Number(v) })}
          >
            <SelectTrigger size="sm" className="text-sm h-auto py-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— none —</SelectItem>
              {HOOK_FORMULAS.map((h) => (
                <SelectItem key={h.n} value={String(h.n)}>
                  {h.n} · {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {/* Episode = position in the learning path (continuity), any pillar. */}
        <label className="flex items-center gap-2 text-xs text-muted-foreground/70">
            <span className="font-semibold uppercase tracking-wider">Episode</span>
            <Input
              type="number"
              min={1}
              value={d.episode ?? ""}
              onChange={(e) => set({ episode: e.target.value ? Number(e.target.value) : undefined })}
              className="w-16 h-auto text-sm rounded-lg px-2 py-1.5"
            />
          </label>
      </div>
      <Textarea
        value={d.notes || ""}
        onChange={(e) => set({ notes: e.target.value })}
        rows={2}
        placeholder="Notes / script beats (optional)"
        className="w-full text-sm rounded-lg px-3 py-2 resize-none"
      />
      <div className="flex items-center gap-2 justify-end">
        <Button onClick={onCancel} variant="secondary" size="sm" className="gap-1.5 text-xs font-medium">
          <X size={14} /> Cancel
        </Button>
        <Button
          onClick={() => d.title.trim() && onSave({ ...d, title: d.title.trim(), notes: d.notes?.trim() || undefined })}
          disabled={!d.title.trim()}
          size="sm"
          className="gap-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 disabled:opacity-50"
        >
          <Check size={14} /> Save
        </Button>
      </div>
    </Card>
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
            className={`text-xs font-medium rounded-full px-3 py-1 transition-colors ${
              pillarFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            All ({ideas.length})
          </button>
          {PILLARS.map((p) => (
            <button
              key={p.pillar}
              onClick={() => setPillarFilter(p.pillar)}
              className="text-xs font-medium rounded-full px-3 py-1 transition-colors"
              style={{
                color: pillarFilter === p.pillar ? "#fff" : "var(--muted-foreground)",
                background: pillarFilter === p.pillar ? p.color : "var(--muted)",
              }}
            >
              {p.label} ({ideas.filter((i) => i.pillar === p.pillar).length})
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-xs ml-2 text-muted-foreground/70">
            <input type="checkbox" checked={hidePosted} onChange={(e) => setHidePosted(e.target.checked)} />
            hide posted
          </label>
        </div>
        <div className="flex items-center gap-2">
          {ideas.length > 0 && (
            <Button
              onClick={runBatch}
              disabled={busy}
              title="Monday block: draft 2 Build Log + 1 Workflow Win + 1 carousel from the bank (never drains unscripted ideas below 12)"
              size="sm"
              className="gap-1.5 text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/80 disabled:opacity-50"
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
            </Button>
          )}
          {!creating && (
            <Button
              onClick={() => setCreating(true)}
              size="sm"
              className="gap-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500"
            >
              <Plus size={15} /> New idea
            </Button>
          )}
        </div>
      </div>

      {unscripted < 12 && ideas.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm bg-amber-500/10 text-muted-foreground border border-amber-500/25">
          <AlertTriangle size={16} className="text-amber-500" />
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
        <Card className="flex-col items-center justify-center py-16 text-center">
          <Clapperboard size={48} className="mb-4 text-muted-foreground/70" />
          <p className="text-lg font-medium text-foreground">
            Idea bank is empty
          </p>
          <p className="text-sm mt-1 mb-4 max-w-sm text-muted-foreground">
            Import the 60 starter ideas from the vault&rsquo;s idea bank, or add your own.
          </p>
          <Button
            onClick={async () => {
              setSeeding(true);
              await seedIdeas();
              setSeeding(false);
              toast("Imported 60 starter ideas");
            }}
            disabled={seeding}
            size="sm"
            className="gap-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 disabled:opacity-50"
          >
            <Download size={15} /> {seeding ? "Importing…" : "Import 60 starter ideas"}
          </Button>
        </Card>
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
            <Card key={idea.id} className="px-4 py-3 gap-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <PillarBadge pillar={idea.pillar} />
                    {idea.episode != null && (
                      <Badge variant="secondary" className="text-[10px] font-bold">
                        Ep {idea.episode}
                      </Badge>
                    )}
                    <HookBadge n={idea.hookFormula} />
                  </div>
                  <p className="text-sm font-medium mt-1.5 text-foreground">
                    {idea.title}
                  </p>
                  {idea.notes && (
                    <p className="text-xs mt-1 whitespace-pre-wrap text-muted-foreground/70">
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
                      className="p-1.5 rounded-lg disabled:opacity-40 text-primary"
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
                      className={`p-1.5 rounded-lg ${openScriptIds.has(idea.id) ? "text-primary" : "text-muted-foreground/70"}`}
                    >
                      <FileText size={14} />
                    </button>
                  )}
                  <button onClick={() => setEditingId(idea.id)} title="Edit" className="p-1.5 rounded-lg text-muted-foreground/70">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setConfirmId(idea.id)} title="Delete" className="p-1.5 rounded-lg text-muted-foreground/70">
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
                      color: idea.status === s.status ? "#fff" : "var(--muted-foreground)",
                      background: idea.status === s.status ? s.color : "var(--muted)",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {idea.script && openScriptIds.has(idea.id) && (
                <div className="mt-3 space-y-3 rounded-lg p-3 bg-muted">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1 text-muted-foreground/70">
                      Script — read aloud once, cut 15%
                    </p>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                      {idea.script}
                    </p>
                  </div>
                  {idea.caption && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-1 text-muted-foreground/70">
                        Caption
                      </p>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                        {idea.caption}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </Card>
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
    <Card className="p-4 gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title}
      </h2>
      {children}
    </Card>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground/70">
        Condensed from the vault playbook (<code>01-Inbox/content-os/</code>) — the vault stays the source of truth.
      </p>

      {section(
        "Non-negotiables",
        <ul className="space-y-1.5">
          {NON_NEGOTIABLES.map((r) => (
            <li key={r} className="text-sm flex gap-2 text-muted-foreground">
              <span className="text-primary">•</span> {r}
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
                <span className="text-xs font-medium text-muted-foreground/70">
                  {p.cadence}
                </span>
              </div>
              <p className="text-sm mt-1 text-muted-foreground">
                {p.job}
              </p>
            </div>
          ))}
        </div>
      )}

      {section(
        "Weekly rhythm (≈8.5h)",
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase tracking-wider">Day</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider">Block</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider">Time</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider whitespace-normal">What</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {WEEKLY_RHYTHM.map((r) => (
              <TableRow key={r.day + r.block}>
                <TableCell className="font-medium text-foreground">{r.day}</TableCell>
                <TableCell className="text-muted-foreground">{r.block}</TableCell>
                <TableCell className="text-muted-foreground">{r.time}</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">{r.what}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {section(
        "Posting map",
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase tracking-wider">Day</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider">TikTok</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider">Instagram</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider">YT Shorts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {POSTING_MAP.map((r) => (
              <TableRow key={r.day}>
                <TableCell className="font-medium text-foreground">{r.day}</TableCell>
                <TableCell className="text-muted-foreground">{r.tiktok}</TableCell>
                <TableCell className="text-muted-foreground">{r.instagram}</TableCell>
                <TableCell className="text-muted-foreground">{r.youtube}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {section(
        "12 hook formulas",
        <div className="space-y-1.5">
          {HOOK_FORMULAS.map((h) => (
            <p key={h.n} className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
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
            <li key={r} className="text-sm flex gap-2 text-muted-foreground">
              <span className="text-primary">☐</span> {r}
            </li>
          ))}
        </ul>
      )}

      {section(
        "Kill / scale rules",
        <ul className="space-y-1.5">
          {KILL_SCALE_RULES.map((r) => (
            <li key={r} className="text-sm flex gap-2 text-muted-foreground">
              <span className="text-primary">•</span> {r}
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
        <h1 className="text-2xl font-semibold flex items-center gap-2 text-foreground">
          <Clapperboard size={22} className="text-primary" /> Content OS
        </h1>
        <p className="text-xs mt-1 text-muted-foreground/70">
          Build-in-public content system — idea bank and the playbook.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList className="bg-transparent p-0 gap-1.5 h-auto">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="text-sm font-medium rounded-lg px-3 py-1.5 data-[state=active]:bg-accent data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === "ideas" && <IdeaBank />}
      {tab === "playbook" && <Playbook />}
    </div>
  );
}
