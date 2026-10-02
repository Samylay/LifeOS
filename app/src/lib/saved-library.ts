import { createHash } from "node:crypto";
import { getDoc, listDocs, runInTransaction, setDoc, updateDoc } from "./server-db";
import { AREAS } from "./types";
import fields from "./saved-fields.json";
import { canonicalizeUrl } from "./triage";
import { extractionItemState, EXTRACTION_STATE_FIELDS, TriageArtifactError } from "./triage-evidence";

export const SAVED_CLASSIFICATIONS = "users/local/savedClassifications";
export const SAVED_FIELDS = fields;
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(object(v)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
function text(v: unknown, name: string): string {
  if (typeof v !== "string" || !v.trim() || v.length > 4096) throw new TriageArtifactError(`Invalid ${name}`, 400);
  return v;
}

/** Persist reference classification only. This never creates executable tasks or human feedback. */
export function publishSavedClassification(input: unknown, expectedState: unknown, acceptReference = false) {
  const data = object(input);
  if (JSON.stringify(data).length > 150000) throw new TriageArtifactError("Classification too large", 400);
  const itemId = text(data.itemId, "itemId");
  const bundleId = text(data.bundleId, "bundleId");
  const classification = object(data.classification);
  if (typeof classification.abstain !== "boolean" || !Array.isArray(classification.limitations) || classification.limitations.some(v => typeof v !== "string")) throw new TriageArtifactError("Invalid classification", 400);
  const state = object(expectedState);
  if (EXTRACTION_STATE_FIELDS.some(k => !(k in state))) throw new TriageArtifactError("Complete expectedItemState required", 400);
  const model = text(data.model, "model");
  const classifierVersion = text(data.classifierVersion, "classifierVersion");
  const taxonomyHash = text(data.taxonomyHash, "taxonomyHash");
  const inputHash = data.inputHash === undefined ? null : text(data.inputHash, "inputHash");
  return runInTransaction(() => {
    const item = getDoc("users/local/triageQueue", itemId);
    if (!item) throw new TriageArtifactError("Save not found", 404);
    if (canonical(extractionItemState(item)) !== canonical(extractionItemState(state))) throw new TriageArtifactError("Save changed during classification", 409);
    const bundle = getDoc("users/local/triageEvidence", bundleId);
    if (!bundle || item.evidenceRef !== bundleId || (bundle.itemId && bundle.itemId !== itemId)) throw new TriageArtifactError("Evidence is no longer current", 409);
    if (typeof item.url !== "string" || typeof bundle.canonicalUrl !== "string" || canonicalizeUrl(item.url) !== canonicalizeUrl(bundle.canonicalUrl)) throw new TriageArtifactError("Evidence belongs to a different source", 400);
    const segmentIds = new Set((Array.isArray(bundle.segments) ? bundle.segments : []).map(v => object(v).id));
    const normalized: Record<string, unknown> = { abstain: classification.abstain, limitations: classification.limitations };
    for (const axis of ["fields", "areas"] as const) {
      const values = classification[axis];
      const allowed = new Set(axis === "fields" ? fields.map(v => v.id) : Object.keys(AREAS));
      if (!Array.isArray(values) || values.length > (axis === "fields" ? 8 : 5)) throw new TriageArtifactError(`Invalid ${axis}`, 400);
      const seen = new Set();
      normalized[axis] = values.map(value => {
        const entry = object(value);
        if (!allowed.has(String(entry.id)) || seen.has(entry.id)) throw new TriageArtifactError(`Unknown or repeated ${axis} label`, 400);
        seen.add(entry.id);
        const refs = entry.segmentIds;
        if (!Array.isArray(refs) || !refs.length || refs.some(ref => !segmentIds.has(ref))) throw new TriageArtifactError("Labels must cite captured evidence", 400);
        return { id: entry.id, reason: text(entry.reason, "reason"), segmentIds: refs };
      });
      if (classification.abstain && values.length) throw new TriageArtifactError("Abstention cannot include labels", 400);
    }
    if (!classification.abstain && !(classification.fields as unknown[]).length && !(classification.areas as unknown[]).length) throw new TriageArtifactError("Empty labels require abstention", 400);
    const sourceContext = savedSourceContext(item);
    const payload = { itemId, bundleId, model, classifierVersion, taxonomyHash, inputHash, sourceContext, classification: normalized };
    const id = createHash("sha256").update(canonical(payload)).digest("hex");
    if (!getDoc(SAVED_CLASSIFICATIONS, id)) setDoc(SAVED_CLASSIFICATIONS, id, { ...payload, createdAt: new Date().toISOString(), labelOrigin: "model-generated" });
    const patch: Record<string, unknown> = { classificationRef: id };
    // Preserve prior decisions. New references can leave the swipe inbox without manufacturing calibration.
    if (acceptReference && ["queued", "proposed"].includes(String(item.status))) {
      patch.status = "filed";
      patch.filedAs = "saved-reference";
      patch.referenceAcceptedAt = new Date().toISOString();
      patch.referenceAcceptedBy = "agent";
    }
    updateDoc("users/local/triageQueue", itemId, patch);
    return { id, itemId, bundleId };
  });
}

const CONTEXT_FIELDS = ["url", "note", "notes", "userNote", "annotations", "folder", "folderPath", "calibration"];
function savedSourceContext(item: Record<string, unknown>) {
  return Object.fromEntries(CONTEXT_FIELDS.map(k => [k, item[k] ?? null]));
}
export function isCurrentSavedClassification(item: Record<string, unknown>, candidate: Record<string, unknown> | null | undefined): boolean {
  return Boolean(candidate && candidate.bundleId === item.evidenceRef && candidate.itemId === item.id && canonical(candidate.sourceContext) === canonical(savedSourceContext(item)));
}

/** Display captured words directly when a current generated assessment is absent. */
export function capturedSourcePreview(bundle: Record<string, unknown> | null | undefined) {
  const captured = (Array.isArray(bundle?.segments) ? bundle.segments : []).map(object);
  const source = captured.filter(v => !["access-notice", "user-context", "reply_other", "visual-uncertainty"].includes(String(v.role ?? v.kind)) && typeof v.text === "string" && v.text.trim());
  const title = source.find(v => (v.role ?? v.kind) === "title")?.text as string | undefined;
  const caption = source.find(v => ["author-caption", "caption"].includes(String(v.role ?? v.kind)));
  const preview = caption ?? source.find(v => (v.role ?? v.kind) !== "title" && String(v.text).trim() !== title?.trim()) ?? source.find(v => (v.role ?? v.kind) !== "title");
  return { title: title ?? (caption ? String(caption.text).split("\n")[0].slice(0, 140) : undefined), preview: preview ? String(preview.text) : undefined };
}

export function savedLibrary(options: { q?: string; field?: string; area?: string; page?: number } = {}) {
  const evidence = new Map(listDocs("users/local/triageEvidence").map(v => [v.id, v]));
  const classifications = new Map(listDocs(SAVED_CLASSIFICATIONS).map(v => [v.id, v]));
  const needle = (options.q ?? "").toLocaleLowerCase().slice(0, 300);
  const all = listDocs("users/local/triageQueue");
  const rows = all.flatMap(item => {
    const bundle = evidence.get(String(item.evidenceRef));
    const candidate = classifications.get(String(item.classificationRef));
    const current = isCurrentSavedClassification(item, candidate) ? candidate : undefined;
    const classification = object(current?.classification);
    const fieldIds = (Array.isArray(classification.fields) ? classification.fields : []).map(v => String(object(v).id));
    const areaIds = (Array.isArray(classification.areas) ? classification.areas : []).map(v => String(object(v).id));
    if (options.field && !fieldIds.includes(options.field)) return [];
    if (options.area && !areaIds.includes(options.area)) return [];
    const proposal = object(item.proposal);
    const captured = (Array.isArray(bundle?.segments) ? bundle.segments : []).map(object);
    const segments = captured.filter(v => (v.role ?? v.kind) !== "access-notice").map(v => String(v.text ?? ""));
    const presentation = capturedSourcePreview(bundle);
    const searchable = [item.url, proposal.title, proposal.summary, item.note, item.notes, item.userNote, ...segments].join("\n");
    if (needle && !searchable.toLocaleLowerCase().includes(needle)) return [];
    const date = object(item.savedAt).__date ?? item.savedAt ?? object(item.createdAt).__date ?? item.createdAt ?? "";
    const match = needle ? segments.find(v => v.toLocaleLowerCase().includes(needle)) : presentation.preview;
    const offset = match ? Math.max(0, match.toLocaleLowerCase().indexOf(needle) - 90) : 0;
    return [{ id: item.id, url: String(item.url ?? ""), title: String(proposal.title ?? presentation.title ?? item.url ?? "Saved source"),
      summary: String(proposal.summary ?? ""), snippet: match?.slice(offset, offset + 300) ?? "", savedAt: String(date),
      status: String(item.status ?? "queued"), quality: String(bundle?.quality ?? "not-extracted"),
      segmentCount: segments.length, classified: Boolean(current), fieldIds, areaIds }];
  }).sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(rows.length / 40));
  const page = Math.min(pages, Math.max(1, Math.floor(options.page ?? 1) || 1));
  return { total: rows.length, allSaves: all.length, page, pages, items: rows.slice((page - 1) * 40, page * 40) };
}
