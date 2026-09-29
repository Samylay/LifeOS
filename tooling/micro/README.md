# Micro

Start with `micro` on the host and the project's brief/artifacts. Where the
LifeOS checkout exposes **Micro → New app**, its studio can collect the same
decisions: problem, selected features, first release, name, visual direction
and AppLlama references. The current UI-integration checkout removed that
surface; the CLI factory remains. Open a new Codex task in the actual project
directory. Its AGENTS.md loads `micro-studio`; no old task transcript is needed.

Read the [software factory playbook](standards/README.md) for sixteen lifecycle
pillars, a curated skills catalogue and a full adoption guide. The
[control audit](standards/installed-audit.md) separates implemented checks from
templates and proposed improvements. New project instructions point to the
playbook; existing repositories can reference it explicitly in a new task.

From the host, `micro` opens Codex in the Micro root. `micro doctor` checks
installation. `micro init <project-id> --brief <json-file>` creates a new
workspace and refuses an existing directory. Use the
[synthetic brief example](standards/templates/example-brief.json) as the input
schema, replacing its fixture content with the actual chosen product decisions.
The earlier studio exported the same JSON shape.

## Installed controls

Projects get a brief, design/spec artifacts, repo-local agent routing and a
hosted CI workflow. Initial check scripts fail until the chosen app stack
implements lint, types, behavior and end-to-end acceptance. The default package
manager adapter is npm with a committed lockfile. Review another adapter
explicitly rather than making the gate silently skip an unsupported stack.

`micro verify <project-id>` checks the committed, clean candidate. It exports
tracked source, rejects credential files and links, then runs redacted secret
scanning, a CycloneDX inventory and high/critical vulnerability checks. These
run separately from candidate tests. The candidate has an immutable source
mount, no network, credentials, live data or Docker socket, and bounded CPU,
memory, process count and time. This is container isolation, not a separate
machine or a certification against kernel escape.

Before the first run, an independent reviewer accepts the actual gate scripts,
runner configuration and acceptance fixtures at a committed source SHA. Save
that review as JSON with `source_sha`, `verdict: "accepted"`, `reviewer` and
`evidence`, then run `micro approve-checks <project-id> --review <receipt.json>`.
The trusted administrator records the protected-file hashes outside candidate
source. Changes to scripts, tests, configs, archive rules or policy block the
next verification until reviewed. The review record is an administrative
attestation, not a cryptographic proof of a human or model identity.

The trusted verifier image includes Node 22, TypeScript 5.9.3, Gitleaks 8.30.1,
Syft 1.52.0 and Grype 0.119.0. Scanner release assets are SHA256 checked before
extraction; versions and checksums live in tools-lock.json. Public advisory
data refreshes daily through micro-vulnerability-db.timer. A stale/unavailable
database or scanner failure blocks verification.

Receipts retain source SHA, immutable image reference, archive/report hashes,
security result, check logs, budget outcome and timestamps under
`~/.local/state/micro-factory`. One candidate runs at a time; no automatic
retry hides a failed run. The synthetic factory-lab exercises success and
actual container constraints; disposable negative fixtures exercise failures.
Agent evaluation cases and their evidence contract live in eval-cases.json
and release-guide.md. They are a starting corpus, not completed model scores.

Host Codex remains attended. Untrusted PR checks use hosted CI; no production
self-hosted runner is installed. Dependency-heavy local checks require a
reviewed verifier image with the locked dependencies already available offline.

## Release

Read [release-guide.md](release-guide.md) when a concrete app is ready.
Hosted CI activates when the product repository is pushed; required checks,
reviews and distribution are configured per actual repository. The initial
release record is disabled. A particular app still needs a build artifact,
artifact-level SBOM/scans/provenance, staging, app-specific smoke, secret
transport and recovery evidence before production/store publishing.

## Reproduce this installation

1. Run `python3 tooling/micro/security.py install --output tooling/micro/scanners`.
2. Build only the trusted `Verifier.Dockerfile`, then record its immutable image
   ID in runtime.json. Never build an untrusted candidate Dockerfile here.
3. Run `python3 tooling/micro/install.py`. It refuses conflicting owned files
   and preserves perso/work, existing projects and Hermes state.
4. Reload user systemd and enable Micro's advisory-data timer; run its service
   once, then `micro doctor`.

The root defaults to `~/apps/micro`, using the existing personal Git identity.
User-created project workspaces have no remote until distribution is chosen.
