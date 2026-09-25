import { describe, expect, it } from "vitest";
import { validateChatInput } from "./chat-input";

describe("validateChatInput", () => {
  it.each([
    "  keep leading and trailing whitespace  ",
    "Punctuation?! <raw> & casing",
    "line one\n\tline two",
  ])("preserves raw message content: %j", (message) => {
    expect(validateChatInput(message)).toBe(message);
  });

  it("still rejects whitespace-only input", () => {
    expect(validateChatInput(" \n\t ")).toBeNull();
  });
});
