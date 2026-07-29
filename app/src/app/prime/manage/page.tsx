"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Plus, Trash2 } from "lucide-react";
import { usePrime } from "@/lib/use-prime";
import { PRIME_TIMER_FLOORS, type AffirmationType } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TYPE_LABEL: Record<AffirmationType, string> = {
  anchor: "Anchor",
  rotating: "Rotating",
  contextual: "Contextual",
};

// Bank manager, moved off the /prime ritual surface (same components/logic):
// affirmations, prompts, principles, timer floor.
export default function PrimeManagePage() {
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
  } = usePrime();

  const [newAff, setNewAff] = useState("");
  const [newAffType, setNewAffType] = useState<AffirmationType>("rotating");
  const [newPrompt, setNewPrompt] = useState("");
  const [newPrinciple, setNewPrinciple] = useState("");

  const cycleType = (t: AffirmationType): AffirmationType =>
    t === "anchor" ? "rotating" : t === "rotating" ? "contextual" : "anchor";

  return (
    <div className="space-y-6 max-w-2xl">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground">
          <Link href="/prime" aria-label="Back to Daily Prime">
            <ArrowLeft size={16} />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Prime banks</h1>
          <p className="text-xs mt-1 text-muted-foreground/70">
            Affirmations, prompts, principles and the soft-timer floor.
          </p>
        </div>
      </header>

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
    </div>
  );
}
