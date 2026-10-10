// The 26-week Paris Marathon block from the vault note
// 04-Areas/Health/workout-plan.md (Mon 5 Oct 2026 to race day, Sun 4 Apr 2027).
// Keep the two in step: the note is the human-readable plan, this file drives
// the Training view and the watch push.

export const PLAN_START = "2026-10-05"; // a Monday
export const PLAN_WEEKS = 26;
export const RACE_DATE = "2027-04-04";

export type Zone = "easy" | "tempo" | "interval" | "none";
export interface Step {
  kind: "warmup" | "work" | "recovery" | "cooldown";
  seconds?: number;
  meters?: number;
  zone: Zone;
}
export interface Block { times: number; steps: Step[] }
export interface RunSpec { name: string; summary: string; blocks: Block[]; note?: string }
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

function longRun(km: number, note?: string): RunSpec {
  return {
    name: "Long run",
    summary: `${km} km easy${note ? `, ${note}` : ""}`,
    blocks: [{ times: 1, steps: [step("work", "easy", { meters: km * 1000 })] }],
    ...(note ? { note: note[0].toUpperCase() + note.slice(1) } : {}),
  };
}
const MARATHON_PACE_NOTE = "last 4 km at goal marathon pace (set after the 30 January 5k)";

// [Tuesday easy, Thursday, Saturday] for each week 1..26.
const RUN_WEEKS: [RunSpec, RunSpec, RunSpec][] = [
  /* 1 */ [easyRun(20), easyStrides(25), timeTrial()],
  /* 2 */ [easyRun(25), easyStrides(25), easyRun(30)],
  /* 3 */ [easyRun(25), tempoRepeats(2, 8), easyRun(35)],
  /* 4 */ [easyRun(30), tempoRepeats(3, 8), easyRun(40)],
  /* 5 */ [easyRun(30), intervals(4, 800), easyRun(45)],
  /* 6 */ [easyRun(30), tempoContinuous(20), easyRun(50)],
  /* 7 */ [easyRun(30), intervals(5, 800), easyRun(55)],
  /* 8 */ [easyRun(25), easyRun(25), easyRun(40)],
  /* 9 */ [easyRun(30), tempoRepeats(2, 12), easyRun(60)],
  /* 10 */ [easyRun(35), intervals(4, 1000), easyRun(65)],
  /* 11 */ [easyRun(35), tempoContinuous(25), easyRun(70)],
  /* 12 */ [easyRun(35), easyStrides(30), easyRun(50)],
  /* 13 */ [easyRun(35), intervals(5, 800), longRun(12)],
  /* 14 */ [easyRun(35), tempoContinuous(25), longRun(14)],
  /* 15 */ [easyRun(35), intervals(5, 1000), longRun(16)],
  /* 16 */ [easyRun(25), easyStrides(25), longRun(10)],
  /* 17 */ [easyRun(20), easyStrides(20), timeTrial()],
  /* 18 */ [easyRun(35), tempoContinuous(30), longRun(18)],
  /* 19 */ [easyRun(35), tempoRepeats(3, 10), longRun(20)],
  /* 20 */ [easyRun(40), tempoContinuous(30), longRun(22, MARATHON_PACE_NOTE)],
  /* 21 */ [easyRun(30), easyStrides(30), longRun(14)],
  /* 22 */ [easyRun(40), tempoRepeats(3, 10), longRun(26, MARATHON_PACE_NOTE)],
  /* 23 */ [easyRun(40), tempoContinuous(25), longRun(32)],
  /* 24 */ [easyRun(30), tempoContinuous(20), longRun(24)],
  /* 25 */ [easyRun(25), easyStrides(25), longRun(16)],
  /* 26 */ [easyStrides(25), easyStrides(20), easyRun(15)],
];
function runsForWeek(week: number): [RunSpec, RunSpec, RunSpec] {
  return RUN_WEEKS[Math.min(Math.max(week, 1), PLAN_WEEKS) - 1];
}
export const PHASE_LABEL = (week: number): string =>
  week === 1 ? "Test week" : week === 2 ? "Base" : week <= 4 ? "Tempo starts" : week <= 7 ? "Intervals start"
    : week === 8 || week === 12 || week === 16 || week === 21 ? "Lighter week" : week <= 11 ? "Build" : week <= 15 ? "Long runs in km"
    : week === 17 ? "Retest" : week <= 20 ? "Marathon build" : week <= 23 ? "Peak" : week <= 25 ? "Taper" : "Race week";

// Plyometrics (week 7 onward) sit at the start of Gym A; see the vault note.
function plyoLines(week: number): string[] {
  if (week >= 7 && week <= 10) return ["Warm-up: pogo hops 2 x 10, low box step-up and land 3 x 4"];
  if ((week >= 11 && week <= 16) || (week >= 18 && week <= 23)) return ["Warm-up: pogo hops 3 x 10, low box jump (step down) 3 x 4, A-skips 2 x 20 m"];
  if (week === 24) return ["Warm-up: pogo hops 2 x 10"];
  return [];
}

function gymA(week: number): Session {
  const test = week === 1;
  const lines = test
    ? ["Back squat: work up to one set of 5, 1 to 2 reps short of failure. Write the load down.",
       "Deadlift: same, one top set of 5.", "Lat pulldown 3 x 10", "Hollow hold: max seconds", "Hanging knee raises 3 x 8"]
    : week === 24
      ? [...plyoLines(week), "Back squat 2 x 6 to 8", "Deadlift 2 x 5", "Leg curl 2 x 10", "Standing calf raise 2 x 8 to 10",
         "Hanging knee raises to leg raises 2 x 8 to 10", "Hollow hold 2 x 20 to 30 s"]
    : week === 25
      ? ["Back squat 2 x 5 at about 70% of your week 17 load", "Deadlift 2 x 5 at about 70% of your week 17 load",
         "Standing calf raise 2 x 8", "Hollow hold 2 x 30 s"]
    : week === 26
      ? ["20 minutes, light. No squats or deadlifts: heavy legs stop 7 days before the race.", "Standing calf raise 2 x 8",
         "Hanging knee raises 2 x 8", "Hollow hold 2 x 30 s"]
    : [...plyoLines(week),
       "Back squat, full depth, 3 x 6 to 8", "Deadlift 3 x 5", "Leg curl 3 x 10, three seconds down",
       "Standing calf raise, stretch at the bottom, 3 x 8 to 10",
       "Hanging knee raises to leg raises 3 x 8 to 10", "Hollow hold 3 x 20 to 30 s, building to 60 s"];
  const taper = week >= 25;
  return { day: 0, kind: "gym", title: test ? "Gym A: test" : taper ? "Gym A: light" : "Gym A", summary: taper ? "Light, legs protected" : "Legs and core", lines };
}
function gymB(week: number): Session {
  const test = week === 1;
  const lines = test
    ? ["Bench press: work up to one set of 5, 1 to 2 reps short of failure.", "Overhead press: same, one top set of 5.",
       "Row 3 x 10", "Plank: max seconds", "Measure the middle split gap in cm"]
    : week === 24
      ? ["Bench press 2 x 6 to 8", "Seated cable row 2 x 8 to 10", "Overhead press 2 x 8", "Lat pulldown or assisted pull-ups 2 x 8 to 10",
         "Side plank 2 x 30 s each side"]
    : week === 25
      ? ["10-minute minimum session: top set of the bench press at your normal load, plus one core finisher."]
    : week === 26
      ? ["Optional. 10 minutes of mobility is enough. Rest, sleep and food matter more now."]
    : ["Bench press 3 x 6 to 8", "Seated cable row or chest-supported row, full stretch at the start, 3 x 8 to 10",
       "Overhead press 3 x 8", "Lat pulldown or assisted pull-ups 3 x 8 to 10",
       "Bulgarian split squat, full depth, 2 x 8 per leg", "Side plank 2 x 30 s each side"];
  const taper = week >= 25;
  return { day: 2, kind: "gym", title: test ? "Gym B: test" : week === 25 ? "Gym B: minimum" : week === 26 ? "Gym B: optional" : "Gym B", summary: taper ? "Minimum only" : "Upper body, light legs", lines };
}
// Friday: the bonus pull session in weeks 2 to 23, otherwise mobility only.
function friday(week: number): Session {
  if (week >= 2 && week <= 23) {
    return {
      day: 4, kind: "gym", title: "Gym C", summary: "Pull and core, then mobility. Skipped: mobility only",
      lines: ["Cable row 3 x 10 to 12", "Face pull 3 x 12 to 15", "Lat pulldown or assisted pull-ups 2 x 8 to 10, different grip from Wednesday",
        "Lateral raise 2 x 12", "Ab wheel or Pallof press 3 x 8 to 10", "No heavy leg work: Saturday is the long run", "Then 15 min mobility"],
    };
  }
  return {
    day: 4, kind: "mobility", title: "Mobility", summary: "Leg routine with contract-relax, 15 min",
    lines: ["Butterfly, frog stretch, straddle with 3 rounds of contract-relax", "Hamstrings 2 x 60 s", "Hip flexors 60 s per side",
      "Quads 60 s per side", "Calves and ankles 60 s per side", "Cossack squat 2 x 6 per side"],
  };
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

// Race day has no run spec, so nothing is pushed to the watch for it.
const RACE_DAY_SESSION: Session = {
  day: 6, kind: "run", title: "Paris Marathon", summary: "42.195 km, Sunday 4 April",
  lines: ["Fuel 60 g of carbohydrate per hour with the products tested on the long runs.", "First 5 km slower than goal pace.", "Nothing new on race day."],
};

export function sessionsForWeek(week: number): Session[] {
  const [tue, thu, sat] = runsForWeek(week);
  const run = (day: number, spec: RunSpec): Session => ({ day, kind: "run", title: spec.name, summary: spec.summary, lines: [...describeRun(spec), ...(spec.note ? [spec.note] : [])], run: spec });
  return [
    gymA(week),
    run(1, tue),
    gymB(week),
    run(3, thu),
    friday(week),
    run(5, sat),
    week === PLAN_WEEKS ? RACE_DAY_SESSION
      : { day: 6, kind: "rest", title: "Rest", summary: "10 min mobility", lines: ["Hip flexors 3 min", "Ankles and calves 3 min", "Straddle stretch 4 min"] },
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
  { label: "Leg mobility (toe touch, knee-to-wall, deep squat)", start: "measure in week 2", goal: "half each gap" },
  { label: "Paris Marathon, 4 Apr 2027", start: "longest run 2.4 km", goal: "finish healthy" },
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
