import { elevenLabsCredentials } from "@/lib/fluency/provider";

function credentials() {
  const fallback = elevenLabsCredentials();
  const key = process.env.LIFEOS_VOICE_ELEVENLABS_API_KEY?.trim()
    || process.env.ELEVENLABS_API_KEY?.trim()
    || fallback?.key;
  const agentId = process.env.LIFEOS_VOICE_AGENT_ID?.trim();
  return key && agentId ? { key, agentId } : null;
}

export function assistantVoiceAvailable() {
  return Boolean(credentials());
}

export async function createAssistantVoiceToken() {
  const config = credentials();
  if (!config) throw new Error("Live assistant voice is not configured.");
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(config.agentId)}`, {
    headers: { "xi-api-key": config.key },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ElevenLabs token request failed (${response.status}).`);
  const data = await response.json();
  if (typeof data.token !== "string" || !data.token) throw new Error("ElevenLabs returned no conversation token.");
  return data.token as string;
}
