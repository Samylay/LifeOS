# News digest and full newsletters

The digest is a searchable reading list with source and section filters.
Compact view shows complete headlines and short summaries. Details reveals
additional context. Full newsletters opens the retained email text, including
stories that did not survive the digest's relevance filter or story cap.

## Storage and generation

The authenticated, allowlisted email ingest writes `news_inbox` and preserves
the received body in `news_issues`. Generation also preserves pending legacy
inbox entries before removing them. No database migration or historical backfill
is needed. Emails already deleted by earlier versions cannot be recovered here.

RSS generation runs at 04:00 in `BRIEF_TZ`. A five-minute check adds later email
arrivals to today's edition, retaining existing stories. Concurrent generation
calls share one run. Manual refresh fetches RSS again and retains today's
newsletter stories. The full-text library works before summarization finishes.

- `GET /api/news/run`: cached edition only, never generates.
- `POST /api/news/run`: regenerate feeds and process pending newsletters.
- `GET /api/news/issues`: newsletter metadata and previews, newest first.
- `GET /api/news/issues/:id`: one complete retained body.

## Daily delivery

The scheduler sends one daily reminder from 08:00 in the notification settings'
timezone, outside quiet hours. It counts issues arriving since the previous
successful reminder; today's existing newsletter edition also supports the
first reminder after upgrading. `news_delivery/daily` stores the local date and
cutoff so restarts do not send twice. Failed HTTP or push delivery is retried.

The `news` stream opts into normal web-push delivery independently of the
system-wide `pushNormal` default. It still respects quiet hours. Other normal
streams keep their existing policy. Pager delivery is retained when no device
is subscribed. Device registration lives in Settings.

## Email forwarding

The Cloudflare worker lives in `~/infra/cf-email-worker`. Its previous version
flattens paragraphs and limits the body to 200,000 characters. The accompanying
worker change preserves plain-text paragraphs, formats HTML fallback text with
links, and removes that truncation. Deploy it with a Cloudflare token that has
Workers Scripts edit access. LifeOS can only retain what the worker forwards.

## Verification

`npx tsc --noEmit` and the focused news, notify-route, and notify-gateway tests
cover body preservation, late arrival merging, split failure fallback, daily
deduplication, quiet hours, push retry, and the news-only push policy. Build and
redeploy using the repository's executor gate, then smoke `/`, `/news`, and the
news API routes. Worker verification: `node src/worker.test.mjs`.
