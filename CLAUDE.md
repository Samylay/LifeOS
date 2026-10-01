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
