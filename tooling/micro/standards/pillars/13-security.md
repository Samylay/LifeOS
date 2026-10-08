# P13. Security, privacy and compliance

Research checked: 2026-09-29. Scope: secure product development, agent privileges, personal-data lifecycle, software obligations and incident preparation. Controls are selected for a specific product; this guide is not a certification or a conclusion that every law applies.

## Decision

Use a threat model and testable control register from the first release. Security belongs in discovery, design, implementation, verification, operations and retirement. A vulnerability scan cannot validate authorization or prove that personal-data handling matches the product's promises.

NIST's publication table currently lists SSDF v1.1 as final and v1.2 / SP 800-218 Rev.1 as a draft released on 2025-12-17. Use v1.1 as the stable baseline while tracking the draft explicitly. Its four groups cover preparing the organization, protecting software, producing well-secured software and responding to vulnerabilities. [NIST publication status](https://csrc.nist.gov/projects/ssdf/publications), [final SSDF](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf)

For application requirements, import selected controls from OWASP ASVS 5.0.0 with versioned identifiers. Select depth according to exposure and consequences, record why controls are applicable and attach actual verification. For native mobile, add MASVS and its testing guidance rather than assuming web checks cover device storage, platform interactions or permissions. [OWASP ASVS](https://owasp.org/projects/asvs?tab=main), [OWASP MASVS](https://mas.owasp.org/MASVS/)

## Product security contract

Create `SECURITY-PLAN.md` and a machine-readable control register. Include:

| Field | Required decision |
| --- | --- |
| System | Assets, data flows, external services, trust boundaries and administrator entry points |
| Abuse | Likely actors, misuse scenarios, consequences and exposure |
| Controls | Applicable standard/version, mitigation, implementing module and verification predicate |
| Residual risk | Unresolved finding, accountable owner, compensating control, expiry and remediation predicate |
| Response | Reporting contact, supported versions, advisory process, evidence retention and incident procedure |

OWASP describes threat modeling through system understanding, threat identification, response and validation, while noting that no single method fits every use case. Use a diagram and explicit abuse scenarios; a formal tool is optional. Update the model when adding an integration, privileged action, new data category or exposure route. [OWASP threat-modeling guidance](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html)

For a budgeting app, model an attacker reading another user's transactions, replaying an import, altering totals, abusing account recovery, exhausting a paid AI endpoint or inserting malicious text in uploaded statements. Manual budgeting and bank-account aggregation have different credentials, risks and potential sector obligations. Decide which product is being built before selecting controls.

## Minimum technical controls

1. **Identity and access.** Use an established authentication implementation. Check authorization at the server boundary for every object and action. Exercise two users, cross-tenant reads/writes, anonymous requests, revoked sessions and administrative routes. Treat identifier unpredictability and client-side hiding as insufficient access controls.
2. **Input and execution.** Validate external data at runtime, enforce size/type limits and use parameterized persistence queries. Constrain redirects, uploaded content, URL fetching and outbound requests. Reject unsafe paths, unrestricted command construction and serialization formats that permit arbitrary execution.
3. **Data and secrets.** Keep secrets out of source, images, browser bundles and evidence. Encrypt relevant transport and protected storage using supported implementations. Limit each credential to its product and purpose. Document rotation, revocation and recovery, then rehearse a rotation with synthetic credentials.
4. **Exposure and abuse.** Define rate/cost limits, dependency timeouts, retry budgets, upload quotas and administrative network access. Apply security headers and cross-site protections appropriate to the actual session and request model. A tailnet access rule helps network access but does not replace application authorization.
5. **Verification and response.** Combine reviewed security-sensitive code, static analysis, dependency/artifact scans, behavioral abuse tests and scoped dynamic testing on synthetic staging. Keep a reporting channel, supported-version policy and observed patch delivery path.

These are Micro implementation requirements. Populate the register with the applicable ASVS/MASVS controls and exact tests; do not label a hand-picked subset “ASVS compliant.” A security header or an empty scanner report is evidence for that particular check only.

## Agent and skill security

Threat-model the factory as well as the shipped app. Agent instructions, skills, repositories, documents, search results, tool responses and persisted memory are different trust inputs. External text cannot grant itself authority to read credentials, publish software or rewrite acceptance criteria.

OWASP's 2026 Agentic Top 10 includes goal hijacking, tool misuse, identity/privilege abuse, supply-chain vulnerabilities, unexpected code execution, memory poisoning and insecure inter-agent communication. Convert relevant risks into adversarial fixtures with executable predicates. [OWASP Agentic Top 10](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/)

For Micro, separate a planner that proposes work, an implementer that edits an approved workspace, a verifier that cannot change the authority of its gates and an operator with narrow release privileges. Use fixed tool schemas, bounded commands, restricted filesystem/network scope and budgets enforced outside the model. Approvals refer to the actual artifact, scope and target. A natural-language “approved” string in candidate output is not authorization.

Maintain an inventory of installed skills and MCP tools with source, revision, license, activation rule, filesystem/network access and verification history. Review updates as executable configuration. Prevent unreviewed retrieved content from becoming permanent high-trust memory. Test hostile instructions in issue text, source comments, reference pages and tool responses; assert that no secret or unauthorized external action occurs. Keep raw traces privately, with redacted shareable summaries.

See [P10 agents and evaluations](10-agents.md) for the evaluation contract; the control register remains the source of product-specific privileges and acceptance.

## Privacy implementation

Describe every collected field, purpose, lawful basis, recipient, storage location, retention period and deletion path. Include authentication, billing, analytics, support, crash reports, backups, AI prompts and provider-side logs. Distinguish the business's controller/processor roles and confirm supplier terms before sending real user data. CNIL's developer guide covers minimization, architecture, notices, user rights, retention and legal bases as implementation concerns. [CNIL developer guide](https://www.cnil.fr/fr/guide-rgpd-du-developpeur)

Create a privacy acceptance suite using synthetic users. Verify notice before collection, access/export where applicable, deletion or justified retention, consent withdrawal, deletion propagation and operator access logs. Reconcile backups and legal retention with deletion promises. Never claim immediate erasure from all backups unless the system actually provides it. A restore procedure must reapply deletion state where retained backups would otherwise resurrect removed accounts.

Prefer the least data needed to answer a product question. Do not transmit full transaction descriptions or screenshots merely to count a completed budgeting journey. Keep production records out of development and agent evaluation datasets. Hashing identifiers is not automatically anonymization; avoid promising anonymous analytics without examining reidentification and linkage risks.

For cookies and similar terminal access, CNIL distinguishes necessary operations from those needing prior consent, and requires a real accept/refuse/withdrawal choice. Audience-measurement exemptions have specific limits, including the publisher's exclusive purpose, anonymous statistics and restrictions on cross-service tracking or sharing. “We use analytics” is insufficient evidence for an exemption. Test requests before consent, refusal and withdrawal; document any exemption against the actual SDK configuration. [CNIL cookie rules](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi), [measurement conditions](https://www.cnil.fr/fr/questions-reponses-lignes-directrices-modificatives-et-recommandation-cookies-traceurs)

## Dated applicability register for EU/French products

Do not generate a universal compliance checklist detached from the business. Record product, market, business role, applicable text/version, decision rationale, evidence, owner and the feature change that triggers reassessment.

| Area | Decision to make before distribution |
| --- | --- |
| GDPR and French terminal-access rules | Does the product process personal data or read/write terminal information? Which purposes, bases, suppliers and safeguards apply? |
| Accessibility | Is this a covered product/service, and does a documented exemption apply? Apply accessibility engineering regardless of exemption. |
| Cyber Resilience Act | Is this an in-scope product with digital elements, who is the manufacturer, and what vulnerability/support/reporting obligations apply? |
| AI Act | Is there an AI system in the product or workflow, what role does Micro perform, and what use/risk/transparency provisions apply? |
| Sector and commercial rules | Do health, children, financial services, consumer subscriptions, payments, app stores, intellectual property or contractual obligations alter the design? |

The European Accessibility Act covers specified products and services, including consumer e-commerce, and exempts microenterprises providing services. Its size definition is not automatically the French micro-enterprise tax status or the name of a LifeOS environment. French Consumer Code L412-13 defines the service exemption using fewer than ten people and annual turnover or balance-sheet total at most EUR 2 million. Do not extend a service exemption to all products or obligations. The French implementation and product category need their own recorded assessment. WCAG 2.2 AA is a useful engineering target; passing an automated checker alone is not a legal assessment. [French statutory exemption](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000047284913), [EU accessibility summary](https://eur-lex.europa.eu/FR/legal-content/summary/accessibility-of-products-and-services.html), [directive and microenterprise definition](https://eur-lex.europa.eu/legal-content/FR-EN/ALL/?uri=CELEX%3A32019L0882), [France Num e-commerce guidance](https://www.francenum.gouv.fr/guides-et-conseils/developpement-commercial/site-e-commerce/accessibilite-des-sites-de-e-commerce)

CRA manufacturer reporting applies from 2026-09-11 to in-scope actively exploited vulnerabilities and severe security incidents; main obligations apply from 2027-12-11. Reporting uses an initial 24-hour warning and 72-hour notification, with subsequent reports depending on the event. This is separate from GDPR breach notification. The Commission's 2026-07-27 guidance addresses remote processing, open source and scope but is non-binding. Assess the actual distribution/service arrangement; neither “SaaS” nor “small business” resolves scope by itself. [CRA timeline](https://digital-strategy.ec.europa.eu/en/policies/cyber-resilience-act), [reporting rules](https://digital-strategy.ec.europa.eu/en/policies/cra-reporting), [2026 scope guidance](https://digital-strategy.ec.europa.eu/en/library/commission-publishes-new-guidance-support-timely-cyber-resilience-act-implementation)

The AI Act uses role and use-case risk categories, with staged provisions and changed transition dates reflected in current Commission guidance. Recheck the applicable text at launch. Merely using a coding assistant does not answer whether the shipped app is an AI system or make the app a general-purpose-model provider. Adding an in-product advisor, automated decision or generated-content flow requires a new assessment. [Commission AI Act guidance](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)

For personal-data breaches, document the incident and assess risk to individuals. Where notification is required, CNIL describes the 72-hour authority-notification rule and communication to individuals for high risk, subject to the applicable cross-border authority arrangement. Preserve awareness time and decision evidence even when investigation is incomplete. [CNIL breach obligations](https://www.cnil.fr/fr/violations-de-donnees-personnelles-les-regles-suivre)

## Operational security

Map runtime advisories to the deployed artifact inventory, not just the current development lockfile. Triage severity together with exposure, exploitability, affected data and available mitigation. An advisory database refresh does not patch a running product. Retain patch/rebuild/redeployment evidence and notify users where applicable.

Define vulnerability handling and incident responsibilities that the solo operator can actually fulfill. Record fallback contacts or provider assistance where required. Rotate a compromised credential, preserve relevant evidence and verify revocation. Avoid dumping secrets into incident attachments, public issues or agent traces. Keep security runbooks available if the app itself is unavailable.

## Acceptance and implementation order

The owner accepts security readiness when each applicable control has observed evidence or an explicit scoped exception, two-user authorization and abuse tests pass, a known vulnerable/secret-bearing synthetic candidate fails, credentials are scoped and rotation is rehearsed. Privacy readiness additionally requires a reconciled data map, accurate notice, tested rights/retention paths and a dated applicability decision. Higher-consequence products require a qualified independent assessment before relying on a checklist.

Source audit: the [Micro kit](../../README.md) supplies source secret/SBOM/vulnerability checks, policy admission, candidate limits and advisory refresh. It does not implement each future product's authentication, authorization, privacy features, legal applicability, security assessment or vulnerability remediation. The attended host agent remains outside the candidate verifier's isolation boundary.

Implement first: threat/data maps and privileges for one product. Next: selected ASVS/MASVS controls and negative tests. Before customers: accurate privacy and distribution documents, rotation and incident drills, plus outstanding applicability decisions. Maintain the control register with releases, dependency changes and product retirement.
