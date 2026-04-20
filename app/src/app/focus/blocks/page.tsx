"use client";

import Link from "next/link";
import { CalendarClock, Plus, Play, Trash2, CheckCircle2 } from "lucide-react";
import { useFocusBlocks } from "@/lib/use-focus-blocks";
import { AREAS, type FocusBlock } from "@/lib/types";

const STATUS_COLORS: Record<FocusBlock["status"], string> = {
  scheduled: "#6366F1",
  active: "#7C9E8A",
  done: "#64748B",
};

function BlockRow({
  block,
  onDelete,
}: {
  block: FocusBlock;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className="rounded-xl p-4 group flex items-center gap-4"
      style={{
        background: "var(--bg-secondary)",
        border: `1px solid ${
          block.status === "active" ? "var(--accent)" : "var(--border-primary)"
        }`,
      }}
    >
      <div
        className="flex flex-col items-center justify-center rounded-lg px-3 py-2 flex-shrink-0"
        style={{ background: "var(--bg-tertiary)", minWidth: 90 }}
      >
        <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
          {new Date(block.date + "T00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
        <span className="text-sm font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
          {block.startTime}–{block.endTime}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h3
            className="text-sm font-semibold truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {block.title}
          </h3>
          <span
            className="text-xs font-mono uppercase px-2 py-0.5 rounded-full"
            style={{
              background: `${STATUS_COLORS[block.status]}20`,
              color: STATUS_COLORS[block.status],
            }}
          >
            {block.status}
          </span>
        </div>
        <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
          {block.goal || "—"}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
          {block.sessionCount} × {block.sessionDuration}m focus + {block.breakDuration}m breaks
          {block.area && ` · ${AREAS[block.area]?.name}`}
          {block.shieldEnabled && " · 🛡 shield"}
        </p>
      </div>

      <div className="flex items-center gap-1">
        {block.status !== "done" && (
          <Link
            href={`/focus?blockId=${block.id}`}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-sage-400 text-white hover:bg-sage-500"
          >
            <Play size={12} />
            Start
          </Link>
        )}
        {block.status === "done" && (
          <span style={{ color: "#64748B" }} title="Done">
            <CheckCircle2 size={16} />
          </span>
        )}
        <button
          onClick={() => {
            if (confirm(`Delete block "${block.title}"?`)) onDelete(block.id);
          }}
          className="opacity-0 group-hover:opacity-100 p-1.5"
          style={{ color: "var(--text-tertiary)" }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function FocusBlocksPage() {
  const { blocks, todayBlocks, upcomingBlocks, doneBlocks, deleteBlock } = useFocusBlocks();
  const today = new Date().toISOString().split("T")[0];

  const upcomingFuture = upcomingBlocks.filter((b) => b.date > today);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Focus Blocks
          </h1>
          <p
            className="text-xs font-mono uppercase tracking-wider mt-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            Pre-scheduled deep work
          </p>
        </div>
        <Link
          href="/focus/blocks/new"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors"
        >
          <Plus size={16} /> New Block
        </Link>
      </div>

      {blocks.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <CalendarClock size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
            No blocks scheduled
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Plan a deep-work block to make focus inevitable.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {todayBlocks.length > 0 && (
            <section>
              <h2
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--accent)" }}
              >
                Today
              </h2>
              <div className="space-y-2">
                {todayBlocks.map((b) => (
                  <BlockRow key={b.id} block={b} onDelete={deleteBlock} />
                ))}
              </div>
            </section>
          )}

          {upcomingFuture.length > 0 && (
            <section>
              <h2
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--text-secondary)" }}
              >
                Upcoming
              </h2>
              <div className="space-y-2">
                {upcomingFuture.map((b) => (
                  <BlockRow key={b.id} block={b} onDelete={deleteBlock} />
                ))}
              </div>
            </section>
          )}

          {doneBlocks.length > 0 && (
            <section>
              <h2
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--text-tertiary)" }}
              >
                Done
              </h2>
              <div className="space-y-2 opacity-60">
                {doneBlocks.slice(0, 10).map((b) => (
                  <BlockRow key={b.id} block={b} onDelete={deleteBlock} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
