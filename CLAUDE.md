# LifeOS — agent context

- App code lives in `app/` (Next.js 16 + better-sqlite3). The repo root doubles as an Obsidian-style vault (`01-Inbox.md`, `02-Knowledge/`, …) — do not touch vault content except when a task explicitly says so.
- Before any change, read `ROADMAP.md` → "Context for the executor" (verify gate, serving topology, NEVER list live there).

## Interaction & motion (house doctrine, locked 2026-07-10)

- All UI work follows the `interaction-craft` skill (`~/.agents/skills/interaction-craft/SKILL.md` — Emil Kowalski doctrine). Load it before touching components; new components inherit it without being asked.
- Samy's explicit call (2026-07-10): LifeOS leans ANIMATED — it must feel nice to use, not austere. Exceptions: keyboard-driven flows and rapid repeat actions stay instant.
- Hard floor even without the skill loaded: animate only `transform`/`opacity`/`clip-path`/`filter`; ≤300ms with custom easing vars (never default `ease`); `transition-all` banned; `active:scale-[0.97]` press feedback on actionable elements; `prefers-reduced-motion` block required in `globals.css`; optimistic UI on frequent mutations.
- Approved deps for this doctrine (Samy, 2026-07-10): `sonner`, `vaul`.
