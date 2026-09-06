"use client";

// Leads — a handful you could act on today, or nothing.
//
// This surface used to be a 653-item graveyard: every lead scout found
// landed here with no bar to clear, and a year of that produced zero
// contacts. The fix lives upstream of the UI (admission — see
// lib/leads/admission.ts and lib/leads/surface.ts): GET /api/leads returns
// only what's admitted right now, capped at a handful, so this component has
// nothing left to filter or paginate. There is deliberately no "show all", no
// source filter, no status filter — those existed only to navigate a pile,
// and a capped set has no pile to navigate.
//
// Emptiness is a real, finished answer here, not a loading or error state:
// see EmptySurface below.
import { useState } from "react";
import { Radar, ExternalLink, Check, Trophy, X, Trash2 } from "lucide-react";
import { useLeads, type Lead, type LeadStatus } from "@/lib/use-leads";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Page, PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/skeleton";
import { calendarDaysBetween } from "@/lib/types";

const SOURCE_LABELS: Record<string, string> = {
  codeur: "Codeur",
  "ject-osm": "JobExtract/OSM",
};

/** Translucent tint of a color (hex or CSS var) for chip backgrounds. */
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

function budgetColor(floor: number): string {
  if (floor >= 10000) return "var(--success)";
  if (floor >= 1000) return "var(--primary)";
  if (floor >= 500) return "var(--warning)";
  return "var(--muted-foreground)";
}

function timeAgo(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const pressable = "pressable active:scale-[0.97]";

export default function LeadsPage() {
  const { leads, loading, cap, lastDeliveredAt, setStatus, remove } = useLeads();

  return (
    <Page narrow>
      <PageHeader
        kicker="Pipeline"
        title="Leads"
        description="A handful worth contacting today. Nothing more."
        icon={Radar}
        actions={leads.length > 0 ? (
          <Badge className="text-xs font-semibold">
            {leads.length}/{cap}
          </Badge>
        ) : undefined}
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : leads.length === 0 ? (
        <EmptySurface lastDeliveredAt={lastDeliveredAt} />
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onStatus={setStatus} onRemove={remove} />
          ))}
        </div>
      )}
    </Page>
  );
}

/**
 * A finished answer, not a failure. Distinguishes "scout is running and
 * nothing cleared the bar today" from "something broke" by naming when scout
 * last delivered anything at all — a quiet day looks different from silence.
 */
function EmptySurface({ lastDeliveredAt }: { lastDeliveredAt: Date | null }) {
  const deliveredText = lastDeliveredAt
    ? `Scout last delivered a lead ${timeAgo(lastDeliveredAt)} ago.`
    : "Scout hasn't delivered a lead yet.";

  return (
    <Card className="p-6 text-center enter">
      <p className="text-sm font-medium text-foreground mb-1">Nothing worth your attention right now.</p>
      <p className="text-xs text-muted-foreground/70">{deliveredText}</p>
    </Card>
  );
}

function LeadCard({
  lead,
  onStatus,
  onRemove,
}: {
  lead: Lead;
  onStatus: (id: string, s: LeadStatus) => void;
  onRemove: (id: string) => void;
}) {
  const [briefOpen, setBriefOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [now] = useState(() => Date.now());
  const contactedDays =
    lead.status === "contacted" && lead.contactedAt
      ? calendarDaysBetween(new Date(lead.contactedAt), new Date(now))
      : null;

  return (
    <Card className="p-4 gap-0 enter">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span
          className="text-xs font-semibold rounded-md px-2 py-0.5"
          style={{ background: tint(budgetColor(lead.budgetFloor), 18), color: budgetColor(lead.budgetFloor) }}
        >
          {lead.budget}
        </span>
        <span className="text-xs text-muted-foreground/70">
          {SOURCE_LABELS[lead.source] ?? lead.source} · {timeAgo(lead.postedAt)}
          {contactedDays !== null && (
            <span className="text-warning"> · contacted {contactedDays === 0 ? "today" : `${contactedDays}d ago`}</span>
          )}
        </span>
      </div>

      <p className="text-sm font-semibold mb-1 text-foreground">
        {lead.title}
      </p>

      {/* The one line that answers "why is this here" — story 14. */}
      <p className="text-xs mb-1.5 text-primary">{lead.admissionReason}</p>

      {lead.brief && (
        <button
          onClick={() => setBriefOpen((o) => !o)}
          aria-expanded={briefOpen}
          className={`text-sm mb-3 break-words text-left text-muted-foreground ${pressable}`}
          style={
            briefOpen
              ? undefined
              : {
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }
          }
          title={briefOpen ? "Collapse brief" : "Show full brief"}
        >
          {lead.brief}
        </button>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <a
          href={lead.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground ${pressable}`}
        >
          <ExternalLink size={14} /> Open brief
        </a>
        <ActionButton
          onClick={() => onStatus(lead.id, "contacted")}
          color="var(--warning)"
          icon={<Check size={14} />}
          label="Contacted"
        />
        <ActionButton
          onClick={() => onStatus(lead.id, "won")}
          color="var(--success)"
          icon={<Trophy size={14} />}
          label="Won"
        />
        <ActionButton
          onClick={() => onStatus(lead.id, "passed")}
          color="var(--muted-foreground)"
          icon={<X size={14} />}
          label="Pass"
        />
        <button
          onClick={() => setConfirmDelete(true)}
          className={`ml-auto h-11 w-11 flex items-center justify-center rounded-lg text-muted-foreground/70 ${pressable}`}
          title="Delete"
          aria-label="Delete lead"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete lead"
        message={`Delete "${lead.title}"? This cannot be undone.`}
        onConfirm={() => { onRemove(lead.id); setConfirmDelete(false); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Card>
  );
}

function ActionButton({
  onClick,
  color,
  icon,
  label,
}: {
  onClick: () => void;
  color: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={`gap-1.5 text-xs font-medium ${pressable}`}
      style={{ color, borderColor: tint(color, 40) }}
    >
      {icon} {label}
    </Button>
  );
}
