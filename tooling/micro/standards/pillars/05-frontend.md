# P05: Frontend and mobile engineering

Checked: 2026-09-29. Scope: implementing browser and native app behavior, state, platform integration, performance, localization and offline recovery. Product discovery, visual direction and animation decisions belong to P01 through P04; this pillar makes their contracts work in code.

This guide proposes Micro policy. The referenced specifications and platform documentation describe their own requirements. Tool choices and thresholds beyond those sources are factory decisions, not universal standards. The [installed kit](../../README.md) supplies agent routing and verification slots; it does not yet ship tested web and native application starters.

## Choose a platform from the product contract

Record supported devices, operating systems, browsers, input methods and distribution channels before choosing a framework. Define one primary journey and its failure states. A budgeting app may need device-local entry and later synchronization; a public catalogue may need search-engine indexing; a desktop utility may need filesystem access. These are different implementation problems.

| Product condition | Candidate starting point | Decision to record |
| --- | --- | --- |
| Public pages plus authenticated web workflows | Server-rendered framework with explicit client islands, such as Next.js | Which pages need server rendering, their cache ownership and deployment requirements |
| Browser-only tool with a separate API | Existing React application or a small browser framework | Why server rendering is unnecessary and how routing, authentication and errors work |
| Android and iOS with ordinary platform integrations | Expo/React Native after a device prototype | Native module compatibility, offline storage, build/signing and accessibility |
| Deep platform integration or demanding device workloads | Native Swift/Kotlin, or a measured specialized implementation | Required platform behavior and evidence that the cross-platform option cannot meet it |
| Local CLI or internal automation | No graphical frontend unless the workflow needs one | Input/output contract, recoverable errors and documentation |

These are selection heuristics. Preserve an existing suitable stack. Do not add a second frontend framework because a reference app uses it. Build the highest-risk platform interaction as a disposable prototype before committing to a mobile stack.

## Make state transitions explicit

Distinguish authoritative server data, unsaved drafts, navigation state and transient presentation state. Avoid storing values that can be derived from existing state. React documents that redundant or contradictory state creates synchronization problems and that Effects are intended for synchronization with external systems. [React state structure](https://react.dev/learn/choosing-the-state-structure), [React Effects guidance](https://react.dev/learn/you-might-not-need-an-effect).

Micro implementation policy:

1. Give every mutation a defined idle, pending, successful and failed outcome. Preserve the draft when saving fails.
2. Specify whether optimistic updates are safe. Reconcile with the server, undo rejected changes and prevent stale responses from overwriting later edits.
3. Put route-shareable filters in the URL when users should be able to bookmark or navigate back to them. Keep private drafts out of URLs and analytics.
4. Model multistep operations with explicit transitions when independent booleans allow impossible combinations. Start with a discriminated union; add a state-machine library only when its features earn the dependency.
5. Own cancellations, stale requests and cleanup. Test rapid navigation, repeated submission, back/forward navigation and leaving a screen during a pending mutation.

For a budgeting entry, acceptance should say what happens when a user saves twice, loses connectivity, changes the amount while saving, or opens the same budget in another session. A spinner disappearing is insufficient evidence of successful persistence.

## Set type and trust boundaries

For a new TypeScript starter, enable `strict`. Evaluate `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` explicitly because they address indexed reads and optional-property semantics separately. Their addition to an existing repository should be a reviewed migration. [TypeScript strict](https://www.typescriptlang.org/tsconfig/strict.html), [indexed access](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html), [optional properties](https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html).

Parse network, storage, URL and AI-produced values at runtime. A type assertion does not check or change a runtime value. Use the product's existing schema validator or a small explicit parser at these boundaries; avoid competing validation libraries. Keep internal domain types separate from transport and persisted schemas. [TypeScript type assertions](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions).

For Next.js, treat Server Actions as callable server entry points. Recheck authentication and resource authorization in each action or the shared data-access path, validate arguments, and return a projection containing only data the client needs. A protected page does not authorize its action. [Next.js data security](https://nextjs.org/docs/app/guides/data-security).

Suggested review predicates are: no browser bundle contains a server secret; malformed persisted data produces a recoverable state; an unauthorized client cannot invoke a mutation; and old/new response versions follow the documented compatibility rule. Static types complement these tests.

## Implement the platform contract

Web components should begin with semantic HTML. A custom ARIA widget must implement its keyboard and focus behavior, not only a role attribute. WCAG 2.2 supplies testable accessibility criteria, while the ARIA Authoring Practices Guide is implementation guidance. Select WCAG 2.2 AA as the Micro web target and assess complete journeys before claiming conformance. [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [APG guidance](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/).

Keep these observable implementation checks in the acceptance matrix:

| Area | Required behavior for the supported scope |
| --- | --- |
| Input | Keyboard, pointer and touch can complete the journey; focus stays visible and logical |
| Forms | Persistent labels, useful error association, retained input, sensible autofill and correct input modes |
| Layout | Supported small screens, large text and zoom preserve the task; safe areas and the on-screen keyboard do not hide essential controls |
| Localization | Locale-specific display stays separate from stored values; long translations, plural forms, right-to-left content and date boundaries receive fixtures where supported |
| Navigation | Browser history or native back behavior, deep links and interrupted flows return to a usable state |
| Permissions | Denied or revoked camera, notification and storage permissions have a usable alternative |

P03 owns component patterns and tokens. P04 owns timing, easing and reduced-motion behavior. Implementers should reuse those decisions instead of adding a local visual system to each feature.

## Define offline and synchronization behavior

An offline-first design makes its local read source and synchronization policy explicit. Android's architecture guidance describes local data sources, queued writes and conflict handling. Service workers add another cache and lifecycle to web products; they are not required for every web app. [Android offline-first architecture](https://developer.android.com/topic/architecture/data-layer/offline-first), [MDN service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

Before adding a service worker or sync library, write a small offline contract: which records are available offline, what can be edited, what the pending indicator means, which user owns cached data, and how conflicts are resolved. Expire or clear account-scoped caches on logout or account switching. Do not cache sensitive responses as an accidental consequence of a generic cache-everything rule.

For a local budgeting app, a first release can deliberately support durable local entries and export without promising multi-device sync. If synchronization is included, test two devices editing the same record, a retry after an uncertain response, revoked access during an offline period and deletion followed by a stale device reconnect. P06 handles request idempotency; P08 handles durable data and deletion semantics.

Store native session secrets using the platform-backed secure storage supported by the selected stack. Expo SecureStore has documented platform and backup behavior; it is not a substitute for the product's durable business database. Verify logout, reinstall/restore and biometric-change behavior on the chosen platforms. [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/).

## Measure usable performance

Core Web Vitals reference good field performance at the 75th percentile: LCP at most 2.5 seconds, INP at most 200 milliseconds and CLS at most 0.1. A laboratory Lighthouse result cannot establish field percentiles. Low-traffic Micro apps should retain comparable lab traces until field data is meaningful. [Web Vitals](https://web.dev/articles/vitals).

React Native recommends measuring performance with release builds; development-mode behavior is not a valid release baseline. Android vitals covers production health including crashes and application-not-responding events. [React Native performance](https://reactnative.dev/docs/performance), [Android vitals](https://developer.android.com/google/play/vitals).

Create `performance-budget.json` or an equivalent recorded contract with the tested device/browser, network profile, fixture size, warm/cold state, measured metric, baseline and regression allowance. Choose bundle, memory and startup budgets from product needs and measurement. Do not apply an invented universal kilobyte limit to every app. Profile before introducing memoization, list virtualization or native optimizations; retain the trace showing that the chosen change addresses the bottleneck.

## Build and verify a vertical slice

Produce `FRONTEND.md` only when the starter needs decisions beyond `DESIGN.md` and `SPEC.md`. It should contain the platform matrix, state ownership, network/cache boundaries and offline contract. Implement one complete useful slice through UI, API and persistence before building all screens.

| Risk tier | Acceptance predicate | Retained evidence |
| --- | --- | --- |
| Disposable prototype with synthetic data | The stated design question is answered on the target platform; prototype is marked nonproduction | Observations and prototype commit |
| First real release | Core journey, reload/reopen persistence, failed save, keyboard/back navigation and reduced motion work on supported targets | Browser/device traces, screenshots and test results tied to source SHA |
| Accounts or sensitive personal data | Cross-account access is denied; logout/cache boundaries, offline conflict and safe error projection are exercised | Negative tests and security review |
| Money movement or other high-consequence behavior | Server-confirmed outcomes, duplicate-action protection and recovery receive independent review | Reviewed scenarios, actual release-build/device evidence and P13/P14 sign-off |

Use Playwright for browser-visible behavior and a native device/simulator acceptance adapter for mobile. Screenshots are one form of evidence; they cannot demonstrate mutation, persistence or assistive-technology behavior. [Playwright best practices](https://playwright.dev/docs/best-practices).

## Factory upgrade sequence

1. Build one reviewed web starter and one mobile starter only after platform requirements justify each. Lock the toolchain, define real lint/type/test/acceptance scripts and verify a clean checkout.
2. Add synthetic fixtures for the full state matrix and a browser/device acceptance adapter. Keep native signing and live accounts outside candidate jobs.
3. Add type-boundary, a11y and performance checks to these starters, with explicit supported targets and independent policy admission.
4. Feed defects back into reusable components and fixtures. Update a starter through a reviewed change, without automatically rewriting existing products.

The installed npm verifier has no network and a bounded runtime. Browser binaries and locked dependencies must be preloaded into a reviewed verifier image, or acceptance must run in the protected hosted CI boundary. Device testing needs a separate bounded adapter. This guide does not claim those adapters have been implemented. [Micro delivery contract](../../release-guide.md).
