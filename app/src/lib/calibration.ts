import { createHash } from "node:crypto";
import { getDoc, listDocs, runInTransaction, setDoc, updateDoc } from "./server-db";
import { createTodoistTask } from "./todoist-client";
import { isWorkflowKind } from "./workflows/model";

const ITEMS = "users/local/triageQueue";
const FEEDBACK = "users/local/sourceFeedback";
const SETTINGS = "users/local/settings";
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function shortText(value: unknown, words = 22): string {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const parts = text.split(" ");
  return parts.length > words ? parts.slice(0, words).join(" ") + "…" : text;
}
export function interpretation(item: Record<string, unknown>): string {
  const proposal = object(item.proposal);
  const calibration = object(item.calibration);
  return shortText(calibration.note || object(proposal.assessment).apply || proposal.why_relevant || proposal.summary || "Explore this source and propose a useful next step.");
}
function topics(item: Record<string, unknown>): string[] {
  const p = object(item.proposal);
  return [...new Set([item.topicTags, item.vaultTags, p.tags].flatMap(v => Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []))];
}
export function calibrationContext(itemId: string) {
  const item = getDoc(ITEMS, itemId);
  if (!item) return null;
  const tags = topics(item);
  const rules = listDocs(FEEDBACK, { orderBy: ["createdAt", "desc"] })
    .filter(r => r.scope === "similar" && Array.isArray(r.topics) && r.topics.some(t => tags.includes(String(t))))
    .slice(0, 12).map(r => ({ note: r.note, topics: r.topics, workflowKind: r.workflowKind, sourceItemId: r.itemId }));
  return { item: item.calibration ?? null, rules, policy: "Use explicit corrections only. Silence, age and skipping express no preference. An item-specific correction wins over examples from other items." };
}
export function saveCalibration(itemId: string, input: Record<string, unknown>) {
  return runInTransaction(() => {
    const item = getDoc(ITEMS, itemId);
    if (!item) throw new Error("Source not found");
    if ((item.evidenceRef ?? null) !== (input.evidenceRef ?? null) || (item.assessmentRef ?? null) !== (input.assessmentRef ?? null)) throw new Error("This card changed. Reload it before answering.");
    if (!["fits", "corrected", "not-for-me"].includes(String(input.verdict))) throw new Error("Choose how this interpretation fits");
    const prior = object(item.calibration);
    const note = typeof input.note === "string" ? input.note.trim() : input.verdict === "fits" && typeof prior.note === "string" ? prior.note : "";
    if (note.length > 2000 || (input.verdict === "corrected" && !note)) throw new Error("Write your intended use in one sentence");
    const kind = input.workflowKind ?? prior.workflowKind ?? "auto";
    if (!isWorkflowKind(kind)) throw new Error("Unknown use");
    const tags = topics(item);
    const scope = input.scope === "similar" && note && tags.length ? "similar" : "item";
    const row = { itemId, verdict: input.verdict, note, workflowKind: kind, scope, topics: tags, interpretation: interpretation(item), evidenceRef: item.evidenceRef ?? null, assessmentRef: item.assessmentRef ?? null, createdAt: new Date().toISOString() };
    // Stable receipt: retries of the same answer do not inflate review progress.
    const id = createHash("sha256").update(JSON.stringify({ ...row, createdAt: null })).digest("hex");
    const existing = getDoc(FEEDBACK, id);
    if (existing) { updateDoc(ITEMS, itemId, { calibration: existing }); return existing; }
    setDoc(FEEDBACK, id, row);
    updateDoc(ITEMS, itemId, { calibration: { ...row, id } });
    return { ...row, id };
  });
}
const parisDay = (value: string) => new Date(value).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
export function calibrationSummary() {
  const today = parisDay(new Date().toISOString());
  const answered = new Set(listDocs(FEEDBACK).filter(r => parisDay(String(r.createdAt)) === today).map(r => r.itemId)).size;
  const items = listDocs(ITEMS).filter(item => item.status !== "discarded" && !item.calibration && object(item.proposal).title).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 3).map(item => ({ id: item.id, url: item.url, title: object(item.proposal).title, meaning: interpretation(item), evidenceRef: item.evidenceRef ?? null, assessmentRef: item.assessmentRef ?? null, topics: topics(item) }));
  return { answered, target: 3, items, reminder: getDoc(SETTINGS, "source-calibration") ?? null };
}
let reminderFlight: Promise<unknown> | null = null;
export function ensureCalibrationReminder() {
  if (reminderFlight) return reminderFlight;
  reminderFlight = (async () => {
    const previous = getDoc(SETTINGS, "source-calibration");
    if (previous?.taskId) return previous;
    const result = await createTodoistTask({ content: "Review 3 LifeOS interpretations (2 minutes): https://homelab.tail069527.ts.net/decide/calibrate", due_string: "every day at 18:00" }, { requestId: "c1bf0474-7db2-467d-a013-a498d225f821" });
    const state = { taskId: result.taskId ?? null, status: result.ok && result.taskId ? "scheduled" : "failed", updatedAt: new Date().toISOString(), due: "every day at 18:00", error: result.error ?? null };
    setDoc(SETTINGS, "source-calibration", state, true);
    return state;
  })().finally(() => { reminderFlight = null; });
  return reminderFlight;
}
