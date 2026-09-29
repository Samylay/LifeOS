import { describe, expect, it } from "vitest";
import { PLAN_WEEKS, dateOfSession, planPosition, sessionsForWeek } from "./training-plan";

describe("training plan", () => {
  it("places dates relative to the Monday 5 Oct 2026 start", () => {
    expect(planPosition(new Date("2026-10-04T10:00:00Z")).state).toBe("before");
    expect(planPosition(new Date("2026-10-05T06:00:00Z"))).toEqual({ state: "active", week: 1, day: 0 });
    expect(planPosition(new Date("2026-10-15T10:00:00Z"))).toEqual({ state: "active", week: 2, day: 3 });
    expect(planPosition(new Date("2027-01-31T10:00:00Z"))).toEqual({ state: "active", week: 17, day: 6 });
    expect(planPosition(new Date("2027-02-01T10:00:00Z")).state).toBe("after");
    expect(dateOfSession(17, 6)).toBe("2027-01-31");
    expect(dateOfSession(1, 0)).toBe("2026-10-05");
  });

  it("gives every week seven sessions with the agreed running order", () => {
    for (let week = 1; week <= PLAN_WEEKS; week++) {
      const s = sessionsForWeek(week);
      expect(s.map((x) => x.kind)).toEqual(["gym", "run", "gym", "run", "mobility", "run", "rest"]);
    }
  });

  it("ramps runs: 5k test week 1, tempo from week 3, intervals from week 5", () => {
    expect(sessionsForWeek(1)[5].title).toBe("5k time trial");
    expect(sessionsForWeek(2)[3].title).toBe("Easy run and strides");
    expect(sessionsForWeek(3)[3].title).toBe("Tempo");
    expect(sessionsForWeek(4)[5].title).toBe("Easy run");
    expect(sessionsForWeek(5)[5].title).toBe("Intervals");
    expect(sessionsForWeek(8).filter((x) => x.kind === "run").every((x) => x.title === "Easy run")).toBe(true);
    expect(sessionsForWeek(17)[5].title).toBe("5k time trial");
  });

  it("starts plyometrics in week 7", () => {
    expect(sessionsForWeek(6)[0].lines.join()).not.toMatch(/pogo/);
    expect(sessionsForWeek(7)[0].lines.join()).toMatch(/pogo/);
  });

  it("describes a tempo session in readable steps", () => {
    expect(sessionsForWeek(3)[3].lines).toEqual(["5 min warm-up", "2 x (8 min at 5:16/km, 2 min jog)", "5 min cool-down"]);
  });
});
