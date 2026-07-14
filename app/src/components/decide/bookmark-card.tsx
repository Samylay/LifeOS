"use client";

// One shelf bookmark the backfill cull wants to DROP. Deliberately the
// thinnest card in the app: every row here is a proposed no, so it only has
// to carry enough to disagree with — what it is, how old, where he filed it,
// whether it still resolves, and one line of why. Anything more would be
// asking him to re-read a four-year-old library he already stopped using.
import { ExternalLink, Unlink } from "lucide-react";
import { hostOf, ageLabel } from "@/lib/bookmark-backfill";

export interface BackfillDeckItem {
  id: string;
  url: string;
  title?: string;
  folder?: string;
  savedAt?: { __date?: string } | string;
  alive?: boolean;
  httpStatus?: number;
  why?: string;
}

function isoOf(v: BackfillDeckItem["savedAt"]): string {
  return (typeof v === "string" ? v : v?.__date) ?? "";
}

export function BookmarkCard({ item }: { item: BackfillDeckItem }) {
  const iso = isoOf(item.savedAt);
  const age = iso ? ageLabel(iso) : "";
  const dead = item.alive === false;

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span
          className="rounded px-1.5 py-0.5 font-medium"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
        >
          {item.folder || "unfiled"}
        </span>
        {dead && (
          <span
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold uppercase tracking-wide"
            style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444" }}
          >
            <Unlink size={11} />
            {item.httpStatus ? `dead · ${item.httpStatus}` : "unreachable"}
          </span>
        )}
        {age && (
          <span className="ml-auto" style={{ color: "var(--text-tertiary)" }}>
            saved {age} ago
          </span>
        )}
      </div>

      <h2
        className="text-lg font-semibold leading-snug"
        style={{ color: "var(--text-primary)" }}
      >
        {item.title || hostOf(item.url)}
      </h2>
      <p className="text-xs font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
        {hostOf(item.url)}
      </p>

      {item.why && (
        <div className="rounded-lg p-3" style={{ background: "var(--bg-tertiary)" }}>
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "#EF4444" }}
          >
            drop
          </span>
          <p className="text-sm leading-relaxed mt-1" style={{ color: "var(--text-primary)" }}>
            {item.why}
          </p>
        </div>
      )}

      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium transition-transform duration-150 active:scale-[0.97]"
        style={{ color: "var(--accent)" }}
      >
        <ExternalLink size={12} /> open original
      </a>
    </div>
  );
}
