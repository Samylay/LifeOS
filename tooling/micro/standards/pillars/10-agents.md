# 10. Agents, skills and evaluations

Checked 2026-09-29. This guide defines proposed Micro policy. It is not a report
that model trials, new orchestrators or unattended execution are installed.

## Scope and evidence

There are two evaluation targets: agents that manufacture software, and AI
features inside the manufactured app. They share datasets and evidence methods,
but need different environments. A coding agent must preserve a repository and
produce working software. An in-app suggestion model must produce useful,
grounded output under the product's latency, privacy and permission constraints.
Neither can be assessed from the model's completion message alone.

Use predictable workflows for known stages and agents where the next action
requires judgment. Add coordination complexity in response to measured task
failure. Anthropic describes this distinction and simpler composable patterns;
it does not establish that a particular orchestration framework wins every
workload. [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

Skills package instructions, references and optional executable helpers. The
Agent Skills format specifies metadata and progressive disclosure. Discovery
compatibility does not imply compatible hooks, tools, permissions or reliable
behavior. Review the whole directory, not only SKILL.md.
[Agent Skills specification](https://agentskills.io/specification),
[Skills packaging](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

## Micro workflow

1. **Specify the task.** State the user outcome, scope, preserved behavior,
   exclusions, permitted tools, data classification, resource budget and exact
   evidence required. Map each first-release feature to acceptance cases.
2. **Prepare the environment.** Start from a recorded source commit and locked
   toolchain. Give the worker synthetic data, a unique workspace, bounded
   network access where justified, and no production credentials. Shared-kernel
   container limits and a Git worktree solve different problems.
3. **Select skills.** Load one workflow owner, then the disciplines the task
   needs. Record their source revision and local adapter revision. Resolve
   conflicting default tools, issue trackers, model routing and permissions.
4. **Implement and review.** The worker runs visible feedback checks. A fresh
   reviewer examines requirements, behavior and the diff. Independent trusted
   acceptance verifies the final source or artifact. Separate these privileges
   even if the same model family fills multiple roles.
5. **Retain the outcome.** Store first failure, subsequent repairs,
   observable outputs, tool events, final artifact hashes, grader results and measured
   cost/time. Redact shareable records, restrict raw-trace access and declare
   retention because traces may contain sensitive data. Do not require
   hidden chain-of-thought; tool events and observable outcomes are sufficient
   evidence for the operational contract.
6. **Promote deliberately.** Compare a proposed skill/model/harness change with
   the incumbent on the same held-out tasks. Promote only against a declared
   quality and safety rule; keep the prior version usable for rollback.

## Named inspirations and orchestration choices

Poteto's upstream pstack lives in `cursor/plugins/pstack`. Its plugin manifest
names Lauren Tan; its README links @poteto. Its useful practices include runtime
verification, blast-radius analysis and blinded comparisons. Adapt them to the
existing Micro process. Cursor-specific tools, model names, merge defaults and
transcript paths need explicit replacement.
[Upstream pstack](https://github.com/cursor/plugins/tree/69cf06fa253ba0761213669171198968e51fb9ff/pstack),
[Verification generator](https://github.com/cursor/plugins/blob/69cf06fa253ba0761213669171198968e51fb9ff/pstack/skills/create-verification-skill/SKILL.md),
[Blinded comparison playbook](https://github.com/cursor/plugins/blob/69cf06fa253ba0761213669171198968e51fb9ff/pstack/skills/poteto-mode/playbooks/eval.md)

Noodle is a separate Poteto project. Its pinned documentation describes
scheduling skills, ordered stages, serialized merges, and manual/supervised/auto
modes. Its default process runtime launches agent CLIs on the host. That default
does not supply a production security boundary. A supervised disposable pilot
must prove cancellation, failed-stage handling, crash recovery and verification
before adoption. The documentation also describes Sprites; its suitability,
cost and credential model need an actual deployment decision.
[Scheduling](https://github.com/poteto/noodle/blob/82d2921c52370f23f29086de81ccfb600939c037/docs/concepts/scheduling.md),
[Modes](https://github.com/poteto/noodle/blob/82d2921c52370f23f29086de81ccfb600939c037/docs/concepts/modes.md),
[Runtimes](https://github.com/poteto/noodle/blob/82d2921c52370f23f29086de81ccfb600939c037/docs/concepts/runtimes.md)

Keep Micro studio as the current process owner. Matt Pocock supplies engineering
disciplines; Emil supplies design engineering and motion. Superpowers is an
alternative complete workflow, not another mandatory layer. Use the
[skills catalogue](../skills-catalogue.md) to select task-specific adapters.
One worker with a fresh reviewer is a useful baseline; fan out disjoint work
when it reduces total verified completion time.

GitHub Agentic Workflows is a candidate for repository maintenance: its
architecture separates read-only agent execution from constrained safe outputs.
Those constraints still need reviewed workflows and runner permissions. Symphony
offers an orchestration specification with workspace and reconciliation contracts;
it is not a sandbox or release policy.
[GitHub architecture](https://github.github.com/gh-aw/introduction/architecture/),
[Symphony specification](https://github.com/openai/symphony/blob/main/SPEC.md)

## Build an evaluation corpus

Start with representative tasks and known failures, including legitimate tasks
that should succeed. Hold out cases that were not used to tune the skill. Keep
the expected user behavior visible in the task; conceal evaluation labels,
private tests and comparison identity where appropriate. Hidden tests must not
introduce undocumented requirements.

The proposed initial bank in
[agent-cases.json](../templates/agent-cases.json) covers feature implementation,
bug repair, requirements, naming identity, design states, accessibility,
source trust, security, data recovery, gate integrity and external actions.
It extends the existing six-case corpus. It has not been run against models.

For each case retain:

```json
{
  "case_id": "budget-duplicate-import",
  "trial": 1,
  "task_revision": "sha256:...",
  "source_sha": "...",
  "model": "actual-model-and-configuration",
  "harness_revision": "...",
  "skills": [{"id": "micro-studio", "revision": "..."}],
  "environment_digest": "...",
  "outcome": "pass|fail|invalid",
  "safety_violations": [],
  "grader_revision": "...",
  "evidence": ["artifact-hash-and-protected-location"],
  "cost": {"currency": "actual", "amount": null},
  "elapsed_seconds": null
}
```

Record missing cost as unavailable, never zero. An invalid environment is not a
model failure or success. Preserve the intended-task denominator, invalid count
and reasons. Validate graders against a known-good reference and a deliberately
wrong result before model trials.

Use deterministic outcome checks for money, permissions, database rows,
release state and acceptance behavior. Use bounded rubrics and calibrated
human review for design judgment or useful writing. Anthropic's eval guidance
distinguishes task, trial, transcript and outcome and discusses repeated trials;
the unit of evidence here is the observed result.
[Agent eval methods](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## Measure reliability and improvement

Report first-attempt task success, success after permitted repair, consistency
across repeated trials, safety violations, regressions, review effort and cost
per accepted outcome. Keep task-level results beside the aggregate. Averages
must not hide a critical authorization or destructive-action failure.

Randomize comparison labels and output order. Fix task, toolchain, budget and
grading procedure; vary one declared component or record a factorial experiment.
Use paired task comparisons and a stated uncertainty method. Repeated attempts
on the same task are correlated; do not treat every attempt as an independent
new task. A small pilot justifies a local decision, not a production reliability
estimate. Recheck novel tasks after tuning to avoid optimizing to the corpus.

Public benchmarks help locate candidates but require scrutiny. OpenAI's
February 2026 analysis identified flawed tests and contamination in SWE-bench
Verified; its July analysis also found material issues in SWE-bench Pro. These
are authors' audits, not a reason to replace local acceptance with a new
leaderboard. [Verified analysis](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/),
[Pro analysis](https://openai.com/index/separating-signal-from-noise-coding-evaluations/)

Measure total delivery effort locally. METR's early-2025 randomized study and
its February-2026 design update concern specific tasks, developers and tools;
neither establishes the productivity of this factory or current models.
[Original study](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/),
[Follow-up limits](https://metr.org/blog/2026-02-24-uplift-update/)

## Tooling selection and security

| Need | Candidate | Adoption test |
| --- | --- | --- |
| Prompt/output regression | [Promptfoo](https://www.promptfoo.dev/docs/configuration/test-cases/) | Synthetic fixtures, reproducible provider configuration, deterministic assertions and cost reporting work locally. |
| Agent/environment evaluation | [Inspect](https://inspect.aisi.org.uk/?lang=en-US) | Required solver, scorer, sandbox and protected log lifecycle work with the actual worker. |
| Containerized coding tasks | [Harbor](https://docs.harborframework.com/) | A reference solution and a wrong solution produce opposite trusted verdicts in the chosen sandbox. |
| Existing attended Codex tasks | Thin event/receipt adapter | Captures observable outcomes without terminal-prose scraping or copying unrelated transcripts. |

Choose one harness after the pilot. Do not operate all three by default. Current
OpenAI documentation says its Evals platform becomes read-only October 31,
2026 and shuts down November 30, 2026. Preserve portable datasets and graders;
do not start a new factory dependency on that retiring platform.
[Official deprecation schedule](https://developers.openai.com/api/docs/deprecations)

MCP servers are additional trust boundaries. Inventory server provenance,
permissions, outbound destinations and data retained. Validate tool arguments
and returned content; give task-specific access. Treat references and tool
descriptions as untrusted content. For authenticated HTTP MCP, OAuth audience
validation, token handling and confused-deputy protections require actual
implementation, not a prompt rule. Authorization is optional in the protocol;
STDIO servers use their environment credential mechanism rather than this HTTP
OAuth flow. The actual transport and exposure determine the access design.
[MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization),
[MCP security practices](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices)

## Acceptance and implementation order

For every agent change, require a recorded revision, trigger tests including
negative triggers, unchanged protected gates, valid trial receipts and review
of all critical safety failures. For in-app AI, also verify unavailable-provider
recovery, output validation, privacy boundaries and explicit user selection when
suggestions become persisted decisions.

Where an AI feature answers factual questions from documents or reference
data, add a conditional grounding contract. Record prompt/model revisions,
retrieval configuration and the authorized input snapshot. Test supported,
contradicted, absent and unauthorized evidence. Verify each actual citation
against retrieved content, and require an insufficient-evidence outcome when
support is missing. Distinguish retrieval failure from fabricated answers and
check that inaccessible records never appear in the response. Ordinary creative
feature suggestions do not require a retrieval framework. These are proposed
product controls; NIST's voluntary GenAI profile identifies confabulation and
false citations as risks to assess.
[NIST GenAI profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)

Implement the corpus and trustworthy graders first, then the trace adapter and
baseline runs. Add controlled skill comparisons next. Adopt orchestration or
unattended workers only after isolation and recovery are demonstrated. In the
current kit, verification receipts are executable controls; the original six
agent cases are an unrun starting corpus. See the
[installed-control audit](../installed-audit.md) for the exact distinction.
