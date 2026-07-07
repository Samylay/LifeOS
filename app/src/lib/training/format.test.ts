import { describe, expect, it } from "vitest";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  isFootSport,
} from "./format";

describe("formatDistance", () => {
  it("renders sub-km in meters", () => {
    expect(formatDistance(500)).toBe("500 m");
    expect(formatDistance(999)).toBe("999 m");
  });
  it("renders km with adaptive precision", () => {
    expect(formatDistance(5000)).toBe("5.00 km");
    expect(formatDistance(15000)).toBe("15.0 km");
    expect(formatDistance(150000)).toBe("150 km");
  });
  it("handles null/undefined", () => {
    expect(formatDistance(null)).toBe("—");
    expect(formatDistance(undefined)).toBe("—");
  });
});

describe("formatDuration", () => {
  it("renders hours-minutes-seconds", () => {
    expect(formatDuration(3661)).toBe("1h 01m 01s");
    expect(formatDuration(125)).toBe("2m 05s");
    expect(formatDuration(45)).toBe("45s");
  });
});

describe("formatPace", () => {
  it("converts mps to min/km", () => {
    // 3 m/s => 1000/3 = 333.33s => 5:33 /km
    expect(formatPace(3)).toBe("5:33 /km");
    // 4 m/s => 250s => 4:10 /km
    expect(formatPace(4)).toBe("4:10 /km");
  });
  it("handles invalid", () => {
    expect(formatPace(0)).toBe("—");
    expect(formatPace(null)).toBe("—");
  });
});

describe("formatSpeed", () => {
  it("converts mps to km/h", () => {
    expect(formatSpeed(10)).toBe("36.0 km/h");
    expect(formatSpeed(5)).toBe("18.0 km/h");
  });
});

describe("isFootSport", () => {
  it("recognizes foot sports", () => {
    expect(isFootSport("Run")).toBe(true);
    expect(isFootSport("TrailRun")).toBe(true);
    expect(isFootSport("Hike")).toBe(true);
    expect(isFootSport("Ride")).toBe(false);
    expect(isFootSport("Swim")).toBe(false);
  });
});
