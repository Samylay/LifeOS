"use client";

// "Teach me" — the curated learning queue + session launcher on /knowledge.
// Topics arrive via Samy (here or the chat Assistant's add_learning_topic
// tool). Starting a topic opens the voice session at /knowledge/teach/<sessionId>.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, GraduationCap, Loader2, Play, Plus } from "lucide-react";
import { useToast } from "@/components/toast";

interface Topic {
  id: string;
  topic: string;
  mission: string;
  status: string;
  scheduledFor?: string;
  learningRecords?: string[];
}

/** Mirrors `lastTaughtDate` in `src/lib/teach.ts` — the API returns raw docs,
 * not the normalized `TeachTopic`, so this reads the same `YYYY-MM-DD: `
 * prefix client-side rather than adding a round trip. */
function lastTaughtDate(records: string[] | undefined): string | null {
  const list = records || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = /^(\d{4}-\d{2}-\d{2}):/.exec(list[i]);
    if (m) return m[1];
  }
  return null;
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
    if (!newMission.trim()) {
      toast("A topic needs a mission — why do you want this?", "error");
      return;
    }
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
          {newTopic.trim() && !newMission.trim() && (
            <p className="text-xs" style={{ color: "var(--accent-danger, #d97757)" }}>
              A mission is required — say why this matters before adding it.
            </p>
          )}
          <button
            onClick={add}
            disabled={!newTopic.trim() || !newMission.trim()}
            className="rounded-lg px-3 py-1.5 text-xs font-medium transition-transform duration-100 active:scale-[0.97] disabled:opacity-50"
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
                  {t.mission || "no mission yet"}
                </p>
                <p className="truncate text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  {t.status === "scheduled" && t.scheduledFor ? `session ${t.scheduledFor} · ` : ""}
                  {(() => {
                    const d = lastTaughtDate(t.learningRecords);
                    return d ? `last taught ${d}` : "never taught";
                  })()}
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
            Nothing queued — add a topic to get started.
          </li>
        )}
      </ul>
    </section>
  );
}
