# P14. Reliability, observability and recovery

Research checked: 2026-09-29. Scope: detecting user harm, operating a product within chosen reliability targets, recovering data/services and learning from incidents. Targets below require product decisions; no uptime promise is inferred from using the homelab.

## Decision

Monitor the important user journeys and prove that data can be recovered. Start with a small observable service and a tested runbook. Add telemetry infrastructure only when it answers a real operational question.

A service-level indicator (SLI) measures behavior; a service-level objective (SLO) sets an agreed target over a defined window. Choose indicators from user needs such as successful writes, readable persisted data, useful response time and job freshness. Google SRE recommends a small set of important indicators and explicit agreement on the target and resulting actions. [SLO implementation](https://sre.google/workbook/implementing-slos/)

## Service contract

Create `OPERATIONS.md` with the product owner/operator, supported hours, critical journeys, dependency map, exposure, SLI definitions, alert route, capacity limits, recovery targets and runbooks. Separate a prototype's availability goal from a paid service commitment. Do not invent 24/7 coverage for a one-person business.

For a budgeting app, a health endpoint does not prove that a user can save an expense, reopen it after restart and obtain the correct budget. Define synthetic acceptance accounts with no financial data; exercise save/read, import status where relevant and authentication recovery. Test lower-level dependency health for diagnosis, while the user journey drives the release and incident verdict.

| Indicator | Implementation decision | Evidence |
| --- | --- | --- |
| Successful journey | Which attempts are eligible and what makes completion correct? | Good/total events plus a representative synthetic check |
| Latency | Which user-visible threshold and window matter? | Histogram or explicit under-threshold count, not only an average |
| Persistence | Can accepted writes be read correctly after restart? | Synthetic records and observed restart/read result |
| Background freshness | How recent must a completed import or scheduled output be? | Completion watermark, expected records and failed/stuck jobs |
| Recovery | What data loss and interruption can the product tolerate? | Measured restore point, full recovery elapsed time and acceptance |

Define missing-data behavior explicitly. A telemetry outage is unknown, not 100% success. Keep real-traffic indicators separate from synthetic checks so artificial traffic cannot improve the reported customer success rate.

## Error budgets and alerts

Use an error budget to determine when ordinary feature changes must give way to reliability work. Document exceptions for urgent security fixes, how the owner decides and what evidence reopens routine releases. The product's target must reflect user needs, feasible response and cost.

At low homelab traffic, one request can dominate a percentage and produce a misleading burn rate. Google SRE's alerting guidance discusses this issue and synthetic traffic, reducing the impact of transient failures and service-appropriate thresholds. Start with sustained synthetic journey failures and clear dependency alerts; add multi-window burn-rate alerting after enough meaningful traffic exists. [SLO alerting and low-traffic services](https://sre.google/workbook/alerting-on-slos/)

Each actionable alert includes product/environment, affected journey, source revision or artifact digest when known, severity, first/last observation, runbook and recovery criterion. Test notification delivery, acknowledgment and resolution. Route urgent user harm to the operator; send capacity trends and non-urgent defects through the ordinary work system. A CPU graph alone should not wake somebody without an associated action.

## Telemetry design

Collect structured logs, request/job metrics and traces where correlation helps diagnosis. OpenTelemetry supplies portable signals and instrumentation, while a backend stores and queries them. It is not itself a complete monitoring service. Begin with application logs and a remote probe; add a Collector and trace backend when debugging multi-step work warrants them. [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/), [Collector deployment](https://opentelemetry.io/docs/collector/deploy/)

Choose a consistent service name, environment, release SHA/digest, request or job ID and error classification. Track latency, traffic, errors and saturation for diagnosis. Google SRE's monitoring guidance describes these four signals and emphasizes useful monitoring over noise. [Monitoring signals](https://sre.google/sre-book/monitoring-distributed-systems/)

Limit labels and retention. Use bounded route templates and status categories instead of URLs containing user identifiers. Avoid raw account IDs, transaction descriptions, emails, tokens and complete prompts in metrics or logs. Maintain a telemetry schema and test redaction before export. OpenTelemetry documents data minimization and processors for removing sensitive fields, and warns that hashing small predictable identifiers does not necessarily anonymize them. [Sensitive telemetry](https://opentelemetry.io/docs/security/handling-sensitive-data/)

Keep security audit events distinct from debug logging: privileged access, sensitive settings, release actions and rights/deletion operations need retained operator evidence. Define who can query it, why and for how long. Review client-side crash tools and session replay against privacy and consent decisions; a useful screenshot can still expose personal data.

## Backup and disaster recovery

Choose a recovery point objective (RPO), the maximum acceptable data loss expressed as time, and a recovery time objective (RTO), the maximum acceptable interruption for recovery. For example, a chosen 24-hour RPO needs successful sufficiently frequent consistent backups; a chosen two-hour RTO needs a measured end-to-end restore below two hours. These are examples, not assigned Micro commitments.

Catalogue the database, uploaded files, required configuration, signing/recovery keys and infrastructure state. Preserve enough release/toolchain information to run a compatible app against the recovered data. Keep an encrypted backup copy outside the original host/failure domain and restrict deletion authority. RAID and another volume on the same machine do not address host loss, malicious deletion or loss of recovery keys.

For SQLite, use a consistent backup mechanism such as the Online Backup API or `VACUUM INTO`, according to the app's concurrency and storage requirements. Do not assume copying a live database file alone captures a valid point-in-time state. SQLite documents its backup API and alternatives. [SQLite backup guidance](https://www.sqlite.org/backup.html)

Restic provides repository integrity checking and restore operations. Its default `check` does not read and verify every data pack; `--read-data` or a deliberately managed subset adds that check at bandwidth/time cost. An intact repository still does not prove the application can run after restore. [Restic integrity checks](https://restic.readthedocs.io/en/stable/045_working_with_repos.html), [restoring snapshots](https://restic.readthedocs.io/en/stable/050_restore.html)

## Recovery drill

1. Choose a specific backup/snapshot and record its source point, schema and compatible artifact. Use a disposable recovery target that cannot write to production or send real notifications.
2. Recover keys, configuration, database and user files through the documented route. Measure from incident declaration to a usable service, including provisioning and credential retrieval.
3. Validate integrity, representative row/file counts and domain invariants. Run synthetic product journeys against the restored app, including persistence/restart behavior.
4. Apply the documented privacy/deletion rules and migration compatibility decision. Verify that restored jobs do not duplicate imports, charges or emails.
5. Retain the drill receipt, observed RPO/RTO, backup IDs, failures and fixes. Keep the first failed drill. Rehearse again after material persistence, encryption or deployment changes.

A pre-release rehearsal should use synthetic data whenever possible. Any drill involving real user records must have explicit scope, protected access and cleanup rules. A drill never authorizes overwriting the live database.

## Incidents and continuity

Define severity from user impact, data/security risk and scope. The first responder stabilizes the system, preserves evidence and communicates through the approved route. Record awareness time, impact, source/artifact/configuration, actions, recovery and unresolved uncertainty. Separate incident command, technical work and communication roles even when one operator wears all three hats; this prevents tasks from disappearing under pressure. [Google incident response](https://sre.google/workbook/incident-response/)

Prefer restoring service through a compatible artifact, disabling a harmful feature or controlling traffic before extended diagnosis. A migration rollback or backup restoration requires a data-loss and compatibility decision. For compromised credentials, revocation and forensic preservation matter alongside availability. Link privacy/security reporting to [P13 security](13-security.md).

Keep emergency instructions, credentials recovery and a contact route available if the homelab or LifeOS is down. Document unavailable-operator scenarios, power/network loss, exhausted disk, DNS/certificate failure and provider outages. Test the alerting system's own missing heartbeat from a separate failure domain. A monitor running only on the failed machine cannot report total host loss.

After a consequential incident, write a blameless postmortem with user impact, timeline, contributing conditions, detection/recovery gaps and bounded corrective changes. Verify the changes by reproducing the failure safely; “agent error” or “human error” does not identify the missing system control. Google SRE describes practices for making postmortems useful and maintaining a learning culture. [Postmortem practice](https://sre.google/workbook/postmortem-culture/)

## Tool choices and graded adoption

| Stage | Minimum capability | Add when justified |
| --- | --- | --- |
| Prototype | Structured local logs, useful errors, backup for valuable drafts | Distributed tracing |
| First customer | Remote journey probe, actual alert delivery, consistent off-host backup, restore receipt, release IDs | Prometheus/Grafana or a managed observability service |
| Multiple products | Shared Collector/logging policy, bounded retention, dependency/capacity views, reusable recovery drills | Dedicated incident/on-call software |
| Higher availability | Measured failure-domain redundancy and tested failover | Multi-host orchestration and database replication |

Self-hosted telemetry keeps control but consumes compute, disk and maintenance time. Managed monitoring survives homelab failure but adds cost and a data recipient. Replica databases may reduce interruption but can also replicate corrupt or deleted data; backups and restore evidence remain necessary.

## Acceptance and installed status

The operator accepts production readiness when critical journeys are measured, a simulated failure produces the correct alert and recovery notice, telemetry contains no disallowed synthetic secret, a separate-target restore meets chosen RPO/RTO and the deployed digest is observed. Product acceptance must pass on the recovered system. Retain the alert trace, restore receipt and release/runbook revisions.

Source audit: the [Micro release guide](../../release-guide.md) requires backup/restore, smoke and monitoring evidence before enabling a product release. The local verifier retains check/scanner receipts and enforces execution limits. That is factory-job evidence, not installed product SLO monitoring, product backup or a demonstrated restore. Configure these per actual app; this guide makes no claim about unrelated existing homelab services.

Implementation order: choose journeys and recovery targets, instrument minimal signals, add a remote probe and alert route, protect consistent backups, complete a restore/incident drill, then use incidents and budget consumption to improve the operating model.
