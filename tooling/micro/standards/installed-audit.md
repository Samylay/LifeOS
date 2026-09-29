# Installed-control audit

Source inspection: 2026-09-29. This is a code and prior-evidence audit of the
Micro kit, not a fresh certification of every live service or every product.
Existing product repositories need their own readback and acceptance evidence.

Checkout-state qualification (`ui-pass-integration`, inspected at
`e6eadb99ebd74dbaf9efce8efd5d6b7d81bbc14b` and subsequent updates):
a concurrent UI integration removed the LifeOS
Micro studio routes while this research was running. The CLI kit and installed
micro-studio skill remain present. Studio behavior below is historical evidence
from the earlier implementation, not a claim that the current checkout exposes
those routes. This research preserves the removal and does not restore it.

The installed micro-studio skill and root installer text still refer to the
earlier `/micro` studio. This is a remaining routing mismatch, not evidence of
current UI availability. New template pointers and explicit playbook prompts
provide the researched path; this edition does not modify global installed
skills or installer-owned environment files.

## Status vocabulary

- **Implemented:** the kit contains an executable control or functioning studio
  workflow. The evidence column identifies the implementation; a particular
  invocation still needs a receipt.
- **Template:** the kit supplies starting configuration which needs product
  setup, review and actual execution.
- **Proposed:** this research specifies a control or practice not enforced by
  the current kit.
- **Conditional:** relevance depends on the product's surface, data, exposure,
  distribution and operating requirements.

No status implies SLSA level, ASVS verification, WCAG conformance or legal
compliance. A local success fixture does not validate a real product's tests.

## Executable foundation

| Control | Status | Starting evidence and practical limit |
| --- | --- | --- |
| App brief and chosen feature scope | Implemented in CLI; historical studio | [Initializer](../micro.py) validates identity, first/later features and acceptance from JSON. The earlier [studio implementation](https://github.com/Samylay/LifeOS/blob/e04f14e/app/src/app/micro/page.tsx) was removed from the current checkout. Neither proves customer demand. |
| AI-assisted problem/features | Historical studio; current integration gap | The earlier [suggestion endpoint](https://github.com/Samylay/LifeOS/blob/e04f14e/app/src/app/api/micro/suggest/route.ts) returned drafts for explicit selection. Its route is absent in this checkout; no customer-validation benchmark or current UI availability is claimed. |
| Fresh-task routing | Implemented | [Project AGENTS template](../templates/AGENTS.md) loads micro-studio and project artifacts. This standards edition adds a kit reference; existing repositories retain their own instructions. |
| Workspace preservation | Implemented | Initializer reserves a new directory, validates IDs/briefs and refuses existing workspaces. Partial failures retain evidence. [Source](../micro.py), [tests](../tests/test_factory.py) |
| Candidate selection | Implemented | Verification requires a clean committed repository, records its SHA and exports tracked source. Archive rules reject unsafe paths, links and credential files. [Source](../micro.py) |
| Reviewed protected policy | Implemented | `approve-checks` records protected-file hashes outside candidate source; changed policy/fixtures/configuration block verification. An administrator can still forge a review, so this is administrative control rather than proof of independent identity. [Source](../micro.py) |
| Bounded candidate checks | Implemented | Digest-pinned preinstalled image, unprivileged user, read-only source, no network/credentials/Docker socket, bounded resources and time. Host Codex remains attended; container isolation shares the kernel. [Runner](../micro.py), [entry point](../verify.mjs), [runtime policy](../runtime.json) |
| Secret/dependency scanning | Implemented | Scanner commands and configuration run separately from candidate npm scripts. Release assets are checksum pinned; advisory data has a freshness gate. Source scanning is not final-artifact scanning, and SBOM production is not complete vulnerability assurance. [Scanner installer](../security.py), [scanner entry](../scan.mjs), [tool lock](../tools-lock.json) |
| Verification receipts | Implemented | Source/image/archive/report hashes, logs, timestamps, budget and failures are retained outside candidate source. Receipts are evidence records, not signed build provenance. [Source](../micro.py) |
| Advisory refresh | Implemented | Kit contains owned service/timer definitions. Prior installation evidence records successful refresh; a current host claim requires systemd/readback and database age. [Timer](../micro-vulnerability-db.timer), [service](../micro-vulnerability-db.service) |
| Product lint/type/test/E2E | Template | Generated scripts deliberately fail until real checks exist. Offline dependencies/browser/native tooling require a reviewed stack adapter; current verifier is not a universal builder. [Package template](../templates/package.json), [entry point](../verify.mjs) |
| Hosted candidate CI | Template | Workflow separates security job from candidate checks and pins Actions. It activates in an actual hosted repository. Workflow files can be changed by privileged contributors; per-repo protections still matter. [Workflow](../templates/.github/workflows/ci.yml) |
| Branch protection and reviews | Proposed | CODEOWNERS declares review routing; it does not enable required reviews/checks or protect the default branch. Actual forge policy must be configured and read back. [CODEOWNERS](../templates/.github/CODEOWNERS), [delivery guide](pillars/12-delivery.md) |
| Agent model evaluation | Proposed | Six existing cases plus the new 30-case proposed bank. No new model trials, baseline scores or reliability estimates are claimed. [Original cases](../eval-cases.json), [new bank](templates/agent-cases.json) |
| Immutable release pipeline | Proposed | Release record is disabled. Build-once artifact testing, signing/provenance, staging and a constrained deployer still need product-specific implementation. [Release template](../templates/.factory/release.json), [release guide](../release-guide.md) |

The initializer/verifier tests cover preservation, invalid scope, dirty source,
archive safety, policy admission and runner-configuration tampering. Their
passing results do not claim model performance or product UI acceptance.

## Lifecycle gap map

| Pillar | Current foundation | Next observable improvement |
| --- | --- | --- |
| 01 Product | CLI brief fields; historical studio | Capture actual problem evidence, alternatives, first-value task and a declared validation decision. |
| 02 UX | Required state guidance and brief references | Test representative task completion, keyboard/focus, content recovery and assistive technology. |
| 03 UI | CLI design document and house skills | Produce semantic tokens, canonical component states and reviewed visual baselines. |
| 04 Motion | Installed house doctrine | Verify interruptions, reduced motion, repeated actions and measured frame behavior per app. |
| 05 Frontend/mobile | Chosen platform and generic gates | Implement a stack-specific bootstrap with tested browser/device/offline/performance fixtures. |
| 06 Backend | Product spec placeholder | Enforce validation/authz/concurrency/jobs/idempotency at every real boundary. |
| 07 Architecture | Local domain/design disciplines | Record domain vocabulary, ownership, dependency direction and meaningful ADRs. |
| 08 Data | No generic live-data automation | Demonstrate synthetic migrations, restore, deletion and mixed-version compatibility. |
| 09 Testing | Reviewed check admission and isolated execution | Prove graders reject wrong behavior; implement meaningful domain/integration/E2E and a flaky-test policy. |
| 10 Agents | Attended worker, independent-review contract, initial cases | Implement trace/trial adapters, protected graders, baselines and controlled skill promotion. |
| 11 Platform | Micro launcher/root and verifier | Add one selected reproducible stack adapter; inventory ownership, access, secrets, drift and recovery. |
| 12 Delivery | Hosted CI starter and disabled release | Configure/read back forge protections, then test/attest/promote the actual immutable artifact. |
| 13 Security | Isolation, scanner separation and secret detection | Complete threat model, ASVS requirements and dated product-specific privacy/legal applicability. |
| 14 Reliability | Receipt retention and advisory-data monitoring | Establish user-journey indicators, actionable alerts, restore drills and incident runbooks per product. |
| 15 Growth | Naming/business hypotheses | Validate pricing and first value; test purchases/restore/cancellation/distribution/support where applicable. |
| 16 Improvement | Existing review skills and preserved failures | Measure accepted delivery, rework, user outcomes, skill results and costs through an improvement register. |

## Sequence and limits

Use [implementation-guide.md](implementation-guide.md). First make one selected
stack and one vertical user journey reproducible. Next implement trusted product
acceptance and agent trials. Add release, recovery and operational controls
before distributing the real product. Broader orchestration comes after those
boundaries work.

Current studio integration is a separate decision following the UI removal.
Use the CLI and project artifacts for the workflow until an authorized product
surface exists; do not silently reintroduce removed routes.

This edition changes research documents and discovery pointers. It does not
enable unattended agents, configure a forge ruleset, install a new skill pack,
publish an app, change production data or upgrade the live SQLite engine.
