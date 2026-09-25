# Crawl4AI and LifeOS capability map

Date: 2026-09-22

Scope: compare Crawl4AI v0.9.x with the systems currently present in LifeOS. This is a capability map, not an implementation plan or permission to change live data.

## What Crawl4AI provides

Crawl4AI is a browser-backed web acquisition layer. It can:

- Fetch static and JavaScript-rendered pages, wait for selectors or JavaScript conditions, click or scroll through dynamic pages, and flatten Shadow DOM.
- Convert pages to Markdown, with raw and filtered `fit_markdown` variants, content pruning, link references, CSS/XPath targeting, and excluded elements.
- Extract structured JSON with CSS, XPath, or LLM strategies. LLM extraction supports schemas, chunking, overlap, multiple providers, and usage reporting.
- Crawl multiple URLs concurrently, stream results, cache results, reuse browser sessions, and run deep crawls with BFS, DFS, or best-first strategies.
- Filter and score discovered links by domain, URL pattern, content type, relevance, SEO signals, and keywords.
- Capture screenshots, PDFs, MHTML, links, media, metadata, console/network information, and SSL certificate data.
- Handle some anti-bot cases through detection, retry, proxy chains, and fallback fetch functions.
- Crawl adaptively until a query has enough evidence, with a confidence signal.
- Run locally as a Python SDK or through the Docker API.

Important limits:

- It does not own user workflows, scheduling, task state, finance data, workout records, or LifeOS decisions.
- LLM extraction is slower and more expensive than CSS/XPath extraction and still needs schema validation and provenance checks.
- The v0.9 Docker API has a deliberate security boundary. Authentication is enabled by default, it binds to loopback by default, and request bodies reject powerful browser-control fields such as arbitrary JavaScript, cookies, proxies, and deep-crawl strategies. Those controls must be configured server-side or used through the in-process SDK.
- The current latest 0.9.x release found in the official repository is 0.9.3, a security and maintenance release. PDF handling and Docker security deserve an upgrade test before adoption.

Sources: [Quick Start](https://docs.crawl4ai.com/core/quickstart/), [configuration reference](https://docs.crawl4ai.com/api/parameters/), [deep crawling](https://docs.crawl4ai.com/core/deep-crawling/), [Markdown generation](https://docs.crawl4ai.com/core/markdown-generation/), [LLM extraction](https://docs.crawl4ai.com/extraction/llm-strategies/), [v0.9.0 security model](https://github.com/unclecode/crawl4ai/blob/main/docs/blog/release-v0.9.0.md), [v0.9.3 release](https://github.com/unclecode/crawl4ai/releases).

## Replacement map

| LifeOS system | Current acquisition or processing | Crawl4AI fit | Decision |
|---|---|---|---|
| News aggregator | RSS/Atom fetch, regex parsing, Jina article text, Claude scoring and summaries | Strong for article pages, JS-heavy publications, full text, screenshots, PDF newsletters, and structured story extraction. It does not replace RSS scheduling, edition persistence, scoring policy, or notification logic. | Replace the Jina full-text fallback and fragile page fetches first. Keep RSS as the cheap discovery path. |
| Morning brief | Small RSS fetchers for FT and Fuite, plus Todoist, calendar, workouts, system health, and local files | Useful only for web-backed cards. It cannot replace Todoist, Google Calendar, Strava, Garmin, Docker health, or local-file readers. | Add a crawler-backed fetcher for selected web cards. Do not replace the brief builder. |
| Triage ingestion | External grabbers and the host-side study service produce queued items, assessments, tags, and evidence artifacts. LifeOS currently fetches readable saved sources through Jina. | Very strong for public article extraction, linked-page expansion, dynamic pages, PDFs, provenance bundles, and structured evidence. It can improve source coverage, but it must not decide whether an item is saved or which action is approved. | Candidate replacement for Jina in evidence extraction and linked-source crawling. Keep study prompts, closed action set, and user verdicts. |
| Decide evidence | Evidence bundles contain sources, relations, segments, coverage, quality, and grounding. | Excellent mechanical evidence producer: crawl the root page, follow relevant links, preserve source IDs, extract exact segments, and report coverage. Adaptive/deep crawling could support “find enough evidence” queries. | Highest-value integration. Build a bounded, read-only crawler worker behind the existing evidence schema. |
| Knowledge capture | Saved triage items can yield up to three verified verbatim passages. Source fetch currently skips X, Instagram, YouTube, and unreadable pages. | Strong for readable web pages, docs, PDFs, tables, and JS-rendered sources. Its Markdown and exact-source extraction can widen coverage. It does not replace the rule that only explicitly saved items may produce material. | Replace or supplement `source-fetch.ts`; keep the exact quote and saved-status gates. |
| Knowledge base and graph | Obsidian vault browsing, FTS search, notes, Hermes enrichment, graph layout | It can import external documentation into a reviewable note or produce structured entities/relations. It cannot replace the vault, FTS index, Hermes watcher, or graph UI. | Add an explicit “crawl into review” path. Never write directly into the vault without a user-approved boundary. |
| Teach and learning feed | Topics, attached material, LLM tutor sessions, concept maps, generated cards, quizzes | Useful to gather source material for a topic or extract structured facts from a documentation site. It cannot replace topic ownership, mission, session state, progress prose, or feed-generation rules. | Optional research-material source. No automatic topic creation or learning-state mutation. |
| Homelab/UI references | Saved URLs and summaries, keyword matching, queued skill-install prompts | Strong for crawling component docs, design systems, package docs, and linked examples. It can provide fresh summaries and page structure. It must not turn page text into executable install instructions. | Good fit for “save UI reference” enrichment and agent context. Keep the existing untrusted-reference boundary. |
| Content OS | Local idea bank, hook formulas, script/caption generation via the configured LLM | Weak replacement fit. Crawl4AI can gather source research or examples, but it should not replace the local idea bank, brand rules, human review, recording, or publishing decisions. | Optional research input only. No auto-publishing. |
| Essay review | User supplies an essay, then the LLM reviews it | No replacement fit. Crawl4AI could fetch cited sources for a separate evidence check, but it does not improve the core review flow by itself. | Leave unchanged. |
| Diagrams | Prompt sent to a host diagrams service that returns Mermaid and SVG | No direct replacement. Crawl4AI could crawl source material before diagram generation, but rendering remains a separate service. | Leave unchanged. |
| Voice and fluency | Whisper transcription, voice stash, fluency provider and review | No replacement fit. Crawl4AI is not audio transcription or pronunciation analysis. | Leave unchanged. |
| Finance | Bank provider sync, transaction ledger, labels, budgets, burn views | No replacement fit. Crawl4AI must not be used for bank authentication, account sync, or financial truth. | Leave unchanged. |
| Workouts and health | Strava and Garmin APIs, nutrition, body measurements, program logging | No replacement fit. Crawl4AI cannot safely replace authenticated fitness APIs or numeric health history. | Leave unchanged. |
| Recipes | Local recipe collection and meal planning | Possible source importer for public recipe pages, but not a replacement for the recipe store, planning, or nutrition rules. | Small optional importer, only if recipe capture is a priority. |
| Leads | Lead lifecycle, admission, contact outcomes, related work | It can discover public company or person pages, but it cannot replace lead admission, user availability, contact state, or outcomes. | Optional enrichment only, with explicit provenance and no automatic lead creation. |
| Prime, habits, goals, projects, status | Local state, Todoist writes, health checks, ROADMAP parsing, notifications | No replacement fit. Crawl4AI may read public project documentation, but these systems are stateful LifeOS workflows or infrastructure checks. | Leave unchanged. |

## Best replacement candidates

### 1. `source-fetch.ts` Jina path

Current weakness: the same Jina reader proxy is used by news and saved-source passage extraction. It skips dynamic pages and gives LifeOS little control over browser state, links, media, PDFs, or extraction quality.

Proposed boundary:

1. LifeOS sends only a validated, user-approved URL to a local Crawl4AI worker.
2. The worker returns Markdown, canonical URL, title, metadata, links, and optional PDF/media artifacts.
3. LifeOS stores a bounded evidence bundle or exact passages, never model-invented text as source text.
4. Failures remain normal empty or partial evidence outcomes.

### 2. Triage evidence collection

This is the strongest architectural match. Deep crawling can follow relevant linked documentation, best-first scoring can prioritize pages related to the user's question, and adaptive crawling can stop when enough evidence is gathered. The existing `sources`, `relations`, `segments`, `coverage`, `quality`, and `issues` fields already provide the right destination shape.

The crawler must be bounded by allowed domains, maximum pages, maximum bytes, wall-clock timeout, and an explicit query. It must never follow arbitrary links across the public web by default.

### 3. News full-text and non-RSS sources

Keep RSS/Atom for discovery because it is cheap and gives publication dates. Use Crawl4AI only for selected articles that need full text, pages rendered by JavaScript, PDFs, or pages where the feed description is too thin. Use CSS/XPath extraction before LLM extraction when the layout is stable.

## Do not replace

Crawl4AI should not replace:

- LifeOS's decision and approval boundaries.
- Todoist, Strava, Garmin, bank, calendar, Whisper, or diagrams integrations.
- The Obsidian vault or Hermes enrichment process.
- Exact-quote verification in `knowledge/passages.ts`.
- The saved-item rule in `knowledge/extract-item.ts`.
- The current LLM backend and prompts for scoring, teaching, content, or review.

## Recommended experiment

Build one read-only Crawl4AI service and connect it only to triage evidence. Test it against ten already-saved public URLs covering a static article, JavaScript page, documentation site, PDF, broken URL, login wall, YouTube page, external-link-heavy page, French article, and a page with tables.

Success means:

- every result has a canonical URL and provenance;
- exact passages always slice from returned source text;
- disallowed domains and private/internal destinations are refused;
- partial failures preserve useful evidence instead of failing the entire bundle;
- no triage status, verdict, vault note, or user data changes during the test.

That experiment answers whether Crawl4AI should replace Jina in the shared source-fetch layer before any wider LifeOS integration.

## PoC shipped

The first implementation is intentionally one read-only adapter with seven named presets rather than seven independent crawlers:

- `src/lib/crawl4ai.ts` calls the internal Crawl4AI Docker API, normalizes nested Markdown/link/media output, rejects local and private destinations, caps returned text and metadata, and marks every result `persisted: false`.
- `src/app/api/crawl4ai/poc/route.ts` exposes health, preset descriptions, and preview requests. It performs no LifeOS writes.
- `src/app/crawl4ai/page.tsx` provides the test surface at `/crawl4ai`.
- `docker-compose.yml` runs the pinned `unclecode/crawl4ai:0.9.3` image on the internal Docker network with a health check and no published port.

Deployed verification on 2026-09-22:

- Crawl4AI health: reachable, version 0.9.3.
- All seven presets returned successful previews for public example, documentation, FT, Python, and shadcn pages.
- Results included Markdown, titles, and links. Every response reported `persisted: false`.
- A request to `http://127.0.0.1:3000` was rejected by the LifeOS wrapper before reaching Crawl4AI.
- `/crawl4ai` and `/api/crawl4ai/poc` both returned HTTP 200.

This proves the acquisition seam. It does not yet replace Jina, alter news generation, create evidence bundles, write knowledge notes, or enrich homelab resources. Those are the next experiments after reviewing the returned quality against real saved sources.
