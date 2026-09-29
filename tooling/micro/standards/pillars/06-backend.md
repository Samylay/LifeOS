# P06: Backend and API engineering

Checked: 2026-09-29. Scope: server-side business behavior, HTTP/API contracts, validation, authorization, concurrency, integrations and asynchronous work. P07 owns architectural boundaries, P08 owns data lifecycle, P13 owns the threat model and security requirements, and P14 owns operating objectives.

This is researched guidance and proposed Micro policy. RFCs define protocol semantics; OWASP and platform documents supply guidance. The [installed factory](../../README.md) runs source checks and scanners but does not create a production API, identity provider, queue or universal backend starter.

## Begin with one deployable business service

For a solo product, start with one modular backend and one primary relational database when the requirements fit. A web app can use its existing server framework. A mobile app needs a backend only for features requiring remote identity, synchronization or shared services. Preserve a working backend unless the product contract requires a change.

| Condition | Implementation choice to evaluate | Cost to account for |
| --- | --- | --- |
| One web app and ordinary CRUD/workflows | Existing full-stack server runtime | Server/client boundary, access control, caching and database operations |
| Multiple clients or an independently operated API | Explicit HTTP API with a documented contract | Client compatibility, authentication and version lifecycle |
| Delayed work with restart recovery | Durable job table or an existing queue | Leases, retries, deduplication, visibility and operating another service |
| High CPU, specialized libraries or a different runtime requirement | Focused Go/Python/Rust or other existing service | Deployment, observability, API compatibility and another toolchain |
| Independent security, release or scaling requirement | Extract the relevant service after a design review | Distributed transactions, network failures and additional operational ownership |

These choices are factory recommendations. Neither GraphQL, RPC nor microservices is an industry requirement. A private typed RPC interface may fit a single client/server pair; public integrations need a stable contract their consumers can actually use.

## Specify the API before relying on it

For externally consumed HTTP APIs, use an OpenAPI version supported by the validator and client-generation toolchain. OpenAPI describes HTTP interfaces and enables documentation, tooling and test automation; a schema alone cannot establish correct authorization or business behavior. [OpenAPI specification repository](https://github.com/OAI/OpenAPI-Specification).

Record operations, authentication, request/response examples, validation limits, failure codes, pagination, compatibility and retry behavior in `API.md` or a machine-readable schema plus short policy. Keep a canonical schema instead of three separately maintained descriptions. Validate examples and exercise the actual server against the same contract.

Use HTTP methods, status codes and conditional requests according to their defined semantics. RFC 9110 distinguishes safe methods from idempotent methods and defines validators such as `If-Match`; do not implement destructive behavior as an ordinary GET. For structured failures, RFC 9457 supplies problem-details semantics. Return safe errors with a stable machine-readable reason, not a raw stack trace. [HTTP semantics](https://www.rfc-editor.org/rfc/rfc9110.html), [problem details](https://www.rfc-editor.org/rfc/rfc9457.html).

Micro contract decisions include deterministic pagination, stable ordering with a tie-breaker, maximum page size, maximum request body, operation deadline and explicitly classified retryable errors. Choose numeric limits from measured capacity and abuse risk. Publish the same decisions in client behavior and server tests.

## Validate syntax and business meaning on the server

Untrusted input includes URL parameters, headers, cookies, uploads, stored third-party payloads, webhooks and AI output. Validate at the server boundary even when the UI already validates it. OWASP separates syntactic validity from semantic validity and states that input validation does not replace SQL-injection or XSS protections. [OWASP input validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html).

Recommended request path:

1. Apply transport, content-type and size limits before expensive parsing. Normalize only according to a documented rule.
2. Establish identity and server-verified resource/tenant scope. Parse the operation into a bounded domain command.
3. Authorize the action and field changes. Enforce business invariants inside the appropriate transaction.
4. Commit the result and any required durable follow-up intent. Return a bounded projection and trace identifier.
5. Record outcome metadata after redaction. Exclude credentials and unnecessary personal data from logs.

Do not spread authorization across UI visibility rules. OWASP recommends denial by default and permission checks on every request. Test both access to a resource and permission to perform the requested operation. Parameterized queries prevent injection; they do not prove the caller owns the selected row. [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

For a Next.js app, apply the same server contract to Route Handlers and Server Actions. Reuse the authorization/data-access path; do not infer authorization from a page redirect. [Next.js data security](https://nextjs.org/docs/app/guides/data-security).

## Treat identity, tenant scope and caching as one access contract

For multi-tenant products, client-selected tenant IDs are selectors requiring membership checks. Carry verified scope through queries, caches, object storage, jobs and exports. A random identifier reduces guessability but is not authorization. Shared workers and queues need the same isolation decisions as requests. [OWASP multi-tenant guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html).

Make ordinary access and privileged maintenance separate paths. A service account with broader access must have a named purpose, bounded scope and auditable operations. Delayed work may need to recheck permission if membership can change before execution. Cache keys must include every identity or policy dimension that changes the returned data.

PostgreSQL row-level security can reinforce shared-table isolation, but superusers and `BYPASSRLS` roles bypass it, and table owners normally do too. Test the deployed application's actual database role. RLS does not replace authorization for external side effects. [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

Cookie-based sessions require an explicit CSRF defense and cookie/session policy. Browser CORS settings do not authorize callers. Assign session expiry, revocation, account recovery and abuse requirements through P13 rather than building ad hoc authentication. [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## Design retries and concurrency deliberately

A timed-out request may already have committed. For a retryable mutation, define an idempotency key scoped to the authorized actor, operation and applicable tenant. Persist the accepted input fingerprint and outcome so conflicting reuse is rejected and concurrent requests cannot both execute. Define expiry and behavior when the original result is uncertain. Stripe documents one concrete idempotency implementation; its retention and error behavior are Stripe-specific, not universal defaults. [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests).

Use database constraints or conditional writes to arbitrate conflicts. A read-then-write in application memory is insufficient under concurrent requests. Keep transactions short and avoid waiting on an external API while holding locks. Select transaction isolation for the invariant and retry the complete transaction when the database requires it. PostgreSQL documents the different anomalies and serialization-failure handling for its isolation levels. [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).

For user editing conflicts, version checks or HTTP conditional requests can reject stale writes and let the UI recover deliberately. For an import, deduplicate stable external identifiers within the correct ownership scope. For money movement, the external provider's confirmed result, reconciliation and audit history need their own specification; a local unique key alone does not guarantee one external side effect.

Use bounded retries for explicitly retryable failures, a total deadline, backoff and jitter. Avoid retrying independently at every layer because attempts multiply. Record exhausted retries as failures with a recovery path. [AWS retry guidance](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_mitigate_interaction_failure_limit_retries.html), [AWS backoff and jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/).

## Make asynchronous work observable and recoverable

Choose a durable job table when it meets the actual concurrency and recovery requirements. Add a queue such as BullMQ only when scheduling, throughput or worker coordination justify it. BullMQ's documentation recommends idempotent jobs and describes stalled work being returned for processing, which means handlers must survive re-execution. [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs), [BullMQ stalled jobs](https://docs.bullmq.io/guide/jobs/stalled).

Define a job envelope with ID, verified owner scope, schema version, safe payload reference, attempt history, deadline and an explicit deduplication contract. Use durable states and a lease/claim mechanism appropriate to the chosen store. Bound worker concurrency, payload size and per-tenant consumption. Failed jobs need retained reason metadata and an authorized replay path; a dead-letter queue is useful only if someone can diagnose it.

When committing a database change and arranging an external notification must be coordinated, record an outbox entry in the same transaction and dispatch it afterward. Outbox consumers still need duplicate handling. This pattern prevents the database-write/message-publish gap; it does not provide universal exactly-once external effects. [AWS transactional outbox](https://docs.aws.amazon.com/en_en/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).

Webhook consumers should authenticate the producer, validate the payload, reject replay according to the documented event contract, durably accept work and tolerate duplicates or out-of-order delivery. Use the provider's official signature verifier where available, with its raw-body requirements. [Stripe webhook guidance](https://docs.stripe.com/webhooks).

## Acceptance and release evidence

| Risk tier | Required acceptance predicate | Failure to exercise |
| --- | --- | --- |
| Synthetic prototype | The business command and schema behave as specified with fixtures | Invalid input and provider failure |
| First real service | API examples, persistence, pagination and error contracts pass on a clean candidate | Duplicate request, stale write, timeout and restart |
| Accounts or sensitive data | Each operation's authorization matrix and ownership isolation pass | Cross-user reads/writes, field escalation, cache/export/job leakage |
| Money or other high-consequence side effects | Independent review covers external confirmation, reconciliation and recovery | Uncertain outcome, duplicate callback, partial commit and delayed revocation |

Retain source SHA, schema/test revisions, runtime versions, fixture identifiers, actual exit statuses and integration traces after redaction. Test a worker restart after committing a side effect but before marking completion. Test concurrent duplicates with two independent connections, not only two sequential calls.

Provide `BACKEND.md`, the API contract, an authorization matrix, job/retry policy and operational dashboards/runbook only where the product requires them. P09 chooses the test portfolio; P12 binds release evidence to the built artifact.

## Factory upgrade sequence

1. Add one reviewed backend adapter to the selected starter, with server parsing, identity integration and real temporary-database tests.
2. Add duplicate/stale-write/provider-timeout fixtures and an authorization matrix to that starter. Require negative cases in the independent gate review.
3. Add jobs/outbox only for a concrete feature. Implement restart/replay evidence before making the feature depend on it.
4. Measure capacity and operating failures before extracting another service. Record the extraction decision and compatibility contract in an ADR.

These deliverables are proposed improvements. Scanners and a green TypeScript command in the current kit do not establish this backend contract.
