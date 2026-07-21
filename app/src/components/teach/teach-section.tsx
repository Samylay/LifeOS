"use client";

// "Teach me" — the curated learning queue + session launcher on /knowledge.
// Topics arrive via Samy (here or the chat Assistant's add_learning_topic
// tool). Starting a topic opens the voice session at /knowledge/teach/<sessionId>.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, GraduationCap, Loader2, Play, Plus } from "lucide-react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

interface Topic {
  id: string;
  topic: string;
  mission: string;
  status: string;
  scheduledFor?: string;
  learningRecords?: string[];
}

/** Mirrors `lastTaughtDate`/`latestProgress` in `src/lib/teach.ts` — the API
 * returns raw docs, not the normalized `TeachTopic`, so this reads the same
 * `YYYY-MM-DD: <prose>` shape client-side rather than adding a round trip.
 * Narrative only (map 08) — never a count, a percentage, or a streak. */
function lastRecord(records: string[] | undefined): { date: string; text: string } | null {
  const list = records || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = /^(\d{4}-\d{2}-\d{2}):\s*(.*)$/.exec(list[i]);
    if (m) return { date: m[1], text: m[2] };
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
    // His available time is the only bound on session material (T59) — ask
    // before starting rather than defaulting silently.
    const raw = window.prompt("How many minutes do you have?", "20");
    if (raw === null) return;
    const minutesAvailable = Number(raw);
    setBusyId(t.id);
    try {
      const { sessionId } = await post({
        action: "start",
        topicId: t.id,
        minutesAvailable: Number.isFinite(minutesAvailable) && minutesAvailable > 0 ? minutesAvailable : undefined,
      });
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
    <Card className="gap-0 rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <GraduationCap size={16} className="text-primary" />
          Teach me
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setAdding((v) => !v)}
          aria-label="Add learning topic"
          className="text-muted-foreground"
        >
          <Plus size={16} />
        </Button>
      </div>

      {liveSession && (
        <button
          onClick={() => router.push(`/knowledge/teach/${liveSession.id}`)}
          className="mb-3 flex w-full items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-left text-sm font-medium text-primary-foreground transition-transform duration-100 active:scale-[0.98]"
        >
          <Play size={14} /> Resume: {liveSession.topic}
        </button>
      )}

      {adding && (
        <div className="mb-3 space-y-2">
          <Input
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="What do you want to learn?"
            className="text-sm bg-muted"
          />
          <Input
            value={newMission}
            onChange={(e) => setNewMission(e.target.value)}
            placeholder="Why? (grounds every lesson)"
            className="text-sm bg-muted"
          />
          {newTopic.trim() && !newMission.trim() && (
            <p className="text-xs text-destructive">
              A mission is required — say why this matters before adding it.
            </p>
          )}
          <Button
            size="sm"
            onClick={add}
            disabled={!newTopic.trim() || !newMission.trim()}
            className="text-xs"
          >
            Add to queue
          </Button>
        </div>
      )}

      <ul className="space-y-2">
        {topics
          .filter((t) => t.status !== "done")
          .map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{t.topic}</p>
                <p className="truncate text-xs text-muted-foreground/70">
                  {t.mission || "no mission yet"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground/70">
                  {t.status === "scheduled" && t.scheduledFor ? `session ${t.scheduledFor} · ` : ""}
                  {(() => {
                    const r = lastRecord(t.learningRecords);
                    return r ? `${r.date}: ${r.text}` : "never taught";
                  })()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => schedule(t)}
                aria-label={`Schedule a session on ${t.topic}`}
                className="text-muted-foreground"
              >
                <CalendarClock size={15} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => start(t)}
                disabled={busyId === t.id}
                aria-label={`Start a session on ${t.topic}`}
                className="text-primary"
              >
                {busyId === t.id ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              </Button>
            </li>
          ))}
        {topics.length === 0 && !adding && (
          <li className="py-1 text-xs text-muted-foreground/70">
            Nothing queued — add a topic to get started.
          </li>
        )}
      </ul>
    </Card>
  );
}
