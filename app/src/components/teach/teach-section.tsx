"use client";

// "Teach me" — the curated learning queue + session launcher on /knowledge.
// Topics arrive via Samy (here or the chat Assistant's add_learning_topic
// tool). Starting a topic opens the voice session at /knowledge/teach/<sessionId>.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarClock, GraduationCap, Loader2, Play, Plus } from "lucide-react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { LEARNING_AREAS, topicInArea, topicLabel } from "@/lib/learning-areas";
import { useIsMobile } from "@/hooks/use-is-mobile";

// Mirrors `TURN_BUDGET_OPTIONS` in `src/lib/teach.ts` (server-only module —
// it pulls in fs/server-db, so a client component can't import it directly).
// A fixed exchange count, stated up front, never a time estimate (ticket 02).
const TURN_BUDGET_OPTIONS = [4, 8, 12] as const;

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

function tomorrowIsoDate(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

interface SessionRow {
  id: string;
  topic: string;
  status: string;
}

interface TeachResponse {
  topics: Topic[];
  sessions: SessionRow[];
}

async function fetchTeachData(): Promise<TeachResponse | null> {
  const res = await fetch("/api/teach");
  if (!res.ok) return null;
  return (await res.json()) as TeachResponse;
}

export function TeachSection() {
  const router = useRouter();
  const { toast } = useToast();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [areaId, setAreaId] = useState<string>(LEARNING_AREAS[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [newMission, setNewMission] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [draftMissions, setDraftMissions] = useState<Record<string, string>>({});
  // T37: on mobile the capture form opens in a Vaul bottom drawer (iOS curve +
  // velocity dismissal defaults); desktop keeps the inline form pixel-identical.
  const isMobile = useIsMobile();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await fetchTeachData();
      if (!data) throw new Error("Unable to load learning topics");
      setTopics(data.topics);
      setSessions(data.sessions);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
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

  // Ticket 02: starting is an honest decision because the length is visible
  // before he commits — the Play tap reveals a fixed exchange count, never a
  // minute estimate for an open conversation.
  const start = async (t: Topic, turnBudget: number) => {
    setPickingId(null);
    setBusyId(t.id);
    try {
      const { sessionId } = await post({
        action: "start",
        topicId: t.id,
        turnBudget,
      });
      router.push(`/knowledge/teach/${sessionId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "couldn't start the session", "error");
      setBusyId(null);
    }
  };

  const completeDraft = async (t: Topic) => {
    const mission = (draftMissions[t.id] || "").trim();
    if (!mission) {
      toast("A topic needs a mission — why do you want this?", "error");
      return;
    }
    try {
      await post({ action: "completeDraft", topicId: t.id, mission });
      setDraftMissions((prev) => {
        const next = { ...prev };
        delete next[t.id];
        return next;
      });
      toast("Added to the learning queue", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "couldn't add the why", "error");
    }
  };

  const schedule = async (t: Topic) => {
    const tomorrow = tomorrowIsoDate();
    try {
      await post({ action: "schedule", topicId: t.id, date: tomorrow });
      toast(`Scheduled for ${tomorrow} — it'll be in your morning push`, "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "couldn't schedule", "error");
    }
  };

  const area = LEARNING_AREAS.find((item) => item.id === areaId)!;
  const areaTopics = topics.filter((t) => topicInArea(t.topic, areaId) && (showCompleted ? t.status === "done" : t.status !== "done"));
  const selected = areaTopics.find((t) => t.id === selectedId) ?? areaTopics[0];
  const record = selected ? lastRecord(selected.learningRecords) : null;
  const liveSession = sessions.find((s) => s.status === "live");

  return (
    <section className="space-y-5" aria-label="Learning roadmaps">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <GraduationCap size={16} className="text-primary" />
          What would you like to explore?
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAdding((v) => !v)}
          aria-label="Add learning topic"
          className="text-muted-foreground"
        >
          <Plus size={16} /> Add a learning goal
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

      {adding && !isMobile && (
        <div className="mb-3 space-y-2">
          <Input
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="What do you want to learn?"
            aria-label="Topic"
            className="text-sm bg-muted"
          />
          <Input
            value={newMission}
            onChange={(e) => setNewMission(e.target.value)}
            placeholder="Why? (grounds every lesson)"
            aria-label="Mission"
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

      {/* Mobile: same capture form in a Vaul bottom drawer — vaul's defaults
          give the iOS curve + velocity dismissal; motion inside is
          transform/opacity only. */}
      <Drawer open={isMobile && adding} onOpenChange={setAdding}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Add a learning topic</DrawerTitle>
            <DrawerDescription>What do you want to learn?</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-2 px-4 pb-6">
            <Input
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder="What do you want to learn?"
              aria-label="Topic"
              className="text-sm bg-muted"
            />
            <Input
              value={newMission}
              onChange={(e) => setNewMission(e.target.value)}
              placeholder="Why? (grounds every lesson)"
              aria-label="Mission"
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
              className="w-full text-xs active:scale-[0.97] transition-transform duration-150"
            >
              Add to queue
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {loading ? (
        <div className="space-y-2" aria-label="Loading learning topics">
          <div className="shimmer h-12 rounded-lg bg-muted" />
          <div className="shimmer h-12 rounded-lg bg-muted" />
        </div>
      ) : loadError ? (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
          <span>Couldn&apos;t load learning topics.</span>
          <Button onClick={() => void load()} size="sm" variant="secondary" className="shrink-0">Retry</Button>
        </div>
      ) : (
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="lg:hidden">
          <label htmlFor="learning-area" className="mb-2 block text-sm font-medium">Your area of interest</label>
          <select id="learning-area" value={areaId} onChange={(e) => { setAreaId(e.target.value); setSelectedId(null); setPickingId(null); }} className="min-h-12 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-primary">
            {LEARNING_AREAS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <nav aria-label="Your areas of interest" className="hidden space-y-1 lg:block">
          <p className="mb-3 text-sm font-medium text-muted-foreground">Your areas of interest</p>
          {LEARNING_AREAS.map((item) => (
            <button key={item.id} onClick={() => { setAreaId(item.id); setSelectedId(null); setPickingId(null); }}
              aria-pressed={areaId === item.id}
              className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-left text-sm font-medium transition-transform duration-150 [transition-timing-function:var(--ease-out-custom)] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-primary ${areaId === item.id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}>
              {item.label}{areaId === item.id && <ArrowRight size={16} className="shrink-0" />}
            </button>
          ))}
        </nav>
        <div className="min-w-0 space-y-5">
          <div>
            <h3 className="text-xl font-semibold">{area.label}</h3>
            <p className="mt-1 text-base leading-relaxed text-muted-foreground">{area.description}</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{showCompleted ? "Goals you marked done" : "Choose a learning goal"}</p>
            <Button variant="ghost" size="sm" onClick={() => { setShowCompleted(!showCompleted); setSelectedId(null); }}>
              {showCompleted ? "Back to current goals" : "View completed goals"}
            </Button>
          </div>
          {areaTopics.length === 0 ? (
            <Card className="gap-3 p-6">
              <h4 className="text-lg font-medium">{showCompleted ? "No completed goals here yet" : "Where would you like to begin?"}</h4>
              <p className="text-base leading-relaxed text-muted-foreground">{showCompleted ? "Your current goals are still available." : "This interest has no learning goal yet. Choose something you want to understand and why it interests you to begin a roadmap."}</p>
              <Button variant="outline" className="self-start" onClick={() => { setShowCompleted(false); setAdding(true); }}><Plus size={16} /> Add a learning goal</Button>
            </Card>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-border" aria-label="Learning goals">
                {areaTopics.map((t) => (
                  <button key={t.id} onClick={() => { setSelectedId(t.id); setPickingId(null); }} aria-pressed={selected?.id === t.id}
                    className={`flex w-full items-center justify-between gap-4 border-b border-border px-4 py-4 text-left text-base leading-relaxed last:border-b-0 transition-transform duration-150 [transition-timing-function:var(--ease-out-custom)] active:scale-[0.97] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${selected?.id === t.id ? "bg-primary/10 text-foreground" : "bg-card text-foreground hover:bg-muted"}`}>
                    <span className="min-w-0 break-words">{topicLabel(t.topic)}</span>
                    <ArrowRight size={16} className="shrink-0 text-primary" />
                  </button>
                ))}
              </div>
              {selected && <Card key={selected.id} className="enter gap-6 p-5 sm:p-7">
                <div>
                  <p className="mb-2 text-sm font-medium text-primary">Your learning roadmap</p>
                  <h4 className="text-xl font-semibold leading-snug break-words">{selected.topic}</h4>
                </div>
                <div className="space-y-5 border-l-2 border-primary/25 pl-5">
                  <div><h5 className="text-sm font-semibold">What you want from this</h5>
                    <p className="mt-1 text-base leading-relaxed text-muted-foreground">{selected.mission || "Add your reason for learning this to shape your lessons."}</p></div>
                  <div><h5 className="text-sm font-semibold">Where you left off</h5>
                    <p className="mt-1 text-base leading-relaxed text-muted-foreground">{record?.text || "No learning notes recorded yet. Your first lesson can establish a starting point."}</p>
                    {record && <p className="mt-2 text-sm text-muted-foreground">Recorded {record.date}</p>}
                    {(selected.learningRecords?.length ?? 0) > 1 && <details className="mt-3"><summary className="cursor-pointer text-sm text-primary active:scale-[0.97]">Earlier learning notes</summary><ul className="mt-3 space-y-3 text-base leading-relaxed text-muted-foreground">{selected.learningRecords!.slice(0, -1).map((entry, i) => <li key={i}>{entry}</li>)}</ul></details>}
                  </div>
                  <div><h5 className="text-sm font-semibold">{selected.status === "done" ? "Marked done by you" : "Your next step"}</h5>
                    <p className="mt-1 text-base leading-relaxed text-muted-foreground">{selected.status === "done" ? "Your learning notes stay here for reference." : selected.status === "needs-mission" ? "Add why this matters to you, then start a lesson." : record ? "Continue this goal in a lesson that uses your earlier learning notes." : "Start a first lesson on this goal. Choose the conversation length below."}</p>
                    {selected.scheduledFor && <p className="mt-2 text-sm text-primary">Scheduled for {selected.scheduledFor}</p>}
                  </div>
                </div>
                {selected.status === "needs-mission" ? <div className="space-y-3">
                  <Input value={draftMissions[selected.id] || ""} onChange={(e) => setDraftMissions((prev) => ({ ...prev, [selected.id]: e.target.value }))} placeholder="Why do you want to learn this?" aria-label="Reason for learning this goal" />
                  <Button onClick={() => completeDraft(selected)} disabled={!(draftMissions[selected.id] || "").trim()}>Save reason</Button>
                </div> : selected.status !== "done" && <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <Button onClick={() => setPickingId(pickingId === selected.id ? null : selected.id)} disabled={busyId !== null} aria-expanded={pickingId === selected.id}>
                      {busyId === selected.id ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}{busyId === selected.id ? "Preparing lesson…" : record ? "Continue learning" : "Start learning"}
                    </Button>
                    <Button variant="outline" onClick={() => schedule(selected)}><CalendarClock size={16} /> Schedule for tomorrow</Button>
                  </div>
                  {pickingId === selected.id && <div className="enter rounded-lg bg-muted p-4">
                    <p className="mb-3 text-sm font-medium">How many exchanges would you like?</p>
                    <div className="flex flex-wrap gap-2">{TURN_BUDGET_OPTIONS.map((n) => <Button key={n} variant="outline" onClick={() => start(selected, n)}>{n} exchanges</Button>)}</div>
                  </div>}
                </div>}
              </Card>}
            </>
          )}
        </div>
      </div>
      )}
    </section>
  );
}
