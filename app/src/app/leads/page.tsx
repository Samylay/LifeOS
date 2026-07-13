"use client";

// Leads — persistent website-build demand found by scout/demand_scout.py.
// The counterpart to /pager: these don't get pruned, they carry a status the
// user drives (new → contacted → won / passed).
import { useState } from "react";
import { Radar, ExternalLink, Check, Trophy, X, Trash2 } from "lucide-react";
import { useLeads, LEAD_STATUSES, type Lead, type LeadStatus } from "@/lib/use-leads";

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  won: "Won",
  passed: "Passed",
};

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "var(--accent)",
  contacted: "#F59E0B",
  won: "#10B981",
  passed: "var(--text-tertiary)",
};

function budgetColor(floor: number): string {
  if (floor >= 10000) return "#10B981";
  if (floor >= 1000) return "var(--accent)";
  if (floor >= 500) return "#F59E0B";
  return "var(--text-tertiary)";
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

  const count = (s: LeadStatus | "all") =>
    s === "all" ? leads.length : leads.filter((l) => l.status === s).length;
  const visible = filter === "all" ? leads : leads.filter((l) => l.status === filter);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Radar size={24} style={{ color: "var(--accent)" }} />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Leads
        </h1>
        {count("new") > 0 && (
          <span
            className="text-xs font-semibold rounded-full px-2 py-0.5"
            style={{ background: "var(--accent)", color: "white" }}
          >
            {count("new")} new
          </span>
        )}
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(["all", ...LEAD_STATUSES] as const).map((s) => {
          const active = filter === s;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-xs rounded-lg px-3 py-2 font-medium ${pressable}`}
              style={{
                background: active ? "var(--accent)" : "var(--bg-secondary)",
                color: active ? "white" : "var(--text-secondary)",
                border: "1px solid " + (active ? "var(--accent)" : "var(--border-primary)"),
              }}
            >
              {s === "all" ? "All" : STATUS_LABELS[s]}
              <span className="ml-1.5 font-semibold">{count(s)}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p style={{ color: "var(--text-tertiary)" }}>Loading…</p>
      ) : visible.length === 0 ? (
        <p style={{ color: "var(--text-tertiary)" }}>
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
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
        opacity: dimmed ? 0.55 : 1,
        transition: "opacity var(--dur-base) var(--ease-out-custom)",
      }}
    >
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span
          className="text-xs font-semibold rounded-md px-2 py-0.5"
          style={{ background: budgetColor(lead.budgetFloor), color: "white" }}
        >
          {lead.budget}
        </span>
        <span
          className="text-xs font-medium rounded-md px-2 py-0.5"
          style={{
            color: STATUS_COLORS[lead.status],
            border: `1px solid ${STATUS_COLORS[lead.status]}`,
          }}
        >
          {STATUS_LABELS[lead.status]}
        </span>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {lead.source} · {timeAgo(lead.postedAt)}
        </span>
      </div>

      <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        {lead.title}
      </p>
      {lead.categories && (
        <p className="text-xs mb-1.5" style={{ color: "var(--text-tertiary)" }}>
          {lead.categories}
        </p>
      )}
      {lead.brief && (
        <p
          className="text-sm mb-3 break-words"
          style={{
            color: "var(--text-secondary)",
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
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${pressable}`}
          style={{ background: "var(--accent)", color: "white" }}
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
          color="var(--text-tertiary)"
          icon={<X size={14} />}
          label="Pass"
        />
        <button
          onClick={() => onRemove(lead.id)}
          className={`ml-auto p-1.5 rounded-lg ${pressable}`}
          style={{ color: "var(--text-tertiary)" }}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
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
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${pressable}`}
      style={{
        background: active ? color : "transparent",
        color: active ? "white" : "var(--text-secondary)",
        border: `1px solid ${active ? color : "var(--border-primary)"}`,
      }}
    >
      {icon} {label}
    </button>
  );
}
