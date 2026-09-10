import { randomUUID } from "node:crypto";
import { getDoc, listDocs, setDoc } from "../server-db";
import { DEFAULTS, emptyRound, type Material, type Preferences, type Session, type Turn, type Phrase } from "./model";
import { MATERIALS } from "./materials";

const ROOT = "users/local/fluency";
export const sessions = () => listDocs(`${ROOT}/sessions`, { orderBy: ["createdAt", "desc"] }) as unknown as Session[];
export const preferences = (): Preferences => ({ ...DEFAULTS, ...getDoc(`${ROOT}/settings`, "preferences") });
export const savePreferences = (p: Preferences) => setDoc(`${ROOT}/settings`, "preferences", { ...p });
export function materials(): Material[] {
  const edits = listDocs(`${ROOT}/materials`) as unknown as Material[];
  return [...MATERIALS.filter(m => !edits.some(e => e.id === m.id)), ...edits];
}
export const saveMaterial = (m: Material) => setDoc(`${ROOT}/materials`, m.id, { ...m });
export const phrases = () => listDocs(`${ROOT}/phrases`) as unknown as Phrase[];
export const savePhrase = (p: Phrase) => setDoc(`${ROOT}/phrases`, p.id, { ...p });
export function session(id: string): Session {
  const found = getDoc(`${ROOT}/sessions`, id) as unknown as Session | null;
  if (!found) throw new Error("Practice session not found.");
  return found;
}
export const saveSession = (s: Session) => setDoc(`${ROOT}/sessions`, s.id, { ...s });
export function createSession(material: Material): Session {
  const s: Session = { id: randomUUID(), createdAt: new Date().toISOString(), material, preferences: preferences(), rounds: [emptyRound(material.prompt)], phase: 0, status: "active" };
  saveSession(s); return s;
}
export function changeTurn(s: Session, phase: number, turn: Turn): Session {
  const round = s.rounds[phase];
  if (!round) throw new Error("Practice round not found.");
  const index = round.turns.findIndex(t => t.id === turn.id);
  if (index < 0) round.turns.push(turn); else round.turns[index] = turn;
  round.revision++; round.review = null;
  saveSession(s); return s;
}
