export const BLOCKS = { conversation: "Conversation", explanation: "Explain something", presentation: "Present & respond" } as const;
export type Block = keyof typeof BLOCKS;
export const SKILLS = { point: "Lead with your point", structure: "Connect your ideas", support: "Make it concrete", response: "Answer the question" } as const;
export type Skill = keyof typeof SKILLS;
export type Language = "en" | "fr";
export interface Material { id: string; title: string; block: Block; language: Language; skill: Skill; prompt: string; hint: string; example: string; variation: string; passage: string; archived?: boolean }
export interface Phrase { id: string; text: string; language: Language; sessionId?: string; original?: string }
export interface Preferences { language: Language; preparation: number; feedback: "gentle" | "direct"; focus: Skill | "auto"; dismissed: string[] }
export const DEFAULTS: Preferences = { language: "en", preparation: 20, feedback: "gentle", focus: "auto", dismissed: [] };
export interface Turn { id: string; role: "user" | "agent"; original: string; text: string; version: number; disputed: boolean; source: "live" | "recorded" | "typed"; audio?: boolean; error?: string }
export interface Observation { skill: Skill; kind: "strength" | "difficulty"; turnId: string; quote: string; note: string }
export interface Review { revision: number; feedback: string; cue: string; observations: Observation[] }
export interface Round { prompt: string; turns: Turn[]; hints: number; revision: number; review: Review | null }
export interface Session { id: string; createdAt: string; material: Material; preferences: Preferences; rounds: Round[]; phase: number; status: "active" | "complete" }
export interface Evidence extends Observation { sessionId: string; createdAt: string; version: number }
export interface Pattern { skill: Skill; block: Block; evidence: Evidence[]; strengths: Evidence[]; state: "tentative" | "recurring" | "improving" }

export const emptyRound = (prompt: string): Round => ({ prompt, turns: [], hints: 0, revision: 0, review: null });
export function profile(sessions: Session[], language: Language, block?: Block): Pattern[] {
  if (!block) return (Object.keys(BLOCKS) as Block[]).flatMap(b => profile(sessions, language, b));
  return (Object.keys(SKILLS) as Skill[]).map(skill => {
    const evidence: Evidence[] = [], strengths: Evidence[] = [];
    for (const session of sessions.filter(s => s.material.language === language && (!block || s.material.block === block))) {
      const round = session.rounds[0];
      if (!round?.review || round.review.revision !== round.revision || session.material.passage || round.hints) continue;
      for (const o of round.review.observations.filter(o => o.skill === skill)) {
        const t = round.turns.find(t => t.id === o.turnId);
        if (!t || t.role !== "user" || t.disputed || t.source === "typed" || !t.text.includes(o.quote)) continue;
        const item = { ...o, sessionId: session.id, createdAt: session.createdAt, version: t.version };
        (o.kind === "difficulty" ? evidence : strengths).push(item);
      }
    }
    const latestDifficulty = evidence.map(e => e.createdAt).sort().at(-1) ?? "";
    const recentSuccesses = new Set(strengths.filter(e => e.createdAt > latestDifficulty).map(e => e.sessionId)).size;
    const count = new Set(evidence.map(e => e.sessionId)).size;
    return { skill, block, evidence, strengths, state: recentSuccesses >= 2 ? "improving" : count >= 2 ? "recurring" : "tentative" } satisfies Pattern;
  }).filter(p => p.evidence.length || p.strengths.length);
}
export function recommend(materials: Material[], sessions: Session[], prefs: Preferences, block: Block): { material: Material; reason: string } | null {
  const available = materials.filter(m => !m.archived && m.language === prefs.language && m.block === block);
  if (!available.length) return null;
  const patterns = profile(sessions, prefs.language, block).filter(p => p.state === "recurring" && !prefs.dismissed.includes(`${prefs.language}:${p.skill}`));
  patterns.sort((a, b) => new Set(b.evidence.map(e => e.sessionId)).size - new Set(a.evidence.map(e => e.sessionId)).size);
  const focus = prefs.focus !== "auto" ? prefs.focus : patterns[0]?.skill;
  const targeted = available.filter(m => m.skill === focus);
  const pool = targeted.length ? targeted : available;
  const count = sessions.filter(s => s.material.language === prefs.language && s.material.block === block).length;
  return { material: pool[count % pool.length], reason: targeted.length ? `${SKILLS[focus!]}${prefs.focus === "auto" ? ": a recurring practice focus in this block." : ": your chosen focus."}` : "A new speaking rep. Your practice will help the coach choose a focus." };
}
export function validateReview(value: unknown, round: Round): Review {
  const data = value as Partial<Review> | null;
  if (!data || typeof data.feedback !== "string" || !data.feedback.trim() || typeof data.cue !== "string" || !Array.isArray(data.observations)) throw new Error("The review was incomplete. Your attempt is saved; try review again.");
  const observations = data.observations.slice(0, 6).map(o => {
    const turn = round.turns.find(t => t.id === o.turnId && t.role === "user" && !t.disputed);
    if (!Object.hasOwn(SKILLS, o.skill) || !["strength", "difficulty"].includes(o.kind) || typeof o.quote !== "string" || o.quote.trim().length < 4 || !turn?.text.includes(o.quote) || typeof o.note !== "string") throw new Error("The review could not be linked to your words. Try review again.");
    return { skill: o.skill, kind: o.kind, turnId: o.turnId, quote: o.quote.slice(0, 1500), note: o.note.slice(0, 700) };
  });
  return { revision: round.revision, feedback: data.feedback.slice(0, 1500), cue: data.cue.slice(0, 700), observations };
}
