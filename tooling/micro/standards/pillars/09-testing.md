# P09: Testing and quality engineering

Checked: 2026-09-29. Scope: establishing product correctness and usable behavior, preventing regressions, probing failure modes and retaining credible acceptance evidence. P10 evaluates coding agents and AI features separately; P12 binds checks to releases; P13/P14 supply security and reliability requirements.

This guide proposes Micro quality policy. Test tools provide mechanisms, not a certificate of product quality. The [installed kit](../../README.md) runs lint, type, behavior and acceptance slots in an isolated candidate boundary, scans separately and protects admitted check configuration. Product suites and the deeper techniques below remain stack- and risk-specific work.

## Write an observable acceptance contract

For each first-release capability, state the user action, environment, expected observable outcome and important negative/recovery case. Link it to the lowest-cost test boundary that can catch the actual defect. Test counts, line coverage, screenshots and HTTP 200 responses answer narrower questions than “the feature works.”

Illustrative budgeting acceptance:

| Criterion | Appropriate evidence | Defect it catches |
| --- | --- | --- |
| A user records an expense and the displayed period total changes correctly | Browser/device assertion plus domain worked example | UI feedback without correct business behavior |
| The expense survives reload/reopen | User-visible read after restart using a synthetic store | Optimistic success without durable persistence |
| Repeated submission cannot duplicate the entry | Concurrent API/DB test and UI behavior | Retry/double-submit race |
| A failed save preserves the input and offers retry | Controlled failed provider/persistence adapter | Lost user draft |
| A second user cannot read or change the expense | Negative integration test with independent identities | Authentication without ownership authorization |
| A migration and restore preserve supported history | Old-version fixture upgrade and clean restore journey | Green new-install tests masking data loss |

Choose independent expected values: a worked example, specification, reference implementation or domain oracle. Do not calculate the expected value using the same algorithm as the implementation and call the equality proof.

## Use behavior-driven vertical slices

Matt Pocock's current TDD skill recommends tests through public interfaces, one behavior slice at a time, red before green, and avoiding implementation-coupled or tautological checks. Current upstream locates refactoring in review rather than inside its red/green loop. This is the author's chosen workflow, not a normative definition of all TDD. Preserve the configured local adaptation and source revision. [Pinned Matt TDD skill](https://github.com/mattpocock/skills/blob/d81f3a183412e71a5b1e84ca21bc1a35eea03a60/skills/engineering/tdd/SKILL.md).

Micro implementation policy:

1. Identify the authorized spec and important public operations. Reuse already agreed acceptance boundaries; clarify only a material unresolved contract.
2. Establish a failure for the stated missing behavior or bug. Distinguish assertion failure from a broken test environment.
3. Implement one useful slice and run its tests. Add the next behavior after learning from that result.
4. Review the implementation and test sensitivity independently. Refactor while preserving the contract and rerun the relevant evidence.
5. Run the admitted clean-candidate checks and retain failures alongside repaired results. The agent's confidence is not a gate result.

Use this discipline where feedback is valuable. A reversible text/style edit does not need a new test that merely mirrors the changed literal. A changed authorization or financial invariant needs meaningful negative and boundary examples.

## Select the test portfolio by failure mode

Testing Library promotes DOM-oriented checks resembling user behavior, while Playwright recommends user-visible assertions, isolation and stable user-facing locators. Use roles and labels rather than component internals or fragile CSS chains. A synthetic DOM test and a real-browser journey have different coverage. [Testing Library principles](https://testing-library.com/docs/guiding-principles/), [Playwright best practices](https://playwright.dev/docs/best-practices).

| Technique | Useful target | Run when | Limitation |
| --- | --- | --- | --- |
| Static types, lint and build | Type errors, policy and toolchain failures | Every relevant change | Does not prove runtime input validity or user behavior |
| Domain/unit behavior | Calculations, state transitions and invariants | Every relevant change | Doubles can conceal adapter behavior |
| Real persistence integration | Constraints, transaction/concurrency, reopen and migrations | Storage or business-write change | Must use the production engine's relevant semantics |
| Consumer/provider contract | Independently released API or message consumers | Integration contract changes | Contract compatibility is narrower than complete correctness |
| Browser/device journey | Navigation, rendering and actual complete actions | Relevant changes and release | Higher runtime and environment cost |
| Manual exploratory review | Unexpected paths, comprehension and platform behavior | New flows, material UI changes and release | Needs a charter, observations and reproducible findings |

Keep the existing test runner when suitable. Vitest or pytest/unittest can support unit and integration tests; use the actual application driver with temporary owned databases. Testcontainers can supply disposable service dependencies, but its runtime access belongs in the protected CI/test environment, never through a production-host socket exposed to untrusted candidates. [Testcontainers Node.js](https://node.testcontainers.org/).

Use Pact when real consumers and providers release independently and need verified compatibility. OpenAPI validation is useful but does not prove how an actual consumer uses the service. Keep a small first-party contract fixture for a simple single-repo integration instead of installing a broker by default. [Pact introduction](https://docs.pact.io/).

## Add deeper techniques where they can reveal real defects

| Technique | Initial target | Evidence to retain |
| --- | --- | --- |
| Property-based testing | Date/amount parsing, normalization, deduplication and operation sequences | Seed, generators, minimized counterexample and replay result |
| Mutation testing | Critical financial calculations, authorization and deletion decisions | Mutants, survivor review and improved behavior assertions |
| Coverage-guided fuzzing | Parsers, archive/import handlers and native dependencies processing untrusted data | Corpus, sanitizer/runtime settings and minimized reproducer |
| Fault injection | Provider timeouts, DB conflicts, interrupted jobs and partial updates | Fault point, expected recovery and actual outcome |
| Bounded load/soak | Busy user journey, queue pressure and resource leaks | Workload, hardware, fixture size, sample count and latency/error/resource distribution |

fast-check generates cases and shrinks failures; preserve the failing seed and replay path. Its properties must express domain truths, not implementation restatements. [fast-check introduction](https://fast-check.dev/docs/introduction/), [fast-check properties and determinism](https://fast-check.dev/docs/introduction/what-is-property-based-testing/).

Stryker changes code to test whether assertions detect the behavioral change. Review surviving mutants; do not pursue a universal mutation percentage or weaken the implementation to improve a score. [Stryker introduction](https://stryker-mutator.io/docs/stryker-js/introduction/).

OSS-Fuzz illustrates continuous coverage-guided fuzzing for supported open-source projects. A private Micro parser can use an appropriate local harness without claiming OSS-Fuzz enrollment. Bound CPU, memory and time and isolate hostile generated inputs. [OSS-Fuzz documentation](https://google.github.io/oss-fuzz/).

Grafana k6 distinguishes load-test types with different goals. Choose a measured workload and staged ramp; do not load-test an unapproved live target or a real billing/bank provider. Performance objectives belong to the product's capacity contract. [k6 load-test types](https://grafana.com/docs/k6/latest/testing-guides/test-types/).

## Verify appearance, accessibility and platform behavior separately

Playwright visual comparisons need a consistent rendering environment; browser, operating system and fonts can affect baselines. Review intended image changes independently instead of regenerating all baselines after a failure. [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots).

Automated accessibility checks catch some issues but cannot establish complete accessibility. Combine state-specific automated checks with keyboard, screen-reader, zoom/large-text and relevant inclusive user review. WCAG 2.2 defines the selected web acceptance criteria; the scan is one input to that assessment. [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing), [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

For mobile, retain actual release-build device evidence for permissions, secure storage, deep links, keyboard/safe-area behavior, notifications, offline transitions and store-related flows where applicable. Maestro is an available UI automation option, not a substitute for device and platform review. [Maestro documentation](https://docs.maestro.dev/), [React Native release-build performance](https://reactnative.dev/docs/performance).

Give exploratory testing a short charter: the user task, supported device, suspicious assumptions, interruptions to try and completion criteria. Record observations as behavior with steps, expected/actual results and evidence. A stylistic preference and a reproducible inability to complete the task require different decisions.

## Protect fixtures and reject false green runs

Use owned synthetic records, one database/namespace per worker, fixed clocks where needed and test adapters for outbound effects. Enforce the production boundary with paths, credentials and network restrictions; a `TEST=true` flag alone is insufficient. Candidate code must not be able to rewrite supervisor evidence or trusted acceptance policy.

Discover tests from source, not generated build copies. Fail a mandatory suite that discovers no cases; Vitest's `passWithNoTests` setting makes that behavior explicit. Track discovered and skipped cases in the receipt and review discovery/config changes as policy. [Vitest passWithNoTests](https://vitest.dev/config/passwithnotests).

Test the gate itself using disposable negative fixtures: a deliberate calculation defect, unauthorized resource access, a persistent-save failure and a malformed test-discovery change should produce rejection for the right reason. Never edit production code or weaken an existing test to manufacture this demonstration.

The installed factory protects admitted scripts/configuration and scans candidate source separately. That reduces some opportunities to tamper with checks, but does not prove test adequacy. The independent reviewer must inspect the acceptance scenarios and actual runner behavior. [Micro verification contract](../../README.md).

## Classify flakes and retain the first result

| Result | Interpretation | Required action |
| --- | --- | --- |
| Pass first attempt | Observed success for this revision and environment | Retain receipt |
| Assertion fails | Product defect or contract mismatch | Diagnose and reproduce before repair |
| Setup cannot execute | Environment failure, no product verdict | Repair the environment and rerun |
| Fail then pass on retry | Flaky result | Keep both outcomes and investigate |
| No mandatory cases or falsified evidence | Invalid verification | Reject the run |

Use state/locator waiting rather than arbitrary sleeps. Bound retries and preserve attempt numbers. Quarantine requires an owner, cause/evidence, repair condition and replacement acceptance for any release-critical behavior. Quarantine does not turn the original failure into first-attempt success. Record this as factory policy instead of relying on a test runner's retry label.

Suggested quality receipt fields are source/base SHA, protected-suite revision, runtime/toolchain, check name, discovered/skipped counts, attempt, seed if applicable, start/end, supervisor exit code, failure classification and redacted artifact hashes. Make acceptance evidence reproducible by a fresh reviewer who has the spec and source, without the maker's reasoning.

## Risk-tiered release predicate

| Tier | Required evidence |
| --- | --- |
| Disposable prototype | The stated question is answered with synthetic data; no production-quality claim |
| First real product | Clean install/build, relevant domain/integration checks, full core journey and recovery state on supported targets |
| Accounts/sensitive data | Authorization negatives, privacy boundaries, real persistence/migration/restore, accessible complete process and appropriate performance evidence |
| High-consequence behavior | Independent test-oracle review, concurrency and partial-failure cases, reconciliation, recovery and threat-model-specific tests |

Every release-critical acceptance criterion needs evidence. Missing evidence
blocks release; a generic exception cannot establish that the behavior works.
A separately defined risk waiver may address a specific finding only with an
accountable owner, expiry, compensating evidence and removal predicate under
[P12's exception policy](12-delivery.md). Coverage percentages and model-written
reviews cannot replace acceptance. Passing a coding-agent benchmark is separate
evidence, handled by P10.

## Factory upgrade sequence

1. Connect the chosen product starter's four check slots to real checks and establish the critical acceptance matrix.
2. Add isolated database/browser/device fixtures and prove the gate rejects a few relevant negative candidates.
3. Add property, mutation, fuzz or load harnesses only for the corresponding risks. Admit their dependencies and policies independently.
4. Retain first-attempt outcomes, traces and counterexamples. Convert verified escaped defects into regression cases and improve shared starters through reviewed changes.

The current offline local verifier needs a reviewed image containing the locked dependencies and any browser runtime. Tests requiring service containers or native devices need a protected hosted/isolated adapter. These are implementation requirements, not capabilities this research has installed.
