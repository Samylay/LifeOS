import { describe, it, expect } from "vitest";
import { calmCaption } from "./saved-snippet";

describe("calmCaption", () => {
  it("removes hashtag walls and keeps the words", () => {
    expect(calmCaption("Save this video please! #dota #dota2 #steam #дота2 #ggwp")).toBe("Save this video please!");
  });
  it("keeps text with no hashtags and collapses whitespace", () => {
    expect(calmCaption("A  caption\nwith   gaps")).toBe("A caption with gaps");
  });
});
