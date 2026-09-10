// Read-only runtime access to the private abtest.design corpus. The importer
// owns this directory. Runtime reads must stay fail-soft because the corpus is
// optional and is deliberately not part of the application image.
import fs from "node:fs";
import path from "node:path";

export interface AbTestImage {
  file: string;
  originalUrl: string;
  label: string;
}

export interface AbTestCase {
  [key: string]: unknown;
  slug: string;
  title: string;
  company: string;
  category: string;
  summary: string;
  results: string[];
  sourceUrl: string;
  images: AbTestImage[];
}

export interface AbTestManifest {
  version: 1;
  source: string;
  fetchedAt: string;
  tests: AbTestCase[];
}

const MANIFEST_NAME = "manifest.json";

/** Returns the configured corpus root without touching the filesystem. */
export function getAbTestContentDir(): string {
  const configured = process.env.ABTEST_CONTENT_DIR?.trim();
  return path.resolve(configured || path.join(process.cwd(), "data", "abtest-design"));
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeResults(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter(Boolean);
}

function safeImageFile(value: unknown): string {
  const file = text(value);
  const parts = file.split("/");
  if (
    parts.length < 3 ||
    parts[0] !== "images" ||
    parts.some((part) => !part || part === "." || part === ".." || part.includes("\\")) ||
    !/\.(?:avif|gif|jpe?g|png|webp)$/i.test(file)
  ) {
    return "";
  }
  return file;
}

function safeSourceUrl(value: unknown, slug: string): string {
  try {
    const url = new URL(text(value));
    if (
      url.protocol !== "https:" ||
      url.hostname !== "abtest.design" ||
      url.pathname.replace(/\/+$/, "") !== `/tests/${slug}`
    ) {
      return "";
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeImage(value: unknown): AbTestImage | null {
  const image = record(value);
  if (!image) return null;
  const file = safeImageFile(image.file);
  if (!file) return null;
  return {
    file,
    originalUrl: text(image.originalUrl),
    label: text(image.label),
  };
}

function normalizeCase(value: unknown): AbTestCase | null {
  const item = record(value);
  if (!item) return null;
  const slug = text(item.slug);
  const title = text(item.title);
  // These two fields identify and display a card. Do not manufacture either
  // value from another field when an imported record is malformed.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !title) return null;
  return {
    slug,
    title,
    company: text(item.company),
    category: text(item.category),
    summary: text(item.summary),
    results: normalizeResults(item.results),
    sourceUrl: safeSourceUrl(item.sourceUrl, slug),
    images: Array.isArray(item.images)
      ? item.images.map(normalizeImage).filter((image): image is AbTestImage => image !== null)
      : [],
  };
}

function normalizeManifest(value: unknown): AbTestManifest | null {
  const manifest = record(value);
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.tests)) return null;

  const seen = new Set<string>();
  const tests: AbTestCase[] = [];
  for (const value of manifest.tests) {
    const item = normalizeCase(value);
    if (!item || seen.has(item.slug)) continue;
    seen.add(item.slug);
    tests.push(item);
  }
  return {
    version: 1,
    source: text(manifest.source),
    fetchedAt: text(manifest.fetchedAt),
    tests,
  };
}

/** Reads and validates manifest.json. Missing or malformed content is empty. */
export function loadAbTestManifest(): AbTestManifest | null {
  try {
    const raw = fs.readFileSync(path.join(getAbTestContentDir(), MANIFEST_NAME), "utf8");
    return normalizeManifest(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Returns normalized test cases, or an empty collection when unavailable. */
export function loadAbTestCases(): AbTestCase[] {
  return loadAbTestManifest()?.tests ?? [];
}

/** Builds the same-origin URL used by the image route for manifest metadata. */
export function getAbTestImageUrl(file: string): string {
  return `/api/ab-tests/images/${file.split("/").map(encodeURIComponent).join("/")}`;
}
