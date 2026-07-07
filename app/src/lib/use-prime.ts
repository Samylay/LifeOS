"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { collection, doc, onSnapshot, query, orderBy } from "@/lib/local-db";
import { db } from "./local-db";
import {
  affirmations as affirmationsApi,
  primePrompts as promptsApi,
  principles as principlesApi,
  primeDays as primeDaysApi,
  primeSettings as primeSettingsApi,
} from "./firestore";
import {
  todayKey,
  DEFAULT_PRIME_SETTINGS,
  type Affirmation,
  type AffirmationType,
  type PrimePrompt,
  type Principle,
  type PrimeDay,
} from "./types";
import { useAuth } from "./auth-context";

// --- Seed banks (first run only) ---------------------------------------------
//
// The starter affirmation set from the spec. The anchor / rotating split below
// is an editable default (the spec gives the eight statements but doesn't tag
// each) — retag freely in the bank manager. Anchors show every morning;
// rotating/contextual swap 1–2 in per day.

const SEED_AFFIRMATIONS: { text: string; type: AffirmationType }[] = [
  { text: "I treat my daily practices with the seriousness of ritual.", type: "anchor" },
  { text: "I trace problems upstream to their source before acting.", type: "anchor" },
  {
    text: "I build a business the way I build systems — small, durable pieces that compound, not loud bets that fade.",
    type: "anchor",
  },
  { text: "I hold my beliefs loosely and change them when the evidence does.", type: "anchor" },
  { text: "I finish what I start.", type: "anchor" },
  { text: "I don't call an expense an investment.", type: "rotating" },
  { text: "I stop parallelizing and start prioritizing.", type: "rotating" },
  { text: "A monotonous voice is forbidden.", type: "rotating" },
];

const SEED_PROMPTS: { text: string; category: "concrete" | "abstract"; weight: number }[] = [
  { text: "Walk me through your plan for the next three hours.", category: "concrete", weight: 1 },
  {
    text: "What's the one task today you're avoiding, and what's the first step?",
    category: "concrete",
    weight: 1,
  },
  {
    text: "Describe a problem you're working on right now, like you're explaining it to a colleague.",
    category: "concrete",
    weight: 1,
  },
  { text: "What went well yesterday? Be specific.", category: "concrete", weight: 1 },
  { text: "If today goes perfectly, what happened?", category: "concrete", weight: 1 },
  // Abstract is mixed in occasionally (lower weight) once fluency is back.
  { text: "Is the thing you're optimizing for actually the thing you want?", category: "abstract", weight: 0.3 },
];

// "Prayers are rituals" — the standing principle the spec keeps out of the
// affirmation list, in its own slot.
const SEED_PRINCIPLES: string[] = ["Prayers are rituals."];

// --- Deterministic daily selection -------------------------------------------

/** Stable hash from a string (so a given date picks the same items all day). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick up to `n` items from a list, deterministically seeded by `seed`. */
function pickN<T>(list: T[], n: number, seed: string): T[] {
  if (list.length <= n) return [...list];
  const scored = list
    .map((item, i) => ({ item, k: hash(`${seed}:${i}`) }))
    .sort((a, b) => a.k - b.k);
  return scored.slice(0, n).map((s) => s.item);
}

/** Weighted single pick, deterministic by `seed`. */
function pickWeighted<T extends { weight: number }>(list: T[], seed: string): T | undefined {
  if (list.length === 0) return undefined;
  const total = list.reduce((sum, x) => sum + Math.max(0, x.weight), 0);
  if (total <= 0) return list[hash(seed) % list.length];
  let r = (hash(seed) / 0xffffffff) * total;
  for (const item of list) {
    r -= Math.max(0, item.weight);
    if (r <= 0) return item;
  }
  return list[list.length - 1];
}

export function usePrime() {
  const { user, isFirebaseConfigured } = useAuth();
  const uid = user?.uid;

  const [affirmationBank, setAffirmationBank] = useState<Affirmation[]>([]);
  const [promptBank, setPromptBank] = useState<PrimePrompt[]>([]);
  const [principleBank, setPrincipleBank] = useState<Principle[]>([]);
  const [today, setToday] = useState<PrimeDay | null>(null);
  const [timerFloorSec, setTimerFloorSec] = useState<number>(DEFAULT_PRIME_SETTINGS.timerFloorSec);

  // Track which streams have reported at least once, to know when it's safe to
  // bootstrap (seed banks / compose the day) without racing the initial fetch.
  const [loadedMask, setLoadedMask] = useState(0);
  const ready = loadedMask === 0b1111;
  const dateKey = todayKey();
  const bootstrappedRef = useRef(false);

  // --- Live streams ---
  useEffect(() => {
    if (!isFirebaseConfigured || !uid || !db) return;

    const unsubA = onSnapshot(
      query(collection(db, `users/${uid}/affirmationBank`), orderBy("order", "asc")),
      (snap) => {
        setAffirmationBank(
          snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Affirmation)
        );
        setLoadedMask((m) => m | 0b0001);
      }
    );
    const unsubP = onSnapshot(
      collection(db, `users/${uid}/promptBank`),
      (snap) => {
        setPromptBank(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as PrimePrompt));
        setLoadedMask((m) => m | 0b0010);
      }
    );
    const unsubPr = onSnapshot(
      collection(db, `users/${uid}/principles`),
      (snap) => {
        setPrincipleBank(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Principle));
        setLoadedMask((m) => m | 0b0100);
      }
    );
    const unsubDay = onSnapshot(
      doc(db, `users/${uid}/primeDays/${dateKey}`),
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        setToday(
          d
            ? ({
                ...d,
                completedAt: d.completedAt?.toDate?.() || undefined,
                createdAt: d.createdAt?.toDate?.() || new Date(),
                updatedAt: d.updatedAt?.toDate?.() || new Date(),
              } as PrimeDay)
            : null
        );
        setLoadedMask((m) => m | 0b1000);
      }
    );

    // Settings is a one-shot read (no listener needed for a tiny config doc).
    primeSettingsApi.get(uid).then((s) => {
      if (s?.timerFloorSec) setTimerFloorSec(s.timerFloorSec);
    });

    return () => {
      unsubA();
      unsubP();
      unsubPr();
      unsubDay();
    };
  }, [uid, isFirebaseConfigured, dateKey]);

  // --- Bootstrap: seed banks on first ever run, then compose today's ritual ---
  useEffect(() => {
    if (!ready || !uid || bootstrappedRef.current) return;
    if (today) {
      bootstrappedRef.current = true;
      return;
    }
    bootstrappedRef.current = true;

    (async () => {
      let affs = affirmationBank;
      let prompts = promptBank;
      let princs = principleBank;

      // First run: empty banks → seed them and keep the created rows in hand so
      // we can compose immediately without waiting for the next poll.
      if (affs.length === 0 && prompts.length === 0) {
        const now = new Date();
        affs = [];
        for (let i = 0; i < SEED_AFFIRMATIONS.length; i++) {
          const s = SEED_AFFIRMATIONS[i];
          const id = await affirmationsApi.create(uid, {
            text: s.text,
            type: s.type,
            active: true,
            order: i,
            createdAt: now,
            updatedAt: now,
          });
          affs.push({ id, text: s.text, type: s.type, active: true, order: i, createdAt: now, updatedAt: now });
        }
        prompts = [];
        for (const s of SEED_PROMPTS) {
          const id = await promptsApi.create(uid, {
            text: s.text,
            category: s.category,
            weight: s.weight,
            active: true,
            createdAt: now,
            updatedAt: now,
          });
          prompts.push({ id, ...s, active: true, createdAt: now, updatedAt: now });
        }
        princs = [];
        for (const text of SEED_PRINCIPLES) {
          const id = await principlesApi.create(uid, { text, active: true, createdAt: now, updatedAt: now });
          princs.push({ id, text, active: true, createdAt: now, updatedAt: now });
        }
      }

      await composeDay(affs, prompts, princs);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, uid, today]);

  // Build and persist the PrimeDay for `dateKey` from the current banks.
  const composeDay = useCallback(
    async (affs: Affirmation[], prompts: PrimePrompt[], princs: Principle[]) => {
      if (!uid) return;
      const anchors = affs.filter((a) => a.active && a.type === "anchor").sort((a, b) => a.order - b.order);
      const rotating = affs.filter((a) => a.active && a.type !== "anchor");
      const chosenRotating = pickN(rotating, Math.min(2, rotating.length || 0), `rot:${dateKey}`);
      const selected = [...anchors, ...chosenRotating];

      const activePrompts = prompts.filter((p) => p.active);
      const prompt = pickWeighted(activePrompts, `prompt:${dateKey}`);
      const activePrinciples = princs.filter((p) => p.active);
      const principle = pickN(activePrinciples, 1, `principle:${dateKey}`)[0];

      const now = new Date();
      const day: PrimeDay = {
        date: dateKey,
        affirmations: selected.map((a) => ({ id: a.id, text: a.text, type: a.type, acknowledged: false })),
        principleOfDay: principle?.text,
        prompt: prompt
          ? { id: prompt.id, text: prompt.text, category: prompt.category }
          : { id: "none", text: "Walk me through your plan for the next three hours.", category: "concrete" },
        promptAcknowledged: false,
        createdAt: now,
        updatedAt: now,
      };
      await primeDaysApi.set(uid, dateKey, day);
      setToday(day);
    },
    [uid, dateKey]
  );

  // --- Persist a mutation to today's day ---
  const persistDay = useCallback(
    async (next: PrimeDay) => {
      if (!uid) return;
      const allAck =
        next.affirmations.every((a) => a.acknowledged) && next.promptAcknowledged;
      const withCompletion: PrimeDay = {
        ...next,
        completedAt: allAck ? next.completedAt ?? new Date() : undefined,
        updatedAt: new Date(),
      };
      setToday(withCompletion);
      // merge:false → overwrite, so clearing completedAt actually sticks.
      await primeDaysApi.set(uid, dateKey, withCompletion);
    },
    [uid, dateKey]
  );

  const acknowledgeAffirmation = useCallback(
    (id: string) => {
      if (!today) return;
      persistDay({
        ...today,
        affirmations: today.affirmations.map((a) =>
          a.id === id ? { ...a, acknowledged: true } : a
        ),
      });
    },
    [today, persistDay]
  );

  const acknowledgePrompt = useCallback(() => {
    if (!today) return;
    persistDay({ ...today, promptAcknowledged: true });
  }, [today, persistDay]);

  const resetToday = useCallback(() => {
    if (!today) return;
    persistDay({
      ...today,
      affirmations: today.affirmations.map((a) => ({ ...a, acknowledged: false })),
      promptAcknowledged: false,
      completedAt: undefined,
    });
  }, [today, persistDay]);

  const updateTimerFloor = useCallback(
    async (sec: number) => {
      setTimerFloorSec(sec);
      if (uid) await primeSettingsApi.set(uid, { timerFloorSec: sec });
    },
    [uid]
  );

  // --- Bank management ---
  const addAffirmation = useCallback(
    async (text: string, type: AffirmationType) => {
      if (!uid || !text.trim()) return;
      const now = new Date();
      const order = affirmationBank.length;
      await affirmationsApi.create(uid, { text: text.trim(), type, active: true, order, createdAt: now, updatedAt: now });
    },
    [uid, affirmationBank.length]
  );
  const updateAffirmation = useCallback(
    async (id: string, data: Partial<Affirmation>) => {
      if (!uid) return;
      await affirmationsApi.update(uid, id, { ...data, updatedAt: new Date() });
    },
    [uid]
  );
  const deleteAffirmation = useCallback(
    async (id: string) => {
      if (!uid) return;
      await affirmationsApi.delete(uid, id);
    },
    [uid]
  );

  const addPrompt = useCallback(
    async (text: string, category: "concrete" | "abstract") => {
      if (!uid || !text.trim()) return;
      const now = new Date();
      await promptsApi.create(uid, { text: text.trim(), category, weight: category === "abstract" ? 0.3 : 1, active: true, createdAt: now, updatedAt: now });
    },
    [uid]
  );
  const updatePrompt = useCallback(
    async (id: string, data: Partial<PrimePrompt>) => {
      if (!uid) return;
      await promptsApi.update(uid, id, { ...data, updatedAt: new Date() });
    },
    [uid]
  );
  const deletePrompt = useCallback(
    async (id: string) => {
      if (!uid) return;
      await promptsApi.delete(uid, id);
    },
    [uid]
  );

  const addPrinciple = useCallback(
    async (text: string) => {
      if (!uid || !text.trim()) return;
      const now = new Date();
      await principlesApi.create(uid, { text: text.trim(), active: true, createdAt: now, updatedAt: now });
    },
    [uid]
  );
  const updatePrinciple = useCallback(
    async (id: string, data: Partial<Principle>) => {
      if (!uid) return;
      await principlesApi.update(uid, id, { ...data, updatedAt: new Date() });
    },
    [uid]
  );
  const deletePrinciple = useCallback(
    async (id: string) => {
      if (!uid) return;
      await principlesApi.delete(uid, id);
    },
    [uid]
  );

  const loading = !ready;
  const done = Boolean(today?.completedAt);

  return {
    loading,
    today,
    done,
    timerFloorSec,
    affirmationBank,
    promptBank,
    principleBank,
    acknowledgeAffirmation,
    acknowledgePrompt,
    resetToday,
    updateTimerFloor,
    // bank management
    addAffirmation,
    updateAffirmation,
    deleteAffirmation,
    addPrompt,
    updatePrompt,
    deletePrompt,
    addPrinciple,
    updatePrinciple,
    deletePrinciple,
  };
}
