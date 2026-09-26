# Visual workspaces and saved-content workflows

The September 2026 overhaul keeps the existing routes and data owners while adding relationships, domain layouts and a durable source-to-result journey.

## Where to work

| Surface | Structure | Purpose |
| --- | --- | --- |
| Today | Workspace map and workflow result notice | Navigate by area and see decisions waiting |
| Decide | Existing source swipe with Develop this as the default for web sources | Accept a source into a workflow; retain filing alternatives |
| Workflows | Results, active work and recorded outcomes | Inspect evidence, artifacts, measurements and the exact next action |
| Mind map | Knowledge graph, source paths, area map, labelled example | Explore actual connections separately from sample content |
| Teaching | Course promise and ordered modules | Design teaching around objectives, exercises and observable understanding |
| Projects | State lanes | See active, blocked and stalled work using existing project evidence |
| Training | Weekly program, activity, strength and nutrition | Keep plan and supporting measurements reachable |
| Recipes | Ingredient previews and ordered methods | Scan choices and cook from the source |
| Content | Development, ready and published stages | Follow ideas through the existing creation flow |
| Knowledge | Notes and narrative learning topics | Preserve overlapping interests and user-owned learning intentions |
| Finance | Spending composition and existing trends | Read actual values; no invented budget or score |
| Fluency / Essays | Practice blocks / paragraph sequence | Show the structure of the existing learning activity |
| News / Leads / Status / Settings | Grids and section navigation | Improve scanning without changing source or service ownership |
| Overhaul review | Original photograph, note, interpretation and destination | Inspect private design inputs individually |

Shared visual navigation is in `src/components/workspace/visual-navigation.tsx`. Domain links describe nearby workspaces, not inferred relationships between records. Counts describe records in a state, never a learning-completion score.

## Workflow implementation

For extractor or worker changes, read [the ingestion contract](ingestion-workflow-contract.md). It defines evidence channels, historic reprocessing, result schemas, worker responsibilities and approval boundaries.

- `src/lib/workflows/model.ts`: kinds, states, typed effects and authoritative action wording.
- `store.ts`: transactions, version binding, idempotency and dispatch lifecycle.
- `instructions.ts`: bounded evaluation and approved application instructions.
- `artifacts.ts`: permitted artifact formats and data-volume storage.
- `/api/workflows`: source selection, status and explicit decisions.
- `/api/workflows/report`: scoped worker callbacks.
- `/workflows`: evidence, side-by-side images, playable video, prepared material and swipe approval.

Application runs through the existing host dispatch service. Evaluation and application are separate jobs. Queued work is never represented as installed. Missing evidence waits for extraction. Host sessions ending without a callback appear blocked; failed applications require reconciliation.

The host worker remains a trusted local agent on the existing private deployment. Scoped reporting tokens and fixed prompts limit the intended workflow protocol; they are not an operating-system sandbox or a new authentication boundary for the entire app. Source content remains untrusted data.

Prepared recipes and content drafts save into their existing collections. Teaching material, training proposals and references retain provenance in the workflow library. Training proposals do not overwrite the user's program. The Teaching editor persists a curriculum with optimistic revisions and browser draft preservation.

## Private notebook review

The deployment reads the review dataset from `.scratch/visual-overhaul/` through the existing read-only host-app mount. Source photographs, extraction, interpretations and render captures stay outside version control and the public image. `/api/overhaul` serves only this fixed dataset and known manifest images. An installation without the private dataset shows an unavailable state.

Treat this directory as user-owned review material, not disposable scratch, while the review page is in use. Preserve it during cleanup or migration. The individually mapped report records what was implemented, what already existed, what remains a concept and what could not be read confidently.

## Verification scope

TypeScript, changed-file ESLint, production Docker build and read-only browser rendering were used for delivery. Mutation tests and live agent experiments were not run. A rendered result fixture is visual-review evidence only; it does not demonstrate an actual experiment or installation. The separate ingestion implementation and historic reprocessing are not included in this deployment.
