"use client";

// One shelf bookmark the backfill cull wants to DROP. Deliberately the
// thinnest card in the app: every row here is a proposed no, so it only has
// to carry enough to disagree with — what it is, how old, where he filed it,
// whether it still resolves, and one line of why. Anything more would be
// asking him to re-read a four-year-old library he already stopped using.
import { ExternalLink, Unlink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
    <div className="space-y-3 p-5">
      <div className="flex items-center gap-2 text-xs">
        <Badge variant="secondary" className="rounded font-medium">
          {item.folder || "unfiled"}
        </Badge>
        {dead && (
          <Badge variant="destructive" className="gap-1 rounded bg-destructive/10 font-semibold uppercase tracking-wide text-destructive">
            <Unlink size={11} />
            {item.httpStatus ? `dead · ${item.httpStatus}` : "unreachable"}
          </Badge>
        )}
        {age && (
          <span className="ml-auto text-muted-foreground">
            saved {age} ago
          </span>
        )}
      </div>

      <h2 className="text-lg font-semibold leading-snug text-foreground">
        {item.title || hostOf(item.url)}
      </h2>
      <p className="truncate font-mono text-xs text-muted-foreground">
        {hostOf(item.url)}
      </p>

      {item.why && (
        <div className="rounded-lg bg-muted p-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-destructive">
            drop
          </span>
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            {item.why}
          </p>
        </div>
      )}

      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-transform duration-150 active:scale-[0.97]"
      >
        <ExternalLink size={12} /> open original
      </a>
    </div>
  );
}
