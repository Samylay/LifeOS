# LifeOS user paths — review draft (2026-07-10)

Samy asked: the app feels unoptimized; propose user paths to review — keep the
ones that make sense, tweak the app to reflect the ones that don't.

## The evidence (read-only DB survey, 2026-07-10)

| Signal | Data |
|---|---|
| contentIdeas **60** · notifications 29 · learnItems 6 · primeDays 6 · projects 6 · habits 3 · objectives 3 | **actually used** |
| strava_activities **613** (own table, synced) | /workouts is read, not written |
| tasks **0** · notes/inbox 0 · goals 0 · dailyLogs 0 · recipes/mealPlans 0 · bodyMeasurements 0 · strengthFocuses 0 · reminders 1 · shipLog 0 (new) | **empty shells** |

Diagnosis: the app still carries its "generic life-OS template" skeleton
(tasks, notes, goals, food, strength, reminders), but the real system runs on
**Todoist** (tasks), the **vault** (knowledge), **Strava** (workouts),
**Google Calendar** (the day), and LifeOS's own genuinely-alive organs: brief,
pager, content, prime, projects, learn-items. The unoptimized feeling is 17
nav destinations where ~7 carry the load — every empty section is a decision
tax on the way to the ones that matter.

---

## Proposed paths — mark each ✅ keep / 🔧 tweak / ❌ kill

### P1 — Morning (the spine)
06:00 brief generates → tentative blocks land on Google Calendar → 06:33
attention push (decisions needed) → you open **/brief**: today's plan card
(blocks + placement questions + reply box), exit velocity, workout, talk
prompts → adjust by reply ("push X to 6pm") → close the app; the calendar IS
the day.
**Consequence if kept:** `/brief` becomes the home page (`/` redirects or the
dashboard dies); the 06:33 push eventually folds into the brief as its
notification. Everything else in the app is reachable *from* the morning, not
peers of it.

### P2 — Capture
Thought on the move → voice note / share-sheet → vault inbox
(01-Inbox/voice/…) → Hermes/objectives route it. Actionable → **Todoist**
(centre inference already pulls it into planning).
**Consequence if kept:** the in-app `/inbox` + `/tasks` pages (0 docs) go —
they are parallel capture systems you correctly never adopted. LifeOS
*consumes* Todoist + vault; it doesn't compete with them.

### P3 — Ship (exit velocity)
Finish a rough thing → **/projects**: log the ship (predicted → later actual)
→ brief's exit-velocity card counts it → 3 ships gate unlocks system changes.
**Consequence if kept:** /projects stays the only project surface; LifeOS
`goals` collection (0 docs) is replaced by T27's goals→grilling pipeline
rather than revived as a form.

### P4 — Content
Idea anytime → **/content** idea bank (60 ideas — your most-used collection)
→ draft → post → tracker. The missing half is *outbound* (T25 default-public
pipeline decision).
**Consequence if kept:** /content is a first-class nav item; T25 decision gets
priority since the intake side demonstrably works and the publish side is the
bottleneck — same exit-velocity pattern.

### P5 — Prime (morning mindset)
**/prime** with prompt/affirmation banks — 6 primeDays says you tried it,
recency unknown.
**Honest question:** is this alive or a relic of the Stride era? If alive, it
belongs *inside* P1 (a brief card, not a separate destination). If not, kill
the route, keep the data.

### P6 — Weekly review (Sunday)
Compost proposals (already Telegram) + /projects WIP/kill pass + ship-log
"actual reaction" fills + decisions-needed grooming. Today this exists as
scattered pieces, no single surface.
**Consequence if kept:** one "/review" surface or a Sunday brief section
aggregates it; the projects-page banner (currently generic staleness) becomes
that hook.

---

## Route disposition (follows from the paths)

| Route | Verdict proposed | Why |
|---|---|---|
| /brief, /pager, /projects, /content, /workouts, /things-to-learn, /status, /settings | **keep** | alive (data or ops role) |
| /prime | **your call** (P5) | 6 days used; fold into brief or drop |
| /areas, /knowledge | **tweak → demote** | knowledge = vault's job; areas has 1 doc — habit/objective bits move to brief cards |
| /tasks, /inbox, /goals, /reminders, /food, /strength | **kill (hide nav, keep code a release)** | 0–1 docs; Todoist/vault/T27 own these jobs |

## Optimization suggestions independent of path choices

1. **Nav reflects frequency:** morning spine (brief) first, then content,
   projects, workouts, pager; everything else behind a "More" fold.
2. **`/` should not be a dashboard nobody visits** — make it /brief (or a
   redirect until a real dashboard earns its place).
3. **One writer per domain:** every domain with an external owner (tasks →
   Todoist, knowledge → vault, workouts → Strava, day → Calendar) gets
   read-only treatment in LifeOS. The app's own writes stay for what it
   uniquely owns: ships, content, pager, prime(?), learn items.
4. **Mobile reality check:** these paths get used from the phone (Tailscale +
   ntfy). Any kept path that's painful at 390px wide isn't actually kept —
   T18/T18b (native app) inherit whichever paths survive this review.

## Review protocol

Reply per path (P1–P6): keep / tweak (with what) / kill. The route table then
executes mechanically: nav hides in one commit, killed-route code removal
queues as small ROADMAP tasks one release later (in case a week of use proves
a verdict wrong).
