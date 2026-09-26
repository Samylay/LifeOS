"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { prepareChatPhoto } from "@/lib/prepare-chat-photo";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";

export function PhotoInboxCapture({ compact = false }: { compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<{ file: File; url: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (draft) URL.revokeObjectURL(draft.url); }, [draft]);
  async function choose(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const prepared = await prepareChatPhoto(file);
      setDraft({ file: prepared, url: URL.createObjectURL(prepared) });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not prepare the photo"); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const body = new FormData(); body.set("photo", draft.file); body.set("caption", caption);
      const response = await fetch("/api/capture/photos", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the photo");
      setDraft(null); setCaption(""); toast.success("Photo saved to inbox");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the photo. Try again."); }
    finally { setBusy(false); }
  }
  const press = "transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97]";
  return <div className="relative">
    <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { void choose(event.target.files?.[0]); event.target.value = ""; }} />
    <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label="Capture photo to inbox" title="Capture photo to inbox" className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40 ${press}`}>
      {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Camera size={16} />}<span className={compact ? "hidden sm:inline" : undefined}>Inbox photo</span>
    </button>
    <Sheet open={!!draft} onOpenChange={open => { if (!open && !busy) setDraft(null); }}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-lg overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader><SheetTitle>Save photo to inbox</SheetTitle><SheetDescription>Add a caption to help you find it later.</SheetDescription></SheetHeader>
        {draft && <div className="space-y-3 px-4">
          <Image src={draft.url} alt="Photo to capture" width={480} height={240} unoptimized className="max-h-[30dvh] w-full rounded-lg object-contain" />
          <textarea value={caption} onChange={event => setCaption(event.target.value)} maxLength={4000} placeholder="Optional caption" aria-label="Photo caption" className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-base" />
          <button type="button" onClick={() => void save()} disabled={busy} className={`min-h-11 w-full rounded-lg bg-primary p-3 text-sm font-medium text-primary-foreground disabled:opacity-40 ${press}`}>{busy ? "Saving" : "Save to inbox"}</button>
        </div>}
      </SheetContent>
    </Sheet>
  </div>;
}
