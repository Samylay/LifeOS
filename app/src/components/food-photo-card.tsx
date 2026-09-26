"use client";

import { useState } from "react";
import { Check, ChevronDown, LoaderCircle, Pencil, RotateCcw, Utensils } from "lucide-react";
import { toast } from "sonner";
import { NUTRIENTS, type FoodPhoto, type Nutrient } from "@/lib/food-model";

const button = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97] disabled:opacity-40";
function localTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export function FoodPhotoCard({ photo, update }: { photo: FoodPhoto; update: (id: string, input: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [portion, setPortion] = useState(String(photo.portion * 100));
  const [time, setTime] = useState(localTime(photo.eatenAt));
  const [correction, setCorrection] = useState("");
  const estimate = photo.estimate;
  const save = async (input: Record<string, unknown>) => {
    setBusy(true);
    try { await update(photo.id, { ...input, revision: photo.revision }); setEditing(false); setCorrection(""); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't update this meal"); }
    finally { setBusy(false); }
  };
  const value = (key: Nutrient) => estimate?.nutrients[key] == null ? "Unknown" : `${Math.round(estimate.nutrients[key]! * photo.portion * 10) / 10} ${NUTRIENTS[key].unit}`;
  return <div className="w-full min-w-0 space-y-3">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={photo.imageUrl} alt={photo.caption || "Photo sent to LifeOS"} className="max-h-64 w-full rounded-xl object-contain" />
    {photo.caption && <p className="whitespace-pre-wrap text-sm leading-6">{photo.caption}</p>}
    <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
      <time dateTime={photo.eatenAt}>{new Intl.DateTimeFormat(undefined, { timeZone: photo.timezone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(photo.eatenAt))}</time>
      <span>{photo.timezone}</span>
      <span>Photo saved</span>
    </div>
    {(photo.state === "pending" || photo.state === "running") && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle size={15} className="animate-spin" />{photo.state === "pending" ? "Waiting to analyse your photo" : "Identifying foods and estimating nutrients"}</p>}
    {photo.state === "failed" && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{photo.error}</p><button type="button" disabled={busy} onClick={() => void save({ retry: true })} className={`${button} bg-card text-foreground`}><RotateCcw size={13} />Retry analysis</button></div>}
    {photo.state === "ready" && estimate && <div className="rounded-xl border border-primary/20 bg-background/70 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div><p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-primary"><Utensils size={12} />{estimate.isFood ? "Meal logged · estimated" : "Photo reviewed"}</p><h3 className="text-sm font-semibold">{estimate.title}</h3></div>
        <button type="button" disabled={busy} aria-label="Edit meal" onClick={() => { setPortion(String(photo.portion * 100)); setTime(localTime(photo.eatenAt)); setEditing(!editing); }} className={`${button} px-2 text-muted-foreground hover:bg-muted`}><Pencil size={14} /></button>
      </div>
      {estimate.isFood ? <>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{estimate.foods.map((f) => `${f.name}${f.grams === null ? "" : ` ≈${Math.round(f.grams * photo.portion)} g`}`).join(" · ")}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{(["kcal", "protein", "carbs", "fat"] as Nutrient[]).map((key) => <div key={key}><dt className="text-[11px] text-muted-foreground">{NUTRIENTS[key].label}</dt><dd className="text-sm font-semibold tabular-nums">{value(key)}</dd></div>)}</dl>
        <p className="mt-3 text-[11px] text-muted-foreground">{photo.portion * 100}% of pictured portion · {estimate.confidence} confidence</p>
        <details className="mt-3 text-xs"><summary className="flex min-h-9 cursor-pointer items-center gap-1 text-primary transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97]">Fibre, vitamins and minerals <ChevronDown size={12} /></summary><dl className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2">{(Object.keys(NUTRIENTS) as Nutrient[]).filter((key) => !["kcal", "protein", "carbs", "fat"].includes(key)).map((key) => <div key={key}><dt className="text-muted-foreground">{NUTRIENTS[key].label}</dt><dd className="tabular-nums">{value(key)}</dd></div>)}</dl></details>
        {!!estimate.assumptions.length && <details className="mt-2 text-xs leading-5 text-muted-foreground"><summary className="flex min-h-11 cursor-pointer items-center gap-1 transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97]">Estimation notes <ChevronDown size={12} /></summary><p className="pb-2">{estimate.assumptions.join(" ")}</p></details>}
        {estimate.question && <p className="mt-2 text-sm leading-5">{estimate.question}</p>}
      </> : <p className="mt-2 text-xs text-muted-foreground">No meal added to your food diary.</p>}
    </div>}
    {(editing || photo.state === "failed") && <form className="space-y-3 rounded-xl border border-border bg-background p-3" onSubmit={(event) => { event.preventDefault(); if (!time || !Number.isFinite(Number(portion))) return; void save({ portion: Number(portion) / 100, eatenAt: new Date(time).toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...(correction.trim() ? { correction } : {}) }); }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs">Portion eaten (%)<input required type="number" min="0" max="500" step="any" value={portion} onChange={(event) => setPortion(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-card px-2" /></label><label className="text-xs">Eating time ({Intl.DateTimeFormat().resolvedOptions().timeZone})<input required type="datetime-local" value={time} onChange={(event) => setTime(event.target.value)} className="mt-1 min-h-10 w-full min-w-0 rounded-lg border border-border bg-card px-2" /></label></div>
      <label className="block text-xs">Ingredients or portion details<textarea maxLength={2000} value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder="For example: tofu, not chicken; cooked with one teaspoon of oil" className="mt-1 min-h-16 w-full rounded-lg border border-border bg-card px-2 py-2" /></label>
      <button disabled={busy || photo.state === "running"} className={`${button} bg-primary text-primary-foreground`}>{busy ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />}Save correction</button>
    </form>}
  </div>;
}
