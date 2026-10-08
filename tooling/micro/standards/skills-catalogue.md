# Skills and reference catalogue

Checked 2026-09-29. This is a curated adoption list, not an install manifest.
Revisions and declared licences are recorded in [sources.lock.json](sources.lock.json).
Read each selected directory's actual licence and executable resources before
copying it. Source popularity is not evidence of local quality.

## Verified named sources

| Source | Contribution to Micro | Recommended treatment |
| --- | --- | --- |
| [Poteto / Lauren Tan, upstream pstack](https://github.com/cursor/plugins/tree/69cf06fa253ba0761213669171198968e51fb9ff/pstack) | Runtime proof, change impact, architecture and type boundaries, parallel review, blinded comparisons | Adapt selected disciplines into Micro. Replace Cursor tool names, model routing, transcript paths, issue operations and automatic merge defaults. Keep Micro as process owner. |
| [Poteto, Noodle](https://github.com/poteto/noodle/tree/82d2921c52370f23f29086de81ccfb600939c037) | Skill-driven scheduling and staged execution | Evaluate supervised orchestration in disposable repositories after the existing verifier and recovery contract pass. Host child processes and worktrees are not security isolation. |
| [Matt Pocock](https://github.com/mattpocock/skills/tree/d81f3a183412e71a5b1e84ca21bc1a35eea03a60) | Requirements, domain language, module design, debugging, test-first behavior, review and handoff | Preserve the installed local adaptations. Current upstream references GLOSSARY.md; LifeOS uses CONTEXT.md and its own issue convention. Map those explicitly rather than renaming established artifacts. |
| [Emil Kowalski](https://github.com/emilkowalski/skills/tree/d16ebe60d09a5ba2afcb7054ede9d0a10c9f6128) | Design engineering, animation review, interaction detail, Expo and native mobile guidance | Load by surface. Existing interaction-craft remains the house doctrine. Prototype and review actual states, including interruption, reduced motion and rapid repeated actions. |
| [Ponytail / Dietrich Gebert](https://github.com/DietrichGebert/ponytail/tree/e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156) | Reuse and implementation economy | Add a bounded necessity/reuse review. Lower code volume never replaces correctness, readable boundaries, data integrity or accessibility. This is the verified technical repository match, not a recovered saved bookmark. |
| [Superpowers / Jesse Vincent](https://github.com/obra/superpowers/tree/8ca22dba9a94f28898bbce59f2537ff4d87c747d) | Complete planning, implementation, debugging and review workflow | Compare as an alternative process owner in an isolated pilot. Select useful practices without activating competing global routers. |

Pstack's upstream plugin manifest identifies Lauren Tan and the README links
@poteto. This resolves the earlier ownership ambiguity. The separately owned
[backnotprop/pstack](https://github.com/backnotprop/pstack) explicitly describes
itself as a standalone mirror and rewrites harness-specific material. Its
contents and model defaults differ from upstream; do not attribute every mirror
instruction to the original author.
[Upstream identity manifest](https://github.com/cursor/plugins/blob/69cf06fa253ba0761213669171198968e51fb9ff/pstack/.cursor-plugin/plugin.json)

The vault was searched for the exact named references. No reliable exact saved
Poteto/Ponytail link was recovered. Public first-party identity and repository
evidence establish the source mapping above; an unavailable saved post is not
invented evidence.

## Additional useful sources

| Source | Why study it | Scope boundary |
| --- | --- | --- |
| [Addy Osmani agent skills](https://github.com/addyosmani/agent-skills) | Engineering review, quality and practical software delivery | Study selected checks with current official platform docs; do not assume a pack enforces its advice. |
| [Vercel agent skills](https://github.com/vercel-labs/agent-skills) and [Web Interface Guidelines](https://vercel.com/design/guidelines) | React/Next performance and product interface review | Framework rules need measured relevance; preserve the product's visual direction. |
| [Vercel product-design evaluation](https://vercel.com/blog/teaching-agents-product-design-at-vercel) | Traceable local rules, focused retrieval, holdouts and application scoring | Separate successful retrieval from correct use. A shipped example can contain flaws. |
| [Impeccable / Paul Bakaus](https://github.com/pbakaus/impeccable) | Focused design critique, content and hardening | Audit scripts/hooks as well as prompts. Existing product conventions take precedence over broad style prescriptions. |
| [Josh W. Comeau](https://www.joshwcomeau.com/) and [web.dev Learn CSS](https://web.dev/learn/css) | CSS reasoning, layout and platform behavior | Use official compatibility evidence for target browsers; educational examples are not universal product policy. |
| [GOV.UK Service Manual](https://www.gov.uk/service-manual) and [Design System](https://design-system.service.gov.uk/) | Discovery, usable forms, content and end-to-end services | Adapt behavior and research discipline, not government branding or mandatory public-sector processes. |
| [W3C WCAG](https://www.w3.org/TR/WCAG22/) and [ARIA APG](https://www.w3.org/WAI/ARIA/apg/) | Accessibility requirements and widget behavior | Automated checks cover only part of the evaluation; manual and representative-use checks remain necessary. |
| [Martin Fowler](https://martinfowler.com/) and [Architecture Decision Records](https://adr.github.io/) | Architecture tradeoffs, refactoring and recorded decisions | Author patterns are choices with contexts, not certification standards. |
| [Google SRE books](https://sre.google/books/) and [OpenTelemetry](https://opentelemetry.io/docs/) | User-facing reliability, incident learning and telemetry | Select a few operational signals and targets the owner can support. |
| [DORA research](https://dora.dev/research/) | Delivery capabilities and outcome measurement | Measure the product/team over time. Avoid ranking individuals or equating commit volume with value. |
| [NIST SSDF](https://csrc.nist.gov/projects/ssdf), [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) and [SLSA](https://slsa.dev/spec/v1.2/) | Secure development, verifiable application controls and supply-chain assurance | Map selected requirements to actual evidence. Templates do not establish a compliance level. |
| [Agent Skills](https://agentskills.io/specification) and [MCP](https://modelcontextprotocol.io/specification/2025-11-25) | Portable packaging and tool protocol contracts | Format support does not establish portable runtime permissions, hooks or security. |
| [Anthropic agent evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) and [OpenAI skill evals](https://developers.openai.com/blog/eval-skills) | Task/outcome evaluation and positive/negative skill triggers | Use these methods with local heldouts and protected graders; record costs and failures. |

## Task routing

| Task | Primary skill or discipline | Required evidence |
| --- | --- | --- |
| New app or feature | micro-studio, requirements/spec discipline | Chosen problem, scope, user states and observable acceptance |
| Uncertain UX direction | AppLlama usage, prototype, frontend/mobile design | Reference provenance, alternatives, realistic task observation |
| Visual or motion work | interaction-craft, relevant Emil review | Actual browser/device interaction, focus, reduced motion, repeat action and performance |
| Boundary or model change | domain-modeling, codebase-design; selected pstack architecture lens | Caller examples, invalid-state behavior, data ownership and ADR when a lasting choice exists |
| Bug | diagnosing-bugs, tdd where a useful test exists | Reproduction, cause, regression predicate and real-surface confirmation |
| Performance | Instrumentation and pstack runtime/trace lens | Fixed workload, baseline trace, before/after and functional invariants |
| Refactor | Code review, reuse discipline | Preserved behavior and consumers, removed obsolete paths, independently reviewed diff |
| Skill or model change | Blinded eval discipline | Trigger tests, valid repeated trials, heldout results and promotion decision |
| Release | Factory release contract | Exact source/artifact, trusted acceptance, security, recovery and running-version evidence |

## Govern updates instead of bulk installing

For each selected adapter, record source URL/commit, original licence and notices,
local version, invocation trigger, supported surfaces/tools, required privileges,
owner, conflicting routers and rollback path. Inspect downloads, hooks and
external writes. A helper is executable software subject to the same review as
app code.

Review a diff before updating. Run positive, negative and adversarial trigger
cases; compare behavior on heldouts. Promote only a change with measurable
benefit and no critical regression. A dated review and preserved prior revision
make the decision reproducible. Pinning is not a reason to ignore security or
compatibility updates.

Micro currently has local Matt-derived skills, interaction-craft, AppLlama
skills, and installed micro-studio skill routing. This research adds a reference and adaptation
plan; it does not globally install upstream packs. Product-specific adapters
and executable verification should be introduced through the
[implementation guide](implementation-guide.md), one evaluated change at a time.
