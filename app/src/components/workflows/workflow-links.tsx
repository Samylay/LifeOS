"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FlaskConical, BookOpen } from "lucide-react";
import { usePathname } from "next/navigation";

export function WorkflowInboxLink() {
  const [data, setData] = useState<{ ready: number; active: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => { fetch("/api/workflows?summary=1").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((d) => { setData(d); setFailed(false); }).catch(() => setFailed(true)); }, []);
  useEffect(() => { load(); const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30000); return () => clearInterval(timer); }, [load]);
  if (failed) return <p className="text-xs text-muted-foreground">Workflow status unavailable. <button onClick={load} className="underline">Retry</button></p>;
  if (!data || (!data.ready && !data.active)) return null;
  return <Link href="/workflows" className="flex items-center gap-3 rounded-xl border border-primary/30 bg-card p-4 transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]"><span className="grid size-10 place-items-center rounded-full bg-secondary"><FlaskConical size={19} /></span><span className="min-w-0 flex-1"><strong className="block text-sm font-medium">{data.ready ? `${data.ready} ${data.ready === 1 ? "result needs" : "results need"} your decision` : "Your saved ideas are being developed"}</strong><span className="mt-1 block text-xs text-muted-foreground">{data.ready ? "See the evidence and approve the next step" : `${data.active} ${data.active === 1 ? "workflow" : "workflows"} in progress`}</span></span><ArrowUpRight size={16} /></Link>;
}
interface Material { id: string; title: string; body: string; sourceUrl: string; destination: string; runId: string; effect: string }
/** Approved workflow outputs stay attached to the area that owns them. */
export function PreparedMaterials({ area }: { area?: string }) {
  const path = usePathname(); const [items, setItems] = useState<Material[]>([]); const [failed, setFailed] = useState(false);
  const load = useCallback(() => { fetch("/api/workflows?library=1").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((d) => { setItems(d.items); setFailed(false); }).catch(() => setFailed(true)); }, []);
  useEffect(() => { load(); }, [load]);
  const shown = items.filter((i) => i.destination === (area || path) && !["save-content", "save-recipe"].includes(i.effect));
  if (failed) return <p className="text-xs text-muted-foreground">Prepared references unavailable. <button onClick={load} className="underline">Retry</button></p>;
  if (!shown.length) return null;
  return <section className="space-y-3"><div className="flex items-center gap-2"><BookOpen size={16} /><h2 className="text-sm font-medium">From your saved sources</h2></div><div className="grid gap-3 md:grid-cols-2">{shown.map((item) => <details key={item.id} className="rounded-xl border border-border bg-card p-4"><summary className="cursor-pointer text-sm font-medium">{item.title}{item.effect === "propose-training" && <span className="mt-1 block text-xs text-muted-foreground">Proposal, current program unchanged</span>}</summary><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{item.body}</p><Link href={`/workflows?run=${item.runId}`} className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs underline">Source and result <ArrowUpRight size={12} /></Link></details>)}</div></section>;
}
