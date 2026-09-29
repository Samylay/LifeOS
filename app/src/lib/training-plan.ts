// The 17-week block from the vault note 04-Areas/Health/workout-plan.md
// (Mon 5 Oct 2026 to Sun 31 Jan 2027). Keep the two in step: the note is the
// human-readable plan, this file drives the Training view and the watch push.

export const PLAN_START = "2026-10-05"; // a Monday
export const PLAN_WEEKS = 17;

export type Zone = "easy" | "tempo" | "interval" | "none";
export interface Step {
  kind: "warmup" | "work" | "recovery" | "cooldown";
  seconds?: number;
  meters?: number;
  zone: Zone;
}
export interface Block { times: number; steps: Step[] }
export interface RunSpec { name: string; summary: string; blocks: Block[] }
export interface Session {
  day: number; // 0 = Monday
  kind: "gym" | "run" | "mobility" | "rest";
  title: string;
  summary: string;
  lines: string[];
  run?: RunSpec;
}

// Paces in seconds per km, from the 5k of 25:00 on 5 May 2026 (VDOT 38).
// Reset after the week 1 time trial.
export const PACE_SEC_PER_KM: Record<Exclude<Zone, "none">, [fast: number, slow: number]> = {
  easy: [379, 417],
  tempo: [311, 321],
  interval: [286, 296],
};

export function formatPace(secPerKm: number): string {
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, "0")}`;
}
function zoneLabel(zone: Zone): string {
  if (zone === "none") return "by feel";
  if (zone === "easy") return `${formatPace(PACE_SEC_PER_KM.easy[0])} to ${formatPace(PACE_SEC_PER_KM.easy[1])}/km`;
  const [fast, slow] = PACE_SEC_PER_KM[zone];
  return `${formatPace(Math.round((fast + slow) / 2))}/km`;
}

const step = (kind: Step["kind"], zone: Zone, amount: { seconds?: number; meters?: number }): Step => ({ kind, zone, ...amount });
const min = (m: number) => ({ seconds: m * 60 });

function easyRun(minutes: number): RunSpec {
  return { name: "Easy run", summary: `${minutes} min easy`, blocks: [{ times: 1, steps: [step("work", "easy", min(minutes))] }] };
}
function easyStrides(minutes: number): RunSpec {
  return {
    name: "Easy run and strides",
    summary: `${minutes} min easy, then 4 strides`,
    blocks: [
      { times: 1, steps: [step("work", "easy", min(minutes))] },
      { times: 4, steps: [step("work", "interval", { seconds: 20 }), step("recovery", "easy", { seconds: 70 })] },
    ],
  };
}
function tempoRepeats(times: number, minutes: number): RunSpec {
  return {
    name: "Tempo",
    summary: `${times} x ${minutes} min at tempo`,
    blocks: [
      { times: 1, steps: [step("warmup", "easy", min(5))] },
      { times, steps: [step("work", "tempo", min(minutes)), step("recovery", "easy", min(2))] },
      { times: 1, steps: [step("cooldown", "easy", min(5))] },
    ],
  };
}
function tempoContinuous(minutes: number): RunSpec {
  return {
    name: "Tempo",
    summary: `${minutes} min continuous at tempo`,
    blocks: [
      { times: 1, steps: [step("warmup", "easy", min(5))] },
      { times: 1, steps: [step("work", "tempo", min(minutes))] },
      { times: 1, steps: [step("cooldown", "easy", min(5))] },
    ],
  };
}
function intervals(times: number, meters: number): RunSpec {
  return {
    name: "Intervals",
    summary: `${times} x ${meters} m at 5k effort`,
    blocks: [
      { times: 1, steps: [step("warmup", "easy", min(10))] },
      { times, steps: [step("work", "interval", { meters }), step("recovery", "easy", min(2))] },
      { times: 1, steps: [step("cooldown", "easy", min(10))] },
    ],
  };
}
function timeTrial(): RunSpec {
  return {
    name: "5k time trial",
    summary: "5k steady-hard, by feel, not all-out",
    blocks: [
      { times: 1, steps: [step("warmup", "easy", min(10))] },
      { times: 1, steps: [step("work", "none", { meters: 5000 })] },
      { times: 1, steps: [step("cooldown", "easy", min(5))] },
    ],
  };
}

// [Tuesday easy, Thursday, Saturday] for each week 1..17.
function runsForWeek(week: number): [RunSpec, RunSpec, RunSpec] {
  if (week === 1) return [easyRun(20), easyStrides(25), timeTrial()];
  if (week === 2) return [easyRun(25), easyStrides(25), easyRun(30)];
  if (week === 3) return [easyRun(25), tempoRepeats(2, 8), easyRun(30)];
  if (week === 4) return [easyRun(30), tempoRepeats(3, 8), easyRun(30)];
  if (week === 5) return [easyRun(30), tempoRepeats(3, 8), intervals(4, 800)];
  if (week === 6) return [easyRun(30), tempoContinuous(20), intervals(5, 800)];
  if (week === 7) return [easyRun(30), tempoContinuous(20), intervals(6, 800)];
  if (week === 8) return [easyRun(25), easyRun(25), easyRun(25)];
  if (week === 9) return [easyRun(30), tempoRepeats(2, 12), intervals(4, 1000)];
  if (week === 10) return [easyRun(35), tempoRepeats(2, 12), intervals(5, 1000)];
  if (week === 11) return [easyRun(35), tempoContinuous(25), intervals(4, 1000)];
  if (week === 12) return [easyRun(35), tempoContinuous(25), intervals(5, 1000)];
  if (week === 13 || week === 15) return [easyRun(35), tempoContinuous(25), intervals(6, 800)];
  if (week === 14 || week === 16) return [easyRun(35), tempoContinuous(25), intervals(5, 1000)];
  return [easyRun(20), easyStrides(20), timeTrial()];
}

export const PHASE_LABEL = (week: number): string =>
  week === 1 ? "Test week" : week === 2 ? "Base" : week <= 4 ? "Tempo starts" : week <= 7 ? "Intervals start"
    : week === 8 ? "Lighter week" : week <= 12 ? "Build" : week <= 16 ? "Sharpen" : "Retest";

function gymA(week: number): Session {
  const test = week === 1;
  const lines = test
    ? ["Back squat: work up to one set of 5, 1 to 2 reps short of failure. Write the load down.",
       "Deadlift: same, one top set of 5.", "Lat pulldown 3 x 10", "Hollow hold: max seconds", "Hanging knee raises 3 x 8"]
    : [...(week >= 7 ? ["Warm-up: pogo hops 2 x 10, low box step-up and land 3 x 4"] : []),
       "Back squat 3 x 6 to 8", "Deadlift 3 x 5", "Lat pulldown or assisted pull-ups 3 x 8 to 10",
       "Hanging knee raises to leg raises 3 x 8 to 10", "Hollow hold 3 x 20 to 30 s, building to 60 s"];
  return { day: 0, kind: "gym", title: test ? "Gym A: test" : "Gym A", summary: "Lower body, pull, core", lines };
}
function gymB(week: number): Session {
  const test = week === 1;
  const lines = test
    ? ["Bench press: work up to one set of 5, 1 to 2 reps short of failure.", "Overhead press: same, one top set of 5.",
       "Row 3 x 10", "Plank: max seconds", "Measure the middle split gap in cm"]
    : ["Bench press 3 x 6 to 8", "Overhead press 3 x 8", "Barbell or dumbbell row 3 x 10", "Lateral raise 2 x 12",
       "Ab wheel or Pallof press 3 x 8 to 10", "Side plank 2 x 30 s each side"];
  return { day: 2, kind: "gym", title: test ? "Gym B: test" : "Gym B", summary: "Upper body, core", lines };
}

function amount(s: Step): string {
  if (s.meters) return `${s.meters} m`;
  const sec = s.seconds ?? 0;
  return sec < 60 ? `${sec} s` : `${Math.round((sec / 60) * 10) / 10} min`;
}

function describeRun(spec: RunSpec): string[] {
  return spec.blocks.map((b) => {
    const parts = b.steps.map((s) =>
      s.kind === "recovery" ? `${amount(s)} jog`
        : s.kind === "warmup" ? `${amount(s)} warm-up`
        : s.kind === "cooldown" ? `${amount(s)} cool-down`
        : `${amount(s)} at ${zoneLabel(s.zone)}`);
    return b.times > 1 ? `${b.times} x (${parts.join(", ")})` : parts.join(", ");
  });
}

export function sessionsForWeek(week: number): Session[] {
  const [tue, thu, sat] = runsForWeek(week);
  const run = (day: number, spec: RunSpec): Session => ({ day, kind: "run", title: spec.name, summary: spec.summary, lines: describeRun(spec), run: spec });
  return [
    gymA(week),
    run(1, tue),
    gymB(week),
    run(3, thu),
    { day: 4, kind: "mobility", title: "Mobility", summary: "Middle split routine, 15 min", lines: ["Butterfly 2 x 60 s", "Frog stretch 2 x 60 s", "Straddle stretch with contract-relax 3 rounds", "Cossack squat 2 x 6 per side"] },
    run(5, sat),
    { day: 6, kind: "rest", title: "Rest", summary: "10 min mobility", lines: ["Hip flexors 3 min", "Ankles 3 min", "Straddle stretch 4 min"] },
  ];
}

export const TARGETS = [
  { label: "Bodyweight", start: "84 kg", goal: "82 kg" },
  { label: "5k", start: "25:00", goal: "23:30" },
  { label: "Bench 5-rep max", start: "about 57 kg", goal: "70 kg" },
  { label: "Overhead press 5-rep max", start: "about 29 kg", goal: "37.5 kg" },
  { label: "Deadlift 5-rep max", start: "about 53 kg", goal: "80 kg" },
  { label: "Hollow hold", start: "untested", goal: "60 s" },
  { label: "Middle split", start: "measure in week 1", goal: "half the gap" },
];

// Local calendar date as YYYY-MM-DD in Europe/Paris.
export function localDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);
}
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

export function planPosition(now: Date = new Date()): { state: "before" | "active" | "after"; week: number; day: number } {
  const offset = dayNumber(localDate(now)) - dayNumber(PLAN_START);
  if (offset < 0) return { state: "before", week: 1, day: 0 };
  const week = Math.floor(offset / 7) + 1;
  if (week > PLAN_WEEKS) return { state: "after", week: PLAN_WEEKS, day: 0 };
  return { state: "active", week, day: offset % 7 };
}

export function dateOfSession(week: number, day: number): string {
  const d = new Date((dayNumber(PLAN_START) + (week - 1) * 7 + day) * 86_400_000);
  return d.toISOString().slice(0, 10);
}
