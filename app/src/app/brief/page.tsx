"use client";

import { useCallback, useEffect, useState } from "react";
import { Coffee, RefreshCw } from "lucide-react";
import type { Brief } from "@/lib/brief-types";
import { BriefCards } from "@/components/brief/brief-cards";

interface BriefResponse {
  source: "live" | "fixture";
  brief: Brief;
}

export default function BriefPage() {
  const [data, setData] = useState<BriefResponse | null>(null);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/brief-json");
      if (!res.ok) throw new Error();
      setData(await res.json());
      setErr(false);
    } catch {
      setErr(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const brief = data?.brief;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Coffee size={22} style={{ color: "var(--accent)" }} /> Morning Brief
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            {brief
              ? `${brief.date} · generated ${new Date(brief.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Loading…"}
            {data?.source === "fixture" && (
              <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: "var(--bg-tertiary)", color: "#F59E0B" }}>
                sample data
              </span>
            )}
          </p>
        </div>
        <button onClick={load} title="Refresh" className="p-2 rounded-lg"
          style={{ color: "var(--text-tertiary)", background: "var(--bg-tertiary)" }}>
          <RefreshCw size={15} />
        </button>
      </div>

      {err && !brief && (
        <div className="rounded-xl p-4 text-sm"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}>
          Couldn&apos;t load the brief.
        </div>
      )}

      {brief && <BriefCards brief={brief} />}
    </div>
  );
}
