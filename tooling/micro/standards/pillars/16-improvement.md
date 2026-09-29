# P16. Delivery process and continuous improvement

Research checked: 2026-09-29. Scope: how Micro selects work, reviews changes, measures outcomes, learns from failures and updates its factory. This is a repeatable operating process, not a permanent claim to be the industry's best.

## Decision

Optimize the path from a validated product problem to useful, dependable software. Keep changes small enough to review and observe. Improve the current bottleneck, then check whether the change improved customer outcomes and total operating effort.

DORA's current guidance uses five delivery metrics, not the older four-key model. Its 2025 annual report describes AI as amplifying existing organizational strengths and weaknesses. The April 2026 ROI publication supplies a framework for estimating adoption value; a calculator is not observed evidence for Micro's savings. Apply these references alongside actual local results. [Current DORA metrics](https://dora.dev/guides/dora-metrics/), [2025 annual research](https://dora.dev/research/2025/dora-report/), [2026 ROI framework](https://dora.dev/ai/roi/report/)

## Work contract

Before execution, write a bounded change specification with user outcome, scope, excluded behavior, preservation rules, affected domain/data, risk, acceptance predicate and evidence destination. An agent must know what it may change and how a fresh verifier will distinguish success from convenient output.

Use a vertical slice that delivers an observable result. For a budgeting app, “record one expense and see the correct remaining monthly budget after reopening” is a better first slice than completing every screen or building all database abstractions. Record later ideas without forcing them into the first release. A design exploration can produce a prototype and a decision, with a separate acceptance contract from production implementation.

Keep branches short-lived, integrate frequently and preserve a working mainline. DORA describes trunk-based development as frequent integration of small batches, not weeks of isolated feature work. Review requirements must fit this flow without bypassing meaningful verification. [Trunk-based development](https://dora.dev/capabilities/trunk-based-development/), [continuous integration](https://dora.dev/capabilities/continuous-integration/)

## Ownership and handoffs

| Role | Responsibility | Handoff evidence |
| --- | --- | --- |
| Product owner | Problem, scope, accepted design and commercial constraints | Brief, chosen hypothesis, applicable acceptance |
| Implementer | Code and bounded implementation decisions | Source SHA, diff, local result, unresolved questions |
| Fresh reviewer | Challenge correctness, architecture, design and scope | Findings linked to actual code and independently checked predicates |
| Verifier/operator | Gate policy, artifact admission and release observation | Immutable receipts, scans, staging/recovery and deployed digest |
| Factory maintainer | Shared adapters, skills, templates and policy changes | Versioned improvement record and held-out evaluation |

A solo developer can occupy several roles sequentially. Use fresh context, independently chosen checks and explicit capability separation where needed; do not pretend several prompts create separate human accountability. Reviews are proportionate to risk, but security-policy, persistence, billing and release-boundary changes deserve direct owner attention.

Parallelize independent research, isolated modules and review. Name file ownership and merge assumptions before starting agents. Serialize shared policy, schema, generated interface and deployment changes. Increasing generation throughput beyond review or verifier capacity only moves the queue downstream.

## Limit work in progress

Choose a visible capacity limit for implementation, review and verification. For a solo product, start with one main implementation slice and one reviewable candidate, then adjust from measured waiting and interruptions. Count platform maintenance, incidents and rework in the same capacity model.

DORA's WIP guidance ties limits to available capacity and calls for exposing the whole value stream, including otherwise invisible work. Its small-batch guidance supports independently testable changes and rapid feedback. The exact proposed Micro limits are an adaptation, not benchmark requirements. [WIP limits](https://dora.dev/capabilities/wip-limits/), [small batches](https://dora.dev/capabilities/working-in-small-batches/)

When work is blocked, improve the constraint or complete another explicitly independent task. Do not launch unrelated product builds merely to occupy agents. A queue of completed code awaiting acceptance is unfinished work, not shipped value.

## Measure outcomes without gaming

Use a per-product event ledger before building a dashboard. Link source revisions, deployments and incidents so calculations can be reproduced. Report missing data and sample counts.

| Delivery metric | Meaning |
| --- | --- |
| Change lead time | Time from committed change to production deployment |
| Deployment frequency | Production deployments over a period, or time between them |
| Failed deployment recovery time | Time to recover a deployment failure needing immediate intervention |
| Change fail rate | Fraction of deployments needing immediate intervention |
| Deployment rework rate | Fraction of unplanned deployments caused by production incidents |

The definitions are condensed from DORA's current guidance. Measure one application/service in context; do not rank different product types or turn a deployment quota into the objective. Recovery from all incidents is a useful separate metric but differs from failed-deployment recovery time. [DORA definitions and pitfalls](https://dora.dev/guides/dora-metrics/)

Add balanced product and factory measures:

| Dimension | Example for Micro | Important distinction |
| --- | --- | --- |
| Product value | First useful budget created, repeated successful use, support burden | Choose an outcome with the product owner; installs alone do not show value |
| Quality | Critical-journey failures, escaped defects, data-integrity incidents | Test count and coverage percentage are indirect evidence |
| Flow | Setup failures, waiting for review, first-attempt check completion, rework | Fast code generation can coexist with slow shipping |
| Cost | Provider/build spend, operator time, failed attempts, support and recovery | Subscription access is not a zero-resource build |
| Developer experience | Cognitive friction, interruptions, confidence in recovery, ability to stop work | More commits and lines do not establish productivity |

The SPACE research framework emphasizes that developer productivity cannot be represented by one activity or efficiency measure. Use qualitative developer feedback alongside delivery/product observations rather than inventing a single score. [SPACE primary paper](https://www.microsoft.com/en-us/research/publication/the-space-of-developer-productivity-theres-more-to-it-than-you-think/)

## AI evaluation and productivity evidence

Treat changes to the model, prompt, skills, tools, memory and orchestration as changes to a system. Pin the versions, use representative tasks, preserve first failures and evaluate independently. Compare end-to-end accepted work, unauthorized actions, repeated-case reliability, review/rework time and actual resource use. A persuasive generated explanation is not a passing predicate.

Do not reuse the exact cases used to tune a skill as its only proof. Separate development cases from a held-out regression set. Include realistic ambiguous requirements, existing dirty work, failing tests, hostile inputs and recovery constraints. Report case-level results and uncertainty; six adversarial fixtures are a useful starting corpus but cannot justify a production reliability estimate.

METR's 2025 randomized study found a 19% slowdown for experienced open-source developers using then-current tools on their own repositories. It explicitly limits generalization. Its February 2026 follow-up says selection effects and concurrent-agent time measurement make the newer signal unreliable. Its May 2026 survey reports perceived value gains and explains why self-reports can misestimate actual impact. These studies support measuring Micro directly, not assuming either universal slowdown or guaranteed acceleration. [2025 experiment](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/), [2026 design update](https://metr.org/blog/2026-02-24-uplift-update/), [2026 survey](https://metr.org/blog/2026-05-11-ai-usage-survey/)

## Improvement loop

1. **Observe.** Gather a concrete failure, delay, user complaint or measurable constraint. Record the affected product, source/release revision, reproduction and impact. Separate fact from inference.
2. **Choose one hypothesis.** Specify the expected improvement and a guardrail that must not regress. For example, a dependency image should reduce clean setup failures without admitting unreviewed lifecycle scripts.
3. **Change one bounded part.** Create a versioned implementation/skill/adapter diff. Preserve existing work and evidence. Avoid changing the metric, acceptance fixture and implementation together to obtain a pass.
4. **Evaluate independently.** Run applicable product checks and held-out factory cases, reproduce the original failure and measure total cost/time. A fresh reviewer sees the contract and diff rather than the maker's confidence.
5. **Adopt or revert.** Record observed effects, uncertainty, remaining limitations and rollback. If the change does not improve the chosen outcome, keep the evidence and revise the hypothesis.

Repeat after a meaningful failure, release or shared-tool change. An individual research or implementation task ends when its declared coverage, evidence and acceptance contract is satisfied; operating improvement continues as new evidence appears. This avoids an unbounded loop that consumes resources without a product decision.

## Incident learning and technical debt

Postmortems connect user impact and contributing conditions to bounded corrective work. Google SRE recommends blameless learning and concrete follow-through; “the agent made a mistake” identifies no preventive control. Each corrective change needs a failure-reproduction or recovery predicate. [Postmortem culture](https://sre.google/workbook/postmortem-culture/)

Maintain decision records for material architecture and platform choices: alternatives, reason, constraints, consequences and a revisit trigger. Track technical debt by actual consequence such as onboarding failure, unsafe recovery or expensive change, rather than an unbounded cleanup list. Simplify or retire unused controls when evidence shows they add no protection or useful feedback. Security/retention obligations survive retirement of the product code.

The Agile Manifesto's principles emphasize useful software, feedback, technical quality and sustainable pace. Keep this intent while choosing the lightest useful ritual for a one-person factory; a mandatory set of enterprise ceremonies is not an acceptance requirement. [Agile principles](https://agilemanifesto.org/principles.html)

## Evidence, acceptance and implementation order

Store a factory improvement record with problem, baseline, hypothesis, source/skill/tool versions, scope, test corpus identity, first failures, independent verdict, measured impact and adopted/reverted status. Keep raw traces and private user evidence protected; publish only sanitized documentation.

The factory maintainer accepts an improvement when the stated failure is reproduced before the change and prevented after it, held-out checks show no material regression, product scope is preserved and a fresh reviewer can reproduce the verdict. Delivery-process changes also need observed use in a real or clearly labeled synthetic product. Writing a workflow page alone does not activate that workflow.

Source audit: the [Micro kit](../../README.md) includes bounded verification receipts, check-policy admission and an initial adversarial case corpus. The docs explicitly identify the corpus as unscored. The source does not implement a full per-product delivery/outcome ledger, continuous model/skill benchmark, or automatic adoption controller.

Implement first: one product's bounded slices and event ledger. Next: fresh review and representative held-out factory cases. Before adding orchestration: measure the real review/verifier bottleneck and prove a tested policy. Add richer dashboards only after the underlying events and decisions are useful.
