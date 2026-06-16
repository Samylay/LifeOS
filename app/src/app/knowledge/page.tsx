"use client";

import { useState } from "react";
import {
  Brain,
  Search,
  Plus,
  X,
  Check,
  FileText,
  ArrowLeft,
  Sparkles,
  Tag,
} from "lucide-react";
import { useKnowledge, type Note } from "@/lib/use-kb";
import { useToast } from "@/components/toast";

function timeAgo(ms: number): string {
  const d = Date.now() - ms;
  const days = Math.floor(d / 86400000);
  if (days > 0) return `${days}d ago`;
  const hrs = Math.floor(d / 3600000);
  if (hrs > 0) return `${hrs}h ago`;
  const mins = Math.floor(d / 60000);
  return mins > 0 ? `${mins}m ago` : "just now";
}

// --- Capture form ---

function CaptureForm({
  onSave,
  onCancel,
}: {
  onSave: (data: { title: string; content: string; folder: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [folder, setFolder] = useState("01-Inbox");

  const inputStyle = {
    color: "var(--text-primary)",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border-primary)",
  };

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
    >
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Note title…"
        autoFocus
        className="w-full text-sm font-medium outline-none rounded-lg px-3 py-2"
        style={inputStyle}
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={5}
        placeholder="Write your note (Markdown). Hermes will add a summary and tags."
        className="w-full text-sm outline-none rounded-lg px-3 py-2 resize-none"
        style={inputStyle}
      />
      <div className="flex items-center gap-2 justify-between flex-wrap">
        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
          Folder
          <input
            type="text"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className="text-xs outline-none rounded-lg px-2 py-1.5 w-32"
            style={inputStyle}
          />
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}
          >
            <X size={14} /> Cancel
          </button>
          <button
            onClick={() => title.trim() && onSave({ title: title.trim(), content, folder: folder.trim() || "01-Inbox" })}
            disabled={!title.trim()}
            className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors disabled:opacity-50"
          >
            <Check size={14} /> Capture
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Note reader ---

function NoteReader({ note, onBack }: { note: Note; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium"
        style={{ color: "var(--accent)" }}
      >
        <ArrowLeft size={14} /> Back to notes
      </button>

      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          {note.title}
        </h1>
        <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
          {note.path}
        </span>
      </div>

      {(note.summary || note.tags?.length) && (
        <div
          className="rounded-xl p-3"
          style={{ background: "var(--accent-bg)", border: "1px solid var(--border-primary)" }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles size={13} style={{ color: "var(--accent)" }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--accent)" }}>
              Hermes
            </span>
          </div>
          {note.summary && (
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              {note.summary}
            </p>
          )}
          {note.tags && note.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {note.tags.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                >
                  <Tag size={10} /> {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <pre
        className="rounded-xl p-4 text-sm whitespace-pre-wrap font-sans overflow-x-auto"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
      >
        {note.content}
      </pre>
    </div>
  );
}

// --- Page ---

export default function KnowledgePage() {
  const { notes, enabled, loading, query, setQuery, readNote, createNote } = useKnowledge();
  const { toast } = useToast();
  const [capturing, setCapturing] = useState(false);
  const [active, setActive] = useState<Note | null>(null);

  if (active) {
    return (
      <div className="max-w-3xl">
        <NoteReader note={active} onBack={() => setActive(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Brain size={22} style={{ color: "var(--accent)" }} /> Knowledge
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            Your Obsidian vault, enriched by Hermes. Capture here — Hermes summarizes &amp; tags.
          </p>
        </div>
        {enabled && !capturing && (
          <button
            onClick={() => setCapturing(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors"
          >
            <Plus size={15} /> Capture note
          </button>
        )}
      </div>

      {!enabled && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}
        >
          The knowledge base isn&apos;t mounted. Set <code>KB_PATH</code> to the vault path and restart.
        </div>
      )}

      {capturing && (
        <CaptureForm
          onCancel={() => setCapturing(false)}
          onSave={async (data) => {
            try {
              await createNote(data);
              setCapturing(false);
              toast("Captured — Hermes will enrich it shortly");
            } catch (e) {
              toast(e instanceof Error ? e.message : "Failed to capture");
            }
          }}
        />
      )}

      {/* Search */}
      {enabled && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <Search size={15} style={{ color: "var(--text-tertiary)" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ color: "var(--text-tertiary)" }}>
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* List */}
      {enabled && (
        <div className="space-y-2">
          {loading && notes.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Loading…</p>
          ) : notes.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              {query ? "No notes match." : "No notes yet."}
            </p>
          ) : (
            notes.map((n) => (
              <button
                key={n.path}
                onClick={async () => {
                  const full = await readNote(n.path);
                  if (full) setActive(full);
                  else toast("Could not open note");
                }}
                className="w-full text-left rounded-xl p-4 transition-colors hover:bg-[var(--bg-tertiary)]"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{ background: "var(--bg-tertiary)" }}
                  >
                    <FileText size={16} style={{ color: "var(--accent)" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {n.title}
                      </p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}>
                        {n.folder}
                      </span>
                      <span className="text-xs ml-auto shrink-0" style={{ color: "var(--text-tertiary)" }}>
                        {timeAgo(n.mtime)}
                      </span>
                    </div>
                    {n.summary && (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                        {n.summary}
                      </p>
                    )}
                    {n.tags && n.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {n.tags.slice(0, 5).map((t) => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
