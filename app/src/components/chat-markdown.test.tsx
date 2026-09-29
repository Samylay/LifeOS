import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMarkdown } from "./chat-markdown";

describe("ChatMarkdown", () => {
  it("renders model HTML as text and rejects unsafe link schemes", () => {
    const html = renderToStaticMarkup(<ChatMarkdown content={'<script>alert("x")</script>\n\n[bad](javascript:alert(1))'} />);

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("javascript:alert(1)");
    expect(html).not.toContain('href="javascript:');
  });
});
