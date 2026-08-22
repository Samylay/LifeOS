"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Sunrise,
  Check,
  Volume2,
  Play,
  Pause,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { usePrime } from "@/lib/use-prime";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Celebration } from "@/components/celebration";
import { type AffirmationType } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
//
// Progress is persisted into the day doc every ~10s while running (and on
// pause/reset), so a phone screen sleeping mid-ritual doesn't zero the clock.

const PERSIST_EVERY_MS = 10_000;

function SoftTimer({
  floorSec,
  initialSec,
  onPersist,
}: {
  floorSec: number;
  initialSec: number;
  onPersist: (sec: number) => void;
}) {
  const [elapsed, setElapsed] = useState(initialSec);
  const [running, setRunning] = useState(false);
  const startRef = useRef<number>(0);
  const baseRef = useRef<number>(initialSec);
  const lastPersistRef = useRef<number>(0);
  // Keep the latest persist callback without restarting the interval.
  const persistRef = useRef(onPersist);
  persistRef.current = onPersist;

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now();
    lastPersistRef.current = Date.now();
    const tick = () => {
      const e = baseRef.current + (Date.now() - startRef.current) / 1000;
      setElapsed(e);
      if (Date.now() - lastPersistRef.current >= PERSIST_EVERY_MS) {
        lastPersistRef.current = Date.now();
        persistRef.current(e);
      }
    };
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [running]);

  const toggle = () => {
    if (running) {
      baseRef.current = elapsed;
      setRunning(false);
      persistRef.current(elapsed);
    } else {
      setRunning(true);
    }
  };
  const reset = () => {
    setRunning(false);
    baseRef.current = 0;
    setElapsed(0);
    persistRef.current(0);
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
        <div
          className="h-full w-full rounded-full origin-left bg-primary"
          style={{
            transform: `scaleX(${pct / 100})`,
            transition: "transform var(--dur-base) var(--ease-out-custom)",
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={toggle} size="sm" className="gap-1.5 text-sm font-medium">
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

export default function PrimePage() {
  const {
    loading,
    today,
    done,
    timerFloorSec,
    timerElapsedSec,
    acknowledgeAffirmation,
    acknowledgePrompt,
    persistTimerElapsed,
    resetToday,
  } = usePrime();
  const { toast } = useToast();
  const [confirmReset, setConfirmReset] = useState(false);

  const step1Done = Boolean(today && today.affirmations.every((a) => a.acknowledged));
  const step2Done = Boolean(today?.promptAcknowledged);

  // T38: celebrate the moment prime flips to complete (not on page load).
  const [celebrating, setCelebrating] = useState(false);
  const prevDone = useRef(done);
  useEffect(() => {
    if (done && !prevDone.current) setCelebrating(true);
    prevDone.current = done;
  }, [done]);

  return (
    <div className="space-y-6 max-w-2xl">
      {celebrating && <Celebration onDone={() => setCelebrating(false)} />}
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
        <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground">
          <Link href="/prime/manage" aria-label="Edit prime banks" title="Edit banks">
            <Settings2 size={16} />
          </Link>
        </Button>
      </div>

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
            <StepHeader n={1} title="Affirmations" hint="Read each aloud, then tap to acknowledge. Tap again to undo." done={step1Done} />
            <div className="space-y-2">
              {today.affirmations.map((a) => (
                <button
                  key={a.id}
                  onClick={() => acknowledgeAffirmation(a.id)}
                  className={`w-full text-left rounded-lg px-4 py-3 flex items-start gap-3 transition-colors border active:scale-[0.99] ${
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
            <SoftTimer
              floorSec={timerFloorSec}
              initialSec={timerElapsedSec}
              onPersist={persistTimerElapsed}
            />
            <Button
              onClick={() => { acknowledgePrompt(); toast("Spoken prompt done"); }}
              disabled={step2Done}
              size="sm"
              className="mt-3 gap-1.5 text-sm font-medium disabled:opacity-50"
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
              onClick={() => setConfirmReset(true)}
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <RotateCcw size={13} /> Reset
            </Button>
          </div>

          <ConfirmDialog
            open={confirmReset}
            title="Reset today's prime?"
            message="Clears every acknowledgement and the timer for today."
            onConfirm={() => {
              resetToday();
              setConfirmReset(false);
              toast("Reset today's prime");
            }}
            onCancel={() => setConfirmReset(false)}
          />
        </>
      )}
    </div>
  );
}
