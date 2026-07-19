"use client";

import { useState, useEffect, useRef } from "react";
import {
  Sunrise,
  Check,
  Volume2,
  Play,
  Pause,
  RotateCcw,
  Settings2,
  Plus,
  Trash2,
} from "lucide-react";
import { usePrime } from "@/lib/use-prime";
import { useToast } from "@/components/toast";
import {
  PRIME_TIMER_FLOORS,
  type AffirmationType,
} from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TYPE_LABEL: Record<AffirmationType, string> = {
  anchor: "Anchor",
  rotating: "Rotating",
  contextual: "Contextual",
};

function StepHeader({ n, title, hint, done }: { n: number; title: string; hint?: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div
        className={`shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? <Check size={14} /> : n}
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">
          {title}
        </h2>
        {hint && (
          <p className="text-xs text-muted-foreground/70">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

// --- Step 2 soft timer: a floor to reach, not a countdown ---

function SoftTimer({ floorSec }: { floorSec: number }) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const startRef = useRef<number>(0);
  const baseRef = useRef<number>(0);

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now();
    const tick = () => setElapsed(baseRef.current + (Date.now() - startRef.current) / 1000);
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [running]);

  const toggle = () => {
    if (running) {
      baseRef.current = elapsed;
      setRunning(false);
    } else {
      setRunning(true);
    }
  };
  const reset = () => {
    setRunning(false);
    baseRef.current = 0;
    setElapsed(0);
  };

  const reached = elapsed >= floorSec;
  const pct = Math.min(100, (elapsed / floorSec) * 100);
  const mmss = `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`;

  return (
    <div className="rounded-lg p-4 bg-muted">
      <div className="flex items-end justify-between mb-2">
        <span className={`text-3xl font-mono font-semibold ${reached ? "text-primary" : "text-foreground"}`}>
          {mmss}
        </span>
        <span className={`text-xs ${reached ? "text-primary" : "text-muted-foreground/70"}`}>
          {reached ? "Floor reached ✓ — keep going if you like" : `${Math.ceil(floorSec - elapsed)}s to the ${floorSec}s floor`}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden mb-3 bg-card">
        <div className="h-full w-full rounded-full origin-left transition-transform bg-primary" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={toggle}
          size="sm"
          className="gap-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500"
        >
          {running ? <Pause size={15} /> : <Play size={15} />}
          {running ? "Pause" : elapsed > 0 ? "Resume" : "Start"}
        </Button>
        {elapsed > 0 && (
          <Button
            onClick={reset}
            variant="secondary"
            size="sm"
            className="gap-1.5 text-xs font-medium"
          >
            <RotateCcw size={14} /> Reset
          </Button>
        )}
      </div>
    </div>
  );
}

// --- Bank manager (compact): affirmations, prompts, principles, floor ---

function BankManager({ prime }: { prime: ReturnType<typeof usePrime> }) {
  const {
    timerFloorSec,
    updateTimerFloor,
    affirmationBank,
    promptBank,
    principleBank,
    addAffirmation,
    updateAffirmation,
    deleteAffirmation,
    addPrompt,
    deletePrompt,
    addPrinciple,
    deletePrinciple,
  } = prime;

  const [newAff, setNewAff] = useState("");
  const [newAffType, setNewAffType] = useState<AffirmationType>("rotating");
  const [newPrompt, setNewPrompt] = useState("");
  const [newPrinciple, setNewPrinciple] = useState("");

  const cycleType = (t: AffirmationType): AffirmationType =>
    t === "anchor" ? "rotating" : t === "rotating" ? "contextual" : "anchor";

  return (
    <Card className="p-5 gap-6">
      {/* Timer floor */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-2 text-muted-foreground">
          Soft-timer floor
        </p>
        <div className="flex items-center gap-2">
          {PRIME_TIMER_FLOORS.map((f) => (
            <button
              key={f}
              onClick={() => updateTimerFloor(f)}
              className={`text-sm font-medium rounded-lg px-3 py-1.5 transition-colors ${
                timerFloorSec === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {f < 120 ? `${f}s` : `${f / 60}min`}
            </button>
          ))}
          <span className="text-xs text-muted-foreground/70">
            Raise it as fluency builds.
          </span>
        </div>
      </div>

      {/* Affirmations */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-2 text-muted-foreground">
          Affirmation bank
        </p>
        <div className="space-y-1.5 mb-2">
          {affirmationBank.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              <button
                onClick={() => updateAffirmation(a.id, { active: !a.active })}
                title={a.active ? "Active — click to disable" : "Disabled — click to enable"}
                className={`shrink-0 h-4 w-4 rounded border flex items-center justify-center border-border ${a.active ? "bg-primary" : "bg-transparent"}`}
              >
                {a.active && <Check size={11} className="text-primary-foreground" />}
              </button>
              <button
                onClick={() => updateAffirmation(a.id, { type: cycleType(a.type) })}
                title="Click to change type"
                className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground/70"
                style={{ width: 78 }}
              >
                {TYPE_LABEL[a.type]}
              </button>
              <span className={`flex-1 ${a.active ? "text-muted-foreground" : "text-muted-foreground/70"}`}>
                {a.text}
              </span>
              <button onClick={() => deleteAffirmation(a.id)} className="shrink-0 p-1 text-muted-foreground/70">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setNewAffType(cycleType(newAffType))}
            className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-1 rounded bg-muted text-muted-foreground/70"
            style={{ width: 78 }}
          >
            {TYPE_LABEL[newAffType]}
          </button>
          <Input
            value={newAff}
            onChange={(e) => setNewAff(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newAff.trim()) {
                addAffirmation(newAff, newAffType);
                setNewAff("");
              }
            }}
            placeholder="Add an affirmation…"
            className="flex-1 h-auto text-sm rounded-lg px-3 py-1.5"
          />
          <Button
            onClick={() => { if (newAff.trim()) { addAffirmation(newAff, newAffType); setNewAff(""); } }}
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-primary"
          >
            <Plus size={16} />
          </Button>
        </div>
      </div>

      {/* Prompts */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-2 text-muted-foreground">
          Prompt bank
        </p>
        <div className="space-y-1.5 mb-2">
          {promptBank.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground/70">
                {p.category}
              </span>
              <span className="flex-1 text-muted-foreground">{p.text}</span>
              <button onClick={() => deletePrompt(p.id)} className="shrink-0 p-1 text-muted-foreground/70">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newPrompt.trim()) {
                addPrompt(newPrompt, "concrete");
                setNewPrompt("");
              }
            }}
            placeholder="Add a concrete prompt…"
            className="flex-1 h-auto text-sm rounded-lg px-3 py-1.5"
          />
          <Button
            onClick={() => { if (newPrompt.trim()) { addPrompt(newPrompt, "concrete"); setNewPrompt(""); } }}
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-primary"
          >
            <Plus size={16} />
          </Button>
        </div>
      </div>

      {/* Principles */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-2 text-muted-foreground">
          Principle slot
        </p>
        <div className="space-y-1.5 mb-2">
          {principleBank.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-muted-foreground">{p.text}</span>
              <button onClick={() => deletePrinciple(p.id)} className="shrink-0 p-1 text-muted-foreground/70">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={newPrinciple}
            onChange={(e) => setNewPrinciple(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newPrinciple.trim()) {
                addPrinciple(newPrinciple);
                setNewPrinciple("");
              }
            }}
            placeholder="Add a standing principle…"
            className="flex-1 h-auto text-sm rounded-lg px-3 py-1.5"
          />
          <Button
            onClick={() => { if (newPrinciple.trim()) { addPrinciple(newPrinciple); setNewPrinciple(""); } }}
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-primary"
          >
            <Plus size={16} />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function PrimePage() {
  const prime = usePrime();
  const {
    loading,
    today,
    done,
    timerFloorSec,
    acknowledgeAffirmation,
    acknowledgePrompt,
    resetToday,
  } = prime;
  const { toast } = useToast();
  const [showManager, setShowManager] = useState(false);

  const step1Done = Boolean(today && today.affirmations.every((a) => a.acknowledged));
  const step2Done = Boolean(today?.promptAcknowledged);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2 text-foreground">
            <Sunrise size={22} className="text-primary" /> Daily Prime
          </h1>
          <p className="text-xs mt-1 text-muted-foreground/70">
            {done ? "Done for today — nice work." : "Morning ritual: affirm, then speak. Read everything out loud."}
          </p>
        </div>
        <Button
          onClick={() => setShowManager((v) => !v)}
          variant="outline"
          size="sm"
          className="gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <Settings2 size={15} /> {showManager ? "Hide banks" : "Edit banks"}
        </Button>
      </div>

      {showManager && <BankManager prime={prime} />}

      {loading && !today && (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground/70">Preparing today&rsquo;s prime…</p>
        </Card>
      )}

      {today && (
        <>
          {/* Principle of the day */}
          {today.principleOfDay && (
            <div className="rounded-xl px-5 py-4 bg-accent border border-primary">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1 text-primary">
                Principle of the day
              </p>
              <p className="text-base font-medium text-foreground">
                {today.principleOfDay}
              </p>
            </div>
          )}

          {/* Step 1 — Affirmations */}
          <Card className="p-5">
            <StepHeader n={1} title="Affirmations" hint="Read each aloud, then tap to acknowledge." done={step1Done} />
            <div className="space-y-2">
              {today.affirmations.map((a) => (
                <button
                  key={a.id}
                  onClick={() => !a.acknowledged && acknowledgeAffirmation(a.id)}
                  disabled={a.acknowledged}
                  className={`w-full text-left rounded-lg px-4 py-3 flex items-start gap-3 transition-colors border ${
                    a.acknowledged ? "bg-accent border-primary" : "bg-muted border-border"
                  }`}
                >
                  <span
                    className={`shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-border ${
                      a.acknowledged ? "bg-primary" : "bg-card"
                    }`}
                  >
                    {a.acknowledged ? <Check size={12} className="text-primary-foreground" /> : <Volume2 size={11} className="text-muted-foreground/70" />}
                  </span>
                  <span className={`flex-1 text-sm ${a.acknowledged ? "text-muted-foreground/70" : "text-foreground"}`}>
                    {a.text}
                  </span>
                  {a.type !== "anchor" && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-card text-muted-foreground/70">
                      {TYPE_LABEL[a.type]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </Card>

          {/* Step 2 — Spoken journaling prompt */}
          <Card className="p-5">
            <StepHeader n={2} title="Spoken prompt" hint="Answer out loud, unscripted. Reach the floor." done={step2Done} />
            <p className="text-lg font-medium mb-4 text-foreground">
              {today.prompt.text}
            </p>
            <SoftTimer floorSec={timerFloorSec} />
            <Button
              onClick={() => { acknowledgePrompt(); toast("Spoken prompt done"); }}
              disabled={step2Done}
              size="sm"
              className="mt-3 gap-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 disabled:opacity-50"
            >
              <Check size={15} /> {step2Done ? "Answered" : "I answered it"}
            </Button>
          </Card>

          {/* Completion / reset */}
          <div className="flex items-center justify-between gap-4">
            <p className={`text-sm ${done ? "text-primary" : "text-muted-foreground/70"}`}>
              {done ? "✓ Prime complete for today." : "Acknowledge every affirmation and the prompt to finish."}
            </p>
            <Button
              onClick={() => { resetToday(); toast("Reset today's prime"); }}
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <RotateCcw size={13} /> Reset
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
