# P01: Product discovery and strategy

Checked: 2026-09-29. Scope: choosing a useful problem, defining a first release, testing assumptions, and deciding what evidence warrants more investment. This is a recommended Micro operating method. Product frameworks are practitioner methods, not certifications or universal requirements.

## Evidence and principles

Start with a person's context and desired outcome. GOV.UK's research guidance separates needs from proposed solutions and treats suggestions without user evidence as assumptions. Its discovery guidance also considers constraints and alternatives to building software. Adapt that discipline to a solo business without importing the government's staffing model or discovery duration. [User needs](https://www.gov.uk/service-manual/user-research/start-by-learning-user-needs), [Discovery phase](https://www.gov.uk/service-manual/agile-delivery/how-the-discovery-phase-works).

Marty Cagan distinguishes value, usability, feasibility, and business viability risks. This is a useful review lens: an app can be pleasant and technically correct while solving an infrequent problem or costing more to support than it earns. Teresa Torres's opportunity solution tree links an outcome to user opportunities, possible solutions, and assumption tests. Neither author establishes a rule that every product needs their entire method. [SVPG's four risks](https://www.svpg.com/four-big-risks/), [Torres's opportunity solution trees](https://www.producttalk.org/opportunity-solution-trees/).

Specify an experiment before looking at results. Strategyzer's Test Card makes the hypothesis, test, measure, and decision threshold explicit; its Learning Card separates observations from conclusions and resulting action. Use a short Markdown record rather than buying a research platform. Google's HEART paper supplies another useful distinction: connect a product goal to observable signals and then metrics. A page-view counter alone does not establish user success. [Test Card](https://www.strategyzer.com/library/validate-your-ideas-with-the-test-card), [Learning Card](https://www.strategyzer.com/library/capture-customer-insights-and-actions-with-the-learning-card), [HEART research](https://research.google/pubs/measuring-the-user-experience-on-a-large-scale-user-centered-metrics-for-web-applications/).

## The Micro workflow

1. **Capture the user's proposal.** In the project's Features brief, preserve the authored title, audience, problem, feature ideas, and first-value hypothesis. AI can propose sharper problem statements, adjacent users, simpler features, and missing risks. Each proposal remains labeled as an assumption until the owner selects it or research supports it. Do not turn a generated persona into a claim that interviews occurred.
2. **Create a compact discovery brief.** Record the situation that triggers the need, current workaround, frequency, cost of failure, reachable users, platform constraints, competing approaches, and the smallest useful result. A budgeting example is: “When deciding whether to spend this week, someone needs a trustworthy view of money already committed.” “Bad financial decisions” is a starting hypothesis; it needs context before specifying a dashboard.
3. **Connect features to opportunities.** Give each first-release feature a stable ID, the user need it addresses, supporting evidence or assumption, and an observable acceptance example. Separate later ideas. Keep an alternative solution, including doing less software work, when it could test the same outcome more cheaply.
4. **Test the highest-impact uncertainty.** A manual workflow can test usefulness, a clickable prototype can test comprehension, a technical spike can test an integration, and a clearly described offer can test willingness to commit. Choose the method for the uncertainty. Do not claim that a landing-page click demonstrates recurring willingness to pay.
5. **Make an explicit investment decision.** Preserve the raw observation summary, contradictory evidence, sample limitations, cost estimates, and the owner's decision. Possible outcomes include continue, revise the problem, narrow scope, or stop this proposed product. An AI cannot silently retire the owner's interests or saved ideas.
6. **Hand off a bounded release.** Freeze the approved feature IDs, constraints, success signals, risk tier, and exclusions for implementation. Reopen discovery when new evidence materially changes them; do not make every implementation detail trigger a new approval ritual.

Recommended project artifacts, created when relevant:

| Artifact | Minimum contents | Used by |
| --- | --- | --- |
| `discovery.md` | Audience, situation, current workaround, evidence, constraints, competing approaches | Product and UX review |
| `experiments.md` | Hypothesis, method, measure, threshold, observation, decision, limitations | Discovery loop |
| `feature-map.md` | Feature ID, need, release scope, acceptance, evidence reference | Spec and tests |
| `economics.md` | Pricing hypothesis, variable costs, support burden, distribution constraints | Release review |
| `decision-log.md` | Decision, alternatives, evidence, owner, revision trigger | Future agents |

Keep consent records, participant contacts, recordings, and sensitive quotations outside public source control. Minimize collected research data and record access and retention rules. GOV.UK's research privacy guidance is a practical handling model; the app's actual jurisdiction and processing determine legal requirements. [Research data and participant privacy](https://www.gov.uk/service-manual/user-research/managing-user-research-data-participant-privacy).

## Acceptance and risk tiers

These are recommended local gates. They do not assert statistical product-market fit.

| Tier | Observable predicate before more investment |
| --- | --- |
| Disposable prototype | The brief names a target user, task, uncertainty, and learning method; every generated claim is labeled; no real sensitive data or undisclosed live charge is used |
| Public first release | Every first-release feature maps to a need and acceptance example; representative task evidence or an explicit evidence gap is recorded; operating cost, support channel, and success measure are defined |
| Money movement, sensitive data, or consequential advice | Product, security, privacy, and domain risks have named review evidence; risky claims and integrations receive appropriate specialist review; failure and recovery cases enter the release contract |

For qualitative work, document recruitment criteria and cover materially different users. GOV.UK recommends actual or likely users, including disabled people and those with limited digital skills; it gives typical small research rounds rather than a universal proof threshold. A small convenience sample can expose problems but does not estimate population conversion or justify precise revenue forecasts. [Finding research participants](https://www.gov.uk/service-manual/user-research/find-user-research-participants).

## Tools and skills

Use `micro-studio` as the workflow entry point, a requirements interrogation skill for unresolved assumptions, and a throwaway prototype skill for a named design question. Add a task-scoped discovery adapter that demands evidence labels and generates the artifact fields above. Evaluate it with cases where the user provides incomplete evidence, conflicting requests, sensitive research, and an attractive but irrelevant competitor feature.

AppLlama supplies real mobile screens and flows for comparative inspection. A saved flow may help identify useful patterns and missing states; it cannot prove why an app succeeds or what this audience needs. Record the observed behavior, attribution, adaptation rationale, and unresolved hypothesis. Use browser or device prototypes for experiments that need interaction. A plain document is sufficient when the question is about language or scope.

For naming, shortlist names after the core job is clear. Check comprehension with likely users and inspect store/domain collisions before investment. Availability checks do not establish trademark clearance. Preserve this distinction in the naming artifact rather than letting an AI assert legal availability.

## Implementation order and limits

First standardize the discovery brief and feature-to-acceptance map. Next add a lightweight experiment record and an explicit evidence-gap field to the project review packet. Then connect release telemetry to the approved outcome. Introduce more elaborate research repositories or experimentation platforms only when the number of products and decisions makes them useful.

The retained Micro initializer, templates, and studio skill support project briefs and artifacts. The earlier LifeOS studio captured problem, audience, scoped features, AI suggestions, naming, vibe, and references at [historical revision e04f14e](https://github.com/Samylay/LifeOS/tree/e04f14e/app/src/app/micro). Concurrent user work removed that UI and its API from the current checkout; this guide does not restore them or claim they are currently available. The experiment records, outcome measures, recruitment process, economic review, and product-learning gates described here are proposed additions. No research participants were contacted and no product hypothesis was validated while writing this guide.

Cross-pillar dependencies: UX evaluates comprehension; architecture tests feasibility; security/privacy review harmful outcomes and collection; growth validates distribution and economics. A factory accelerates these decisions and retains their evidence. It cannot guarantee demand.
