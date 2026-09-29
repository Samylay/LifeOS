"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { useGarmin } from "@/lib/use-garmin";
import { TrainingDashboard } from "@/components/training-dashboard";
import { Page, PageHeader } from "@/components/ui/page";

export default function TrainingPage() {
  const garmin = useGarmin();

  useEffect(() => {
    if (garmin.connection.connected) garmin.syncActivities(0, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garmin.connection.connected]);

  return <Page className="max-w-5xl">
    <PageHeader title="Training" icon={Dumbbell} />
    {garmin.error && <div role="status" className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
      Garmin session expired. <Link href="/settings" className="text-primary underline underline-offset-2">Reconnect in Settings</Link>.
    </div>}
    <TrainingDashboard />
  </Page>;
}
