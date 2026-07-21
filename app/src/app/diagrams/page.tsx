"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Workflow, Copy, Download, Trash2, Sparkles, Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/toast";
import { useVoiceRecorder } from "@/lib/use-voice-recorder";

interface Diagram {
  id: string;
  title: string;
  prompt: string;
  kind: string;
  mermaid: string;
  svg: string;
  createdAt?: { __date: string };
}

const KINDS = ["auto", "flowchart", "mindmap", "sequence", "timeline"] as const;

function when(d?: { __date: string }): string {
  if (!d?.__date) return "";
  return new Date(d.__date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function DiagramsPage() {
  const { toast } = useToast();
  const [history, setHistory] = useState<Diagram[] | null>(null);
  const [current, setCurrent] = useState<Diagram | null>(null);
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("auto");
  const [busy, setBusy] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const { state: voice, start: startVoice, stop: stopVoice } = useVoiceRecorder({
    onTranscript: (t) => {
      setPrompt((p) => (p.trim() ? `${p.trim()} ${t}` : t));
      promptRef.current?.focus();
    },
    onError: (m) => toast(m, "error"),
  });

  const load = useCallback(async () => {
    const res = await fetch("/api/diagrams");
    if (!res.ok) return;
    const { diagrams } = await res.json();
    setHistory(diagrams);
    setCurrent((cur) => cur ?? diagrams[0] ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = useCallback(async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/diagrams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCurrent(data.diagram);
      setHistory((h) => [data.diagram, ...(h ?? [])]);
      setPrompt("");
      toast("Diagram ready", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Generation failed", "error");
    } finally {
      setBusy(false);
    }
  }, [prompt, kind, busy, toast]);

  const remove = useCallback(
    async (id: string) => {
      await fetch(`/api/diagrams?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setHistory((h) => (h ?? []).filter((d) => d.id !== id));
      setCurrent((cur) => (cur?.id === id ? null : cur));
    },
    [],
  );

  const copyMermaid = useCallback(async () => {
    if (!current) return;
    await navigator.clipboard.writeText(current.mermaid);
    toast("Mermaid source copied", "success");
  }, [current, toast]);

  const downloadSvg = useCallback(() => {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([current.svg], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${current.title.replace(/[^\w-]+/g, "-").slice(0, 40) || "diagram"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [current]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Workflow size={22} className="text-primary" /> Diagrams
        </h1>
        <p className="text-xs text-muted-foreground">
          Describe a system, a plan, or paste a brain-dump. Sonnet draws it as mermaid.
        </p>
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <Textarea
          ref={promptRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void generate();
          }}
          placeholder="e.g. the flow of a content idea from capture to published video, including the feedback loop"
          rows={3}
          className="resize-none"
          disabled={busy}
        />
        <div className="flex items-center justify-between gap-2">
          {voice === "recording" ? (
            <Button
              size="icon-sm"
              onClick={stopVoice}
              aria-label="Stop recording"
              title="Stop recording"
              className="shrink-0 bg-destructive text-white hover:bg-destructive/90 active:scale-[0.97]"
            >
              <Square size={12} className="animate-pulse" />
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={startVoice}
              disabled={voice !== "idle" || busy}
              aria-label="Dictate the diagram prompt"
              title="Dictate the diagram prompt"
              className="shrink-0 text-muted-foreground active:scale-[0.97]"
            >
              {voice === "transcribing" ? (
                <Loader2 size={14} className="animate-spin text-primary" />
              ) : (
                <Mic size={14} />
              )}
            </Button>
          )}
          <p role="status" className="sr-only">
            {voice === "recording" ? "recording" : voice === "transcribing" ? "transcribing" : ""}
          </p>
          <div className="flex flex-wrap gap-1">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors active:scale-[0.97] ${
                  kind === k
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <Button onClick={() => void generate()} disabled={busy || !prompt.trim()} className="active:scale-[0.97]">
            <Sparkles size={14} className="mr-1" />
            {busy ? "Drawing…" : "Generate"}
          </Button>
        </div>
        {busy && (
          <p className="text-xs text-muted-foreground">
            Composing mermaid and rendering, usually 10–30 seconds.
          </p>
        )}
      </Card>

      {busy && !current && <Skeleton className="h-72 w-full rounded-lg" />}

      {current && (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{current.title}</p>
              <p className="text-xs text-muted-foreground">
                {current.kind} · {when(current.createdAt)}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" onClick={() => void copyMermaid()} title="Copy mermaid source">
                <Copy size={14} />
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadSvg} title="Download SVG">
                <Download size={14} />
              </Button>
            </div>
          </div>
          <div
            className="overflow-x-auto rounded-lg border border-border bg-white p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: current.svg }}
          />
        </Card>
      )}

      {history === null ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : history.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">History</p>
          {history.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setCurrent(d)}
              className={`group flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors active:scale-[0.99] ${
                current?.id === d.id ? "border-primary/50 bg-primary/5" : "border-border hover:bg-accent-ui"
              }`}
            >
              <span className="min-w-0 truncate">{d.title}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {d.kind} · {when(d.createdAt)}
                <Trash2
                  size={13}
                  className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(d.id);
                  }}
                />
              </span>
            </button>
          ))}
        </div>
      ) : (
        !current && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No diagrams yet. Describe one above.
          </p>
        )
      )}
    </div>
  );
}
