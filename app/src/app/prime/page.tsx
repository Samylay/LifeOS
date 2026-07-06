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

const TYPE_LABEL: Record<AffirmationType, string> = {
  anchor: "Anchor",
  rotating: "Rotating",
  contextual: "Contextual",
};

function StepHeader({ n, title, hint, done }: { n: number; title: string; hint?: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div
        className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
        style={{
          background: done ? "var(--accent)" : "var(--bg-tertiary)",
          color: done ? "#fff" : "var(--text-secondary)",
        }}
      >
        {done ? <Check size={14} /> : n}
      </div>
      <div>
        <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h2>
        {hint && (
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
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
    <div className="rounded-lg p-4" style={{ background: "var(--bg-tertiary)" }}>
      <div className="flex items-end justify-between mb-2">
        <span className="text-3xl font-mono font-semibold" style={{ color: reached ? "var(--accent)" : "var(--text-primary)" }}>
          {mmss}
        </span>
        <span className="text-xs" style={{ color: reached ? "var(--accent)" : "var(--text-tertiary)" }}>
          {reached ? "Floor reached ✓ — keep going if you like" : `${Math.ceil(floorSec - elapsed)}s to the ${floorSec}s floor`}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden mb-3" style={{ background: "var(--bg-secondary)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--accent)" }} />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors"
        >
          {running ? <Pause size={15} /> : <Play size={15} />}
          {running ? "Pause" : elapsed > 0 ? "Resume" : "Start"}
        </button>
        {elapsed > 0 && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium"
            style={{ color: "var(--text-secondary)", background: "var(--bg-secondary)" }}
          >
            <RotateCcw size={14} /> Reset
          </button>
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

  const inputStyle = {
    color: "var(--text-primary)",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border-primary)",
  };

  const cycleType = (t: AffirmationType): AffirmationType =>
    t === "anchor" ? "rotating" : t === "rotating" ? "contextual" : "anchor";

  return (
    <div className="rounded-xl p-5 space-y-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
      {/* Timer floor */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>
          Soft-timer floor
        </p>
        <div className="flex items-center gap-2">
          {PRIME_TIMER_FLOORS.map((f) => (
            <button
              key={f}
              onClick={() => updateTimerFloor(f)}
              className="text-sm font-medium rounded-lg px-3 py-1.5 transition-colors"
              style={{
                color: timerFloorSec === f ? "#fff" : "var(--text-secondary)",
                background: timerFloorSec === f ? "var(--accent)" : "var(--bg-tertiary)",
              }}
            >
              {f < 120 ? `${f}s` : `${f / 60}min`}
            </button>
          ))}
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Raise it as fluency builds.
          </span>
        </div>
      </div>

      {/* Affirmations */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>
          Affirmation bank
        </p>
        <div className="space-y-1.5 mb-2">
          {affirmationBank.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              <button
                onClick={() => updateAffirmation(a.id, { active: !a.active })}
                title={a.active ? "Active — click to disable" : "Disabled — click to enable"}
                className="shrink-0 h-4 w-4 rounded border flex items-center justify-center"
                style={{ borderColor: "var(--border-primary)", background: a.active ? "var(--accent)" : "transparent" }}
              >
                {a.active && <Check size={11} color="#fff" />}
              </button>
              <button
                onClick={() => updateAffirmation(a.id, { type: cycleType(a.type) })}
                title="Click to change type"
                className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)", width: 78 }}
              >
                {TYPE_LABEL[a.type]}
              </button>
              <span className="flex-1" style={{ color: a.active ? "var(--text-secondary)" : "var(--text-tertiary)" }}>
                {a.text}
              </span>
              <button onClick={() => deleteAffirmation(a.id)} className="shrink-0 p-1" style={{ color: "var(--text-tertiary)" }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setNewAffType(cycleType(newAffType))}
            className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-1 rounded"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)", width: 78 }}
          >
            {TYPE_LABEL[newAffType]}
          </button>
          <input
            value={newAff}
            onChange={(e) => setNewAff(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newAff.trim()) {
                addAffirmation(newAff, newAffType);
                setNewAff("");
              }
            }}
            placeholder="Add an affirmation…"
            className="flex-1 text-sm outline-none rounded-lg px-3 py-1.5"
            style={inputStyle}
          />
          <button
            onClick={() => { if (newAff.trim()) { addAffirmation(newAff, newAffType); setNewAff(""); } }}
            className="shrink-0 p-1.5 rounded-lg" style={{ color: "var(--accent)" }}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Prompts */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>
          Prompt bank
        </p>
        <div className="space-y-1.5 mb-2">
          {promptBank.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}>
                {p.category}
              </span>
              <span className="flex-1" style={{ color: "var(--text-secondary)" }}>{p.text}</span>
              <button onClick={() => deletePrompt(p.id)} className="shrink-0 p-1" style={{ color: "var(--text-tertiary)" }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newPrompt.trim()) {
                addPrompt(newPrompt, "concrete");
                setNewPrompt("");
              }
            }}
            placeholder="Add a concrete prompt…"
            className="flex-1 text-sm outline-none rounded-lg px-3 py-1.5"
            style={inputStyle}
          />
          <button
            onClick={() => { if (newPrompt.trim()) { addPrompt(newPrompt, "concrete"); setNewPrompt(""); } }}
            className="shrink-0 p-1.5 rounded-lg" style={{ color: "var(--accent)" }}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Principles */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>
          Principle slot
        </p>
        <div className="space-y-1.5 mb-2">
          {principleBank.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1" style={{ color: "var(--text-secondary)" }}>{p.text}</span>
              <button onClick={() => deletePrinciple(p.id)} className="shrink-0 p-1" style={{ color: "var(--text-tertiary)" }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newPrinciple}
            onChange={(e) => setNewPrinciple(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newPrinciple.trim()) {
                addPrinciple(newPrinciple);
                setNewPrinciple("");
              }
            }}
            placeholder="Add a standing principle…"
            className="flex-1 text-sm outline-none rounded-lg px-3 py-1.5"
            style={inputStyle}
          />
          <button
            onClick={() => { if (newPrinciple.trim()) { addPrinciple(newPrinciple); setNewPrinciple(""); } }}
            className="shrink-0 p-1.5 rounded-lg" style={{ color: "var(--accent)" }}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
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
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Sunrise size={22} style={{ color: "var(--accent)" }} /> Daily Prime
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            {done ? "Done for today — nice work." : "Morning ritual: affirm, then speak. Read everything out loud."}
          </p>
        </div>
        <button
          onClick={() => setShowManager((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"
          style={{ color: "var(--text-secondary)", background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <Settings2 size={15} /> {showManager ? "Hide banks" : "Edit banks"}
        </button>
      </div>

      {showManager && <BankManager prime={prime} />}

      {loading && !today && (
        <div className="rounded-xl p-8 text-center" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Preparing today&rsquo;s prime…</p>
        </div>
      )}

      {today && (
        <>
          {/* Principle of the day */}
          {today.principleOfDay && (
            <div className="rounded-xl px-5 py-4" style={{ background: "var(--accent-bg)", border: "1px solid var(--accent)" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--accent)" }}>
                Principle of the day
              </p>
              <p className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
                {today.principleOfDay}
              </p>
            </div>
          )}

          {/* Step 1 — Affirmations */}
          <section className="rounded-xl p-5" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
            <StepHeader n={1} title="Affirmations" hint="Read each aloud, then tap to acknowledge." done={step1Done} />
            <div className="space-y-2">
              {today.affirmations.map((a) => (
                <button
                  key={a.id}
                  onClick={() => !a.acknowledged && acknowledgeAffirmation(a.id)}
                  disabled={a.acknowledged}
                  className="w-full text-left rounded-lg px-4 py-3 flex items-start gap-3 transition-colors"
                  style={{
                    background: a.acknowledged ? "var(--accent-bg)" : "var(--bg-tertiary)",
                    border: `1px solid ${a.acknowledged ? "var(--accent)" : "var(--border-primary)"}`,
                  }}
                >
                  <span
                    className="shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full"
                    style={{ background: a.acknowledged ? "var(--accent)" : "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
                  >
                    {a.acknowledged ? <Check size={12} color="#fff" /> : <Volume2 size={11} style={{ color: "var(--text-tertiary)" }} />}
                  </span>
                  <span className="flex-1 text-sm" style={{ color: a.acknowledged ? "var(--text-tertiary)" : "var(--text-primary)" }}>
                    {a.text}
                  </span>
                  {a.type !== "anchor" && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}>
                      {TYPE_LABEL[a.type]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Step 2 — Spoken journaling prompt */}
          <section className="rounded-xl p-5" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
            <StepHeader n={2} title="Spoken prompt" hint="Answer out loud, unscripted. Reach the floor." done={step2Done} />
            <p className="text-lg font-medium mb-4" style={{ color: "var(--text-primary)" }}>
              {today.prompt.text}
            </p>
            <SoftTimer floorSec={timerFloorSec} />
            <button
              onClick={() => { acknowledgePrompt(); toast("Spoken prompt done"); }}
              disabled={step2Done}
              className="mt-3 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors disabled:opacity-50"
            >
              <Check size={15} /> {step2Done ? "Answered" : "I answered it"}
            </button>
          </section>

          {/* Completion / reset */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm" style={{ color: done ? "var(--accent)" : "var(--text-tertiary)" }}>
              {done ? "✓ Prime complete for today." : "Acknowledge every affirmation and the prompt to finish."}
            </p>
            <button
              onClick={() => { resetToday(); toast("Reset today's prime"); }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{ color: "var(--text-secondary)", background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
            >
              <RotateCcw size={13} /> Reset
            </button>
          </div>
        </>
      )}
    </div>
  );
}
