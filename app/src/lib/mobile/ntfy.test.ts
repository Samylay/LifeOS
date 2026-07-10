import { describe, it, expect } from "vitest";
import {
  NTFY_BASE_URL,
  NTFY_TOPIC,
  subscribeUrl,
  channelForPriority,
  parseNtfyEvent,
  CHANNEL_URGENT,
  CHANNEL_DEFAULT,
  CHANNEL_LOW,
} from "./ntfy";

describe("subscribeUrl", () => {
  it("subscribes to the homelab topic's JSON stream on the self-hosted instance", () => {
    expect(subscribeUrl()).toBe(`${NTFY_BASE_URL}/${NTFY_TOPIC}/json`);
  });

  it("replays missed messages via since=<last id>", () => {
    expect(subscribeUrl("AbC123xY")).toBe(`${NTFY_BASE_URL}/${NTFY_TOPIC}/json?since=AbC123xY`);
  });

  it("URL-encodes a hostile since id instead of letting it mangle the query", () => {
    expect(subscribeUrl("a&b=c")).toContain("?since=a%26b%3Dc");
  });

  it("null since behaves like no since (SharedPreferences default)", () => {
    expect(subscribeUrl(null)).toBe(subscribeUrl());
  });
});

describe("channelForPriority (mirrors /api/notify's severity -> ntfy priority table)", () => {
  it("page severity (ntfy urgent=5 / high=4) heads-up channel", () => {
    expect(channelForPriority(5)).toBe(CHANNEL_URGENT);
    expect(channelForPriority(4)).toBe(CHANNEL_URGENT);
  });

  it("info severity (default=3) default channel", () => {
    expect(channelForPriority(3)).toBe(CHANNEL_DEFAULT);
  });

  it("low severity (min=1 / low=2) silent channel", () => {
    expect(channelForPriority(1)).toBe(CHANNEL_LOW);
    expect(channelForPriority(2)).toBe(CHANNEL_LOW);
  });
});

describe("parseNtfyEvent", () => {
  const message = {
    id: "hwQ2YpKdmg",
    time: 1752069600,
    event: "message",
    topic: "homelab",
    title: "LifeOS · nightly",
    message: "🌙 autoloop night run: ✅ lifeos",
    priority: 3,
  };

  it("parses a real message event", () => {
    expect(parseNtfyEvent(JSON.stringify(message))).toEqual({
      id: "hwQ2YpKdmg",
      time: 1752069600,
      title: "LifeOS · nightly",
      message: "🌙 autoloop night run: ✅ lifeos",
      priority: 3,
    });
  });

  it("defaults priority to 3 and title to null when absent (ntfy omits defaults)", () => {
    const { title: _t, priority: _p, ...bare } = message;
    const parsed = parseNtfyEvent(JSON.stringify(bare));
    expect(parsed?.priority).toBe(3);
    expect(parsed?.title).toBeNull();
  });

  it("ignores keepalive and open events (never notifications)", () => {
    expect(
      parseNtfyEvent(JSON.stringify({ id: "k1", time: 1, event: "keepalive", topic: "homelab" }))
    ).toBeNull();
    expect(
      parseNtfyEvent(JSON.stringify({ id: "o1", time: 1, event: "open", topic: "homelab" }))
    ).toBeNull();
  });

  it("ignores malformed lines and messages missing id or body", () => {
    expect(parseNtfyEvent("not json {")).toBeNull();
    expect(parseNtfyEvent("null")).toBeNull();
    expect(parseNtfyEvent('"a string"')).toBeNull();
    expect(parseNtfyEvent(JSON.stringify({ ...message, message: "" }))).toBeNull();
    expect(parseNtfyEvent(JSON.stringify({ ...message, id: undefined }))).toBeNull();
  });
});
