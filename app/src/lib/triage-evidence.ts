import { createHash } from "node:crypto";
import { getDoc, runInTransaction, setDoc, updateDoc } from "./server-db";
import { canonicalizeUrl, type TriageProposal } from "./triage";

export const TRIAGE_EVIDENCE_COLLECTION = "users/local/triageEvidence";
export const TRIAGE_ASSESSMENTS_COLLECTION = "users/local/triageAssessments";
export const EVIDENCE_STATUSES = [
  "complete",
  "partial",
  "unavailable",
  "not_applicable",
  "not_requested",
] as const;

export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export interface EvidenceSource {
  id: string;
  kind: string;
  url: string;
  [key: string]: unknown;
}

export interface EvidenceRelation {
  fromSourceId: string;
  toSourceId: string;
  kind: string;
  [key: string]: unknown;
}

export interface EvidenceSegment {
  id: string;
  sourceId: string;
  kind: string;
  text: string;
  method: string;
  [key: string]: unknown;
}

export interface EvidenceCoverage {
  sourceId: string;
  aspect: string;
  status: EvidenceStatus;
  [key: string]: unknown;
}

export interface EvidenceQuality {
  // Kept as an alias for callers that used the first draft of this module.
  [key: string]: unknown;
}

export interface EvidenceBundle {
  schemaVersion: string;
  bundleId: string;
  contentHash: string;
  extractionVersion: string;
  requestedUrl: string;
  canonicalUrl: string;
  platform: string;
  fetchedAt: string;
  rootSourceId: string;
  sources: EvidenceSource[];
  relations: EvidenceRelation[];
  segments: EvidenceSegment[];
  coverage: EvidenceCoverage[];
  quality: string;
  issues: string[];
}

export interface TriageAssessmentRecord {
  assessmentId: string;
  itemId: string;
  bundleId: string;
  createdAt: string;
  model: string;
  promptVersion: string;
  personaHash: string;
  rubricHash: string;
  inputSegmentIds: string[];
  omittedSegmentIds: string[];
  inputTruncated: boolean;
  proposal: unknown;
  grounding: unknown[];
}

export interface EvidenceSummary {
  bundleId: string;
  sourceCount: number;
  segmentCount: number;
  coverage: EvidenceStatus[];
  issueCount: number;
  quality: string;
}

export class TriageArtifactError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409
  ) {
    super(message);
    this.name = "TriageArtifactError";
  }
}

const MAX_JSON_BYTES = 1_500_000;
const MAX_SOURCES = 200;
const MAX_RELATIONS = 500;
const MAX_SEGMENTS = 4_000;
const MAX_COVERAGE = 200;
const MAX_ISSUES = 200;
const MAX_GROUNDING = 1_000;
const MAX_SEGMENT_TEXT = 100_000;

function record(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TriageArtifactError(`${field} must be an object`, 400);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string, max = 512): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new TriageArtifactError(`${field} must be a non-empty string`, 400);
  }
  return value;
}

function id(value: unknown, field: string): string {
  const result = requiredString(value, field, 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(result)) {
    throw new TriageArtifactError(`${field} has an invalid identifier`, 400);
  }
  return result;
}

function url(value: unknown, field: string): string {
  const result = requiredString(value, field, 4096);
  try {
    const parsed = new URL(result);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) {
      throw new Error("unsafe URL");
    }
  } catch {
    throw new TriageArtifactError(`${field} must be an absolute URL`, 400);
  }
  return result;
}

function array(value: unknown, field: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new TriageArtifactError(`${field} must be an array of at most ${max} items`, 400);
  }
  return value;
}

function checkJsonSize(value: unknown): void {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new TriageArtifactError("artifact is not JSON serializable", 400);
  }
  if (typeof encoded !== "string" || encoded.length > MAX_JSON_BYTES) {
    throw new TriageArtifactError("artifact is too large", 400);
  }
}

function iso(value: unknown, field: string): string {
  const result = requiredString(value, field, 80);
  if (Number.isNaN(Date.parse(result))) {
    throw new TriageArtifactError(`${field} must be an ISO date`, 400);
  }
  return result;
}

function checkRefs(bundle: EvidenceBundle): void {
  const sourceIds = new Set(bundle.sources.map((source) => source.id));
  if (!sourceIds.has(bundle.rootSourceId)) {
    throw new TriageArtifactError("rootSourceId must refer to a source", 400);
  }
  for (const relation of bundle.relations) {
    if (!sourceIds.has(relation.fromSourceId) || !sourceIds.has(relation.toSourceId)) {
      throw new TriageArtifactError("relation references an unknown source", 400);
    }
  }
  for (const segment of bundle.segments) {
    if (!sourceIds.has(segment.sourceId)) {
      throw new TriageArtifactError("segment references an unknown source", 400);
    }
  }
  for (const coverage of bundle.coverage) {
    if (!sourceIds.has(coverage.sourceId)) {
      throw new TriageArtifactError("coverage references an unknown source", 400);
    }
  }
}

export function validateEvidenceBundle(input: unknown): EvidenceBundle {
  checkJsonSize(input);
  const value = record(input);
  if (
    typeof value.schemaVersion !== "string" || !value.schemaVersion.trim()
  ) {
    throw new TriageArtifactError("schemaVersion is required", 400);
  }
  const bundle: EvidenceBundle = {
    schemaVersion: value.schemaVersion,
    bundleId: id(value.bundleId, "bundleId"),
    contentHash: requiredString(value.contentHash, "contentHash", 256),
    extractionVersion: requiredString(value.extractionVersion, "extractionVersion", 160),
    requestedUrl: url(value.requestedUrl, "requestedUrl"),
    canonicalUrl: url(value.canonicalUrl, "canonicalUrl"),
    platform: requiredString(value.platform, "platform", 80),
    fetchedAt: iso(value.fetchedAt, "fetchedAt"),
    rootSourceId: id(value.rootSourceId, "rootSourceId"),
    sources: array(value.sources, "sources", MAX_SOURCES).map((raw, index) => {
      const source = record(raw);
      return {
        ...source,
        id: id(source.id, `sources[${index}].id`),
        kind: requiredString(source.kind, `sources[${index}].kind`, 80),
        url: url(source.url, `sources[${index}].url`),
      };
    }),
    relations: array(value.relations, "relations", MAX_RELATIONS).map((raw, index) => {
      const relation = record(raw);
      return {
        ...relation,
        fromSourceId: id(relation.fromSourceId, `relations[${index}].fromSourceId`),
        toSourceId: id(relation.toSourceId, `relations[${index}].toSourceId`),
        kind: requiredString(relation.kind, `relations[${index}].kind`, 120),
      };
    }),
    segments: array(value.segments, "segments", MAX_SEGMENTS).map((raw, index) => {
      const segment = record(raw);
      const text = requiredString(segment.text, `segments[${index}].text`, MAX_SEGMENT_TEXT);
      return {
        ...segment,
        id: id(segment.id, `segments[${index}].id`),
        sourceId: id(segment.sourceId, `segments[${index}].sourceId`),
        kind: requiredString(segment.kind, `segments[${index}].kind`, 80),
        text,
        method: requiredString(segment.method, `segments[${index}].method`, 120),
      };
    }),
    coverage: array(value.coverage, "coverage", MAX_COVERAGE).map((raw, index) => {
      const coverage = record(raw);
      const status = coverage.status;
      if (!EVIDENCE_STATUSES.includes(status as EvidenceStatus)) {
        throw new TriageArtifactError(`coverage[${index}].status is invalid`, 400);
      }
      return {
        ...coverage,
        sourceId: id(coverage.sourceId, `coverage[${index}].sourceId`),
        aspect: requiredString(coverage.aspect, `coverage[${index}].aspect`, 80),
        status: status as EvidenceStatus,
      };
    }),
    quality: (() => {
      const quality = requiredString(value.quality, "quality", 80);
      if (!["usable", "limited", "unavailable"].includes(quality)) {
        throw new TriageArtifactError("quality is invalid", 400);
      }
      return quality;
    })(),
    issues: array(value.issues, "issues", MAX_ISSUES).map((issue, index) =>
      requiredString(issue, `issues[${index}]`, 1_000)
    ),
  };
  if (new Set(bundle.sources.map((source) => source.id)).size !== bundle.sources.length) {
    throw new TriageArtifactError("sources contain duplicate id values", 400);
  }
  if (new Set(bundle.segments.map((segment) => segment.id)).size !== bundle.segments.length) {
    throw new TriageArtifactError("segments contain duplicate id values", 400);
  }
  checkRefs(bundle);
  return bundle;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function ensureSame(idValue: string, existing: Record<string, unknown>, payload: unknown): void {
  if (existing.payloadHash !== digest(payload)) {
    throw new TriageArtifactError(`${idValue} already exists with different content`, 409);
  }
}

function evidenceSummary(bundle: EvidenceBundle): EvidenceSummary {
  return {
    bundleId: bundle.bundleId,
    sourceCount: bundle.sources.length,
    segmentCount: bundle.segments.length,
    coverage: bundle.coverage.map((entry) => entry.status),
    issueCount: bundle.issues.length,
    quality: bundle.quality,
  };
}

function attachEvidence(itemId: string, bundle: EvidenceBundle): void {
  const item = getDoc("users/local/triageQueue", itemId);
  if (!item) return;
  updateDoc("users/local/triageQueue", itemId, {
    evidenceRef: bundle.bundleId,
    evidenceSummary: evidenceSummary(bundle),
  });
}

function validateItemIdentity(itemId: string, bundle: EvidenceBundle): void {
  const item = getDoc("users/local/triageQueue", itemId);
  if (!item) throw new TriageArtifactError("itemId does not refer to a triage item", 404);
  if (typeof item.url !== "string" || canonicalizeUrl(item.url) !== canonicalizeUrl(bundle.canonicalUrl)) {
    throw new TriageArtifactError("evidence does not belong to itemId", 400);
  }
}

export function persistEvidence(bundleInput: unknown, itemId?: unknown): EvidenceBundle {
  const bundle = validateEvidenceBundle(bundleInput);
  const item = itemId === undefined ? undefined : id(itemId, "itemId");
  if (item) validateItemIdentity(item, bundle);
  const payloadHash = digest(bundle);
  runInTransaction(() => {
    const existing = getDoc(TRIAGE_EVIDENCE_COLLECTION, bundle.bundleId);
    if (existing) {
      ensureSame(bundle.bundleId, existing, bundle);
      if (item) attachEvidence(item, bundle);
      return;
    }
    setDoc(TRIAGE_EVIDENCE_COLLECTION, bundle.bundleId, {
      ...bundle,
      ...(item ? { itemId: item } : {}),
      payloadHash,
      recordedAt: { __date: new Date().toISOString() },
    });
    if (item) attachEvidence(item, bundle);
  });
  return bundle;
}

function validateAssessment(input: unknown): TriageAssessmentRecord {
  checkJsonSize(input);
  const value = record(input);
  const inputSegmentIds = array(value.inputSegmentIds, "inputSegmentIds", MAX_SEGMENTS).map((v, i) => id(v, `inputSegmentIds[${i}]`));
  const omittedSegmentIds = array(value.omittedSegmentIds, "omittedSegmentIds", MAX_SEGMENTS).map((v, i) => id(v, `omittedSegmentIds[${i}]`));
  if (new Set([...inputSegmentIds, ...omittedSegmentIds]).size !== inputSegmentIds.length + omittedSegmentIds.length) {
    throw new TriageArtifactError("inputSegmentIds and omittedSegmentIds must not overlap", 400);
  }
  const grounding = array(value.grounding, "grounding", MAX_GROUNDING);
  if (typeof value.inputTruncated !== "boolean") {
    throw new TriageArtifactError("inputTruncated must be a boolean", 400);
  }
  const segmentIds = new Set(inputSegmentIds);
  for (const [index, citation] of grounding.entries()) {
    const c = record(citation);
    const cited = c.segmentId ?? c.id;
    const citedMany = c.segmentIds;
    const refs = Array.isArray(citedMany) ? citedMany : cited === undefined ? [] : [cited];
    if (!refs.length || refs.some((ref) => typeof ref !== "string" || !segmentIds.has(ref))) {
      throw new TriageArtifactError(`grounding[${index}] cites an unknown segment`, 400);
    }
  }
  return {
    assessmentId: id(value.assessmentId, "assessmentId"),
    itemId: id(value.itemId, "itemId"),
    bundleId: id(value.bundleId, "bundleId"),
    createdAt: iso(value.createdAt, "createdAt"),
    model: requiredString(value.model, "model", 160),
    promptVersion: requiredString(value.promptVersion, "promptVersion", 160),
    personaHash: requiredString(value.personaHash, "personaHash", 256),
    rubricHash: requiredString(value.rubricHash, "rubricHash", 256),
    inputSegmentIds,
    omittedSegmentIds,
    inputTruncated: value.inputTruncated,
    proposal: requiredRecord(value.proposal, "proposal"),
    grounding,
  };
}

function compatibilityProposal(item: Record<string, unknown>, assessment: TriageAssessmentRecord): TriageProposal | Record<string, unknown> {
  const current = record(item.proposal);
  const proposal = record(assessment.proposal);
  return { ...current, ...proposal, assessment: assessment.proposal };
}

export function publishAssessment(input: unknown, expectedPriorAssessmentId?: unknown): TriageAssessmentRecord {
  const assessment = validateAssessment(input);
  const expected = expectedPriorAssessmentId === undefined || expectedPriorAssessmentId === null
    ? undefined
    : id(expectedPriorAssessmentId, "expectedPriorAssessmentId");
  const payloadHash = digest(assessment);
  runInTransaction(() => {
    const existing = getDoc(TRIAGE_ASSESSMENTS_COLLECTION, assessment.assessmentId);
    if (existing) {
      ensureSame(assessment.assessmentId, existing, assessment);
      return;
    }
    const bundle = getDoc(TRIAGE_EVIDENCE_COLLECTION, assessment.bundleId);
    if (!bundle) throw new TriageArtifactError("bundleId does not refer to stored evidence", 404);
    const item = getDoc("users/local/triageQueue", assessment.itemId);
    if (!item) throw new TriageArtifactError("itemId does not refer to a triage item", 404);
    if (typeof bundle.itemId === "string" && bundle.itemId !== assessment.itemId) {
      throw new TriageArtifactError("assessment itemId does not match its evidence bundle", 400);
    }
    if (typeof item.url !== "string" || typeof bundle.canonicalUrl !== "string" || canonicalizeUrl(item.url) !== canonicalizeUrl(bundle.canonicalUrl)) {
      throw new TriageArtifactError("assessment itemId does not match its evidence bundle", 400);
    }
    const bundleSegmentIds = new Set(
      (Array.isArray(bundle.segments) ? bundle.segments : [])
        .map((segment) => record(segment).id)
        .filter((segmentId): segmentId is string => typeof segmentId === "string")
    );
    if ([...assessment.inputSegmentIds, ...assessment.omittedSegmentIds].some((segmentId) => !bundleSegmentIds.has(segmentId))) {
      throw new TriageArtifactError("assessment references a segment outside its evidence bundle", 400);
    }
    const prior = typeof item.assessmentRef === "string" ? item.assessmentRef : undefined;
    if (expected !== prior) {
      throw new TriageArtifactError("assessment is based on an unexpected prior assessment", 409);
    }
    setDoc(TRIAGE_ASSESSMENTS_COLLECTION, assessment.assessmentId, {
      ...assessment,
      payloadHash,
    });
    const patch: Record<string, unknown> = {
      assessmentRef: assessment.assessmentId,
      proposal: compatibilityProposal(item, assessment),
    };
    // Only queued items are promoted. Deferred dates and every terminal decision
    // are deliberately left untouched when a slow assessment finishes.
    if (item.status === "queued") patch.status = "proposed";
    updateDoc("users/local/triageQueue", assessment.itemId, patch);
  });
  return assessment;
}
