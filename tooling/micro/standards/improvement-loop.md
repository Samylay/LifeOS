# The factory improvement loop

Checked 2026-09-30. This protocol turns new research or a real failure into a
bounded, reviewable improvement. It does not install a recurring automation or
authorize unlimited model spending. Use it within an explicitly requested goal
or scoped maintenance task.

## Start with a falsifiable gap

Choose one issue with an observable consequence: a failed restore, a confusing
error state, a repeated authorization defect, a weak skill trigger, a slow
setup, or a missing release guarantee. A saved post is a candidate idea until
its source and relevance are verified. Popularity, novelty and an attractive
demo do not establish a defect in this product.

Record the existing baseline, affected users/systems, desired change, preserved
contracts, permitted access, experiment budget and the exact acceptance rule.
The rule must include quality/safety limits as well as the target metric. For
example, reducing build time must preserve uncached reproducibility; improving
animation must preserve keyboard response and reduced-motion behavior.

## Run the cycle

1. **Research.** Trace the claim to the author, standard, official documentation
   or implementation. Record date, revision, applicability and unresolved
   uncertainty. Check whether the guidance is final, draft, maintainer opinion
   or an experimental result.
2. **Specify.** State the smallest change that could resolve the gap. Define a
   reference outcome, a deliberately wrong outcome and a grader which
   distinguishes them. Resolve requirements before exposing hidden checks.
3. **Implement.** Change only the owned files or disposable environment. Preserve
   unrelated work and existing identifiers. If parallel workers help, assign
   disjoint ownership and define how shared contracts merge.
4. **Verify.** Run appropriate behavior, quality, security and recovery checks
   against the exact candidate. Keep first failures and invalid environments.
   For skill/model changes, use held-out tasks and repeated trials with a fixed
   configuration and cost/time accounting.
5. **Challenge.** Give a fresh reviewer the contract, diff, evidence and source
   claims. Ask how the candidate could pass while failing users. Review gates
   and fixtures as well as implementation. A different model alone does not
   guarantee independent reasoning.
6. **Decide.** Accept, revise, reject or mark inconclusive under the declared
   rule. Revert only the experiment's owned changes if rejected; retain its
   evidence. Fix material findings and rerun the affected checks.
7. **Encode.** Put a recurring invariant in a test, linter, schema or runtime
   control when possible. Use a focused skill or document for judgment. Record
   source/adaptation revision and the rollback path.

The use of task-specific outcomes, heldouts, calibrated graders and continuous
regression follows primary evaluation guidance. The concrete sequence here is
proposed Micro policy. [Agent evaluation methods](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents),
[Skill evaluation](https://developers.openai.com/blog/eval-skills),
[Product-design evaluation](https://vercel.com/blog/teaching-agents-product-design-at-vercel)

## Evidence record

Store private implementation evidence with the existing task artifacts, outside
untrusted candidate authority. Link public summaries to redacted records.
Use one authoritative register, not a second issue tracker.

| Field | Meaning |
| --- | --- |
| Gap and hypothesis | What currently fails and why the change could help |
| Scope and preservation | Owned surface, exclusions and invariants |
| Baseline and source | Measured prior outcome and primary-source provenance |
| Variant | Exact source, skill, model, harness and environment revisions |
| Rule | Pass/fail/invalid criteria, ceilings and critical regression limits |
| Result | Task-level outcomes, costs, time, review effort and uncertainty |
| Challenge | Findings, disposition and rerun evidence |
| Decision | Accepted/rejected/inconclusive, rationale and rollback reference |

Keep raw tool events, transcripts that the harness exposes and artifact hashes
with appropriate access and retention. Do not request or collect hidden model
reasoning. Do not copy unrelated personal/work conversations into an experiment.

## Stop and promotion rules

Stop a run when its scoped acceptance and review predicates pass, the enforced
budget expires, a safety boundary fails or meaningful progress requires a
material unresolved decision. Follow the active goal's actual status rules;
budget exhaustion is not achievement. Report the concrete remaining gap.

Promote only a valid improvement with no unresolved critical authorization,
data-integrity, secret-exposure or release-integrity failure. A small sample may
justify a pilot but not unattended production authority. Preserve the incumbent
configuration and previous deployment/recovery evidence.

Repeat research when an upstream change, measured regression, new product
requirement or incident supplies the next hypothesis. Do not keep adding tools
to improve an abstract maturity score. DORA describes AI as amplifying existing
system strengths and weaknesses; operational improvement still needs a clear
problem and evidence. [DORA research](https://dora.dev/research/2025/),
[DORA metrics](https://dora.dev/guides/dora-metrics/)

## Maintaining this edition

For a standards update, identify the affected pillars and source revisions.
Recheck changed normative text, product applicability and tool deprecations.
Run `check.py`, inspect source support, and challenge important claims with a
reviewer who did not author that section. HTTP success only confirms
reachability, not that a source supports the claim.

This edition's completion requires sixteen sourced guides, verified named
provenance, a truthful installed-control audit, concrete adoption gates and
resolved material review findings. Research completion is distinct from
implementing every proposed product control.
