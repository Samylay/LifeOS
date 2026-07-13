# News aggregator

In-app replacement for the n8n "Daily News Digest" workflow. Same pipeline
shape, now running on LifeOS's own `claude -p` backend so feeds are managed
from the UI instead of an n8n code node.

## What shipped (2026-07-13)

- **`src/lib/news/types.ts`** — `Feed`, `NewsItem`, `Edition`, the `DEFAULT_FEEDS`
  seed lineup, and `BUCKET_LABELS`. Buckets: `tech`, `sec`, `video`, `news`.
- **`src/lib/news/feeds.ts`** — feed CRUD over the doc store (`news_feeds`
  collection). `listFeeds()` seeds `DEFAULT_FEEDS` on first read, so a fresh
  install has a working lineup with no migration.
- **`src/lib/news/engine.ts`** — `runNews()`: parallel RSS/Atom fetch → dedupe +
  24h cutoff → interleave by source (≤12) → best-effort Jina full-text →
  per-article `claude -p` summarise+score → drop `< MIN_SCORE` (3) → bucket →
  persist one `Edition` per day in `news_editions` (doc id = date). Deduped by
  date; `{ force: true }` regenerates. The reader profile the LLM scores against
  is `process.env.NEWS_READER_PROFILE` (set in the deploy `.env`, kept out of the
  public repo; generic default in code).
- **`src/lib/news/scheduler.ts`** — daily run at 04:00 `BRIEF_TZ` + boot catch-up
  (mirrors the brief scheduler), started from `instrumentation.ts`. 04:00 is
  before the 06:00 brief so today's edition is ready when the brief card reads it.
- **`/news`** — today's edition grouped by section with score marks (🔥/⭐/•), a
  Refresh (force-regenerate) button, and an add / pause / remove feed manager.
- **`/api/news/run`** — `GET` returns today's edition (generating if missing),
  `POST` forces a fresh regeneration. **`/api/news/feeds`** — GET/POST/PATCH/DELETE.
- **Brief card** — `fetchers/digest.ts` now reads the stored edition and renders
  the top 6 headlines (was a bare link to the n8n Telegram digest).

### Managing feeds

Add/pause/remove from `/news` → **Feeds**, or via `/api/news/feeds`. To change the
scoring lens, edit `NEWS_READER_PROFILE` in `app/.env` and restart the container.

### Retiring the n8n workflow

The n8n "Daily News Digest" (`infra/n8n`, workflow `ElZmBVwv6e8HOxUH`) and its
standing goal `digest-scored` still run in parallel as the delivery-of-record
until this in-app version has proven itself over a few days and gained Telegram/
pager delivery. Retiring them is a logged human decision (see T-number below).

---

## Planned: email-newsletter ingestion (design — NEEDS-SAMY)

Goal: newsletters Samy subscribes to land in the digest instead of a cluttered
inbox. Approach approved in principle 2026-07-13; needs a Cloudflare API token /
Worker deploy Samy must provision (external secret — not inventable by an agent).

### Flow

1. **Address** — a dedicated address on `samylayaida.com`, e.g.
   `news@samylayaida.com`, via **Cloudflare Email Routing** (no mailbox, no IMAP
   poll). Samy subscribes newsletters to it (or auto-forwards a Gmail label).
2. **Email Worker** — Email Routing fires a Cloudflare Email Worker on each
   message. The worker extracts sender, subject, and the text/HTML body, then
   POSTs a compact JSON payload to LifeOS over the existing Cloudflare Tunnel
   (`https://lab.samylayaida.com/api/news/ingest-email`).
3. **Authentication** — the worker signs the payload with an HMAC over a shared
   secret (`NEWS_INGEST_SECRET`, in `~/.config/homelab/secrets.env` + the LifeOS
   `.env`); the route rejects anything without a valid signature. This is a
   public-internet endpoint behind the tunnel, so signature verification is
   mandatory (do not rely on Access for a machine-to-machine POST).
4. **Temp store + treatment** — the route writes the raw email to a
   `news_inbox` collection (temporary). The next `runNews()` pass treats each
   pending inbox item as a "source": strips boilerplate/tracking, runs the same
   summarise+score prompt, buckets it under `news` (Newsletters), and includes
   surviving items in the edition.
5. **Discard** — after an inbox item has been folded into an edition (or after a
   TTL, e.g. 3 days), it is **deleted** from `news_inbox`. The digest keeps the
   summary; the raw email does not linger. (Matches Samy's "temp folder that gets
   treated and then discarded".)

### Executor-sized tasks (once unblocked)

- `POST /api/news/ingest-email` with HMAC verification + `news_inbox` write.
- Extend `runNews()` to fold + score `news_inbox` items, then delete them.
- Surface newsletter items in `/news` and the brief card (already bucket-aware).
- The Cloudflare Email Worker script + routing rule (committed to `infra/`,
  deployed with Samy's `wrangler`/token).

### NEEDS-SAMY (external, not inventable)

- Cloudflare **Email Routing** enabled on the `samylayaida.com` zone + the
  `news@` rule pointing at the worker.
- A Cloudflare **API token** (or `wrangler` login) scoped to deploy the Email
  Worker.
- Generate `NEWS_INGEST_SECRET` and place it in `~/.config/homelab/secrets.env`
  and the LifeOS `.env`.
- Confirm the address to publish to newsletters (`news@samylayaida.com`?) and the
  inbox TTL (default 3 days).
