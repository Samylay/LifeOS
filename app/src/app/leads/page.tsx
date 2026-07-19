"use client";

// Leads — persistent demand, from two places: website-build briefs found by
// scout/demand_scout.py (source "codeur") and pain points kept in the /decide
// Pain deck (source "hn-pain"). The counterpart to /pager: these don't get
// pruned, they carry a status the user drives (new → contacted → won / passed).
//
// The source filter is not cosmetic. Leads sort by postedAt, and an HN comment
// is always older than this morning's freelance brief — so kept pain points
// land at the bottom of the list and are effectively invisible without it.
import { useState } from "react";
import { Radar, ExternalLink, Check, Trophy, X, Trash2 } from "lucide-react";
import { useLeads, LEAD_STATUSES, type Lead, type LeadStatus } from "@/lib/use-leads";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  won: "Won",
  passed: "Passed",
};

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "var(--primary)",
  contacted: "#F59E0B",
  won: "#10B981",
  passed: "var(--muted-foreground)",
};

// Known sources get a readable name; anything new falls back to its raw key
// rather than disappearing.
const SOURCE_LABELS: Record<string, string> = {
  codeur: "Codeur",
  "hn-pain": "Pain (HN)",
};

function budgetColor(floor: number): string {
  if (floor >= 10000) return "#10B981";
  if (floor >= 1000) return "var(--primary)";
  if (floor >= 500) return "#F59E0B";
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

const pressable = "transition-transform duration-150 active:scale-[0.97]";

export default function LeadsPage() {
  const { leads, loading, setStatus, remove } = useLeads();
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const [source, setSource] = useState<string>("all");

  const sources = Array.from(new Set(leads.map((l) => l.source))).sort();
  // Source narrows first, so the status counts describe what you're looking at.
  const scoped = source === "all" ? leads : leads.filter((l) => l.source === source);
  const count = (s: LeadStatus | "all") =>
    s === "all" ? scoped.length : scoped.filter((l) => l.status === s).length;
  const visible = filter === "all" ? scoped : scoped.filter((l) => l.status === filter);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Radar size={24} className="text-primary" />
        <h1 className="text-2xl font-semibold text-foreground">
          Leads
        </h1>
        {count("new") > 0 && (
          <Badge className="text-xs font-semibold">
            {count("new")} new
          </Badge>
        )}
      </div>

      {/* Source filter — only worth showing once there's more than one. */}
      {sources.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {(["all", ...sources] as const).map((s) => {
            const active = source === s;
            const n = s === "all" ? leads.length : leads.filter((l) => l.source === s).length;
            return (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`text-xs rounded-full px-3 py-1.5 font-medium border ${pressable} ${
                  active ? "bg-muted text-foreground border-muted-foreground" : "bg-transparent text-muted-foreground/70 border-border"
                }`}
              >
                {s === "all" ? "All sources" : (SOURCE_LABELS[s] ?? s)}
                <span className="ml-1.5 font-semibold">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(["all", ...LEAD_STATUSES] as const).map((s) => {
          const active = filter === s;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-xs rounded-lg px-3 py-2 font-medium border ${pressable} ${
                active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"
              }`}
            >
              {s === "all" ? "All" : STATUS_LABELS[s]}
              <span className="ml-1.5 font-semibold">{count(s)}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-muted-foreground/70">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground/70">
          {filter === "all"
            ? "No leads yet. demand-scout drops new website requests here every morning."
            : `No ${STATUS_LABELS[filter as LeadStatus].toLowerCase()} leads.`}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onStatus={setStatus} onRemove={remove} />
          ))}
        </div>
      )}
    </div>
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
  const dimmed = lead.status === "passed";
  return (
    <Card
      className="p-4 gap-0 transition-opacity"
      style={{ opacity: dimmed ? 0.55 : 1, transitionDuration: "var(--dur-base)", transitionTimingFunction: "var(--ease-out-custom)" }}
    >
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span
          className="text-xs font-semibold rounded-md px-2 py-0.5 text-white"
          style={{ background: budgetColor(lead.budgetFloor) }}
        >
          {lead.budget}
        </span>
        <span
          className="text-xs font-medium rounded-md px-2 py-0.5 border"
          style={{
            color: STATUS_COLORS[lead.status],
            borderColor: STATUS_COLORS[lead.status],
          }}
        >
          {STATUS_LABELS[lead.status]}
        </span>
        <span className="text-xs text-muted-foreground/70">
          {lead.source} · {timeAgo(lead.postedAt)}
        </span>
      </div>

      <p className="text-sm font-semibold mb-1 text-foreground">
        {lead.title}
      </p>
      {lead.categories && (
        <p className="text-xs mb-1.5 text-muted-foreground/70">
          {lead.categories}
        </p>
      )}
      {lead.brief && (
        <p
          className="text-sm mb-3 break-words text-muted-foreground"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {lead.brief}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <a
          href={lead.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground ${pressable}`}
        >
          <ExternalLink size={14} /> Ouvrir
        </a>
        <StatusButton
          active={lead.status === "contacted"}
          onClick={() => onStatus(lead.id, lead.status === "contacted" ? "new" : "contacted")}
          color="#F59E0B"
          icon={<Check size={14} />}
          label="Contacted"
        />
        <StatusButton
          active={lead.status === "won"}
          onClick={() => onStatus(lead.id, lead.status === "won" ? "new" : "won")}
          color="#10B981"
          icon={<Trophy size={14} />}
          label="Won"
        />
        <StatusButton
          active={lead.status === "passed"}
          onClick={() => onStatus(lead.id, lead.status === "passed" ? "new" : "passed")}
          color="var(--muted-foreground)"
          icon={<X size={14} />}
          label="Pass"
        />
        <button
          onClick={() => onRemove(lead.id)}
          className={`ml-auto p-1.5 rounded-lg text-muted-foreground/70 ${pressable}`}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </Card>
  );
}

function StatusButton({
  active,
  onClick,
  color,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border ${pressable}`}
      style={{
        background: active ? color : "transparent",
        color: active ? "white" : "var(--muted-foreground)",
        borderColor: active ? color : "var(--border)",
      }}
    >
      {icon} {label}
    </button>
  );
}
