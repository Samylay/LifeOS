"use client";

import { useEffect, useState } from "react";
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
import { TeachSection } from "@/components/teach/teach-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

  return (
    <Card className="gap-3 rounded-xl p-4">
      <Input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Note title…"
        autoFocus
        className="text-sm font-medium"
      />
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={5}
        placeholder="Write your note (Markdown). Hermes will add a summary and tags."
        className="text-sm resize-none"
      />
      <div className="flex items-center gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={onCancel} className="gap-1.5 text-xs">
          <X size={14} /> Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => title.trim() && onSave({ title: title.trim(), content, folder: "01-Inbox" })}
          disabled={!title.trim()}
          className="gap-1.5 text-sm px-4"
        >
          <Check size={14} /> Capture
        </Button>
      </div>
    </Card>
  );
}

// --- Note reader ---

function NoteReader({ note, onBack }: { note: Note; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-primary">
        <ArrowLeft size={14} /> Back to notes
      </button>

      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl font-semibold text-foreground">{note.title}</h1>
        <span className="text-xs font-mono text-muted-foreground/70">{note.path}</span>
      </div>

      {(note.summary || note.tags?.length) && (
        <Card className="gap-0 rounded-xl border-border bg-primary/10 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles size={13} className="text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
              Hermes
            </span>
          </div>
          {note.summary && <p className="text-sm text-foreground">{note.summary}</p>}
          {note.tags && note.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {note.tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1 rounded-md text-xs font-normal">
                  <Tag size={10} /> {t}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      )}

      <pre className="rounded-xl border border-border bg-card p-4 text-sm whitespace-pre-wrap break-words font-sans max-w-full text-foreground">
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
  const [showAllNotes, setShowAllNotes] = useState(false);

  // The reader gets its own history entry so the phone back gesture closes
  // the note instead of leaving /knowledge.
  useEffect(() => {
    const onPop = () => setActive(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openNote = (note: Note) => {
    window.history.pushState({ ...window.history.state, kbNote: true }, "");
    setActive(note);
  };

  const closeNote = () => {
    if (window.history.state?.kbNote) window.history.back();
    else setActive(null);
  };

  if (active) {
    return (
      <div className="max-w-3xl">
        <NoteReader note={active} onBack={closeNote} />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap enter">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2 text-foreground">
            <Brain size={22} className="text-primary" /> Knowledge
          </h1>
          <p className="text-xs mt-1 text-muted-foreground/70">
            Your Obsidian vault, enriched by Hermes. Capture here — Hermes summarizes &amp; tags.
          </p>
        </div>
        {enabled && !capturing && (
          <Button size="sm" onClick={() => setCapturing(true)} className="gap-1.5">
            <Plus size={15} /> Capture note
          </Button>
        )}
      </div>

      {!enabled && (
        <Card className="gap-0 rounded-xl p-4 text-sm text-muted-foreground">
          The knowledge base isn&apos;t mounted. Set <code>KB_PATH</code> to the vault path and restart.
        </Card>
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

      {/* Voice teaching sessions — queue, suggestions, session launcher.
          The learning loop owns the fold; the note archive lives below. */}
      <div className="enter" style={{ ["--enter-delay" as string]: "40ms" }}>
        <TeachSection />
      </div>

      {/* Search */}
      {enabled && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Search size={15} className="text-muted-foreground/70 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes…"
            className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted-foreground/70">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* List */}
      {enabled && (
        <div className="space-y-2">
          {loading && notes.length === 0 ? (
            <p className="text-sm text-muted-foreground/70">Loading…</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground/70">
              {query ? "No notes match." : "No notes yet."}
            </p>
          ) : (
            (showAllNotes || query ? notes : notes.slice(0, 5)).map((n) => (
              <button
                key={n.path}
                onClick={async () => {
                  const full = await readNote(n.path);
                  if (full) openNote(full);
                  else toast("Could not open note");
                }}
                className="w-full text-left rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted active:scale-[0.99] duration-150"
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <FileText size={16} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate text-foreground">{n.title}</p>
                      <Badge variant="secondary" className="rounded-md text-[10px] font-normal">
                        {n.folder}
                      </Badge>
                      <span className="text-xs ml-auto shrink-0 text-muted-foreground/70">
                        {timeAgo(n.mtime)}
                      </span>
                    </div>
                    {n.summary && (
                      <p className="text-xs mt-1 line-clamp-2 text-muted-foreground">{n.summary}</p>
                    )}
                    {n.tags && n.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {n.tags.slice(0, 5).map((t) => (
                          <span
                            key={t}
                            className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary"
                          >
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
          {!query && !showAllNotes && notes.length > 5 && (
            <button
              onClick={() => setShowAllNotes(true)}
              className="w-full rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground transition-transform duration-150 active:scale-[0.98]"
            >
              Show all ({notes.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
