# Content workflow audit

Scope: idea-bank writing, brainstorm help, editing, and navigation. Reviewed 2026-09-09.

## Findings and fixes

- **Last body edit could be lost.** `IdeaBody` cleared its 700 ms debounce on unmount. Switching a card, filtering it out, or navigating away before the timer ran discarded the last change. Each idea now keeps its current draft and write queue across card remounts until a save succeeds.
- **Concurrent body writes could finish out of order.** A slow earlier request could overwrite a later edit. Every instance of the same idea joins one queue, and a failed older request does not block the newest prose.
- **Failed writes gave no recovery path.** The body now says when saving fails and exposes Retry. The manual idea editor stays open on a failed save, keeps its fields, and shows the error. The draft cache is session-only: it protects navigation and remounts in the open app, while the server remains the durable copy after a successful save.
- **Brainstorm failures required re-finding the action.** The error panel now provides Retry. Brainstorm output remains separate from the body and is never merged into user prose.
- **Icon actions depended on hover titles.** Edit and delete now carry idea-specific accessible names for keyboard and screen-reader users.

## Preservation boundaries

- No generated text is written into `ContentIdea.body`.
- Existing titles, notes, bodies, brainstorms, statuses, and navigation behavior are unchanged except for failed-save recovery.
- The queue and cache tests cover write ordering, continuation after a failed earlier request, and restoring a failed last edit on remount.
- Mock-browser review passed on 2026-09-09: failed save, navigation away and back, Retry preserving the exact cached prose, brainstorm Retry, and 390px reflow.
