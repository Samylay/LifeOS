// Server-side LLM client. Points the OpenAI SDK at a local Ollama instance via
// its OpenAI-compatible endpoint, so no cloud API keys are used. Ollama runs on
// the homelab host; from inside Docker reach it via host.docker.internal.
import OpenAI from "openai";

export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";

export function getOllamaClient(): OpenAI {
  const base = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  return new OpenAI({
    apiKey: "ollama", // Ollama ignores the key but the SDK requires one.
    baseURL: `${base.replace(/\/$/, "")}/v1`,
  });
}
