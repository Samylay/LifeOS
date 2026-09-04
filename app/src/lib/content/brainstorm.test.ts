import { describe, it, expect } from "vitest";
import {
  buildBrainstormPrompt,
  validateBrainstorm,
  type BrainstormIdea,
  type ContentTypeRef,
} from "./brainstorm";

const IDEA: BrainstormIdea = {
  title: "Why my agent kept picking the wrong branch",
  body: "I noticed it always took the first match.",
  contentType: "under-the-hood",
};

const CATALOG: ContentTypeRef[] = [
  { key: "under-the-hood", label: "Concept" },
  { key: "build-log", label: "Built It" },
  { key: "workflow-win", label: "Gotcha" },
];

const HOOKS = [
  { n: 1, name: "The mistake", template: "I spent __ doing __ wrong" },
  { n: 2, name: "The number", template: "__ out of __ of my __ were __" },
];

describe("buildBrainstormPrompt — asks for help, never for prose", () => {
  const prompt = buildBrainstormPrompt(IDEA, { types: CATALOG, hooks: HOOKS });

  it("asks for angles, questions, a type fit and candidate hooks", () => {
    expect(prompt).toMatch(/angle/i);
    expect(prompt).toMatch(/question/i);
    expect(prompt).toMatch(/content type|type fit/i);
    expect(prompt).toMatch(/hook/i);
  });

  it("never asks for a script, a caption or hashtags", () => {
    // The rejected premise of this whole vertical was being handed postable
    // text. The prompt must not even request it.
    expect(prompt).not.toMatch(/write (a|the) script/i);
    expect(prompt).not.toMatch(/\bcaption\b/i);
    expect(prompt).not.toMatch(/\bhashtag/i);
    expect(prompt).not.toMatch(/read aloud|voiceover|ghost-draft/i);
  });

  it("states the rule to the model in plain terms", () => {
    expect(prompt).toMatch(/not write|never write|do not write/i);
  });

  it("carries the idea and the catalog it must choose from", () => {
    expect(prompt).toContain(IDEA.title);
    expect(prompt).toContain("under-the-hood");
    expect(prompt).toContain("Gotcha");
    expect(prompt).toContain("The mistake");
  });

  it("works for an unsorted idea with no content type", () => {
    // /decide files idea-bank cards with no type. That is expected, not an error.
    const p = buildBrainstormPrompt({ title: "A thought", body: "", contentType: "" },
      { types: CATALOG, hooks: HOOKS });
    expect(p).toContain("A thought");
    expect(p).toMatch(/angle/i);
  });

  it("works with an empty catalog rather than throwing", () => {
    expect(() => buildBrainstormPrompt(IDEA, { types: [], hooks: [] })).not.toThrow();
  });
});

describe("validateBrainstorm — the house law, enforced not trusted", () => {
  const good = {
    angles: ["Frame it as a debugging story", "Lead with the wrong assumption"],
    questions: ["What did you expect it to pick?", "How long did it take to spot?"],
    contentType: "under-the-hood",
    hooks: [1],
  };

  it("accepts structured angles and questions", () => {
    const r = validateBrainstorm(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.angles).toHaveLength(2);
      expect(r.value.questions).toHaveLength(2);
      expect(r.value.contentType).toBe("under-the-hood");
    }
  });

  it("accepts a response with no type or hooks — those are suggestions", () => {
    const r = validateBrainstorm({ angles: ["one"], questions: [] });
    expect(r.ok).toBe(true);
  });

  // These are the cases the vertical died of. If any of them starts passing,
  // the app can hand Samy something postable again.
  const postable: Array<[string, unknown]> = [
    ["a script field", { ...good, script: "Hook: I spent three days..." }],
    ["a caption field", { ...good, caption: "Here is what I learned 👇" }],
    ["a hashtag block", { ...good, hashtags: ["#buildinpublic", "#ai"] }],
    ["hashtags inside an angle", { ...good, angles: ["Open with #buildinpublic energy"] }],
    ["script beats in an angle", {
      ...good,
      angles: ["HOOK: I spent 3 days on this.\nBEAT 1: here is the setup.\nBEAT 2: the fix."],
    }],
    ["a voiceover direction", { ...good, angles: ["(read aloud) So here's the thing, right"] }],
    ["prose long enough to be a script", {
      ...good,
      angles: ["So ".repeat(200)],
    }],
  ];

  for (const [name, response] of postable) {
    it(`rejects ${name}`, () => {
      const r = validateBrainstorm(response);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBeTruthy();
    });
  }

  it("rejects a response that is not an object at all", () => {
    for (const junk of [null, undefined, "a string", 42, []]) {
      expect(validateBrainstorm(junk).ok).toBe(false);
    }
  });

  it("rejects a response with nothing useful in it", () => {
    // Returning an empty shell is a failure, not a valid brainstorm — the
    // done bar is that Samy gets back something he did not have.
    expect(validateBrainstorm({ angles: [], questions: [] }).ok).toBe(false);
  });

  it("never returns rejected content alongside the failure", () => {
    const r = validateBrainstorm({ angles: ["fine"], script: "postable text" });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("postable text");
  });
});
