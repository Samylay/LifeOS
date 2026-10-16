// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pageShortcut } from "./keyboard";

const press = (key: string, init: Partial<KeyboardEvent> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, altKey: false, repeat: false, isComposing: false, defaultPrevented: false, target: null, ...init }) as KeyboardEvent;

describe("pageShortcut", () => {
  it("returns a plain key", () => expect(pageShortcut(press("a"))).toBe("a"));
  it.each([["ctrlKey"], ["metaKey"], ["altKey"]])("ignores %s combos (Ctrl+A is select all, not Approve)", (mod) => {
    expect(pageShortcut(press("a", { [mod]: true }))).toBeNull();
    expect(pageShortcut(press("x", { [mod]: true }))).toBeNull();
  });
  it("ignores a held key repeating", () => expect(pageShortcut(press("a", { repeat: true }))).toBeNull());
  it("ignores an event another handler already took", () => expect(pageShortcut(press("a", { defaultPrevented: true }))).toBeNull());
});
