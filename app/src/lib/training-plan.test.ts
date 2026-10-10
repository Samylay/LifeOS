import { describe, expect, it } from "vitest";
import { PLAN_WEEKS, RACE_DATE, dateOfSession, planPosition, sessionsForWeek } from "./training-plan";

describe("training plan", () => {
  it("places dates relative to the Monday 5 Oct 2026 start", () => {
    expect(planPosition(new Date("2026-10-04T10:00:00Z")).state).toBe("before");
    expect(planPosition(new Date("2026-10-05T06:00:00Z"))).toEqual({ state: "active", week: 1, day: 0 });
    expect(planPosition(new Date("2026-10-15T10:00:00Z"))).toEqual({ state: "active", week: 2, day: 3 });
    expect(planPosition(new Date("2027-01-31T10:00:00Z"))).toEqual({ state: "active", week: 17, day: 6 });
    expect(planPosition(new Date("2027-04-04T10:00:00Z"))).toEqual({ state: "active", week: 26, day: 6 });
    expect(planPosition(new Date("2027-04-05T10:00:00Z")).state).toBe("after");
    expect(dateOfSession(17, 6)).toBe("2027-01-31");
    expect(dateOfSession(PLAN_WEEKS, 6)).toBe(RACE_DATE);
    expect(RACE_DATE).toBe("2027-04-04");
    expect(dateOfSession(1, 0)).toBe("2026-10-05");
  });

  it("gives every week seven sessions with the agreed running order", () => {
    for (let week = 1; week <= PLAN_WEEKS; week++) {
      const s = sessionsForWeek(week);
      const friday = week >= 2 && week <= 23 ? "gym" : "mobility";
      expect(s.map((x) => x.kind)).toEqual(["gym", "run", "gym", "run", friday, "run", week === PLAN_WEEKS ? "run" : "rest"]);
    }
  });

  it("ends on Paris Marathon race day, which is not pushed to the watch", () => {
    const race = sessionsForWeek(PLAN_WEEKS)[6];
    expect(race.title).toBe("Paris Marathon");
    expect(race.run).toBeUndefined();
  });

  it("ramps runs: 5k test week 1, tempo from week 3, intervals from week 5, long run on Saturday", () => {
    expect(sessionsForWeek(1)[5].title).toBe("5k time trial");
    expect(sessionsForWeek(2)[3].title).toBe("Easy run and strides");
    expect(sessionsForWeek(3)[3].title).toBe("Tempo");
    expect(sessionsForWeek(4)[5].title).toBe("Easy run");
    expect(sessionsForWeek(5)[3].title).toBe("Intervals");
    expect(sessionsForWeek(8).filter((x) => x.kind === "run").every((x) => x.title === "Easy run")).toBe(true);
    expect(sessionsForWeek(17)[5].title).toBe("5k time trial");
  });

  it("builds the long run to a 32 km peak three weeks before the race, then tapers", () => {
    const long = (week: number) => sessionsForWeek(week)[5].run!.blocks[0].steps[0].meters;
    expect(long(13)).toBe(12_000);
    expect(long(15)).toBe(16_000);
    expect(long(23)).toBe(32_000);
    expect(dateOfSession(23, 5)).toBe("2027-03-13");
    expect(long(24)).toBe(24_000);
    expect(long(25)).toBe(16_000);
    const peak = Math.max(...Array.from({ length: PLAN_WEEKS - 1 }, (_, i) => long(i + 1) ?? 0));
    expect(peak).toBe(32_000);
  });

  it("marks the marathon-pace long runs with a note", () => {
    expect(sessionsForWeek(20)[5].lines.join()).toMatch(/goal marathon pace/);
    expect(sessionsForWeek(22)[5].lines.join()).toMatch(/goal marathon pace/);
    expect(sessionsForWeek(23)[5].lines.join()).not.toMatch(/goal marathon pace/);
  });

  it("runs plyometrics from week 7, pauses at the retest, and drops them in the last two weeks", () => {
    expect(sessionsForWeek(6)[0].lines.join()).not.toMatch(/pogo/);
    expect(sessionsForWeek(7)[0].lines.join()).toMatch(/pogo hops 2 x 10/);
    expect(sessionsForWeek(11)[0].lines.join()).toMatch(/pogo hops 3 x 10/);
    expect(sessionsForWeek(17)[0].lines.join()).not.toMatch(/pogo/);
    expect(sessionsForWeek(23)[0].lines.join()).toMatch(/pogo hops 3 x 10/);
    expect(sessionsForWeek(25)[0].lines.join()).not.toMatch(/pogo/);
    expect(sessionsForWeek(26)[0].lines.join()).not.toMatch(/pogo/);
  });

  it("adds a pull-biased Gym C on Friday with no heavy leg work, and drops it in the taper", () => {
    const fri = sessionsForWeek(5)[4];
    expect(fri.title).toBe("Gym C");
    expect(fri.lines.join()).toMatch(/Cable row/);
    expect(fri.lines.join()).not.toMatch(/squat|Deadlift/i);
    expect(sessionsForWeek(1)[4].kind).toBe("mobility");
    expect(sessionsForWeek(24)[4].kind).toBe("mobility");
  });

  it("pulls more than it pushes across Wednesday and Friday", () => {
    const text = [...sessionsForWeek(5)[2].lines, ...sessionsForWeek(5)[4].lines].join("\n");
    const sets = (re: RegExp) => (text.match(re) ?? []).reduce((n, line) => n + Number(line.match(/(\d+) x/)?.[1] ?? 0), 0);
    const pull = sets(/(row|pulldown|pull-ups|Face pull)[^\n]* \d+ x/gi);
    const push = sets(/(Bench press|Overhead press|Lateral raise)[^\n]* \d+ x/gi);
    expect(pull).toBeGreaterThan(push);
  });

  it("keeps heavy legs out of race week", () => {
    expect(sessionsForWeek(26)[0].lines.join()).toMatch(/No squats or deadlifts/);
    expect(sessionsForWeek(26)[0].lines.join()).not.toMatch(/Back squat/);
  });

  it("describes a tempo session in readable steps", () => {
    expect(sessionsForWeek(3)[3].lines).toEqual(["5 min warm-up", "2 x (8 min at 5:16/km, 2 min jog)", "5 min cool-down"]);
  });
});
