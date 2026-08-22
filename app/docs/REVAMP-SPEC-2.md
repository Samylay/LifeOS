# LifeOS Revamp-2 (homelab edition) — Implementation Spec

**Branch:** `revamp-2` (off `origin/master`). **Repo:** `~/Documents/Projects/LifeOS` (mirror of homelab `~/apps/lifeos`).
**Status:** Authoritative for implementers and the independent reviewer. User prunes afterward.

## LAW — read before touching anything
1. `CLAUDE.md` + `ROADMAP.md` "Context for the executor" are binding: NEVER touch vault content, `.env`, live DB (`data/lifeos.db` / volume), ports/networks/mounts. One logical change per commit, `autoloop:` prefix NOT used here (this is an interactive swarm, not the nightly executor) — use plain conventional commits. Never leave the tree dirty.
2. `app/STYLE.md` is binding: dark-only; 5 nav destinations (new surfaces live under More); the Assistant is the ONLY capture surface (no second capture UI); no engagement mechanics (no streaks/XP/infinite feeds); shadcn/ui first, chart kit for charts, no component-lib installs; semantic tokens only (`text-success` etc.), never hex status colors; motion = transform/opacity/clip-path/filter only, ≤300ms, custom easing vars, no `transition-all`, `active:scale-[0.97]`, reduced-motion block required.
3. Interaction doctrine skill: load `~/.agents/skills/interaction-craft/SKILL.md` before UI work.
4. Verify gate for every unit of work: `node node_modules/typescript/bin/tsc --noEmit` clean + `npm test` green (391 baseline) + touched routes still compile. Do NOT run docker or touch the live service from the dev machine.
5. LLM backend is `claude -p` via `src/lib/claude-cli.ts`. Ollama fallback stays. No new runtime deps except where a task says so (`vaul` is PRE-APPROVED).

## What this revamp is
The old REVAMP-SPEC.md targeted a stale Firebase snapshot and parts of it CONTRADICT the current design laws (gamification, second capture surface, light theme). That spec is superseded. This revamp implements the remaining open ROADMAP work that is buildable unattended, plus a critical-review fix list — nothing that violates STYLE.md.

## PART A — CRITICAL REVIEW OF CURRENT STATE (what's actually wrong)
- A1. **Docs lie about routes:** `app/docs/routes.md` still lists `/focus`, `/areas/*`, `/projects`, `/quests`, `/journeys`, `/goals`, `/calendar`, `/review`, `/capture` as routes — none exist in `src/app/`. The docs describe the dead Firebase-era app.
- A2. **T27 (goals → grilling → granular todos) is unbuilt plumbing**, fully specced in ROADMAP with decisions recorded. Todoist is the system of record; grilling sessions need Samy but the plumbing degrades gracefully.
- A3. **T29 (chat `queue_dev_request` tool) is unbuilt** — specced, decided, safe (writes a request doc, no shell power).
- A4. **T37 (Vaul mobile drawers)** pre-approved dep, retargeted surfaces (knowledge capture form, project detail, pager message actions), habit-tick vibration. Unbuilt.
- A5. **T38 (delight + stats polish)** count-ups exist on some tiles but celebrations/stagger/chart-mount polish per spec are missing; reduced-motion compliance not verified everywhere.
- A6. Legacy deprecated token aliases (`--bg-*`, `--text-*`, `--border-*`, `--accent`) still referenced by components; STYLE.md says delete once unreferenced.
- A7. Hard-coded status hexes exist in places despite the STYLE.md rule (grep-enforced below).

## PART B — BINDING REQUIREMENTS (reviewer checks each ID)

### R-A. Docs truth
- R-A.1 `app/docs/routes.md` rewritten to list ONLY real routes in `src/app/` with correct Live/Scaffold status. Zero phantom routes.
- R-A.2 `docs/features.md` stale Firebase-era sections removed or rewritten to match reality (SQLite local-db, claude-cli, dark-only).

### R-B. T27 — Goals → grilling pipeline plumbing (per ROADMAP T27 text)
- R-B.1 Goal schema gains `needsGrilling?: boolean` (tolerant read; no DB migration).
- R-B.2 Creating/editing a goal with `needsGrilling` auto-creates ONE todo-shaped reminder of the form "Grilling session: <goal>" (Todoist write via the SAME pattern as T60 `scheduleTopic`'s Todoist POST — token already in secrets env; fail soft: local state consistent, log+retry). Assert against stubbed endpoint in tests; NO live POST.
- R-B.3 Morning attention surface reads pending grilling sessions from LifeOS goals (not the md file); `decisions-needed.md` stays untouched as source of truth until Samy cutover (degrade gracefully = both shown, LifeOS ones labelled).
- R-B.4 Unit tests: flag round-trip, todo shape, fail-soft path.

### R-C. T29 — chat `queue_dev_request` tool (per ROADMAP T29 text)
- R-C.1 New function-calling tool in `src/app/api/chat/route.ts`: `queue_dev_request({project?, title, description})` writes to a `devRequests` store (same local-db pattern as other collections) with `{status:"queued", createdAt}`. No shell/file access. Chat system prompt updated to mention it can queue dev requests.
- R-C.2 Queued requests visible somewhere sane (e.g. a card/list under More or in settings) with mark-done. Tests: tool schema validation, store round-trip.

### R-D. T37 — Vaul drawers + haptics
- R-D.1 `vaul` added as dependency (PRE-APPROVED — allowed).
- R-D.2 At least TWO high-traffic mobile surfaces converted: knowledge capture form and pager message actions (mobile breakpoint via media query; desktop unchanged). iOS curve + velocity dismissal defaults.
- R-D.3 `navigator.vibrate?.(10)` on habit completion tick.
- R-D.4 House motion rules respected inside drawers (transform/opacity only, ≤300ms).

### R-E. T38 — Delight + stats polish
- R-E.1 Celebration animation on goal shipped + prime completion (SVG stroke draw-in or scale spring, ≤400ms, transform/opacity only), rare-events only.
- R-E.2 Count-up on ALL /status and /workouts headline stat tiles (CountUp exists — extend coverage).
- R-E.3 Staggered tile load-in + ~400ms ease-out chart mount on /workouts.
- R-E.4 `prefers-reduced-motion` skips count-ups/celebrations/stagger.

### R-F. Token hygiene (A6+A7)
- R-F.1 All components migrated off legacy `--bg-*`/`--text-*`/`--border-*`/`--accent` aliases onto the semantic layer (`bg-card`, `text-muted-foreground`, `var(--primary)` etc.). Then DELETE the deprecated alias definitions from globals.css. Grep proves zero references remain.
- R-F.2 Status colors: grep proves no hard-coded success/warning hexes (`#22c55e`,`#f59e0b`,`#ef4444` etc.) in components outside legit multi-hue data palettes (area/category maps stay).

### R-G. Quality gates
- R-G.1 `tsc --noEmit` clean.
- R-G.2 `npm test` green (≥391 passing; new tests additive).
- R-G.3 `npm run lint` no NEW errors vs baseline.
- R-G.4 `docker compose build` succeeds ON THE HOMELAB only (orchestrator does this; implementers do NOT).

## PROCESS RULES FOR IMPLEMENTERS
- Work on branch `revamp-2` in `~/Documents/Projects/LifeOS/app`. Commit per coherent unit, plain conventional messages, NO co-author lines. Push at the end (orchestrator pushes).
- File ownership per agent is strict; shared files (`chat/route.ts`, `globals.css`, `bottom-nav.tsx`) are assigned explicitly below by the orchestrator — do not edit unassigned shared files.
- If something is impossible, record why in `app/docs/revamp-notes-2.md` instead of skipping silently.
