"use client";

import { useState } from "react";
import { MessageSquare, Check, Trash2, ArrowRight, ListTodo, MoreHorizontal } from "lucide-react";
import { useNotes } from "@/lib/use-notes";
import { useTasks } from "@/lib/use-tasks";
import { AREAS } from "@/lib/types";
import type { AreaId, Note } from "@/lib/types";

export default function InboxPage() {
  const { notes, updateNote, deleteNote, loading } = useNotes();
  const { createTask } = useTasks();
  
  const unprocessedNotes = notes.filter(n => !n.processed);

  const handleFileIntoArea = async (note: Note, areaId: AreaId) => {
    await updateNote(note.id, { 
      area: areaId, 
      processed: true 
    });
  };

  const handleConvertToTask = async (note: Note) => {
    const title =
      note.content.length > 100
        ? `${note.content.substring(0, 100)}…`
        : note.content;
    await createTask({
      title,
      description: note.content.length > 100 ? note.content : undefined,
      status: "todo",
      priority: "medium",
      area: note.area,
    });
    await deleteNote(note.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-tertiary">Loading inbox...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Inbox</h1>
          <p className="text-sm text-secondary">
            {unprocessedNotes.length} unprocessed item{unprocessedNotes.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {unprocessedNotes.length === 0 ? (
        <div 
          className="rounded-2xl p-12 text-center"
          style={{ background: "var(--bg-secondary)", border: "1px dashed var(--border-primary)" }}
        >
          <div className="bg-bg-tertiary w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="text-sage-500" />
          </div>
          <h2 className="text-lg font-medium text-primary mb-1">Inbox Zero!</h2>
          <p className="text-sm text-tertiary">All your notes are processed and filed.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {unprocessedNotes.map((note) => (
            <NoteCard 
              key={note.id} 
              note={note} 
              onFile={handleFileIntoArea}
              onConvert={handleConvertToTask}
              onDelete={deleteNote}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({ 
  note, 
  onFile, 
  onConvert, 
  onDelete 
}: { 
  note: Note; 
  onFile: (note: Note, areaId: AreaId) => void;
  onConvert: (note: Note) => void;
  onDelete: (id: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div 
      className="group rounded-2xl p-5 transition-all hover:shadow-md"
      style={{ 
        background: "var(--bg-secondary)", 
        border: "1px solid var(--border-primary)" 
      }}
    >
      <div className="flex gap-4">
        <div className="mt-1">
          <MessageSquare size={20} className="text-emerald-500 opacity-60" />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-primary text-sm leading-relaxed whitespace-pre-wrap mb-4">
            {note.content}
          </p>
          
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary mr-2">File into area:</span>
            {(Object.entries(AREAS) as [AreaId, any][]).map(([id, area]) => (
              <button
                key={id}
                onClick={() => onFile(note, id)}
                className="text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors border border-primary hover:border-accent hover:text-accent bg-bg-tertiary text-secondary"
              >
                {area.name.split(' ')[0]}
              </button>
            ))}
            
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => onConvert(note)}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 transition-colors"
              >
                <ListTodo size={12} />
                Task
              </button>
              <button
                onClick={() => onDelete(note.id)}
                className="p-1.5 rounded-lg text-tertiary hover:text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
