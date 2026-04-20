"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Zap, Check, Loader2, Save, X, Calendar, MessageSquare, Bell, ListTodo } from "lucide-react";
import { useTasks } from "@/lib/use-tasks";
import { useEvents } from "@/lib/use-events";
import { useNotes } from "@/lib/use-notes";
import { useReminders } from "@/lib/use-reminders";
import { AREAS } from "@/lib/types";
import type { AreaId } from "@/lib/types";

interface ParsedData {
  type: "task" | "event" | "note" | "reminder";
  confidence: number;
  fields: any;
}

export default function CapturePage() {
  const { createTask } = useTasks();
  const { createEvent } = useEvents();
  const { createNote } = useNotes();
  const { createReminder } = useReminders();

  const [input, setInput] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parseText = async (text: string) => {
    if (!text.trim() || text.length < 3) {
      setParsedData(null);
      return;
    }

    setIsParsing(true);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.type) {
        setParsedData(data);
      }
    } catch (err) {
      console.error("Parse error:", err);
    } finally {
      setIsParsing(false);
    }
  };

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (!input.trim()) {
      setParsedData(null);
      setIsParsing(false);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      parseText(input);
    }, 1000);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [input]);

  const handleSave = async () => {
    if (!parsedData || isSaving) return;
    setIsSaving(true);

    try {
      const { type, fields } = parsedData;
      let title = fields.title || fields.content || input;

      switch (type) {
        case "task":
          await createTask({
            title,
            priority: fields.priority || "medium",
            status: "todo",
            area: fields.area,
            energy: fields.energy,
            estimatedMinutes: fields.estimatedMinutes,
            dueDate: fields.dueDate ? new Date(fields.dueDate) : undefined,
          });
          break;
        case "event":
          await createEvent({
            title,
            start: fields.start ? new Date(fields.start) : new Date(),
            end: fields.end ? new Date(fields.end) : new Date(Date.now() + 3600000),
            source: "manual",
          });
          break;
        case "note":
          await createNote({
            content: fields.content || input,
            area: fields.area,
            tags: fields.tags || [],
            processed: false,
          });
          break;
        case "reminder":
          await createReminder({
            title,
            frequency: fields.frequency || "once",
            dueDate: fields.dueDate ? new Date(fields.dueDate) : new Date(),
            time: fields.time,
            area: fields.area,
          });
          break;
      }

      setLastSaved(title);
      setInput("");
      setParsedData(null);
      setTimeout(() => setLastSaved(null), 3000);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = (key: string, value: any) => {
    if (!parsedData) return;
    setParsedData({
      ...parsedData,
      fields: { ...parsedData.fields, [key]: value },
    });
  };

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-primary">Quick Capture</h1>
        {lastSaved && (
          <div className="flex items-center gap-2 text-sage-500 animate-in fade-in slide-in-from-top-2">
            <Check size={16} />
            <span className="text-sm font-medium">Saved: {lastSaved.substring(0, 20)}...</span>
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        className="rounded-2xl p-6 mb-8 transition-all duration-300"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
          boxShadow: isParsing ? "0 0 20px var(--accent-bg)" : "none",
        }}
      >
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What's on your mind? (e.g., 'Gym at 5pm tomorrow', 'Note: check the new Garmin API', 'Buy milk every Monday')"
            className="w-full bg-transparent text-lg resize-none outline-none min-h-[120px] text-primary"
            autoFocus
          />
          <div className="absolute bottom-0 right-0 flex items-center gap-2">
            {isParsing && <Loader2 size={18} className="animate-spin text-accent" />}
            <span className="text-xs text-tertiary">{input.length} chars</span>
          </div>
        </div>
      </div>

      {/* Preview Card */}
      {parsedData && (
        <div
          className="rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-primary flex items-center justify-between bg-tertiary">
            <div className="flex items-center gap-2">
              <TypeIcon type={parsedData.type} />
              <span className="text-sm font-bold uppercase tracking-wider text-secondary">
                {parsedData.type} Preview
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-bg-primary border border-primary">
                <div 
                  className="w-1.5 h-1.5 rounded-full" 
                  style={{ background: parsedData.confidence > 0.8 ? "#22C55E" : parsedData.confidence > 0.5 ? "#F59E0B" : "#EF4444" }} 
                />
                <span className="text-[10px] font-bold text-tertiary">
                  {Math.round(parsedData.confidence * 100)}% Match
                </span>
              </div>
              <button 
                onClick={() => setParsedData(null)}
                className="text-tertiary hover:text-primary transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Fields */}
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-tertiary">Title / Content</label>
              <input
                type="text"
                value={parsedData.fields.title || parsedData.fields.content || ""}
                onChange={(e) => updateField(parsedData.type === "note" ? "content" : "title", e.target.value)}
                className="w-full bg-bg-tertiary border-primary rounded-xl px-4 py-2 text-primary focus:ring-1 focus:ring-accent outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Common field: Area */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-tertiary">Area</label>
                <select
                  value={parsedData.fields.area || ""}
                  onChange={(e) => updateField("area", e.target.value || undefined)}
                  className="w-full bg-bg-tertiary border-primary rounded-xl px-3 py-2 text-sm text-primary outline-none"
                >
                  <option value="">None</option>
                  {Object.entries(AREAS).map(([id, area]) => (
                    <option key={id} value={id}>{area.name}</option>
                  ))}
                </select>
              </div>

              {/* Type-specific fields */}
              {parsedData.type === "task" && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-tertiary">Priority</label>
                  <select
                    value={parsedData.fields.priority || "medium"}
                    onChange={(e) => updateField("priority", e.target.value)}
                    className="w-full bg-bg-tertiary border-primary rounded-xl px-3 py-2 text-sm text-primary outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              )}

              {parsedData.type === "event" && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-tertiary">Start Time</label>
                  <input
                    type="datetime-local"
                    value={parsedData.fields.start ? new Date(parsedData.fields.start).toISOString().slice(0, 16) : ""}
                    onChange={(e) => updateField("start", e.target.value)}
                    className="w-full bg-bg-tertiary border-primary rounded-xl px-3 py-2 text-sm text-primary outline-none"
                  />
                </div>
              )}

              {parsedData.type === "reminder" && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-tertiary">Frequency</label>
                  <select
                    value={parsedData.fields.frequency || "once"}
                    onChange={(e) => updateField("frequency", e.target.value)}
                    className="w-full bg-bg-tertiary border-primary rounded-xl px-3 py-2 text-sm text-primary outline-none"
                  >
                    <option value="once">Once</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-tertiary border-t border-primary flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 bg-sage-500 hover:bg-sage-600 disabled:opacity-50 text-white rounded-xl px-6 py-2 font-medium transition-colors shadow-sm"
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Confirm & Save
            </button>
          </div>
        </div>
      )}

      {/* Help info when idle */}
      {!parsedData && !isParsing && (
        <div className="space-y-6 mt-8 opacity-60">
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-widest text-tertiary">Examples</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ExampleCard text="Meet with Sarah for coffee tomorrow at 10am" />
              <ExampleCard text="Note: the login API needs a 5s timeout" />
              <ExampleCard text="Fix the leaky faucet in the bathroom" />
              <ExampleCard text="Pay internet bill every 15th" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TypeIcon({ type }: { type: ParsedData["type"] }) {
  switch (type) {
    case "task": return <ListTodo size={18} className="text-indigo-500" />;
    case "event": return <Calendar size={18} className="text-amber-500" />;
    case "note": return <MessageSquare size={18} className="text-emerald-500" />;
    case "reminder": return <Bell size={18} className="text-rose-500" />;
  }
}

function ExampleCard({ text }: { text: string }) {
  return (
    <div className="bg-secondary border-primary rounded-xl px-4 py-2 text-xs text-secondary italic">
      &quot;{text}&quot;
    </div>
  );
}
