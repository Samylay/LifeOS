# P15: Growth, distribution, billing, and support

Checked: 2026-09-29. Scope: first value, distribution, pricing, purchase lifecycle, user communication, support, and product learning. This is a recommended commercial operating layer for Micro. Store rules are platform policy, payment docs describe provider contracts, and privacy guidance is jurisdiction-dependent. Refresh them for the actual launch region and date.

## Evidence and principles

Growth begins with a useful product and an honest promise. Android's quality model includes core value, user experience, technical quality, and privacy/security. Treat a launch as a complete operating commitment, including support and departure, rather than a successful build upload. [Android quality framework](https://developer.android.com/quality?authuser=289541483).

Choose the distribution and payment channel before coding a paywall. Apple and Google policies govern digital purchases in store-distributed apps and contain category, region, and program exceptions. A web checkout integration does not establish that the same checkout is allowed inside every native app. Review the current policy against the specific product instead of relying on a saved social post. [Apple review rules](https://developer.apple.com/app-store/review/guidelines/), [Google Play payments](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en).

Measure the user's result and the business result separately. Acquisition, activation, retention, revenue, support cost, and reliability answer different questions. Google's HEART research connects user goals to signals and metrics; use that discipline to define activation as a meaningful successful task, not merely account creation. [HEART research](https://research.google/pubs/measuring-the-user-experience-on-a-large-scale-user-centered-metrics-for-web-applications/).

## The Micro workflow

1. **Define first value and pricing.** State what a person can understand or accomplish before registering or paying, which capabilities require an account, why, and what the offer includes. For budgeting, a synthetic demonstration or local first budget may be useful if it fits the security and persistence model. Do not assert that removing authentication always increases revenue.
2. **Choose a reachable distribution path.** Web, Android, iOS, desktop, and private distribution carry different discovery, trust, review, update, and support costs. Select an initial audience and an ethical channel where it can be reached. Prepare one clear offer and one primary call to action. Additional channels follow evidence, not a generic instruction to advertise everywhere.
3. **Design the full purchase lifecycle.** Specify trial, purchase pending, success, failure, renewal, cancellation, refund, revoked entitlement, offline behavior, account merge, reinstall, restore, and support escalation where applicable. Decide which server/store/provider record determines access and how discrepancies are reconciled.
4. **Prepare the launch packet.** Record the product identity, package/bundle IDs, signed artifact, supported devices and languages, listing copy and screenshots, privacy disclosures, support contact, reviewer instructions, account deletion path, billing tests, release evidence, and recovery plan. Keep signing secrets and reviewer credentials in their intended protected locations.
5. **Launch gradually and observe.** Use the channel's test/staging capabilities, then compare actual activation, failures, support requests, and cost with the product hypothesis. Preserve cohort definitions and event meanings. Avoid interpreting low-volume noise as a causal result.
6. **Improve or retire deliberately.** Feed observed problems into discovery and engineering. If ending a product, plan user notice, paid obligations, export, retention/deletion, and dependency shutdown. An agent must not silently remove users' access or retire the owner's ideas.

Recommended artifacts:

| Artifact | Minimum contract |
| --- | --- |
| `commercial.md` | Audience, positioning, first value, pricing assumptions, cost/support model |
| `distribution.md` | Chosen channels, account type, regions, policy references and checked date |
| `billing-state-matrix.md` | Event/state, trusted authority, entitlement, idempotency, UI, recovery |
| `analytics-plan.md` | Goal, signal, event definition, permitted fields, retention, access |
| `launch.md` | Listing, signed artifact, disclosures, reviewer/support information, release gates |
| `support.md` | Contact, triage, escalation, privacy handling, refunds/deletion routing |

These can be sections in the release guide for a small product. Store screenshots and marketing examples should use synthetic data, licensed assets, and claims supported by the shipped behavior.

## Purchase correctness

For a permitted Stripe integration, verify webhook signatures using the raw request body. Stripe documents duplicate deliveries and no guaranteed event order. Separate durable event receipt from processing, make business effects idempotent, and reconcile with provider state when events are missing or conflicting. A browser success redirect alone must not authorize paid access. [Stripe webhook contract](https://docs.stripe.com/webhooks).

API idempotency keys support safe retries of supported Stripe requests, but they do not automatically deduplicate your database writes, emails, or fulfillment. Define a durable application-level operation identity and uniqueness rules. Test retries around failure boundaries. Test clocks can simulate eligible Billing scenarios in test mode; they supplement integration tests and do not recreate every production failure. [API idempotency](https://docs.stripe.com/api/idempotent_requests), [Billing test clocks](https://docs.stripe.com/billing/testing/test-clocks).

Use native billing APIs or a reviewed subscription service when the selected store channel requires them. RevenueCat's first-party quickstart documents its cross-platform subscription SDK approach; assess SDK collection, cost, availability, identity mapping, entitlement ownership, and exit/export options before choosing it. It does not remove the developer's store-policy or support responsibilities. [RevenueCat quickstart](https://www.revenuecat.com/docs/getting-started/quickstart).

Critical integration cases include duplicate and reordered events, invalid signatures, delayed confirmation, expired trials, failed renewal, restored purchases, refund/revocation, simultaneous device sessions, and interruption after charge but before local completion. Verify that repeated inputs never create an extra charge or inconsistent entitlement in the test scenario. Keep tests isolated from live money.

## App release realities

Google's current policy for personal Play accounts created after 2023-11-13 requires at least 12 testers opted in continuously for 14 days before applying for production access. This is account-type-specific and may change. Check the actual publishing account early; do not infer its type from the business name or promise that meeting the test threshold guarantees approval. [Personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

Apple requires an in-app initiation path for account deletion when account creation is supported, with documented exceptions and handling. Google's applicable account-deletion policy also requires an in-app path and a web resource. Define deletion, subscription cancellation, and legally retained records separately so the UX does not promise that deleting an account automatically cancels store billing. [Apple deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app), [Google deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Google Play's Data safety declarations include data handled by third-party libraries and SDKs, with track and app exceptions. Maintain a data/SDK inventory and compare disclosures with observed behavior. An internal-test exemption is not a general public-release exemption. [Data safety requirements](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

## Privacy-conscious acquisition and learning

Collect the minimum event fields needed for the approved decision. For a budgeting app, aggregate successful budget creation may be sufficient; expense labels, amounts, bank identifiers, and free-form notes do not belong in generic analytics by default. Keep product telemetry separate from debugging and billing audit requirements.

CNIL distinguishes an operating-system permission from consent for the processing purpose. Its SDK guidance recommends checking collection, control, and relevant consent behavior when selecting integrations. This is a source-backed design consideration for a French micro-enterprise, not a complete legal assessment. Test refusal and withdrawal where required; the interface and SDK behavior must agree. [Mobile permissions](https://www.cnil.fr/fr/permissions-applications-mobiles-recommandations-de-la-cnil-pour-respecter-la-vie-privee), [SDK selection](https://www.cnil.fr/fr/applications-mobiles-comment-integrer-des-sdk-et-respecter-la-vie-privee-des-utilisateurs).

For web discovery, Google Search's starter guide supports clear helpful content and crawlable structure. It cannot guarantee rankings or demand. Apple offers product-page optimization and custom pages to compare listing assets and acquisition paths. Treat observed conversion and retention as evidence within the experiment's limits; a small sample or changed traffic mix does not prove a design caused growth. [Search starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), [Product-page optimization](https://developer.apple.com/help/app-store-connect/create-product-page-optimization-tests/overview-of-product-page-optimization), [Custom product pages](https://developer.apple.com/app-store/custom-product-pages/).

## Risk-tiered acceptance and implementation

| Tier | Observable predicate |
| --- | --- |
| Private prototype | Offer and pricing are clearly hypothetical; no undisclosed charge, marketing contact, or public claim occurs; synthetic data is used |
| Free public release | Distribution policy and disclosures match the app; first-value flow, support, export/deletion where relevant, and rollback are tested; telemetry fields and collection behavior are reviewed |
| Paid or sensitive release | Billing state tests, entitlement reconciliation, cancellation/refund/restore paths, privacy review, and signed-artifact release evidence pass; support can handle a failed purchase without asking for secrets |

Start with distribution/account-policy review and the first-value contract. Implement support and privacy disclosures before launch. Add billing only with a defined lifecycle and trusted authority. Then introduce acquisition experiments, cohort learning, and automation that reduce demonstrated work. Stripe publishes official agent skills, a useful optional scoped adapter when Stripe is chosen, after inspection and evaluation. [Stripe agent skills](https://docs.stripe.com/skills).

The retained Micro brief supports pricing/first-value text, and the kit has a disabled initial release record. The earlier LifeOS studio exposed the pricing field at [historical revision e04f14e](https://github.com/Samylay/LifeOS/tree/e04f14e/app/src/app/micro); concurrent user work removed that UI and its API from the current checkout. The kit does not install a payment provider, store publishing account, advertising campaign, analytics service, or support operation. Those remain app-specific implementations. No store submission, payment, message to a potential customer, or commercial validation occurred during this research.
