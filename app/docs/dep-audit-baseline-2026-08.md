# Dependency audit against Baseline — 2026-08-08

Prompted by [Smashing Magazine's Baseline audit guide](https://www.smashingmagazine.com/2026/08/how-baseline-can-help-ship-less-javascript/) (claims 60–90KB gzipped of removable weight in a typical mid-sized app). Result for LifeOS: **zero removable dependencies**. Every runtime dep is imported, and none duplicates a Baseline platform feature.

| Article target | LifeOS state |
|---|---|
| Date libs (moment, date-fns, dayjs) | None. Date formatting uses `Intl` directly. |
| HTTP libs (axios, node-fetch) | None. Native `fetch` throughout. |
| Utility libs (lodash: groupBy, clone) | None. |
| Modal/popover libs | `radix-ui` (16 imports) — a11y behavior layer for the shadcn/ui system, not a `<dialog>`/popover polyfill. Keep. |
| structuredClone / Object.groupBy polyfills | None present. |

Deps that look like candidates but aren't:

- `openai` — client for the OpenAI-compatible claude-shim/Ollama endpoint (`src/lib/ollama.ts`, agent-engine, chat route). Replacing an SDK with hand-rolled fetch is churn, not a platform win.
- `clsx` + `tailwind-merge` + `class-variance-authority` — the shadcn `cn()` stack; tiny and load-bearing.
- `tw-animate-css` — imported from global CSS, drives the animation utilities.

Re-run this audit only when a new dependency lands (the constitution gates that anyway) or when Next.js majors change the bundling story.
