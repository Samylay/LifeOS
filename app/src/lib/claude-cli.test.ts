import { describe, it, expect, vi, beforeEach } from "vitest";
import { promisify } from "node:util";

// Behavior slot the mocked execFile reads on each call. `null` = resolve.
let execBehavior: { stdout: string; reject?: Record<string, unknown> } = { stdout: "" };

vi.mock("node:child_process", () => {
  const execFile = Object.assign(() => {}, {
    // promisify(execFile) resolves through this custom implementation, same
    // as Node's real execFile — returning { stdout, stderr }.
    [promisify.custom]: () => {
      if (execBehavior.reject) return Promise.reject(execBehavior.reject);
      return Promise.resolve({ stdout: execBehavior.stdout, stderr: "" });
    },
  });
  return { execFile };
});

const ollamaGenerate = vi.fn();
vi.mock("./ollama", () => ({
  OLLAMA_MODEL: "qwen2.5:7b",
  ollamaGenerate: (p: string) => ollamaGenerate(p),
}));

import { generateText, isLimitError } from "./claude-cli";

beforeEach(() => {
  execBehavior = { stdout: "" };
  ollamaGenerate.mockReset();
});

describe("isLimitError", () => {
  it("matches the subscription 5h-cap message", () => {
    expect(isLimitError("Claude AI usage limit reached|1753900000")).toBe(true);
  });
  it("matches API rate-limit / overload shapes", () => {
    expect(isLimitError('{"type":"error","error":{"type":"rate_limit_error"}}')).toBe(true);
    expect(isLimitError('API Error: 429 {"type":"overloaded_error"}')).toBe(true);
    expect(isLimitError("You are out of extra usage for this billing cycle")).toBe(true);
  });
  it("does not match unrelated failures", () => {
    expect(isLimitError("claude: command not found")).toBe(false);
    expect(isLimitError("Invalid API key. Please run /login")).toBe(false);
    expect(isLimitError("no JSON in model output")).toBe(false);
  });
});

describe("runClaude limit fallback", () => {
  it("returns the envelope result on a normal run, never touching Ollama", async () => {
    execBehavior = { stdout: JSON.stringify({ result: "hello", is_error: false }) };
    expect(await generateText("p")).toBe("hello");
    expect(ollamaGenerate).not.toHaveBeenCalled();
  });

  it("falls back to Ollama when the CLI exits non-zero with a limit message", async () => {
    execBehavior = {
      stdout: "",
      reject: { stdout: "Claude AI usage limit reached|1753900000", stderr: "", message: "exit 1" },
    };
    ollamaGenerate.mockResolvedValue("local answer");
    expect(await generateText("the prompt")).toBe("local answer");
    expect(ollamaGenerate).toHaveBeenCalledWith("the prompt");
  });

  it("falls back when exit is 0 but the envelope reports the limit", async () => {
    execBehavior = {
      stdout: JSON.stringify({ is_error: true, result: "Claude AI usage limit reached|1753900000" }),
    };
    ollamaGenerate.mockResolvedValue("local answer");
    expect(await generateText("p")).toBe("local answer");
  });

  it("rethrows non-limit failures without calling Ollama", async () => {
    execBehavior = { stdout: "", reject: { stderr: "claude: command not found", message: "ENOENT" } };
    await expect(generateText("p")).rejects.toBeTruthy();
    expect(ollamaGenerate).not.toHaveBeenCalled();
  });

  it("surfaces BOTH errors when the fallback itself fails", async () => {
    execBehavior = {
      stdout: "",
      reject: { stdout: "Claude AI usage limit reached|1753900000", message: "exit 1" },
    };
    ollamaGenerate.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:11434"));
    await expect(generateText("p")).rejects.toThrow(/usage limit reached[\s\S]*ECONNREFUSED/);
  });
});
