# LifeOS improvement pass, 2026-09-09

The owner requested an app-wide audit and implementation pass, including
open Decide explanations, ADHD writing, interactive Finance, five-hour bank
sync, clearer labels, and better saved-post OCR. Production deployment is
authorized. This builds on the Mira redesign already deployed on September 8.

## User-visible changes

- Decide explanations open on arrival. Descriptions, recommendations, and
  approval consequences remain complete, without a Read more step. New
  generated prose follows the ADHD skill: action first, one next step, short
  sentences, no repeated benefit, and explicit uncertainty.
- Finance shows a six-month spending explorer. Hover or keyboard focus
  previews spending, income, net cash flow, and transfers; selecting a month
  filters category totals and transactions. Mobile uses the same selection.
- Finance has its own Sync now control. The server checks for a due bank
  refresh every minute, with a five-hour interval persisted through restarts.
  Manual and scheduled refreshes share one in-flight operation. Partial
  failures preserve the last successful timestamp and remain visible.
- Transaction names use the bank's remittance description when a merchant
  field is absent. Income/outgoing direction comes from the bank indicator,
  not an assumed amount sign. Suggested categories are editable; a merchant
  correction applies to its past and future entries and can be reset.
- Finance keeps original transaction amounts, dates, and identity untouched.
  EUR totals exclude other currencies rather than inventing an exchange rate;
  transaction rows and balances retain their actual currency. Own-account
  transfers remain outside spending and income.
- Content saves survive switching cards, serialize writes per idea, retain
  failed drafts during navigation, and offer Retry. Editor/brainstorm errors
  no longer discard the work or leave a dead end.
- Knowledge separates a temporarily unavailable search from an unconfigured
  vault. New searches supersede old requests. Training can log today's
  remaining exercises in one action, excludes already logged items, and
  waits for every write before enabling another batch.
- Today, Voice, Knowledge Teach, News, and Diagrams have explicit loading
  failure/retry states. Diagram removal waits for a successful response.
  Assistant clearing and Status polling guard against stale responses. Today
  also uses a deterministic first render to avoid a server/browser clock
  mismatch, then updates its local greeting and date each minute.
- Saved-post extraction handles HTML encodings, compressed pages, malformed X
  payloads, and text-bearing image alt attributes. Thin X posts can use image
  OCR; scanned PDFs can use OCR for pages 1–3. Partial coverage is stored as
  low confidence and shown directly in Decide.

## Audit coverage

Reviewed Today, Decide Saved/Proposals/Approvals/Send, Finance, Content,
Knowledge and Teach, Training, Voice, Projects, Leads, News and its feeds,
Feed, Recipes, Status, Settings, Terminal, Prime and its editor, Diagrams,
and the shared navigation/Assistant shell. Existing functioning flows were
retained when no useful verified change was found.

Detailed evidence is in `decide-followup-audit.md`,
`content-workflow-audit.md`, and `surface-audit-2026-09-09.md`.
The saved-post pipeline audit lives in
`~/services/triage/saved-posts-audit.md`; code also uses the existing
`~/apps/reels-reader/capture/server.py` vision helper.

## Verification and limits

TypeScript, ESLint, all 986 Vitest tests across 94 files, and the production
Docker build passed. Offline Python verification passed 13 saved-post
extraction tests, four OCR tests, and the existing alt-text fixture. Browser scripts under ignored `.scratch/mira-redesign`
exercise Decide disclosures, Finance hover/selection/filter/label/sync/error
flows, Content recovery, and desktop/mobile route smoke checks. All passed
on the final image. The general smoke covered 17 routes at two widths
(34 checks): one main landmark per route, no horizontal overflow, no browser
exceptions, and no mutation attempts. Additional Finance and Decide checks
passed at 320px; Content passed failed-save remount and exact-text Retry.

Browser mutation checks use synthetic responses. No test changes the live
bank ledger, saved items, vault, or external accounts. No real model call or
whole-library OCR backfill is part of verification. Newly generated briefs
use the writing rules; existing briefs are displayed without rewriting them.
The OCR pass improves available evidence, but cannot recover private or
inaccessible Instagram slides. Scanned-PDF OCR is deliberately limited to
the first three pages and reported as partial.

This is an implementation audit, not a claim of complete accessibility
certification or guaranteed OCR/model accuracy. All screenshot artifacts
remain local because read-only review can still contain personal information.
