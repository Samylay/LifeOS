// Read-only LifeOS adapter for the internal Crawl4AI PoC.
// This module deliberately exposes a narrow, safe subset of the Docker API.
// It never writes to LifeOS, the vault, or external services.

const CRAWL4AI_URL = (process.env.CRAWL4AI_URL || "").replace(/\/$/, "");
const CRAWL4AI_TOKEN = process.env.CRAWL4AI_API_TOKEN || "";
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_MARKDOWN_CHARS = 30_000;

export type CrawlPreset =
  | "source"
  | "evidence"
  | "news"
  | "brief"
  | "knowledge"
  | "learning"
  | "homelab";

export interface CrawlPresetInfo {
  id: CrawlPreset;
  label: string;
  purpose: string;
}

export interface CrawlPreview {
  preset: CrawlPreset;
  requestedUrl: string;
  canonicalUrl: string;
  title: string;
  markdown: string;
  fitMarkdown: string;
  links: Array<{ href: string; text?: string }>;
  media: Array<{ src: string; type?: string; alt?: string }>;
  metadata: Record<string, unknown>;
  success: boolean;
  error?: string;
  durationMs: number;
  persisted: false;
}

export interface CrawlHealth {
  configured: boolean;
  reachable: boolean;
  version?: string;
  error?: string;
}

const presets: Record<CrawlPreset, { label: string; purpose: string }> = {
  source: { label: "Source fetch", purpose: "Replace the Jina full-text path for one readable source." },
  evidence: { label: "Triage evidence", purpose: "Preview source text and links for an evidence bundle." },
  news: { label: "News article", purpose: "Fetch an article behind an RSS item for later summarising." },
  brief: { label: "Brief web card", purpose: "Test a web-backed morning-brief fetcher." },
  knowledge: { label: "Knowledge import", purpose: "Preview Markdown and exact source text before note or passage import." },
  learning: { label: "Learning material", purpose: "Preview material that could support a topic without changing learning state." },
  homelab: { label: "UI reference", purpose: "Preview component or documentation pages for future agent context." },
};

export function crawlPresets(): CrawlPresetInfo[] {
  return (Object.keys(presets) as CrawlPreset[]).map((id) => ({ id, ...presets[id] }));
}

export function isCrawl4AiConfigured(): boolean {
  return Boolean(CRAWL4AI_URL && CRAWL4AI_TOKEN);
}

function rejectUnsafeUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("URL must be absolute.");
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
    throw new Error("Only credential-free HTTP(S) URLs are allowed.");
  }
  const host = url.hostname.toLowerCase();
  const normalizedHost = host.replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "ip6-localhost" ||
    host === "host.docker.internal" ||
    host === "metadata.google.internal" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    normalizedHost === "::1" ||
    normalizedHost.startsWith("fc") ||
    normalizedHost.startsWith("fd") ||
    normalizedHost.startsWith("fe80:")
  ) {
    throw new Error("Private, loopback, and local-network destinations are not allowed.");
  }
  url.hash = "";
  return url;
}

function text(value: unknown, max = MAX_MARKDOWN_CHARS): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function resultRows(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  const body = value as Record<string, unknown>;
  if (Array.isArray(body.results)) return body.results.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
  if (body.result && typeof body.result === "object") {
    const nested = body.result as Record<string, unknown>;
    if (Array.isArray(nested.results)) return nested.results.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
  }
  return [];
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  if (!isCrawl4AiConfigured()) throw new Error("Crawl4AI is not configured.");
  const response = await fetch(`${CRAWL4AI_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CRAWL4AI_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body && typeof body === "object" && "detail" in body ? String((body as { detail?: unknown }).detail) : `HTTP ${response.status}`;
    throw new Error(`Crawl4AI ${response.status}: ${detail.slice(0, 300)}`);
  }
  return body;
}

async function awaitJob(body: unknown): Promise<unknown> {
  if (!body || typeof body !== "object" || !("task_id" in body)) return body;
  const taskId = String((body as { task_id?: unknown }).task_id || "");
  if (!taskId) return body;
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await request(`/task/${encodeURIComponent(taskId)}`, { method: "GET" });
    if (status && typeof status === "object") {
      const state = String((status as { status?: unknown }).status || "").toLowerCase();
      if (["completed", "success", "failed", "error"].includes(state) || resultRows(status).length > 0) return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Crawl4AI job timed out.");
}

function normalize(preset: CrawlPreset, requestedUrl: string, body: unknown, durationMs: number): CrawlPreview {
  const row = resultRows(body)[0] || {};
  const markdownSource = row.markdown && typeof row.markdown === "object" ? row.markdown as Record<string, unknown> : {};
  const markdown = text(markdownSource.raw_markdown || row.markdown || row.raw_markdown || row.cleaned_html);
  const fitMarkdown = text(
    row.fit_markdown || markdownSource.fit_markdown,
  );
  const linkGroups = row.links && typeof row.links === "object" ? row.links as Record<string, unknown> : {};
  const linkValues = Object.values(linkGroups).flatMap((group) => Array.isArray(group) ? group : []);
  const links = linkValues
    .filter((link): link is Record<string, unknown> => Boolean(link) && typeof link === "object")
    .slice(0, 100)
    .map((link) => ({ href: String(link.href || link.url || ""), text: typeof link.text === "string" ? link.text : undefined }))
    .filter((link) => link.href);
  const mediaGroups = row.media && typeof row.media === "object" ? row.media as Record<string, unknown> : {};
  const mediaValues = Object.values(mediaGroups).flatMap((group) => Array.isArray(group) ? group : []);
  const media = mediaValues.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object").slice(0, 100).map((item) => ({ src: String(item.src || item.url || ""), type: typeof item.type === "string" ? item.type : undefined, alt: typeof item.alt === "string" ? item.alt : undefined })).filter((item) => item.src);
  const success = row.success !== false && Boolean(markdown || fitMarkdown || row.url);
  return {
    preset,
    requestedUrl,
    canonicalUrl: String(row.url || requestedUrl),
    title: String(row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>).title || "" : row.title || ""),
    markdown,
    fitMarkdown,
    links,
    media,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {},
    success,
    error: success ? undefined : String(row.error_message || row.error || "No readable content returned."),
    durationMs,
    persisted: false,
  };
}

export async function crawlPreview(preset: CrawlPreset, requestedUrl: string): Promise<CrawlPreview> {
  if (!(preset in presets)) throw new Error("Unknown Crawl4AI preset.");
  const url = rejectUnsafeUrl(requestedUrl);
  const started = Date.now();
  try {
    const body = await awaitJob(await request("/crawl", {
      method: "POST",
      body: JSON.stringify({
        urls: [url.href],
        browser_config: { headless: true },
        crawler_config: {
          type: "CrawlerRunConfig",
          params: {
            cache_mode: "bypass",
            word_count_threshold: 20,
            excluded_tags: ["script", "style", "noscript"],
            stream: false,
          },
        },
      }),
    }));
    return normalize(preset, requestedUrl, body, Date.now() - started);
  } catch (error) {
    return {
      preset,
      requestedUrl,
      canonicalUrl: url.href,
      title: "",
      markdown: "",
      fitMarkdown: "",
      links: [],
      media: [],
      metadata: {},
      success: false,
      error: error instanceof Error ? error.message : "Crawl failed.",
      durationMs: Date.now() - started,
      persisted: false,
    };
  }
}

export async function crawlHealth(): Promise<CrawlHealth> {
  if (!isCrawl4AiConfigured()) return { configured: false, reachable: false, error: "CRAWL4AI_URL or CRAWL4AI_API_TOKEN is missing." };
  try {
    const body = await request("/health", { method: "GET" });
    return { configured: true, reachable: true, version: body && typeof body === "object" && "version" in body ? String((body as { version?: unknown }).version) : undefined };
  } catch (error) {
    return { configured: true, reachable: false, error: error instanceof Error ? error.message : "Health check failed." };
  }
}
