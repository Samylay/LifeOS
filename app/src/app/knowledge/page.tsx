"use client";

import { useEffect, useState } from "react";
import {
  Brain,
  Search,
  X,
  FileText,
  ArrowLeft,
  Sparkles,
  Tag,
} from "lucide-react";
import { useKnowledge, type Note, type NoteMeta } from "@/lib/use-kb";
import { calendarDaysBetween } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/components/toast";
import { TeachSection } from "@/components/teach/teach-section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Page, PageHeader } from "@/components/ui/page";

function timeAgo(ms: number): string {
  const days = calendarDaysBetween(new Date(ms), new Date());
  if (days > 0) return `${days}d ago`;
  const d = Date.now() - ms;
  const hrs = Math.floor(d / 3600000);
  if (hrs > 0) return `${hrs}h ago`;
  const mins = Math.floor(d / 60000);
  return mins > 0 ? `${mins}m ago` : "just now";
}

// --- Note reader ---

function NoteReader({ note, onBack }: { note: Note; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-primary">
        <ArrowLeft size={14} /> Back to notes
      </button>

      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-foreground">{note.title}</h1>
        <span className="text-xs font-mono text-muted-foreground/70">{note.path}</span>
      </div>

      {(note.summary || note.tags?.length) && (
        <Card className="gap-0 rounded-xl border-border bg-primary/10 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles size={13} className="text-primary" />
            <span className="section-label">
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

// --- Note row ---

function NoteRow({
  note: n,
  readNote,
  openNote,
  toast,
}: {
  note: NoteMeta;
  readNote: (path: string) => Promise<Note | null>;
  openNote: (note: Note) => void;
  toast: (msg: string) => void;
}) {
  return (
    <button
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
            <span className="text-xs ml-auto shrink-0 text-muted-foreground/70">{timeAgo(n.mtime)}</span>
          </div>
          {n.summary && <p className="text-xs mt-1 line-clamp-2 text-muted-foreground">{n.summary}</p>}
          {n.tags && n.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {n.tags.slice(0, 5).map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// --- Page ---

export default function KnowledgePage() {
  const { notes, suggestions, message, enabled, loading, query, setQuery, readNote } = useKnowledge();
  const { toggleChatPanel } = useAppStore();
  const { toast } = useToast();
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
      <Page narrow>
        <NoteReader note={active} onBack={closeNote} />
      </Page>
    );
  }

  return (
    <Page narrow>
      <PageHeader
        kicker="Vault"
        title="Knowledge"
        description="Search your Obsidian vault, review Hermes enrichment, and keep teaching sessions moving."
        icon={Brain}
        actions={
          enabled ? (
            <Button variant="outline" onClick={toggleChatPanel}>
              <Sparkles size={15} /> Capture with Assistant
            </Button>
          ) : undefined
        }
      />

      {!enabled && (
        <Card className="gap-0 rounded-xl p-4 text-sm text-muted-foreground">
          The knowledge base isn&apos;t mounted. Set <code>KB_PATH</code> to the vault path and restart.
        </Card>
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
            <button
              onClick={() => setQuery("")}
              aria-label="Clear knowledge search"
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
            >
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
          ) : notes.length === 0 && query ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground/70">{message || "No notes match."}</p>
              {suggestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground/70">Recent notes</p>
                  {suggestions.map((n) => (
                    <NoteRow key={n.path} note={n} readNote={readNote} openNote={openNote} toast={toast} />
                  ))}
                </div>
              )}
            </div>
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground/70">No notes yet.</p>
          ) : (
            (showAllNotes || query ? notes : notes.slice(0, 5)).map((n) => (
              <NoteRow key={n.path} note={n} readNote={readNote} openNote={openNote} toast={toast} />
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
    </Page>
  );
}
