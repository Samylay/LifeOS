"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Service = { name: string; label: string; state: string; status: string; networks: string[] };
type Snapshot = { ok: boolean; services: Service[]; checkedAt: number };

export function SystemMap() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch("/api/system-map", { signal: controller.signal });
        if (!response.ok) throw new Error();
        const snapshot: Snapshot = await response.json();
        if (!controller.signal.aborted) { setData(snapshot); setError(false); }
      } catch { if (!controller.signal.aborted) setError(true); }
    };
    void refresh();
    const timer = setInterval(refresh, 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [revision]);
  const services = data?.services ?? [];
  const networks = [...new Set(services.flatMap((service) => service.networks))].sort();
  const active = services.find((service) => service.name === selected);
  const height = Math.max(460, services.length * 84 + 32, networks.length * 92 + 32);
  return <section className="space-y-4" aria-label="LifeOS system map">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-semibold">The system behind LifeOS</h2><p className="mt-1 text-sm text-muted-foreground">All Docker services on this host. Lines show shared networks, not confirmed data flows.</p></div>
      <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Refresh status</Button>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{error ? "Status unavailable. Refresh to retry. Any previous snapshot below may be out of date." : data ? `Checked ${new Date(data.checkedAt).toLocaleTimeString()} · refreshes every 30 seconds` : "Loading service status…"}</p>
    {data && services.length === 0 && <p>No Docker services found.</p>}
    {services.length > 0 && <div className="grid overflow-hidden rounded-xl border border-border bg-card xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="max-h-[72dvh] overflow-auto p-4">
        <div className="mb-4 flex min-w-[620px] justify-between text-sm font-medium text-muted-foreground"><span>Services · {services.length}</span><span>Docker networks</span></div>
        <div className="relative min-w-[620px]" style={{ height }}>
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none" aria-hidden="true">
            {services.flatMap((service, index) => service.networks.map((network) => {
              const target = networks.indexOf(network);
              const y = 38 + index * 84, end = 38 + target * 92;
              return <path key={`${service.name}:${network}`} d={`M 430 ${y} C 570 ${y}, 620 ${end}, 740 ${end}`} fill="none" stroke={selected === service.name ? "var(--primary)" : "var(--muted-foreground)"} strokeWidth={selected === service.name ? 2 : 1} opacity={selected && selected !== service.name ? 0.12 : 0.5} vectorEffect="non-scaling-stroke" />;
            }))}
          </svg>
          {services.map((service, index) => <button key={service.name} onClick={() => setSelected(service.name === selected ? null : service.name)} aria-pressed={selected === service.name} className="absolute left-0 flex h-[72px] w-[43%] flex-col justify-center rounded-lg border border-border bg-background px-4 text-left pressable active:scale-[0.97] aria-pressed:border-primary focus-visible:outline-2 focus-visible:outline-ring" style={{ top: index * 84 }}>
            <span className="w-full truncate text-base font-medium">{service.label}</span><span className={`text-sm ${service.status.includes("unhealthy") ? "text-destructive" : service.state === "running" ? "text-primary" : "text-muted-foreground"}`}>{service.state}{service.status.includes("unhealthy") ? " · unhealthy" : service.status.includes("(healthy)") ? " · healthy" : ""}</span>
          </button>)}
          {networks.map((network, index) => <div key={network} className="absolute right-0 flex min-h-[72px] w-[26%] items-center break-all rounded-lg border border-border bg-secondary px-3 py-2 text-sm" style={{ top: index * 92 }}>{network}</div>)}
        </div>
      </div>
      <aside className="space-y-4 border-t border-border p-5 xl:border-l xl:border-t-0" aria-label="Service details">
        {active ? <><h3 className="break-words text-lg font-semibold">{active.label}</h3><p className="break-all text-sm text-muted-foreground">{active.name}</p><p className="text-sm">{active.status || active.state}</p><h4 className="text-sm font-medium">Connected networks</h4>{active.networks.length ? active.networks.map((network) => <div key={network}><p className="break-all text-sm text-primary">{network}</p><ul className="mt-2 space-y-2">{services.filter((peer) => peer.name !== active.name && peer.networks.includes(network)).map((peer) => <li key={peer.name}><button className="break-all text-left text-sm text-muted-foreground pressable active:scale-[0.97] hover:text-foreground" onClick={() => setSelected(peer.name)}>{peer.label}</button></li>)}</ul></div>) : <p className="text-sm text-muted-foreground">No Docker network membership reported.</p>}</> : <><h3 className="text-lg font-medium">Follow a service</h3><p className="text-sm leading-relaxed text-muted-foreground">Select a service to highlight its connections and see which services share its networks.</p></>}
        <p className="text-xs leading-relaxed text-muted-foreground">Running describes the container process. Health appears only when Docker reports a health check. Host processes and external services are outside this map.</p>
        <Button asChild variant="outline"><Link href="/status">Open system status</Link></Button>
      </aside>
    </div>}
  </section>;
}
