import { describe, it, expect } from "vitest";
import { parseSpokenDestination, classify, route, type VoiceDestination } from "./voice-routing";

describe("parseSpokenDestination — recognising a named destination, deterministically", () => {
  it("returns null when the transcript opens with none of the spoken prefixes", () => {
    // No model call backs this: an unrecognised opening must fall through to
    // classify(), not be guessed at here.
    expect(parseSpokenDestination("I was thinking about the marathon plan")).toBeNull();
  });

  const cases: Array<{ name: string; transcript: string; destination: VoiceDestination; text: string }> = [
    { name: "content idea, colon", transcript: "content idea: a reel about morning routines", destination: "idea-bank", text: "a reel about morning routines" },
    { name: "content idea, no punctuation", transcript: "content idea a reel about morning routines", destination: "idea-bank", text: "a reel about morning routines" },
    { name: "shouted casing", transcript: "CONTENT IDEA: a reel about morning routines", destination: "idea-bank", text: "a reel about morning routines" },
    { name: "task, colon", transcript: "task: buy milk", destination: "todoist", text: "buy milk" },
    { name: "task, dash", transcript: "Task - buy milk", destination: "todoist", text: "buy milk" },
    { name: "task, comma", transcript: "task, buy milk", destination: "todoist", text: "buy milk" },
    { name: "decide, colon", transcript: "decide: do I keep the second bike", destination: "decide", text: "do I keep the second bike" },
    { name: "decide, no punctuation", transcript: "Decide do I keep the second bike", destination: "decide", text: "do I keep the second bike" },
    { name: "note, colon", transcript: "note: thinking out loud about the offsite", destination: "vault", text: "thinking out loud about the offsite" },
  ];

  for (const c of cases) {
    it(`recognises "${c.name}"`, () => {
      const result = parseSpokenDestination(c.transcript);
      expect(result).toEqual({ destination: c.destination, text: c.text });
    });
  }

  it("strips the prefix so it never survives into the text handed to the destination", () => {
    const result = parseSpokenDestination("task: call the dentist");
    expect(result?.text).not.toMatch(/task/i);
  });
});

describe("classify — judging a transcript that named no destination", () => {
  it("always returns a destination from the closed set, never an unknown outcome", () => {
    const result = classify("the weather was nice today so I went for a run");
    expect(["vault", "todoist", "idea-bank", "decide"]).toContain(result.destination);
  });

  it("falls back to the vault note when nothing in the words gives it away", () => {
    // Story 5 is a hard rule: unclassifiable thinking-out-loud is not lost,
    // and it is never surfaced as an error or an "unrouted" state.
    const result = classify("just rambling about nothing in particular");
    expect(result.destination).toBe("vault");
  });

  it("classifies a decision question as the decide queue", () => {
    const result = classify("should I keep paying for the second bike or sell it");
    expect(result.destination).toBe("decide");
  });

  it("classifies a spoken action as a Todoist task", () => {
    const result = classify("remind me to call the dentist");
    expect(result.destination).toBe("todoist");
  });

  it("classifies a content mention as an idea bank entry", () => {
    const result = classify("I have a video idea about morning routines");
    expect(result.destination).toBe("idea-bank");
  });

  it("attaches a due parameter when the classified action carries a time", () => {
    const result = classify("remind me to call the dentist tomorrow");
    expect(result.destination).toBe("todoist");
    expect(result.params).toMatchObject({ due: "tomorrow" });
  });
});

describe("route — the one entry point, always yielding exactly one destination", () => {
  it("lets a spoken destination beat the classifier even when the words point elsewhere", () => {
    // The content is task-shaped ("remind me to"), but the explicit "decide:"
    // prefix must win — explicit intent is never second-guessed.
    const result = route("decide: remind me to call the dentist");
    expect(result.destination).toBe("decide");
  });

  it("classifies when the transcript names no destination", () => {
    const result = route("I have a video idea about morning routines");
    expect(result.destination).toBe("idea-bank");
  });

  it("routes empty input to the vault note rather than erroring", () => {
    const result = route("");
    expect(result.destination).toBe("vault");
  });

  it("routes whitespace-only input to the vault note rather than erroring", () => {
    const result = route("   \n\t  ");
    expect(result.destination).toBe("vault");
  });

  it("attaches a due parameter from a spoken task carrying a day name", () => {
    const result = route("task: submit the report Friday");
    expect(result.destination).toBe("todoist");
    expect(result.params).toMatchObject({ due: "Friday" });
  });

  it("leaves the due parameter undefined when no time was spoken", () => {
    const result = route("task: buy milk");
    expect(result.destination).toBe("todoist");
    expect(result.params).toMatchObject({ due: undefined });
  });

  it("never leaves ambient words free-form: idea-bank and decide carry no untyped payload", () => {
    // Every destination's params are a typed struct, never a bare string a
    // downstream agent could be handed as an instruction.
    const idea = route("content idea: a reel about morning routines");
    expect(Object.keys(idea.params)).not.toContain("text");
    const decision = route("decide: do I keep the second bike");
    expect(Object.keys(decision.params)).not.toContain("text");
  });

  it("carries the transcript text separately from the params on every destination", () => {
    for (const transcript of [
      "note: thinking out loud",
      "task: buy milk",
      "content idea: a reel",
      "decide: do I keep the bike",
      "just rambling",
    ]) {
      const result = route(transcript);
      expect(typeof result.text).toBe("string");
    }
  });
});
