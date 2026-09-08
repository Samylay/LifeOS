"use client";

// T-content-rework-04 — what comes back when Samy asks for help.
//
// Angles and questions sit BESIDE his writing, never in it, and are marked as
// not-his on purpose: the whole premise of this rework is that what he posts
// is his, so the line between his words and the machine's has to be visible
// at a glance rather than inferred.
//
// Nothing here is copyable-as-a-post, because nothing here is postable. If
// the model returns something that would be, the request fails upstream and
// this renders the failure instead.
import { Lightbulb, Loader2, MessageCircleQuestion, Sparkles, X } from "lucide-react";
import type { Brainstorm } from "@/lib/content/brainstorm";
import type { ContentType } from "@/lib/content/catalog";
import { typeLabel } from "@/lib/content/catalog";

export function BrainstormPanel({
  brainstorm,
  busy,
  error,
  types,
  currentType,
  onAsk,
  onDismiss,
  onAcceptType,
}: {
  brainstorm: Brainstorm | null;
  busy: boolean;
  error: string | null;
  types: ContentType[];
  currentType: string;
  onAsk: () => void;
  onDismiss: () => void;
  onAcceptType: (key: string) => void;
}) {
  if (!brainstorm && !busy && !error) {
    return (
      <button
        onClick={onAsk}
        className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-xs font-medium text-primary transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]"
      >
        <Sparkles size={12} aria-hidden /> Stuck? Ask for angles
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-dashed border-border bg-muted/40 p-3">
      <div className="flex items-center gap-1.5">
        <Sparkles size={12} className="text-muted-foreground" aria-hidden />
        {/* Said plainly, every time. Not his words. */}
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Not your words — thinking aid
        </p>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="ml-auto rounded p-0.5 text-muted-foreground transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] hover:text-foreground active:scale-[0.97]"
        >
          <X size={13} />
        </button>
      </div>

      {busy && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 size={13} className="animate-spin" /> thinking…
        </p>
      )}

      {error && <div className="flex items-center gap-2 text-sm text-destructive" role="alert">
        <span>{error}</span>
        <button
          type="button"
          onClick={onAsk}
          className="font-medium underline-offset-4 hover:underline pressable active:scale-[0.97]"
        >
          Retry
        </button>
      </div>}

      {brainstorm && (
        <div className="space-y-2.5">
          {brainstorm.angles.length > 0 && (
            <div>
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Lightbulb size={11} aria-hidden /> Angles
              </p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-sm text-foreground">
                {brainstorm.angles.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </div>
          )}
          {brainstorm.questions.length > 0 && (
            <div>
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <MessageCircleQuestion size={11} aria-hidden /> Only you can answer
              </p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-sm text-foreground">
                {brainstorm.questions.map((q) => <li key={q}>{q}</li>)}
              </ul>
            </div>
          )}
          {brainstorm.contentType && brainstorm.contentType !== currentType && (
            // A suggestion he accepts or ignores — never a demand.
            <button
              onClick={() => onAcceptType(brainstorm.contentType!)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]"
            >
              Sort as {typeLabel(brainstorm.contentType, types)}
            </button>
          )}
          {brainstorm.hooks.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Hooks worth trying: {brainstorm.hooks.map((n) => `#${n}`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
