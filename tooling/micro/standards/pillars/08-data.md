# P08: Data engineering and lifecycle

Checked: 2026-09-29. Scope: data meaning, integrity, ownership, concurrency, migrations, backups, restores, imports/exports, retention and deletion. P06 owns request and job behavior; P13 owns legal/privacy requirements and access policy; P14 owns operating recovery objectives.

This guide proposes Micro policy for products. Database documentation describes engine behavior; it does not approve a migration of live user data. The [current factory](../../README.md) preserves candidate boundaries and records verification receipts. Product data models, migration runners, restoration drills and deletion workflows are still product-specific deliverables.

## Choose the store from workload and recovery requirements

SQLite fits embedded/device-local storage and many single-server applications. It supports only one writer at a time per database file. Its own selection guide recommends a client/server engine when network-separated SQL access or more simultaneous writers require that model. Do not use a generic traffic number as a capacity guarantee. [SQLite appropriate uses](https://www.sqlite.org/whentouse.html).

| Condition | Initial option | Evidence needed before release |
| --- | --- | --- |
| Device-local or single-host app with bounded writes | SQLite using the supported driver | Concurrency, durable-write and backup/restore tests on its actual runtime |
| Shared server data, many concurrent writers or database roles/RLS | PostgreSQL | Role isolation, pool limits, transactions and restore procedure |
| Large binary files | Object storage or a bounded file adapter, with metadata in the primary store | Ownership, integrity, upload limits and coordinated deletion |
| Derived search/index/cache | Existing search engine or cache only when needed | Source-of-truth ownership, reindex/rebuild and authorization scope |
| Analytics or AI retrieval | Separate derived pipeline after classification | Lineage, retention, minimization and cross-user retrieval denial |

These are Micro defaults to evaluate, not a requirement to deploy every listed component. A relational database can often provide the first version of search or jobs. Add infrastructure after a measurable limitation or concrete product requirement.

SQLite WAL permits readers alongside a writer, but still permits only one writer at a time, requires processes to share the same host and needs checkpoint management. Do not place a WAL database on an arbitrary network filesystem. Record durability settings and test them with the chosen storage/runtime. [SQLite WAL](https://www.sqlite.org/wal.html).

The checked WAL documentation reports a rare WAL-reset corruption race fixed in SQLite 3.51.3 and later, with documented backports including 3.44.6 and 3.50.7. Inventory the driver's actual linked SQLite version and upstream fixes before releasing a concurrent WAL product. This is a compatibility check, not a finding that a particular installed application is affected. [SQLite WAL-reset notice](https://www.sqlite.org/wal.html#the_wal_reset_bug).

## Model meaning and integrity explicitly

Create `DATA.md` or a concise section of the spec containing records, owners, authoritative fields, derived values, units, lifecycle and consistency requirements. Use the domain vocabulary from P07. Include identifiers that must stay stable across names, exports, migrations and references.

For financial amounts, avoid assuming binary floating point is exact. PostgreSQL documents exact `numeric` and inexact floating-point types. Choose integer minor units with an explicit currency scale or an exact decimal representation according to the domain, and define rounding at each calculation boundary. [PostgreSQL numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html).

Keep instants, local calendar dates, recurrence rules and display time zones distinct. PostgreSQL's date/time documentation explains that time-zone-aware timestamps represent instants and are displayed in the configured zone; they do not preserve the original zone name. If a recurring budget closes in a named zone, store that zone and calendar rule explicitly. [PostgreSQL date/time types](https://www.postgresql.org/docs/current/datatype-datetime.html).

Use constraints for durable invariants: primary/unique keys, required values, valid relationships and suitable row checks. A pre-insert UI check cannot prevent a concurrent duplicate. PostgreSQL documents constraint semantics and limits; SQLite foreign-key enforcement must be enabled and verified for each relevant connection. [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), [SQLite foreign keys](https://www.sqlite.org/foreignkeys.html).

Micro acceptance examples should include zero/negative amounts where permitted, maximum representable amounts, mixed currencies, rounding boundaries, leap days, daylight-saving transitions, deleted owners and duplicate external identifiers. Expected results must come from the domain contract rather than recomputing the implementation in the test.

## Define transactions, ownership and derived data

Identify which record set must change atomically. Keep the invariant and its write inside that transaction. Choose isolation and conflict handling deliberately; PostgreSQL's default and serializable modes have different guarantees and failure behavior. [PostgreSQL isolation](https://www.postgresql.org/docs/current/transaction-iso.html).

For shared-table multi-tenancy, declare which tables are tenant-owned or intentionally shared. Prove isolation using the application's deployed role, including reused pooled connections. PostgreSQL superusers, `BYPASSRLS` roles and ordinary table ownership can bypass row policies; use appropriate runtime roles and tests. [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

Caches, exports, attachments and derived indexes must carry the same ownership boundary as the authoritative records. If transaction-local tenant settings are used, re-establish them in every transaction and exercise connection reuse. Deletion must include derived data and asynchronous work that could repopulate it. [OWASP tenant isolation](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html).

Keep lineage for an import: source/provider, stable external ID, import revision, transformation version and reconciliation result where needed. Use bounded batches and resumable checkpoints for large jobs. Avoid keeping raw sensitive payloads indefinitely merely because reproducing an import could be convenient.

## Migrate data as a reviewed release operation

Migrations need a source revision, checksum, ordering policy, preconditions, postconditions and one bounded runner. Test creation from an empty store and upgrade from supported older synthetic schemas. The SQLite ALTER TABLE documentation describes supported changes and a generalized rebuild procedure for more complex transformations. Use the actual engine's documented procedure rather than editing schema metadata casually. [SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html).

For a change used by multiple running versions, expand the schema, backfill/reconcile, switch consumers, observe compatibility and only then contract the old schema. Prisma's migration guide illustrates this expand-and-contract pattern; it does not require adopting Prisma. [Expand-and-contract migration pattern](https://www.prisma.io/dataguide/types/relational/expand-and-contract-pattern).

Recommended migration receipt:

| Field | Required information |
| --- | --- |
| Identity | Product, source SHA, migration ID/checksum and runtime versions |
| Compatibility | Supported schema versions, old/new application compatibility and whether writes must pause |
| Preconditions | Schema fingerprint, bounded size estimate, backup availability and authorized scope |
| Execution | Actual start/end, exit status, locks/timeouts, transformed counts and retained failure state |
| Postconditions | Constraints, domain reconciliation, old-record preservation and new-write acceptance |
| Recovery | Forward repair or restore procedure, expected lost writes and explicit recovery authorization |

Do not make “rollback” mean automatically applying reverse SQL. A new release can create data the old schema cannot represent. A code rollback and a data restoration are distinct decisions. Destructive transformations need a concrete reviewed plan; prototype/test migrations should run only against owned synthetic stores.

## Back up consistently and restore completely

SQLite's online backup API creates a consistent database snapshot while accounting for concurrent writes. Copying only the main file of an active WAL database can omit committed changes; use a documented consistent method with the supported driver. [SQLite backup API](https://www.sqlite.org/backup.html).

PostgreSQL distinguishes logical dumps, filesystem-level backups and continuous archiving. Point-in-time recovery requires a suitable base backup and the needed continuous WAL archive; a `pg_dump` is not the base for WAL replay. Select the mechanism from required recovery point and recovery time. [PostgreSQL backup methods](https://www.postgresql.org/docs/current/backup.html), [PostgreSQL PITR](https://www.postgresql.org/docs/17/continuous-archiving.html).

Micro policy should specify a recovery point objective (how much recent data may be lost) and recovery time objective (how long restoration may take), an owner and evidence from a drill. Coordinate database, attachments, keys, schema version and application artifact. Encrypt backups according to the data classification, restrict access and test availability of decryption keys without printing them.

A complete synthetic restore drill should:

1. Create realistic owned fixture records and attachments, perform concurrent writes, and capture a backup with the proposed mechanism.
2. Restore into a clean isolated environment using the recorded toolchain and key path, without reaching production credentials or destinations.
3. Validate integrity and business totals, open the restored app, and complete the main user journey including a new write.
4. Measure duration and the recovered point against the stated objectives. Record missing components, repair steps and actual outcome.
5. Exercise a relevant failure such as an absent WAL segment, unavailable key or interrupted restore. Alerting should identify the failure instead of reporting a backup as successful.

A file existing or a backup command exiting zero cannot establish that the product is recoverable. P14 owns the recurring operating procedure; this pillar owns what data must survive.

## Retention, deletion and portability

Define an owner and retention policy for each data class: business records, authentication metadata, analytics, traces, support attachments, cached content, AI/retrieval indexes and backups. P13 selects applicable obligations and exceptions from primary legal/regulatory sources. This guide does not assert a universal retention duration or legal compliance.

Implement deletion as an observable workflow: authorized request, access revocation, deletion of primary/derived records, queued-work cancellation or tombstones, provider confirmation where applicable, and a completion record that avoids retaining the deleted content. State when backup retention expires and how restoring an older backup avoids resurrecting deleted accounts. “Soft deleted” is a product state, not evidence that data has been erased.

Exports need an ownership check, versioned format, units/currency/time semantics and a round-trip or documented import policy. Reject untrusted formulas, paths and oversized records at the appropriate import/export boundary. Keep personal production exports outside CI, agent workspaces and public artifacts.

For search/vector indexes and analytics, document the original source, transformation, refresh and deletion propagation. Test that a deleted or differently owned record cannot be recovered through search, an old cache or an AI retrieval tool. Rebuildable derived stores should have a tested rebuild path.

## Acceptance by data risk

| Tier | Required predicate |
| --- | --- |
| Synthetic prototype | Fixture creation/reopen and stated domain calculations work; disposable ownership is recorded |
| Real local product | Constraints, concurrent writes, consistent backup and clean restore preserve the supported records |
| Accounts or sensitive data | Authorization, tenant/owner isolation, export and deletion propagation work across primary and derived stores |
| Consequential ledger/shared financial data | Independent reconciliation, duplicate/concurrent write tests, migration compatibility and measured recovery meet the product contract |

Query optimization begins with a measured workload and query plan, not an index on every field. PostgreSQL documents `EXPLAIN`; use it on synthetic/staging workloads and account for the fact that `EXPLAIN ANALYZE` executes the query. Record latency, row counts, cardinality and resource use before choosing indexes or caching. [PostgreSQL EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html).

## Factory upgrade sequence

1. Add a temporary-store adapter and versioned synthetic fixtures to the selected product starter. Record linked database versions and durability settings.
2. Add migration checks from supported old fixtures, ownership/constraint negatives and a clean restore acceptance command.
3. Add retention/export/deletion tests once the product accepts real data. Keep credentials and production backups outside candidate verification.
4. Tie the data compatibility and recovery receipt to the release record before distribution. Update the procedure when schema, storage or external providers change.

These changes require product-specific implementation. The installed factory's isolation and scan receipts do not establish a product backup, successful migration or deletion guarantee.
