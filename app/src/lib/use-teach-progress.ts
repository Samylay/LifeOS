"use client";

import { useEffect, useState } from "react";

/** The one narrative line Today shows for the learning pipeline (T61, map
 * 08) — the latest `learningRecords` prose across all topics, verbatim.
 * No score, no streak: `latestProgress()` in `src/lib/teach.ts` is the only
 * source, surfaced here via the existing `/api/teach` payload. */
export interface TeachProgress {
  topic: string;
  date: string;
  text: string;
}

export function useTeachProgress(): TeachProgress | null {
  const [progress, setProgress] = useState<TeachProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/teach")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setProgress(data?.latestProgress ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return progress;
}
