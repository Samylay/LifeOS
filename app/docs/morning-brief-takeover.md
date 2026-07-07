# Morning Brief — LifeOS takeover spec

**Status:** the standalone host service `~/services/brief` (Python, systemd timer) is
being retired. This document captures its complete design so LifeOS absorbs the
responsibility. When the in-app implementation reaches parity, kill the host service
(checklist at the bottom).

## The idea

One daily brief, built **once** as structured JSON, fanned out to **two renders**:

1. **Cards page** — `GET /api/brief-json` serves `brief.json`, rendered as cards on `/brief`.
2. **Telegram** — a markdown render of the *same data*, POSTed as `{"text": ...}` to an
   n8n webhook (`BRIEF_N8N_WEBHOOK`, tailnet-only) that forwards to Telegram.

Design principles worth preserving:

- **One source of truth, two renders.** Never build the Telegram message from different
  data than the cards page.
- **Independent failure.** Each card fetcher runs isolated; an exception becomes an
  error card (`status: neutral`, `error: <msg>`) — one broken source never takes down
  the brief. A failed Telegram send still leaves `brief.json` updated, but the run must
  surface as degraded (non-zero exit / logged error), not silent success.
- **Atomic writes.** `brief.json` is written via temp-file + rename so readers never see
  a half-written file. Same pattern for rotation state.
- **Deterministic by date.** Prompt rotation keys off day-of-year so both surfaces show
  the same prompt for a given date.
- **Exception-driven status.** The status dot *is* the message: green needs no words;
  issues are listed only when they exist.
- **Adding a card = one fetcher + registry entry** (+ a bespoke renderer only if the
  generic card doesn't fit).

## Card model

```jsonc
{
  "date": "YYYY-MM-DD",
  "generated_at": "ISO-8601 with offset",
  "cards": [{
    "id": "workout",
    "type": "workout",            // drives renderer choice
    "priority": "action|state",   // actions sort before state
    "status": "green|amber|red|neutral",
    "title": "…",
    "body": { /* type-specific */ },
    "link": null,                 // optional deep link
    "error": null                 // set → render "unavailable"
  }]
}
```

Telegram render sorts by `(priority: action first, severity: red→amber→neutral→green)`.

## The cards (as implemented 2026-07)

### Action cards

| id | source | body | notes |
|---|---|---|---|
| `workout` | ` ```yaml ` block in vault note `04-Areas/Health/workout-plan.md` (`WORKOUT_PLAN_NOTE`) | `{rest, day_label, exercises:[{name,sets,reps}]}` | `week.{mon..sun}`; absent/`rest` day ⇒ rest card. App-owned editing was "phase 2" — **native LifeOS ownership of the plan is the natural end state.** |
| `work` | Todoist REST v2, filter `overdue \| today`, `TODOIST_API_TOKEN` | `{tasks:[{content,due,priority,url}], events:[]}` | Max 10, urgent first (Todoist priority 4 = p1). `events` reserved for a future calendar source (Google Calendar was dropped in the local-only conversion). |
| `prompt` | `prompts.json` pool (7 prompts: spoken-english / journaling / recurring) | `{prompt_text, category, inbox_note}` | Rotates by `day_of_year % len`. The one **bidirectional** card: answers go through the existing `/api/voice` pipeline into vault note `01-Inbox/voice/{date}.md`. |
| `objective_<field>` | `objectives.yaml` + `state.json` in `~/services/objectives` | same shape as `prompt`, `category: "objective:<field>"` | Picks 2 fields/day: oldest `last_shown` first, weight breaks ties, never-shown first. `prompt_strategy: continuity` ⇒ quote the last non-header line of the field's `log.md` ("Last time on X: … — what's the update?"), else rotate `prompt_pool` by day-of-year. Writes `last_shown` back (atomic). Answer *routing* is NOT the brief's job — `classify.py` (separate host service) sweeps voice notes into each field's `log.md`. |

### State cards

| id | source | status logic |
|---|---|---|
| `homelab` | `docker ps` (watch list of 10 containers — mirror of `src/lib/system-health.ts`), `shutil.disk_usage("/")`, `tailscale ip -4`, Hermes heartbeat `~/.hermes/status.json` | red: any watched container down, disk ≥90%, or tailscale unreachable. amber: disk ≥75% or hermes `consecutive_failures ≥ 3` or (opt-in `BRIEF_CHECK_OLLAMA=1`) ollama down. else green. `link: /status`. Summary is terse: "2 containers down · disk 63%" / "all good". |
| `fuite` | RSS `https://bonjourlafuite.eu.org/feed.xml` (French data leaks) | Entry titles are `"<emoji> OrgName"` (🟢/🟠/🔴 encodes severity); description is HTML `<ul>` of leaked data types or plain text. Last 7 days, max 5. Card amber if any red entry, else green. |
| `ft_headlines` | RSS `https://www.ft.com/rss/home/international` | Keyword-filter title+standfirst to beats: tech/AI, cybersecurity, markets/fintech, Japan, Europe. Max 8. (History: originally tomorrowspapers.co.uk, abandoned 2026-07 — it went image-only.) |
| `quorky_digest` | pointer file `digest-latest.json` (`{date, url}`) | Card **omitted** (fetcher returns null) unless a pointer for *today* with a URL exists. v1 stub — n8n's "Daily News Digest" is Telegram-only, no web edition yet. |

## Scheduling semantics to preserve

- Daily at **06:00 in Samy's local timezone** — currently `Asia/Tokyo` (Sendai,
  June–July 2026), back to `Europe/Paris` after. Host clock is UTC; don't hardcode UTC.
- **Catch-up on missed runs** (`Persistent=true` equivalent): if the box was down at
  06:00, run at next opportunity instead of skipping the day.
- Safe to trigger by hand at any time (idempotent for a given day, except the
  objectives rotation writes `last_shown`).

## Migration notes (host service → inside LifeOS)

The lifeos container already mounts what's needed for most cards: vault (rw),
`docker.sock` (ro), `~/.hermes` (ro). Gaps to solve:

1. **Scheduler:** LifeOS needs an in-app scheduler (e.g. node-cron kicked off from
   `instrumentation.ts`) or an internal route (`POST /api/brief/run`) triggered
   externally. In-app is preferred — that's the point of the takeover.
2. **Objectives state:** `~/services/objectives/{objectives.yaml,state.json}` is not
   mounted. Either mount it, or (better) move objectives config+state into LifeOS's
   own data — and eventually absorb `classify.py` too.
3. **Host disk %:** `disk_usage("/")` inside the container measures the container fs.
   Read the host via an added `/host` ro mount, or query node_exporter/prometheus.
4. **Tailscale check:** no `tailscale` binary in-container. Query the host another way
   (e.g. prometheus, or hit the tailscale IP) or drop the check into /status's domain.
5. **Telegram:** keep POSTing `{"text": ...}` to the n8n webhook (env
   `BRIEF_N8N_WEBHOOK`); n8n owns the Telegram credentials. n8n listens on the
   tailnet IP (host networking) — reachable from the bridge network.
6. **brief.json contract:** during transition, keep writing the same JSON shape where
   `/api/brief-json` reads it; once the builder is in-process the file becomes an
   internal detail (or is kept as a debug artifact).
7. **claude-health.sh dependency:** `~/services/health/claude-health.sh` reuses the
   same n8n webhook for alerts — it depends on the *webhook*, not on the brief
   service; unaffected by the kill.

## Kill checklist (once LifeOS parity is confirmed)

```bash
sudo systemctl disable --now brief.timer
sudo rm /etc/systemd/system/brief.{service,timer} && sudo systemctl daemon-reload
# repo ~/services/brief stays on GitHub (homelab-services) as the reference implementation
# then: remove the ./out:/brief ro mount from the lifeos compose once brief.json is internal
```

Env inventory to carry over: `TODOIST_API_TOKEN`, `BRIEF_N8N_WEBHOOK`,
(`BRIEF_CHECK_OLLAMA`, `WORKOUT_PLAN_NOTE`, `DIGEST_POINTER`, `OBJECTIVES_*` overrides).
