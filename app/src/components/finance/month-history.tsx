"use client";

import { useState } from "react";
import type { MonthlyBurnResult } from "@/lib/finance-burn";
import { formatMoney } from "@/lib/finance-activity";
import { cn } from "@/lib/utils";

export function monthLabel(month: string, short = false) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: short ? "short" : "long", ...(short ? {} : { year: "numeric" }), timeZone: "UTC" });
}

export function MonthHistory({ months, selected, onSelect }: { months: MonthlyBurnResult[]; selected: string; onSelect: (month: string) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const viewed = months.find((month) => month.burn.month === (preview ?? selected)) ?? months.at(-1)!;
  const max = Math.max(...months.map((month) => month.burn.out), 1);
  return <section aria-label="Spending history" className="space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-medium">Monthly spending</h3>
      <p className="text-xs text-muted-foreground">Hover to compare. Select a month to explore.</p>
    </div>
    <div className="grid grid-cols-6 gap-1 sm:gap-3" onPointerLeave={() => setPreview(null)}>
      {months.map(({ burn }) => <button key={burn.month} type="button" aria-label={`View ${monthLabel(burn.month)}, spent ${formatMoney(burn.out)}`}
        aria-pressed={selected === burn.month} onPointerEnter={() => setPreview(burn.month)} onFocus={() => setPreview(burn.month)} onBlur={() => setPreview(null)}
        onClick={() => { onSelect(burn.month); setPreview(null); }}
        className={cn("group flex min-w-0 flex-col items-center gap-2 rounded-md px-1 pb-2 pt-1 transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring", selected === burn.month ? "bg-muted" : "hover:bg-muted/50")}>
        <span className="flex h-24 w-full items-end justify-center" aria-hidden>
          <span className={cn("w-full max-w-12 rounded-t-md", selected === burn.month ? "bg-primary" : "bg-chart-2/60 group-hover:bg-chart-2")} style={{ height: `${Math.max(3, burn.out / max * 100)}%` }} />
        </span>
        <span className="text-xs font-medium">{monthLabel(burn.month, true)}</span>
      </button>)}
    </div>
    <div data-testid="month-preview" className="rounded-lg border border-border bg-muted/40 p-3" aria-live="polite" aria-atomic="true">
      <p className="mb-2 text-sm font-medium">{monthLabel(viewed.burn.month)}{viewed.burn.month === months.at(-1)?.burn.month ? " · so far" : ""}</p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Spent", viewed.burn.out], ["Income", viewed.burn.in], ["Net cash flow", viewed.burn.in - viewed.burn.out], ["Transfers", viewed.burn.transfer]].map(([label, value]) => <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium tabular-nums">{formatMoney(Number(value))}</dd>
        </div>)}
      </dl>
    </div>
  </section>;
}
