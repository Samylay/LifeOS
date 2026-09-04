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
  ArrowRight,
} from "lucide-react";
import { useContentIdeas } from "@/lib/use-content";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Page, PageHeader } from "@/components/ui/page";
import { Skeleton } from "@/components/skeleton";
import type { ContentIdea, ContentIdeaStatus, ContentPillar } from "@/lib/types";
import { PILLARS, PILLAR_META, HOOK_FORMULAS } from "@/lib/content-os";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IDEA_STATUSES, NEXT_STATUS } from "@/lib/content/idea-status";
import { IdeaBody } from "@/components/content/idea-body";

const STATUSES = IDEA_STATUSES;

const STATUS_META = Object.fromEntries(STATUSES.map((s) => [s.status, s])) as Record<
  ContentIdeaStatus,
  (typeof STATUSES)[number]
>;

// One advance button per card: the label names what Samy actually does next.
const NEXT_STEP = NEXT_STATUS;

/** Translucent tint of a color (hex or CSS var) for chip backgrounds. */
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

function PillarBadge({ pillar }: { pillar: ContentPillar | "" }) {
  const meta = pillar ? PILLAR_META[pillar] : undefined;
  if (!meta) {
    return (
      <Badge
        variant="secondary"
        className="section-label"
        title="No pillar assigned — sort this idea into a pillar"
      >
        unsorted
      </Badge>
    );
  }
  return (
    <Badge
      className="section-label"
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
            className="text-xs font-medium rounded-full px-3 py-1.5 transition-colors duration-150 active:scale-[0.95]"
            style={{
              color: d.pillar === p.pillar ? p.color : "var(--muted-foreground)",
              background: d.pillar === p.pillar ? tint(p.color, 20) : "var(--muted)",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {/* Full status row lives here (the card face shows one advance button) */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          Status
        </span>
        {STATUSES.map((s) => (
          <button
            key={s.status}
            onClick={() => set({ status: s.status })}
            className="text-xs font-medium rounded-full px-3 py-1.5 transition-colors duration-150 active:scale-[0.95]"
            style={{
              color: d.status === s.status ? s.color : "var(--muted-foreground)",
              background: d.status === s.status ? tint(s.color, 20) : "var(--muted)",
            }}
          >
            {s.label}
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
          className="gap-1.5 text-sm font-medium"
        >
          <Check size={14} /> Save
        </Button>
      </div>
    </Card>
  );
}

function IdeaBank() {
  const { ideas, loading, createIdea, updateIdea, deleteIdea, seedIdeas } =
    useContentIdeas();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pillarFilter, setPillarFilter] = useState<ContentPillar | "all">("all");
  const [hidePosted, setHidePosted] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Per-idea batch failure reasons, rendered inline on the card (not a toast storm).

  // No ship-logging step: the ship log is being retired, and this surface
  // must not write to a collection on its way out.
  const setIdeaStatus = async (idea: ContentIdea, status: ContentIdeaStatus) => {
    await updateIdea(idea.id, { status });
    if (status === "posted" && idea.status !== "posted") toast("Posted");
  };



  const visible = ideas.filter(
    (i) => (pillarFilter === "all" || i.pillar === pillarFilter) && (!hidePosted || i.status !== "posted")
  );
  const shown = showAll ? visible : visible.slice(0, 25);
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
              className="text-xs font-medium rounded-full px-3 py-1.5 transition-colors duration-150 active:scale-[0.95]"
              style={{
                color: pillarFilter === p.pillar ? p.color : "var(--muted-foreground)",
                background: pillarFilter === p.pillar ? tint(p.color, 20) : "var(--muted)",
              }}
            >
              {p.label} ({ideas.filter((i) => i.pillar === p.pillar).length})
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-xs ml-2 text-muted-foreground/70">
            <Checkbox checked={hidePosted} onCheckedChange={(v) => setHidePosted(v === true)} />
            hide posted
          </label>
        </div>
        <div className="flex items-center gap-2">
          {!creating && (
            <Button
              onClick={() => setCreating(true)}
              size="sm"
              className="gap-1.5 text-sm font-medium"
            >
              <Plus size={15} /> New idea
            </Button>
          )}
        </div>
      </div>

      {unscripted < 12 && (
        <div className="flex items-center gap-3 flex-wrap rounded-xl px-4 py-3 text-sm bg-warning/10 text-muted-foreground border border-warning/25">
          <AlertTriangle size={16} className="text-warning shrink-0" />
          <span className="flex-1 min-w-0">
            Bank rule: {unscripted} unscripted idea{unscripted === 1 ? "" : "s"} left (floor is 12). Run a 20-min
            brainstorm against the hook formulas.
          </span>
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)} className="gap-1.5 text-xs shrink-0">
            <Plus size={13} /> Add idea
          </Button>
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

      {loading && ideas.length === 0 && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      )}

      {ideas.length === 0 && !loading && !creating && (
        <Card className="flex-col items-center justify-center py-16 text-center enter">
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
            className="gap-1.5 text-sm font-medium"
          >
            <Download size={15} /> {seeding ? "Importing…" : "Import 60 starter ideas"}
          </Button>
        </Card>
      )}

      <div className="space-y-2">
        {shown.map((idea) =>
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
            <Card key={idea.id} className="px-4 py-3 gap-0 enter">
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
                <div className="flex items-center shrink-0">
                  <button
                    onClick={() => setEditingId(idea.id)}
                    title="Edit"
                    className="h-11 w-11 flex items-center justify-center rounded-lg text-muted-foreground/70 transition-transform duration-150 active:scale-[0.9]"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setConfirmId(idea.id)}
                    title="Delete"
                    className="h-11 w-11 flex items-center justify-center rounded-lg text-muted-foreground/70 transition-transform duration-150 active:scale-[0.9]"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {/* One advance button, labeled with the next step; the full
                  status row lives in the editor for corrections. */}
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span
                  className="text-[11px] font-medium rounded-full px-2.5 py-1"
                  style={{
                    color: STATUS_META[idea.status].color,
                    background: tint(STATUS_META[idea.status].color, 20),
                  }}
                >
                  {STATUS_META[idea.status].label}
                </span>
                {NEXT_STEP[idea.status] && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIdeaStatus(idea, NEXT_STEP[idea.status]!.next)}
                    className="gap-1 text-xs"
                  >
                    {NEXT_STEP[idea.status]!.label} <ArrowRight size={13} />
                  </Button>
                )}
              </div>
              {/* Samy's own writing. The legacy generated script on the one
                  previously-scripted idea is deliberately NOT rendered: the
                  premise of this rework is that he never sees a postable
                  draft. The data is kept, just not shown. */}
              <div className="mt-3">
                <IdeaBody
                  key={idea.id}
                  value={idea.body ?? ""}
                  onSave={(body) => updateIdea(idea.id, { body })}
                />
              </div>
            </Card>
          )
        )}
        {!showAll && visible.length > shown.length && (
          <Button variant="ghost" onClick={() => setShowAll(true)} className="w-full text-xs text-primary">
            Show more ({visible.length - shown.length})
          </Button>
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

// --- Page -----------------------------------------------------------------------

export default function ContentPage() {
  return (
    <Page>
      <PageHeader
        kicker="Publish"
        title="Content OS"
        description="Move ideas toward a published artifact. The playbook in the vault remains the source of truth."
        icon={Clapperboard}
      />

      <IdeaBank />
    </Page>
  );
}
