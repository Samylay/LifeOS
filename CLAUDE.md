# LifeOS — agent context

- App code lives in `app/` (Next.js 16 + better-sqlite3). The live Obsidian vault is `~/vault/obsidian` (mounted at `/vault`), outside this repo. The old repo-root vault moved to `06-Archive/lifeos-repo-vault/` there on 2026-10-01; never put notes or personal data in this repo, its remote is public.
- Before any change, read `ROADMAP.md` → "Context for the executor" (verify gate, serving topology, NEVER list live there).

## Interaction & motion (house doctrine, locked 2026-07-10)

- All UI work follows the `interaction-craft` skill (`~/.agents/skills/interaction-craft/SKILL.md` — Emil Kowalski doctrine). Load it before touching components; new components inherit it without being asked.
- Samy's explicit call (2026-07-10): LifeOS leans ANIMATED — it must feel nice to use, not austere. Exceptions: keyboard-driven flows and rapid repeat actions stay instant.
- Hard floor even without the skill loaded: animate only `transform`/`opacity`/`clip-path`/`filter`; ≤300ms with custom easing vars (never default `ease`); `transition-all` banned; `active:scale-[0.97]` press feedback on actionable elements; `prefers-reduced-motion` block required in `globals.css`; optimistic UI on frequent mutations.
- Approved deps for this doctrine (Samy, 2026-07-10): `sonner`, `vaul`.

## Page headers (Samy, 2026-09-26)

- Page headers contain the page title and useful actions. Do not add eyebrow labels, kickers, slogans, or explanatory taglines above or below the title. Samy explicitly rejected this pattern across all pages.
- Keep necessary instructions next to the relevant control, and actual status or record metadata in the relevant content. Use `PageHeader`, whose API intentionally has no kicker or description props.
- Apply this preference to future UI work unless Samy explicitly requests otherwise.

## Deploy (Samy, 2026-09-29)

- After adding a feature, deploy it without asking: `cd app && npx tsc --noEmit && docker compose build && docker compose up -d`, then smoke `/` and every touched route. Restarting the `lifeos` service is part of shipping.
- `docker-compose.yml` requires `CRAWL4AI_API_TOKEN`, which is in no env file. Export it from the running container's env (`docker inspect lifeos`), never print it, run compose, then unset it. Never invent a token.

## Agent skills

### Issue tracker

Issues and specs live as local markdown under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Software Factory (SF)

sf-types: surface:web-app, stack:nextjs, stack:react, stack:sqlite

- `.sf/bin/sf-types` lists the skills these types load (`--check` fails when one is missing). Vocabulary: SF ticket 11.
- Gate: `cd app && npm run verify:all`. It is the only definition of green. A unit is done when it passes, and a non-author verdict row in `.sf/ledger.tsv` names the commit (`.sf/bin/ledger-check`).
- Sandbox for any run of the app by an agent: `.sf/bin/sandbox` (no network, snapshot copy, never port 3000). Drive it with the `verify-lifeos` skill.
- Before a unit of work, write a brief from `.sf/briefs/TEMPLATE.md`. Product calls go through `.sf/playbooks/plan.md`.
- pstack is vendored at a pin, not committed: `.sf/bin/pstack-fetch`, then `.sf/bin/pstack-check`.

### Rule table (rule, then what enforces it)

| Rule | Enforced by |
|---|---|
| No `transition-all`, in TSX or CSS | `.sf/bin/rules` (ast-grep `motion-no-transition-all`, `css-no-transition-all`), fixtures from af10eca |
| Motion at most 500 ms | `.sf/bin/rules` (`motion-duration-cap`) |
| Animate only transform, opacity, clip-path, filter | `.sf/bin/rules` (`motion-no-layout-transition`) |
| Never enter from `scale-0` | `.sf/bin/rules` (`motion-no-scale-zero`) |
| No `*/` inside CSS comment text | `.sf/bin/rules` (css comment check), fixtures from af10eca and 0f85874 |
| Single-key page shortcuts go through `pageShortcut()` (no Ctrl/Cmd/Alt, no repeats) | `.sf/bin/rules` (ast-grep `page-shortcut-helper`), fixture from ca829e0 |
| The suite is green before "done" | `npm run verify:all` (tests stage) |
| Vendored pstack is unedited | `.sf/bin/pstack-check` |
| Page headers have no kicker or description | `PageHeader` has no such props (type level) |
| Press feedback, reduced-motion block, optimistic UI | prose only (judgment), see Interaction & motion above |
