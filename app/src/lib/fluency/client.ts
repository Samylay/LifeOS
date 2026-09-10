import type { Material, Pattern, Preferences, Session, Block, Phrase } from "./model";
export interface Dashboard {
  preferences: Preferences; materials: Material[]; phrases: Phrase[]; connected: boolean; agentId?: string | null; profile: Pattern[];
  recommendations: Record<Block, { material: Material; reason: string } | null>;
  sessions: { id: string; title: string; createdAt: string; status: string; language: string; rounds: number }[];
}
export async function request<T>(body?: Record<string, unknown>, url = "/api/fluency"): Promise<T> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not save. Try again.");
  return data as T;
}
export const loadSession = async (id: string) => (await request<{ session: Session }>(undefined, `/api/fluency?id=${encodeURIComponent(id)}`)).session;
