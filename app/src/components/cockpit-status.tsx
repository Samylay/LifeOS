"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Server, Bot, ArrowRight } from "lucide-react";

interface StravaSummary {
  ok: boolean;
  weekKm?: number;
  weekMinutes?: number;
  weekCount?: number;
  activeToday?: boolean;
  last?: { name: string; type: string; km: number; minutes: number; date: string } | null;
}

interface SystemSummary {
  health: {
    ok: boolean;
    services: { name: string; label: string; up: boolean; state: string; status: string }[];
  };
  hermes: {
    ok: boolean;
    lastRun: string | null;
    lastFile: string | null;
    processed: number;
    ranToday: boolean;
  };
  now: number;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function CardShell({
  icon,
  title,
  meta,
  href,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4 lg:p-5"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {meta && (
            <span className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
              {meta}
            </span>
          )}
          {href && (
            <Link href={href} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
              <ArrowRight size={12} className="inline" />
            </Link>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

export function CockpitTraining() {
  const [data, setData] = useState<StravaSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/strava/summary", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData({ ok: false });
      }
    };
    load();
    const id = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <CardShell
      icon={<Activity size={16} style={{ color: "#14B8A6" }} />}
      title="Training"
      meta={data?.ok && data.activeToday ? "active today" : undefined}
      href="/workouts"
    >
      {!data ? (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Loading…</p>
      ) : !data.ok ? (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Strava not connected.</p>
      ) : (
        <div>
          <div className="flex gap-5 mb-3">
            <div>
              <p className="text-xl font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                {data.weekKm ?? 0}
                <span className="text-xs font-normal ml-0.5" style={{ color: "var(--text-tertiary)" }}>km</span>
              </p>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>this week</p>
            </div>
            <div>
              <p className="text-xl font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                {Math.floor((data.weekMinutes ?? 0) / 60)}
                <span className="text-xs font-normal" style={{ color: "var(--text-tertiary)" }}>h</span>{" "}
                {(data.weekMinutes ?? 0) % 60}
                <span className="text-xs font-normal" style={{ color: "var(--text-tertiary)" }}>m</span>
              </p>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>moving</p>
            </div>
            <div>
              <p className="text-xl font-bold font-mono" style={{ color: "var(--text-primary)" }}>{data.weekCount ?? 0}</p>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>sessions</p>
            </div>
          </div>
          {data.last ? (
            <div className="text-xs pt-2" style={{ color: "var(--text-tertiary)", borderTop: "1px solid var(--border-primary)" }}>
              Last: <span className="font-medium" style={{ color: "var(--text-primary)" }}>{data.last.name}</span>{" "}
              — {data.last.km} km · {data.last.minutes}m · {timeAgo(data.last.date)}
            </div>
          ) : (
            <p className="text-xs pt-2" style={{ color: "var(--text-tertiary)", borderTop: "1px solid var(--border-primary)" }}>
              No recent activity.
            </p>
          )}
        </div>
      )}
    </CardShell>
  );
}

export function CockpitHomelab() {
  const [data, setData] = useState<SystemSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/system/summary", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      }
    };
    load();
    const id = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const services = data?.health?.services ?? [];
  const up = services.filter((s) => s.up).length;

  return (
    <CardShell
      icon={<Server size={16} style={{ color: "var(--text-tertiary)" }} />}
      title="Homelab"
      meta={data?.health?.ok ? `${up}/${services.length} up` : undefined}
    >
      {!data ? (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Loading…</p>
      ) : !data.health?.ok ? (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Health check unavailable.</p>
      ) : (
        <div className="space-y-1.5">
          {services.map((s) => (
            <div key={s.name} className="flex items-center gap-2 text-sm">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{
                  background: s.up ? "#14B8A6" : "#EF4444",
                  boxShadow: s.up ? "0 0 6px -1px #14B8A6" : "none",
                }}
              />
              <span className="flex-1 truncate" style={{ color: "var(--text-primary)" }}>{s.label}</span>
              <span className="text-[11px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                {s.up ? s.status.replace(/^Up /, "up ") : s.state === "absent" ? "down" : s.state}
              </span>
            </div>
          ))}
          <div
            className="flex items-center gap-2 text-sm pt-2 mt-1"
            style={{ borderTop: "1px solid var(--border-primary)" }}
          >
            <Bot size={14} style={{ color: data?.hermes?.ranToday ? "#14B8A6" : "var(--text-tertiary)" }} />
            <span className="flex-1" style={{ color: "var(--text-primary)" }}>Hermes</span>
            <span className="text-[11px] font-mono" style={{ color: "var(--text-tertiary)" }}>
              {data?.hermes?.ok
                ? `${data.hermes.ranToday ? "ran today" : "idle"} · ${timeAgo(data.hermes.lastRun)}`
                : "—"}
            </span>
          </div>
        </div>
      )}
    </CardShell>
  );
}
