# Decide follow-up audit

Scope: Saved, Proposals, Approvals, and Send to Claude. Reviewed 2026-09-09.

## Findings and fixes

- Complete saved-item summaries, approval briefs, source requests, and saved UI-reference summaries now render immediately. `ContextDetails` remains available for grouping, but starts open on first render.
- Queued instructions on Send no longer clamp after three lines. Titles, candidate URLs, and proposal tags wrap on narrow screens.
- Raw approval commands remain complete in a scrollable, preformatted block. This preserves exact commands rather than reflowing or shortening them.
- `study.py` and `decisions.py` load the same prose-only writing rules. They retain their JSON schema, permitted destinations, identifiers, URLs, and verbatim execution instructions.

## Boundaries checked

- Approval and triage actions continue to send only typed action IDs and parameters. Ingested content does not become an executable instruction.
- Undo, deferred cards, approval application, and the separate Send gesture are unchanged.

- Partial or unavailable source extraction is shown directly on the saved card, including the actual coverage limit. It is no longer conveyed only by a confidence dot.
