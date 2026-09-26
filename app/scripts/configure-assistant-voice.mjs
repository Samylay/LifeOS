// Run inside the LifeOS container, using its existing private credentials.
// Only the assistant prompt and ask_lifeos speech policy are changed.
import fs from "node:fs";
let fallback;
try { fallback = JSON.parse(fs.readFileSync("/data/fluency-connection.json", "utf8")); } catch {}
const key = process.env.LIFEOS_VOICE_ELEVENLABS_API_KEY?.trim() || process.env.ELEVENLABS_API_KEY?.trim() || fallback?.key;
const agentId = process.env.LIFEOS_VOICE_AGENT_ID?.trim();
if (!key || !agentId) throw new Error("Live assistant voice is not configured.");
const prompt = "You are the speech interface for LifeOS. For EVERY user turn, call ask_lifeos once with the complete user request exactly as spoken before answering. Never answer from your own knowledge and never skip the tool. Wait silently for the result. Do not rephrase, paraphrase, echo, or acknowledge the user's request before calling the tool. Read the returned answer faithfully, without adding a preamble or restating the request. The LifeOS backend has the app and homelab tool catalog; always delegate to it instead of claiming you lack access. If the tool fails, say LifeOS could not finish the request and ask the user to try again. Do not claim an action happened unless the tool result says it did.";
async function request(endpoint, body) {
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/${endpoint}`, {
    method: body ? "PATCH" : "GET",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`ElevenLabs configuration request failed (${response.status}).`);
  return response.json();
}
const endpoint = `agents/${encodeURIComponent(agentId)}`;
const agent = await request(endpoint);
const tools = await Promise.all((agent.conversation_config.agent.prompt.tool_ids || []).map(async id => ({ id, ...(await request(`tools/${encodeURIComponent(id)}`)) })));
const tool = tools.find(t => t.tool_config?.name === "ask_lifeos" && t.tool_config.type === "client");
if (!tool) throw new Error("The assistant agent has no ask_lifeos client tool. Configuration unchanged.");
if (tool.tool_config.pre_tool_speech !== "off" || !tool.tool_config.expects_response) {
  await request(`tools/${encodeURIComponent(tool.id)}`, { tool_config: { ...tool.tool_config, pre_tool_speech: "off", force_pre_tool_speech: false, expects_response: true }, ...(tool.response_mocks ? { response_mocks: tool.response_mocks } : {}) });
}
if (agent.conversation_config.agent.prompt.prompt !== prompt) {
  await request(endpoint, { conversation_config: { agent: { prompt: { prompt } } } });
}
const verifiedAgent = await request(endpoint);
const verifiedTool = await request(`tools/${encodeURIComponent(tool.id)}`);
if (verifiedAgent.conversation_config.agent.prompt.prompt !== prompt || verifiedTool.tool_config.pre_tool_speech !== "off" || !verifiedTool.tool_config.expects_response) throw new Error("Voice configuration verification failed.");
console.log("Verified assistant voice: exact request forwarding, silent tool wait, no paraphrasing preamble.");
