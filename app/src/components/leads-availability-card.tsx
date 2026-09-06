"use client";

// The one on/off switch admission (lib/leads/admission.ts) judges against —
// Samy's call, 2026-09-06: a value a human sets, default OFF, never derived
// from a calendar or any other data he'd have to keep in sync. Same
// settings-doc-via-generic-passthrough pattern as PushSettings' "push normal
// severity" toggle: this ticket only needed the read path
// (lib/leads/availability-settings.ts); this card is the write path.
//
// Off means /leads shows nothing, full stop — turning it back on is the only
// way leads reappear. There is no snooze picker, no calendar sync: the
// switch is the whole feature.
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";

const AVAILABILITY_DOC = "/api/data/users/local/settings/leads-availability";

export function LeadsAvailabilityCard() {
  const [openToWork, setOpenToWork] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(AVAILABILITY_DOC)
      .then((r) => r.json())
      .then((d) => setOpenToWork(d?.doc?.openToWork === true))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const toggle = async (v: boolean) => {
    setOpenToWork(v); // optimistic
    try {
      await fetch(AVAILABILITY_DOC, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { openToWork: v }, merge: true }),
      });
    } catch {
      setOpenToWork(!v); // restore truth on failure
    }
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">Looking for work</p>
        <p className="text-xs text-muted-foreground">
          {loaded
            ? openToWork
              ? "On — /leads can admit new leads."
              : "Off — /leads stays empty no matter what scout finds."
            : "Loading…"}
        </p>
      </div>
      <Switch checked={openToWork} onCheckedChange={toggle} disabled={!loaded} aria-label="Looking for work" />
    </div>
  );
}
