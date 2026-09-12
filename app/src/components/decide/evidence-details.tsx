"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, ChevronDown, ExternalLink, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type EvidenceStatus = "complete" | "partial" | "unavailable" | "not_applicable" | "not_requested";

export interface EvidenceSourceView {
  id: string;
  kind: string;
  url: string;
  [key: string]: unknown;
}

export interface EvidenceRelationView {
  fromSourceId: string;
  toSourceId: string;
  kind: string;
  [key: string]: unknown;
}

export interface EvidenceSegmentView {
  id: string;
  sourceId: string;
  kind: string;
  text: string;
  method: string;
  [key: string]: unknown;
}

export interface EvidenceCoverageView {
  sourceId: string;
  aspect: string;
  status: EvidenceStatus;
  [key: string]: unknown;
}

export interface EvidenceBundleView {
  schemaVersion: string;
  bundleId: string;
  contentHash: string;
  extractionVersion: string;
  requestedUrl: string;
  canonicalUrl: string;
  platform: string;
  fetchedAt: string;
  rootSourceId: string;
  sources: EvidenceSourceView[];
  relations: EvidenceRelationView[];
  segments: EvidenceSegmentView[];
  coverage: EvidenceCoverageView[];
  quality: string;
  issues: string[];
}

export interface AssessmentView {
  inputSegmentIds: string[];
  omittedSegmentIds: string[];
  grounding: unknown[];
}

const STATUS_ORDER: EvidenceStatus[] = ["unavailable", "partial", "complete"];

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function isEvidenceStatus(value: unknown): value is EvidenceStatus {
  return value === "complete" || value === "partial" || value === "unavailable" || value === "not_applicable" || value === "not_requested";
}

function validUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Parse the generic document-store response at the client boundary. The
 * server validates these records, but the Decide surface must fail closed if
 * an old or hand-edited document is encountered.
 */
export function parseEvidenceBundle(value: unknown): EvidenceBundleView | null {
  const record = objectValue(value);
  if (!record) return null;
  const required = ["schemaVersion", "bundleId", "contentHash", "extractionVersion", "requestedUrl", "canonicalUrl", "platform", "fetchedAt", "rootSourceId", "quality"];
  if (required.some((key) => !stringValue(record[key]))) return null;
  if (!validUrl(record.requestedUrl) || !validUrl(record.canonicalUrl)) return null;

  const sources = Array.isArray(record.sources)
    ? record.sources.map((entry) => {
      const source = objectValue(entry);
      const id = source && stringValue(source.id);
      const kind = source && stringValue(source.kind);
      const url = source && stringValue(source.url);
      return id && kind && url && validUrl(url) ? { ...source, id, kind, url } : null;
    }).filter((entry): entry is EvidenceSourceView => entry !== null)
    : [];
  const sourceIds = new Set(sources.map((source) => source.id));
  const rootSourceId = stringValue(record.rootSourceId);
  if (!rootSourceId || !sourceIds.has(rootSourceId)) return null;

  const relations = Array.isArray(record.relations)
    ? record.relations.map((entry) => {
      const relation = objectValue(entry);
      const fromSourceId = relation && stringValue(relation.fromSourceId);
      const toSourceId = relation && stringValue(relation.toSourceId);
      const kind = relation && stringValue(relation.kind);
      return fromSourceId && toSourceId && kind && sourceIds.has(fromSourceId) && sourceIds.has(toSourceId)
        ? { ...relation, fromSourceId, toSourceId, kind }
        : null;
    }).filter((entry): entry is EvidenceRelationView => entry !== null)
    : [];
  const segments = Array.isArray(record.segments)
    ? record.segments.map((entry) => {
      const segment = objectValue(entry);
      const id = segment && stringValue(segment.id);
      const sourceId = segment && stringValue(segment.sourceId);
      const kind = segment && stringValue(segment.kind);
      const text = segment && typeof segment.text === "string" ? segment.text : null;
      const method = segment && stringValue(segment.method);
      return id && sourceId && kind && text !== null && method && sourceIds.has(sourceId)
        ? { ...segment, id, sourceId, kind, text, method }
        : null;
    }).filter((entry): entry is EvidenceSegmentView => entry !== null)
    : [];
  const coverage = Array.isArray(record.coverage)
    ? record.coverage.map((entry) => {
      const item = objectValue(entry);
      const sourceId = item && stringValue(item.sourceId);
      const aspect = item && stringValue(item.aspect);
      const status = item?.status;
      return sourceId && aspect && isEvidenceStatus(status) && sourceIds.has(sourceId)
        ? { ...item, sourceId, aspect, status }
        : null;
    }).filter((entry): entry is EvidenceCoverageView => entry !== null)
    : [];

  return {
    schemaVersion: String(record.schemaVersion),
    bundleId: String(record.bundleId),
    contentHash: String(record.contentHash),
    extractionVersion: String(record.extractionVersion),
    requestedUrl: String(record.requestedUrl),
    canonicalUrl: String(record.canonicalUrl),
    platform: String(record.platform),
    fetchedAt: String(record.fetchedAt),
    rootSourceId,
    sources,
    relations,
    segments,
    coverage,
    quality: String(record.quality),
    issues: Array.isArray(record.issues) ? record.issues.filter((issue): issue is string => typeof issue === "string") : [],
  };
}

export function parseAssessment(value: unknown): AssessmentView | null {
  const record = objectValue(value);
  if (!record) return null;
  return {
    inputSegmentIds: stringArray(record.inputSegmentIds),
    omittedSegmentIds: stringArray(record.omittedSegmentIds),
    grounding: Array.isArray(record.grounding) ? record.grounding : [],
  };
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function platformName(platform: string): string {
  const normalized = platform.toLowerCase();
  if (normalized === "x" || normalized === "twitter") return "X";
  if (normalized === "instagram" || normalized === "ig") return "Instagram";
  return humanize(platform);
}

function sourceRelationLabel(bundle: EvidenceBundleView, source: EvidenceSourceView): string | null {
  if (source.id === bundle.rootSourceId) return `${platformName(bundle.platform)} post`;
  const incoming = bundle.relations.filter((relation) => relation.toSourceId === source.id);
  const kinds = new Set(incoming.map((relation) => relation.kind.toLowerCase()));
  if (kinds.has("contains") || kinds.has("child") || source.kind.toLowerCase() === "image" || source.kind.toLowerCase() === "video") {
    const order = typeof source.order === "number" ? source.order : typeof source.order === "string" ? Number(source.order) : NaN;
    return Number.isFinite(order) ? `Slide ${order}` : "Media";
  }
  if (["links_to", "linked", "outbound", "child_page"].some((kind) => kinds.has(kind))) return "Linked site";
  if (["quotes", "quote", "quoted"].some((kind) => kinds.has(kind))) return "Quoted post";
  if (["reply", "reply_to", "replies_to", "thread"].some((kind) => kinds.has(kind))) return "Thread post";
  return source.kind ? humanize(source.kind) : "Related source";
}

export function sourceLabel(bundle: EvidenceBundleView, source: EvidenceSourceView): string {
  const role = sourceRelationLabel(bundle, source);
  const author = stringValue(source.author);
  if (source.id === bundle.rootSourceId) return author ? `${role} · ${author}` : role ?? "Author post";
  return author && role ? `${role} · ${author}` : role ?? "Related source";
}

export function sourceIdHint(id: string): string {
  return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

export function formatTimestamp(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const milliseconds = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function segmentLabel(segment: EvidenceSegmentView): string {
  const method = segment.method.toLowerCase();
  if (method.includes("whisper") || segment.kind.toLowerCase() === "transcript") return "Transcript";
  if (method.includes("ocr") || segment.kind.toLowerCase() === "ocr") return method.includes("alt") ? "Alt text OCR" : "On-screen OCR";
  if (method.includes("alt-description") || segment.kind.toLowerCase() === "alt-text") return "Alt text";
  if (segment.kind.toLowerCase() === "caption") return "Caption";
  if (segment.kind.toLowerCase().includes("vision")) return "Vision observation";
  if (segment.kind.toLowerCase() === "frame") return "Frame candidate";
  return humanize(segment.kind || segment.method);
}

function coverageReason(item: EvidenceCoverageView): string | null {
  const reasonCode = stringValue(item.reasonCode);
  const detail = stringValue(item.detail);
  if (detail) return detail;
  if (reasonCode) return humanize(reasonCode);
  if (item.status === "partial") return "some material was not readable";
  if (item.status === "unavailable") return "source was not available";
  return null;
}

export interface CoverageView {
  status: EvidenceStatus;
  line: string;
  reasons: string[];
}

export function coverageView(bundle: EvidenceBundleView): CoverageView {
  const meaningful = bundle.coverage.filter((item) => item.status !== "not_applicable" && item.status !== "not_requested");
  const status = STATUS_ORDER.find((candidate) => meaningful.some((item) => item.status === candidate)) ?? (bundle.quality === "unavailable" ? "unavailable" : "complete");
  const reasons = meaningful
    .filter((item) => item.status === "partial" || item.status === "unavailable")
    .map((item) => {
      const reason = coverageReason(item);
      return `${humanize(item.aspect)}: ${reason ?? "not fully available"}`;
    });
  const statusLabel = humanize(status);
  const line = `Extraction ${statusLabel.toLowerCase()} · ${bundle.sources.length} sources · ${bundle.segments.length} evidence items${reasons.length ? ` · ${reasons[0]}` : ""}`;
  return { status, line, reasons };
}

function groundingIds(assessment: AssessmentView | null): Set<string> {
  const ids = new Set([...(assessment?.inputSegmentIds ?? [])]);
  for (const entry of assessment?.grounding ?? []) {
    if (typeof entry === "string") ids.add(entry);
    const record = objectValue(entry);
    const id = record && (record.segmentId ?? record.segment_id ?? record.id);
    if (typeof id === "string") ids.add(id);
  }
  return ids;
}

function segmentContext(segment: EvidenceSegmentView): string {
  const timestamp = [formatTimestamp(segment.startMs), formatTimestamp(segment.endMs)].filter(Boolean);
  if (timestamp.length === 2) return `${timestamp[0]}–${timestamp[1]}`;
  if (timestamp.length === 1) return timestamp[0] ?? "";
  const slide = typeof segment.slideIndex === "number" ? `Slide ${segment.slideIndex}` : typeof segment.slideIndex === "string" ? `Slide ${segment.slideIndex}` : "";
  const frame = stringValue(segment.frameId);
  return slide || (frame ? `Frame ${sourceIdHint(frame)}` : "");
}

function externalHref(value: unknown): string | null {
  return validUrl(value) ? value : null;
}

function mediaLinks(source: EvidenceSourceView): { url: string; label: string }[] {
  const metadata = objectValue(source.mediaMetadata);
  const images = metadata?.images;
  if (!Array.isArray(images)) return [];
  return images.map((entry, index) => {
    const media = objectValue(entry);
    const url = media && (media.url ?? media.mediaUrl ?? media.media_url ?? media.src ?? media.expandedUrl);
    return externalHref(url) ? { url, label: `Image ${index + 1}` } : null;
  }).filter((entry): entry is { url: string; label: string } => entry !== null);
}

function sourceSegments(bundle: EvidenceBundleView, sourceId: string): EvidenceSegmentView[] {
  return bundle.segments.filter((segment) => segment.sourceId === sourceId);
}

function sourceDetail(bundle: EvidenceBundleView, source: EvidenceSourceView, grounded: Set<string>) {
  const segments = sourceSegments(bundle, source.id);
  const media = mediaLinks(source);
  return (
    <li key={source.id} className="min-w-0 space-y-1.5 rounded-md border border-border/70 p-2.5">
      <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1 text-xs">
        <span className="min-w-0 font-medium text-foreground [overflow-wrap:anywhere]">{sourceLabel(bundle, source)}</span>
        {stringValue(source.publishedAt) && <time className="text-muted-foreground" dateTime={String(source.publishedAt)}>{formatDate(source.publishedAt)}</time>}
        <code className="ml-auto max-w-full text-[10px] text-muted-foreground" title={source.id}>{sourceIdHint(source.id)}</code>
      </div>
      {externalHref(source.url) && (
        <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 max-w-full items-center gap-1 text-xs text-primary underline-offset-4 hover:underline transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]">
          <span className="min-w-0 [overflow-wrap:anywhere]">Open source</span><ArrowUpRight size={12} aria-hidden />
        </a>
      )}
      {media.length > 0 && (
        <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs">
          {media.map((entry) => (
            <a key={entry.url} href={entry.url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 max-w-full items-center gap-1 text-primary underline-offset-4 hover:underline transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]">
              <span>{entry.label}</span><ArrowUpRight size={12} aria-hidden />
            </a>
          ))}
        </div>
      )}
      {segments.length > 0 && (
        <ul className="space-y-1.5 border-l border-border pl-2 text-xs text-muted-foreground">
          {segments.map((segment) => {
            const context = segmentContext(segment);
            return (
              <li key={segment.id} className="min-w-0 [overflow-wrap:anywhere]">
                <span className="font-medium text-foreground">{segmentLabel(segment)}</span>
                {context && <span className="ml-1 text-[11px]">· {context}</span>}
                {grounded.has(segment.id) && <span className="ml-1 rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">grounded</span>}
                <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{segment.text}</p>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function formatDate(value: unknown): string {
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function fetchDocument(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error("request failed");
  const body = await response.json() as unknown;
  const document = objectValue(body)?.doc;
  if (!document) throw new Error("document missing");
  return document;
}

function requestPath(collection: string, id: string): string {
  return `/api/data/${collection}/${encodeURIComponent(id)}`;
}

export function EvidenceDetails({ evidenceRef, assessmentRef }: { evidenceRef?: string; assessmentRef?: string }) {
  const [bundle, setBundle] = useState<EvidenceBundleView | null>(null);
  const [assessment, setAssessment] = useState<AssessmentView | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!evidenceRef) return;
    const controller = new AbortController();
    void fetchDocument(requestPath("users/local/triageEvidence", evidenceRef), controller.signal)
      .then((value) => {
        const parsed = parseEvidenceBundle(value);
        if (!parsed) throw new Error("invalid evidence");
        setBundle(parsed);
        setState("ready");
        if (assessmentRef) {
          void fetchDocument(requestPath("users/local/triageAssessments", assessmentRef), controller.signal)
            .then((assessmentValue) => setAssessment(parseAssessment(assessmentValue)))
            .catch(() => setAssessment(null));
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState("error");
      });
    return () => controller.abort();
  }, [assessmentRef, evidenceRef, retry]);

  if (!evidenceRef) return null;
  if (state === "loading" || state === "idle") {
    return <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status"><LoaderCircle size={13} aria-hidden className="animate-spin" /> Loading source evidence…</p>;
  }
  if (state === "error" || !bundle) {
    return (
      <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
        <p className="flex items-start gap-1.5"><AlertTriangle size={15} aria-hidden className="mt-0.5 shrink-0 text-warning" /><span><span className="font-medium">Evidence could not be loaded.</span> Check the source before acting.</span></p>
        <button type="button" onClick={() => { setState("loading"); setBundle(null); setRetry((value) => value + 1); }} className="min-h-8 rounded-md text-xs font-medium text-primary underline-offset-4 hover:underline transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]">Retry</button>
      </div>
    );
  }

  const coverage = coverageView(bundle);
  const grounded = groundingIds(assessment);
  return (
    <section className="min-w-0 space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3" aria-label="Source evidence">
      <div className="flex min-w-0 items-start gap-2">
        <p className={cn("min-w-0 flex-1 text-xs leading-relaxed", coverage.status === "complete" ? "text-muted-foreground" : "text-warning-foreground")}>{coverage.line}</p>
        {bundle.issues.length > 0 && <span className="shrink-0 text-[11px] text-warning" title={`${bundle.issues.length} extraction issue${bundle.issues.length === 1 ? "" : "s"}`}>· {bundle.issues.length} issue{bundle.issues.length === 1 ? "" : "s"}</span>}
      </div>
      {coverage.reasons.length > 0 && <p className="text-xs leading-relaxed text-warning-foreground">{coverage.reasons.join(" · ")}</p>}
      <details className="group/evidence min-w-0 border-t border-border/70 pt-2">
        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-md text-xs font-medium text-foreground transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97] [&::-webkit-details-marker]:hidden">
          <ChevronDown size={13} aria-hidden className="transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] group-open/evidence:rotate-180" />
          Sources <span className="text-muted-foreground">({bundle.sources.length})</span>
          <ExternalLink size={12} aria-hidden className="ml-auto text-muted-foreground" />
        </summary>
        <div className="min-w-0 space-y-2 pt-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground">Author claims and linked-site facts are listed separately by source. Evidence labels show how each passage was obtained.</p>
          <ul className="min-w-0 space-y-2">{bundle.sources.map((source) => sourceDetail(bundle, source, grounded))}</ul>
        </div>
      </details>
    </section>
  );
}
