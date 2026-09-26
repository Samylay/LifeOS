# LifeOS — agent context

- App code lives in `app/` (Next.js 16 + better-sqlite3). The repo root doubles as an Obsidian-style vault (`01-Inbox.md`, `02-Knowledge/`, …) — do not touch vault content except when a task explicitly says so.
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

## Agent skills

### Issue tracker

Issues and specs live as local markdown under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
