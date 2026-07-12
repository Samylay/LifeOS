"use client";

// "Teach me" — the curated learning queue + session launcher on /knowledge.
// Topics arrive two ways: Samy adds them (here or via the chat Assistant's
// add_learning_topic tool) or they're adopted from approved triage items
// (ai-tip / ai-project / swe). Starting a topic opens the voice session at
// /knowledge/teach/<sessionId>.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, GraduationCap, Loader2, Play, Plus, Sparkles } from "lucide-react";
import { useToast } from "@/components/toast";

interface Topic {
  id: string;
  topic: string;
  mission: string;
  status: string;
  scheduledFor?: string;
  learningRecords?: string[];
}
interface Suggestion {
  triageId: string;
  topic: string;
  why: string;
}
interface SessionRow {
  id: string;
  topic: string;
  status: string;
}

export function TeachSection() {
  const router = useRouter();
  const { toast } = useToast();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [newMission, setNewMission] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/teach");
    if (!res.ok) return;
    const data = await res.json();
    setTopics(data.topics);
    setSuggestions(data.suggestions);
    setSessions(data.sessions);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/teach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };

  const add = async () => {
    if (!newTopic.trim()) return;
    try {
      await post({ action: "addTopic", topic: newTopic, mission: newMission });
      setNewTopic("");
      setNewMission("");
      setAdding(false);
      toast("Added to the learning queue", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "couldn't add topic", "error");
    }
  };

  const adopt = async (s: Suggestion) => {
    setBusyId(s.triageId);
    try {
      await post({ action: "adoptSuggestion", triageId: s.triageId });
      toast("Adopted from your saved content", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "couldn't adopt", "error");
    } finally {
      setBusyId(null);
    }
  };

  const start = async (t: Topic) => {
    setBusyId(t.id);
    try {
      const { sessionId } = await post({ action: "start", topicId: t.id });
      router.push(`/knowledge/teach/${sessionId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "couldn't start the session", "error");
      setBusyId(null);
    }
  };

  const schedule = async (t: Topic) => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    try {
      await post({ action: "schedule", topicId: t.id, date: tomorrow });
      toast(`Scheduled for ${tomorrow} — it'll be in your morning push`, "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "couldn't schedule", "error");
    }
  };

  const liveSession = sessions.find((s) => s.status === "live");

  return (
    <section
      className="rounded-xl p-4"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2
          className="flex items-center gap-2 text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          <GraduationCap size={16} style={{ color: "var(--accent-primary)" }} />
          Teach me
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          aria-label="Add learning topic"
          className="rounded-lg p-1.5 transition-transform duration-100 active:scale-[0.97]"
          style={{ color: "var(--text-secondary)" }}
        >
          <Plus size={16} />
        </button>
      </div>

      {liveSession && (
        <button
          onClick={() => router.push(`/knowledge/teach/${liveSession.id}`)}
          className="mb-3 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-transform duration-100 active:scale-[0.98]"
          style={{ background: "var(--accent-primary)", color: "white" }}
        >
          <Play size={14} /> Resume: {liveSession.topic}
        </button>
      )}

      {adding && (
        <div className="mb-3 space-y-2">
          <input
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="What do you want to learn?"
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{
              color: "var(--text-primary)",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border-primary)",
            }}
          />
          <input
            value={newMission}
            onChange={(e) => setNewMission(e.target.value)}
            placeholder="Why? (grounds every lesson)"
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{
              color: "var(--text-primary)",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border-primary)",
            }}
          />
          <button
            onClick={add}
            className="rounded-lg px-3 py-1.5 text-xs font-medium transition-transform duration-100 active:scale-[0.97]"
            style={{ background: "var(--accent-primary)", color: "white" }}
          >
            Add to queue
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {topics
          .filter((t) => t.status !== "done")
          .map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" style={{ color: "var(--text-primary)" }}>
                  {t.topic}
                </p>
                <p className="truncate text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {t.status === "scheduled" && t.scheduledFor ? `session ${t.scheduledFor} · ` : ""}
                  {(t.learningRecords?.length ?? 0) > 0
                    ? `${t.learningRecords!.length} learning record${t.learningRecords!.length > 1 ? "s" : ""}`
                    : t.mission || "no mission yet"}
                </p>
              </div>
              <button
                onClick={() => schedule(t)}
                aria-label={`Schedule a session on ${t.topic}`}
                className="rounded-lg p-1.5 transition-transform duration-100 active:scale-[0.97]"
                style={{ color: "var(--text-secondary)" }}
              >
                <CalendarClock size={15} />
              </button>
              <button
                onClick={() => start(t)}
                disabled={busyId === t.id}
                aria-label={`Start a session on ${t.topic}`}
                className="rounded-lg p-1.5 transition-transform duration-100 active:scale-[0.97]"
                style={{ color: "var(--accent-primary)" }}
              >
                {busyId === t.id ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              </button>
            </li>
          ))}
        {topics.length === 0 && !adding && (
          <li className="py-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Nothing queued — add a topic, or adopt one of your saved finds below.
          </li>
        )}
      </ul>

      {suggestions.length > 0 && (
        <div className="mt-4">
          <h3
            className="mb-2 flex items-center gap-1.5 text-xs font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            <Sparkles size={13} /> From your saved content
          </h3>
          <ul className="space-y-1.5">
            {suggestions.slice(0, 5).map((s) => (
              <li key={s.triageId} className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                  {s.topic}
                </p>
                <button
                  onClick={() => adopt(s)}
                  disabled={busyId === s.triageId}
                  className="shrink-0 rounded-md px-2 py-1 text-xs transition-transform duration-100 active:scale-[0.97]"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                >
                  {busyId === s.triageId ? "…" : "Queue"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
