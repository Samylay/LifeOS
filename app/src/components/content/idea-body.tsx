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
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Authorship } from "@/components/ui/decision-context";
import { Textarea } from "@/components/ui/textarea";
import { getDraftSnapshot, saveCachedDraft, setCachedDraft } from "@/lib/content/draft-cache";

const SAVE_DEBOUNCE_MS = 700;

export function IdeaBody({
  ideaId,
  value,
  onSave,
  placeholder = "Write the hook and the beats. Your words — this is what you'll film.",
}: {
  ideaId: string;
  value: string;
  onSave: (body: string) => Promise<void>;
  placeholder?: string;
}) {
  // Seeded once from the stored value and owned locally from then on. The
  // caller keys this component by idea id, so switching ideas remounts it;
  // within one idea, a background refresh must never overwrite what Samy is
  // mid-way through typing.
  const [initial] = useState(() => getDraftSnapshot(ideaId, value));
  const [draft, setDraft] = useState(initial.draft);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(initial.failed ? "error" : "idle");
  const timer = useRef<number | null>(null);
  const statusTimer = useRef<number | null>(null);
  // A remounted card can start from newer cached prose after a failed write.
  // The retry must save what is displayed, not the older stored value.
  const draftRef = useRef(initial.draft);
  // Keep the stored value here deliberately: when cached prose differs from
  // storage, cleanup must enqueue it instead of treating it as already saved.
  const lastQueuedRef = useRef(value);
  const mountedRef = useRef(true);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  const persist = useCallback((body: string, force = false) => {
    if (!force && body === lastQueuedRef.current) return;
    lastQueuedRef.current = body;
    if (mountedRef.current) setState("saving");
    const write = saveCachedDraft(ideaId, value, body, onSaveRef.current);
    void write
      .then(() => {
        if (!mountedRef.current || draftRef.current !== body) return;
        setState("saved");
        if (statusTimer.current) window.clearTimeout(statusTimer.current);
        statusTimer.current = window.setTimeout(() => {
          if (mountedRef.current && draftRef.current === body) setState("idle");
        }, 1200);
      })
      .catch(() => {
        if (mountedRef.current && draftRef.current === body) setState("error");
      });
  }, [ideaId, value]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
      mountedRef.current = false;
      // Switching or filtering cards must not throw away the last keystroke.
      persist(draftRef.current);
    };
  }, [persist]);

  const change = (next: string) => {
    setDraft(next);
    draftRef.current = next;
    setCachedDraft(ideaId, value, next);
    setState("idle");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      persist(next);
    }, SAVE_DEBOUNCE_MS);
  };

  return (
    <div className="space-y-1">
      <label className="flex items-center justify-between"><Authorship /><span className="sr-only">Content draft</span></label>
      <Textarea
        aria-label="Your content draft"
        value={draft}
        onChange={(e) => change(e.target.value)}
        rows={6}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground"
      />
      <p className="flex h-4 items-center gap-1 text-xs text-muted-foreground" role="status">
        {state === "saving" && <><Loader2 size={11} className="animate-spin" /> saving…</>}
        {state === "saved" && <><Check size={11} /> saved</>}
        {state === "error" && <><span>Couldn&apos;t save.</span><button type="button" onClick={() => persist(draftRef.current, true)} className="font-medium text-primary underline-offset-4 hover:underline pressable active:scale-[0.97]">Retry</button></>}
      </p>
    </div>
  );
}
