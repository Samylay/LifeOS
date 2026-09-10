#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_BASE_URL = "https://abtest.design/";
export const DEFAULT_SITEMAP_URL = "https://abtest.design/sitemap.xml";
export const MIN_TEST_COUNT = 47;
const SAFE_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const ALLOWED_REMOTE_HOSTS = new Set(["abtest.design", "framerusercontent.com"]);
const SITE_COPY = new Set([
  "Curated collection of A/B test results from best-in-class apps",
  "Powered by",
  "Submit test",
  "Categories",
  "Paywall & free trial",
  "Onboarding",
  "Checkout & sales",
  "User engagement & retention",
  "Monetization awareness",
  "Referral",
  "Misc",
  "Share feedback",
]);

function cleanText(value) {
  return String(value ?? "")
    .replace(/&nbsp;|\u00a0/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;|&#47;/gi, "/")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value) {
  return cleanText(value)
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function canonicalUrl(value) {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

/** Refuse redirects or page metadata that could point the importer at the LAN. */
export function allowedRemoteUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid remote URL: ${value}`);
  }
  if (url.protocol !== "https:" || !ALLOWED_REMOTE_HOSTS.has(url.hostname)) {
    throw new Error(`Remote URL is outside the scrape allowlist: ${url}`);
  }
  return url;
}

function containedPath(root, ...segments) {
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, ...segments);
  if (candidate === resolvedRoot || !candidate.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Unsafe corpus path: ${segments.join("/")}`);
  }
  return candidate;
}

function validateCorpusImagePath(value) {
  const file = String(value ?? "");
  const segments = file.split("/");
  if (
    segments.length < 3 ||
    segments[0] !== "images" ||
    segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\")) ||
    !imageExtension(`https://framerusercontent.com/${encodeURI(file)}`)
  ) {
    throw new Error(`Unsafe manifest image path: ${file}`);
  }
  return segments;
}

export function parseSitemap(xml, baseUrl = DEFAULT_BASE_URL) {
  if (typeof xml !== "string" || !xml.trim()) throw new Error("Sitemap is empty");
  const base = new URL(baseUrl);
  const urls = [];
  for (const match of xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)) {
    const raw = decodeXml(match[1]);
    let url;
    try {
      url = new URL(raw, base);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.hostname !== base.hostname) continue;
    const pathname = url.pathname.replace(/\/+$/, "");
    if (!/^\/tests\/[^/]+$/i.test(pathname)) continue;
    url.pathname = pathname;
    url.search = "";
    url.hash = "";
    urls.push(url.toString());
  }
  return [...new Set(urls)].sort((a, b) => a.localeCompare(b));
}

export function stableSlug(sourceUrl) {
  let segment = "";
  try {
    const url = new URL(sourceUrl);
    segment = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
  } catch {
    segment = String(sourceUrl);
  }
  const slug = segment
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug) return slug;
  return `test-${crypto.createHash("sha256").update(String(sourceUrl)).digest("hex").slice(0, 12)}`;
}

function extractMeta(html, name) {
  const pattern = new RegExp(`<meta\\b[^>]*(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(pattern)?.[0] ?? "";
  return tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "";
}

function roleFromImageTag(tag) {
  const role = tag.match(/\b(?:data-role|data-label|aria-label|alt)=["']([^"']*)["']/i)?.[1] ?? "";
  const normalized = cleanText(role).toLowerCase();
  const control = /\bcontrol\b/.test(normalized);
  const variant = /\bvariant\b/.test(normalized);
  if (control && !variant) return "control";
  if (variant && !control) return "variant";
  return "experiment";
}

function imageExtension(assetUrl) {
  let pathname;
  try {
    pathname = new URL(assetUrl).pathname;
  } catch {
    return null;
  }
  const extension = path.extname(pathname).toLowerCase();
  return SAFE_IMAGE_EXTENSIONS.has(extension) ? extension : null;
}

export function extractMainImages(html) {
  if (typeof html !== "string") return [];
  const contentMarker = html.search(/data-framer-name=["']Content["']/i);
  const limit = contentMarker >= 0 ? contentMarker : html.length;
  const seen = new Set();
  const images = [];
  // Framer emits the main image in three responsive SSR variants. The stable
  // class is scoped to the experiment post, while recommendation cards use a
  // different image wrapper. Keep page order and dedupe those variants.
  const boundedHtml = html.slice(0, limit);
  const wrapper = /<div\b[^>]*class=["'][^"']*\bframer-16lvn8g\b[^"']*["'][^>]*>/gi;
  const wrappers = [...boundedHtml.matchAll(wrapper)];
  for (const [index, match] of wrappers.entries()) {
    const start = match.index + match[0].length;
    const end = wrappers[index + 1]?.index ?? boundedHtml.length;
    const imageTag = boundedHtml.slice(start, end).match(/<img\b[^>]*>/i)?.[0];
    const assetUrl = imageTag?.match(/\bsrc=["'](https:\/\/framerusercontent\.com\/images\/[^"']+)["']/i)?.[1];
    if (!assetUrl || !imageExtension(assetUrl)) continue;
    const url = canonicalUrl(assetUrl);
    if (seen.has(url)) continue;
    seen.add(url);
    images.push({ originalUrl: url, label: roleFromImageTag(imageTag) });
  }

  // Keep fixtures and future Framer markup useful if the wrapper class changes.
  // Only inspect the short tail immediately before Content, which excludes
  // the recommendation carousel that follows it.
  if (!images.length && contentMarker >= 0) {
    const tail = html.slice(Math.max(0, contentMarker - 5000), contentMarker);
    for (const match of tail.matchAll(/<img\b[^>]*\bsrc=["'](https:\/\/framerusercontent\.com\/images\/[^"']+)["'][^>]*>/gi)) {
      const assetUrl = match[1];
      if (!imageExtension(assetUrl)) continue;
      const url = canonicalUrl(assetUrl);
      if (seen.has(url)) continue;
      seen.add(url);
      images.push({ originalUrl: url, label: roleFromImageTag(match[0]) });
    }
  }
  return images;
}

export function extractTeaching(entry) {
  if (!entry || typeof entry !== "object") throw new Error("Search index entry is missing");
  const title = cleanText(entry.title) || cleanText(entry.h2?.at(-1));
  const headings = Array.isArray(entry.h2) ? entry.h2.map(cleanText).filter(Boolean) : [];
  const bullet = headings.indexOf("•");
  const category = bullet >= 0 ? headings[bullet + 1] ?? "" : headings.find((h) => h !== title) ?? "";
  const company = bullet >= 1 ? headings[bullet - 1] ?? "" : headings.find((h) => h !== title && h !== category) ?? "";
  const paragraphs = Array.isArray(entry.p) ? entry.p.map(cleanText).filter(Boolean) : [];
  const resultsStart = paragraphs.findIndex((paragraph) => paragraph.toLowerCase() === "results");
  const sourceStart = paragraphs.findIndex((paragraph, index) => index > Math.max(resultsStart, 0) && paragraph.toLowerCase() === "source");
  const beforeResults = resultsStart >= 0 ? paragraphs.slice(0, resultsStart) : paragraphs;
  const summary = [...beforeResults].reverse().find((paragraph) => !SITE_COPY.has(paragraph) && paragraph.length > 20) ?? "";
  const resultEnd = sourceStart >= 0 ? sourceStart : paragraphs.length;
  const results = resultsStart >= 0
    ? paragraphs.slice(resultsStart + 1, resultEnd).filter((paragraph) => !SITE_COPY.has(paragraph))
    : [];
  return { title, company, category, summary, results };
}

export function extractTestRecord({ html, sourceUrl, searchIndexEntry }) {
  const teaching = extractTeaching(searchIndexEntry);
  if (!teaching.title || !teaching.company || !teaching.category || !teaching.summary) {
    throw new Error(`Malformed test page: ${sourceUrl}`);
  }
  const images = extractMainImages(html);
  if (!images.length) throw new Error(`Main experiment image missing: ${sourceUrl}`);
  return { slug: stableSlug(sourceUrl), ...teaching, sourceUrl: canonicalUrl(sourceUrl), images };
}

function safeAssetName(assetUrl, index, usedNames) {
  const extension = imageExtension(assetUrl);
  if (!extension) throw new Error(`Unsupported image extension: ${assetUrl}`);
  let base;
  try {
    base = path.basename(decodeURIComponent(new URL(assetUrl).pathname));
  } catch {
    base = "asset";
  }
  base = base.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^-+/, "") || `asset-${index}${extension}`;
  if (path.extname(base).toLowerCase() !== extension) base += extension;
  if (!usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }
  const digest = crypto.createHash("sha256").update(assetUrl).digest("hex").slice(0, 10);
  const stem = base.slice(0, -extension.length);
  const unique = `${stem}-${digest}${extension}`;
  usedNames.add(unique);
  return unique;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = allowedRemoteUrl(url);
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      const response = await fetch(current, { redirect: "manual", signal: controller.signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new Error(`Redirect without Location for ${current}`);
        current = allowedRemoteUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${current}`);
      return response;
    }
    throw new Error(`Too many redirects for ${url}`);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Timed out fetching ${url}`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, timeoutMs) {
  return (await fetchWithTimeout(url, timeoutMs)).text();
}

async function mapConcurrent(values, concurrency, worker) {
  const output = new Array(values.length);
  let next = 0;
  async function consume() {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      output[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, consume));
  return output;
}

export async function writeCorpusAtomically(outputDir, records, imageData, minTests = MIN_TEST_COUNT) {
  const outputParent = path.dirname(outputDir);
  await fs.mkdir(outputParent, { recursive: true });
  const stageDir = await fs.mkdtemp(path.join(outputParent, ".abtest-design-stage-"));
  let backupDir;
  try {
    const imageDir = path.join(stageDir, "images");
    await fs.mkdir(imageDir, { recursive: true });
    for (const item of imageData) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) {
        throw new Error(`Unsafe image slug: ${item.slug}`);
      }
      if (path.basename(item.filename) !== item.filename || !imageExtension(`https://framerusercontent.com/${item.filename}`)) {
        throw new Error(`Unsafe image filename: ${item.filename}`);
      }
      const target = containedPath(imageDir, item.slug);
      await fs.mkdir(target, { recursive: true });
      await fs.writeFile(containedPath(target, item.filename), item.bytes);
    }
    const manifest = {
      version: 1,
      source: DEFAULT_BASE_URL,
      fetchedAt: new Date().toISOString(),
      tests: records,
    };
    await fs.writeFile(path.join(stageDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const check = JSON.parse(await fs.readFile(path.join(stageDir, "manifest.json"), "utf8"));
    if (check.tests.length < minTests) throw new Error(`Refusing to write only ${check.tests.length} tests`);
    for (const test of check.tests) {
      for (const image of test.images) {
        await fs.access(containedPath(stageDir, ...validateCorpusImagePath(image.file)));
      }
    }

    try {
      await fs.access(outputDir);
      backupDir = `${outputDir}.previous-${process.pid}-${Date.now()}`;
      await fs.rename(outputDir, backupDir);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      await fs.rename(stageDir, outputDir);
    } catch (error) {
      if (backupDir) await fs.rename(backupDir, outputDir).catch(() => {});
      throw error;
    }
    if (backupDir) await fs.rm(backupDir, { recursive: true, force: true });
  } catch (error) {
    await fs.rm(stageDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function importCorpus({
  outputDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/abtest-design"),
  sitemapUrl = DEFAULT_SITEMAP_URL,
  minTests = MIN_TEST_COUNT,
  timeoutMs = 30_000,
  concurrency = 6,
} = {}) {
  const sitemap = await fetchText(sitemapUrl, timeoutMs);
  const sourceUrls = parseSitemap(sitemap);
  if (sourceUrls.length < minTests) throw new Error(`Refusing to import ${sourceUrls.length} tests, expected at least ${minTests}`);
  const pages = await mapConcurrent(sourceUrls, concurrency, async (sourceUrl) => ({ sourceUrl, html: await fetchText(sourceUrl, timeoutMs) }));
  const searchIndexUrl = extractMeta(pages[0].html, "framer-search-index") || null;
  if (!searchIndexUrl) throw new Error("Framer search index URL missing");
  const searchIndex = JSON.parse(await fetchText(searchIndexUrl, timeoutMs));
  const records = [];
  const imageData = [];
  const usedSlugs = new Set();
  for (const page of pages) {
    const pathname = new URL(page.sourceUrl).pathname;
    const entry = searchIndex[pathname];
    if (!entry) throw new Error(`Search index entry missing: ${pathname}`);
    const record = extractTestRecord({ html: page.html, sourceUrl: page.sourceUrl, searchIndexEntry: entry });
    if (usedSlugs.has(record.slug)) throw new Error(`Stable slug collision: ${record.slug}`);
    usedSlugs.add(record.slug);
    const usedNames = new Set();
    const manifestImages = [];
    for (const [index, image] of record.images.entries()) {
      const filename = safeAssetName(image.originalUrl, index, usedNames);
      const bytes = new Uint8Array(await (await fetchWithTimeout(image.originalUrl, timeoutMs)).arrayBuffer());
      imageData.push({ slug: record.slug, filename, bytes });
      manifestImages.push({ file: `images/${record.slug}/${filename}`, originalUrl: image.originalUrl, label: image.label });
    }
    records.push({ ...record, images: manifestImages });
  }
  records.sort((a, b) => a.slug.localeCompare(b.slug));
  await writeCorpusAtomically(outputDir, records, imageData, minTests);
  return {
    testCount: records.length,
    imageCount: imageData.length,
    ambiguousImageCount: imageData.filter((item) => records.some((record) => record.slug === item.slug && record.images.some((image) => image.file.endsWith(`/${item.filename}`) && image.label === "experiment"))).length,
    outputDir,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    args[key] = argv[index + 1]?.startsWith("--") ? true : argv[++index];
  }
  return args;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  importCorpus({
    outputDir: args.outputDir,
    sitemapUrl: args.sitemapUrl,
    minTests: args.minTests ? Number(args.minTests) : undefined,
    timeoutMs: args.timeoutMs ? Number(args.timeoutMs) : undefined,
    concurrency: args.concurrency ? Number(args.concurrency) : undefined,
  })
    .then((result) => {
      console.log(`Imported ${result.testCount} tests and ${result.imageCount} images into ${result.outputDir}`);
      console.log(`Ambiguous image labels retained neutrally: ${result.ambiguousImageCount}`);
    })
    .catch((error) => {
      console.error(`A/B test import failed: ${error.message}`);
      process.exitCode = 1;
    });
}
