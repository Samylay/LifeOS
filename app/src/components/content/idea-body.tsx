"use client";

// T-content-rework-02 — where Samy writes the thing himself.
//
// This is the point of the record now. The old surface stored a generated
// script and gave his own notes a cramped "optional" box; the premise of the
// rework is that what he posts is his, so his words get the room and the
// generated field is not rendered at all.
//
// Saved as he types, because a half-written hook lost to a closed tab is the
// kind of small betrayal that stops someone opening a tool again.
import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

const SAVE_DEBOUNCE_MS = 700;

export function IdeaBody({
  value,
  onSave,
  placeholder = "Write the hook and the beats. Your words — this is what you'll film.",
}: {
  value: string;
  onSave: (body: string) => Promise<void>;
  placeholder?: string;
}) {
  // Seeded once from the stored value and owned locally from then on. The
  // caller keys this component by idea id, so switching ideas remounts it;
  // within one idea, a background refresh must never overwrite what Samy is
  // mid-way through typing.
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const change = (next: string) => {
    setDraft(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setState("saving");
      onSave(next)
        .then(() => {
          setState("saved");
          window.setTimeout(() => setState("idle"), 1200);
        })
        .catch(() => setState("idle"));
    }, SAVE_DEBOUNCE_MS);
  };

  return (
    <div className="space-y-1">
      <textarea
        value={draft}
        onChange={(e) => change(e.target.value)}
        rows={6}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground"
      />
      <p className="flex h-4 items-center gap-1 text-xs text-muted-foreground" role="status">
        {state === "saving" && <><Loader2 size={11} className="animate-spin" /> saving…</>}
        {state === "saved" && <><Check size={11} /> saved</>}
      </p>
    </div>
  );
}
