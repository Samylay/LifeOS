"use client";

// T29 / R-C — queued dev requests from the in-app chat Assistant. Modest
// review surface: list, mark done. Dark-only tokens, shadcn primitives,
// house motion (transform/opacity only, active:scale press).
import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import type { DevRequest } from "@/lib/dev-requests";

export function DevRequestsCard() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<DevRequest[] | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dev-requests");
      const data = await res.json();
      setRequests((data.requests as DevRequest[]) ?? []);
    } catch {
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markDone = async (id: string) => {
    setCompleting(id);
    try {
      const res = await fetch("/api/dev-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "done" }),
      });
      if (res.ok) {
        toast("Request marked done");
        await load();
      } else {
        toast("Failed to update request", "error");
      }
    } catch {
      toast("Failed to update request", "error");
    } finally {
      setCompleting(null);
    }
  };

  const queued = (requests ?? []).filter((r) => r.status === "queued");

  return (
    <Card className="p-4">
      <h2 className="text-sm font-medium text-foreground mb-1">
        Dev requests
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        Queued by the Assistant when you ask for a build/fix/change — recorded
        only; nothing executes.
      </p>
      {requests === null ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : queued.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing queued.</p>
      ) : (
        <ul className="space-y-2">
          {queued.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm truncate">{r.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {r.description}
                  {r.project ? ` · ${r.project}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={completing === r.id}
                onClick={() => void markDone(r.id)}
                className="shrink-0 active:scale-[0.97] transition-transform duration-200 ease-[var(--ease-out)]"
                aria-label={`Mark "${r.title}" done`}
              >
                <Check size={14} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
