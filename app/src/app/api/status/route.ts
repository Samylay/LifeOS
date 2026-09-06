// The operational surface's data. Gathers the signals, then hands them to the
// pure verdict in lib/status/verdict.ts — this route decides nothing itself.
//
// Standing goals are surfaced here for the first time. getStandingGoals()
// already existed and fed the brief's homelab card; the brief is dropping
// that card, so this is a relocation of an existing capability, not new work.
import { NextResponse } from "next/server";
import { getAllContainers, getHermesStatus } from "@/lib/system-health";
import { getHostMetrics, getStandingGoals } from "@/lib/metrics";
import { getDeliveryHealth } from "@/lib/web-push-channel";
import { problems, verdict, type StatusSignals } from "@/lib/status/verdict";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [containers, host, goals] = await Promise.all([
    getAllContainers(),
    getHostMetrics(),
    getStandingGoals(),
  ]);
  const hermes = getHermesStatus();
  const delivery = getDeliveryHealth();

  const signals: StatusSignals = { goals, containers, host, delivery };

  return NextResponse.json({
    containers,
    host,
    hermes,
    goals,
    delivery,
    problems: problems(signals),
    verdict: verdict(signals),
    now: Date.now(),
  });
}
