# Micro software factory standards

Research edition: 2026-09-29. The practical target is a factory that repeatedly
produces useful, maintainable software with trustworthy acceptance and recovery
evidence. There is no single certified tool stack that makes every product
industry best. This playbook combines formal standards, primary-source
engineering practice and explicit local choices, with proportionate adoption
for a solo micro-enterprise.

Start with the [implementation guide](implementation-guide.md). Consult the
[installed-control audit](installed-audit.md) to distinguish functioning kit
controls from templates and proposals. Use the [skills catalogue](skills-catalogue.md)
to select disciplines for the task rather than load every pack.

## The sixteen pillars

| Pillar | Governing question | Guide |
| --- | --- | --- |
| 01 Product discovery and strategy | Is this a worthwhile problem for a specific user? | [Product](pillars/01-product.md) |
| 02 UX and content | Can people complete the task and recover from failure? | [UX](pillars/02-ux.md) |
| 03 UI and design systems | Does a coherent, accessible visual system support the task? | [UI](pillars/03-ui.md) |
| 04 Interaction and animation | Does feedback clarify state and feel good under real use? | [Motion](pillars/04-motion.md) |
| 05 Frontend and mobile | Does the actual browser/device behave correctly and efficiently? | [Frontend](pillars/05-frontend.md) |
| 06 Backend and APIs | Are boundaries, permissions, retries and concurrency correct? | [Backend](pillars/06-backend.md) |
| 07 Architecture and domain modeling | Are concepts, ownership and change boundaries clear? | [Architecture](pillars/07-architecture.md) |
| 08 Data lifecycle | Can data evolve, recover and be deleted as promised? | [Data](pillars/08-data.md) |
| 09 Testing and quality | Do independent checks distinguish working behavior from failure? | [Testing](pillars/09-testing.md) |
| 10 Agents, skills and evaluations | Do the worker and its guidance improve verified outcomes? | [Agents](pillars/10-agents.md) |
| 11 Platform and developer experience | Can a clean environment reproduce development safely? | [Platform](pillars/11-platform.md) |
| 12 CI/CD, releases and supply chain | Is the tested, attributable artifact the one that ships? | [Delivery](pillars/12-delivery.md) |
| 13 Security, privacy and compliance | Are actual threats, data duties and applicable obligations addressed? | [Security](pillars/13-security.md) |
| 14 Reliability, observability and recovery | Can the operator detect and recover a broken user journey? | [Reliability](pillars/14-reliability.md) |
| 15 Growth, distribution, billing and support | Can people find, buy, use and obtain support for the product? | [Growth](pillars/15-growth.md) |
| 16 Delivery process and improvement | Does each iteration improve user outcomes and sustainable delivery? | [Improvement](pillars/16-improvement.md) |

Performance, accessibility, localization, security, documentation, cost and
data integrity cross several pillars. The product's control register assigns
one owner and one evidence location for each requirement, preventing duplicate
checklists from drifting.

## Standards and evidence hierarchy

| Reference | Status and role | Adoption boundary |
| --- | --- | --- |
| [NIST SSDF](https://csrc.nist.gov/projects/ssdf/publications) | Confirmed final v1.1 secure-development baseline; v1.2 was listed as a draft at research time | Map practices to real controls and evidence; do not label a template compliant. |
| [OWASP ASVS](https://owasp.org/projects/asvs?tab=main) and [MASVS](https://mas.owasp.org/MASVS/) | Versioned application/mobile verification requirements | Select applicable requirements for exposure and consequence, record verification depth. |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | W3C Recommendation with testable success criteria | Engineering target AA; scope and complete processes matter. Tools alone do not establish conformance. |
| [WCAG-EM 2.0](https://www.w3.org/TR/WCAG-EM-2/) | Evaluation methodology, W3C Group Note | Supports scoped assessment; it is not an additional conformance standard. |
| [DTCG 2025.10](https://www.designtokens.org/TR/2025.10/format/) | Stable Community Group report for token interchange | Use when tooling interoperability is needed; it is not a W3C Recommendation. |
| [SLSA v1.2](https://slsa.dev/spec/v1.2/) | Versioned source/build assurance requirements | Document actual builder/source/provenance properties before any level claim. |
| [OpenAPI](https://spec.openapis.org/oas/latest.html) | API description specification | Pin a supported version per product; a schema alone does not prove authorization or business behavior. |
| [OpenTelemetry](https://opentelemetry.io/docs/) | Instrumentation and telemetry specifications/tools | Choose supported signals, retention and an operator workflow. |
| [DORA metrics](https://dora.dev/guides/dora-metrics/) | Empirical delivery framework with current five-metric definition | Observe trends alongside product outcomes, quality, review effort and cost. |
| EU/French obligations | Applicable legal texts interpreted for a specific role/product/market | Use the dated applicability register in [P13](pillars/13-security.md), not a universal legal conclusion. |

An author's design preference, maintainer benchmark, first-party case study and
formal standard have different evidential weight. Each guide cites claims close
to the supporting source and labels proposed Micro policy. Repository revisions
are recorded in [sources.lock.json](sources.lock.json); source freshness and
compatibility must be rechecked when adopting or updating a dependency.

## How to use this in a new task

Open the actual Micro product repository, read its AGENTS.md and the installed
micro-studio skill, then say:

> Use the Micro factory playbook in the LifeOS kit. Read BRIEF.md, DESIGN.md,
> SPEC.md and git status. Identify the relevant pillars and unresolved product
> choices. Preserve existing work. Implement the agreed first release in small
> verified steps, with independent review and exact-source acceptance. Report
> actual evidence and remaining release gaps.

The current UI-integration checkout removed the LifeOS studio routes. The CLI
kit and project artifacts remain the starting path. This research preserves
that unrelated change; see the [audit](installed-audit.md) before relying on a
studio page. New project templates point to this playbook. Existing repositories
need an explicit pointer or the prompt above; a document's presence does not
make every old task automatically load it.

## Maintained research loop

Use the [improvement protocol](improvement-loop.md) to turn a failure into a
bounded experiment, independent result and versioned update. This edition has
finite completion criteria: sixteen sourced guides, verified named provenance,
an audited implementation map, operational adoption steps and resolved material
review findings. Continuing research targets a concrete gap, changed source or
measured regression.

Run `python3 tooling/micro/standards/check.py` from the LifeOS root to validate
the document manifest, local references, source provenance fields and proposed
case-bank shape. That check does not execute product acceptance, confirm live
services, inspect legal applicability or measure model reliability.
