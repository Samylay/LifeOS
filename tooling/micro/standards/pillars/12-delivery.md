# P12. CI/CD, releases and software supply chain

Research checked: 2026-09-29. Scope: candidate admission, continuous integration (CI), trusted builds, release evidence, deployment and distribution. This is an implementation contract, not a claim that every listed control is installed.

## Decision

Check every candidate, build approved source once, test the resulting artifact and promote that artifact by digest. A passing source test is one input to release. The release decision also depends on provenance, target configuration, data compatibility and observed user behavior.

Use SLSA v1.2 as the current approved reference for supply-chain requirements. Its Build track describes increasing guarantees from provenance at L1, signed hosted-platform provenance at L2 and a hardened platform at L3; v1.2 also includes a Source track. Record actual achieved properties and gaps, not an unsupported level badge. [SLSA v1.2](https://slsa.dev/spec/v1.2/), [Build track](https://slsa.dev/spec/v1.2/build-track-basics)

## Pipeline and trust boundaries

```text
Brief and acceptance contract
  -> candidate PR + isolated checks
  -> reviewed protected-source revision
  -> trusted build + artifact digest + SBOM + provenance
  -> policy verification + artifact acceptance in staging
  -> authorized digest promotion
  -> user-journey smoke + running-digest receipt
  -> observation, incident handling and advisory response
```

Keep the untrusted test job separate from the release job. The PR token has read-only access and no deployment secrets. The trusted release job runs after admission on approved source, with only the permissions its builder and target need. Avoid privileged workflows that check out and execute attacker-controlled PR source. Full commit-SHA pins, reviewed action source and controlled workflow changes reduce action substitution risk. [GitHub secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use)

Protect policy as well as code. A candidate can otherwise replace its tests, scanner configuration, workflow or deployment recipe with a convenient success. Keep required acceptance specifications and security policy outside candidate control, or use admission controls that require independently reviewed changes. An independent model review is a useful second assessment; it does not create an independent account or hardware trust boundary.

## Repository onboarding

1. Select an actual product repository and source host. Keep the lockfile, build recipe, gate scripts, fixtures and release configuration under review. Publish no repository simply because a template exists.
2. Configure required checks with stable, unique job names and expected check source where supported. Read back effective protection, bypass permissions and review rules. Verify that a disposable failing candidate cannot merge. CODEOWNERS alone does not enforce review.
3. Keep branches short-lived and changes independently reviewable. Recheck the revision that actually merges, including merge-queue candidates if using a queue. A review of an earlier SHA cannot justify a different final artifact.
4. Activate build and distribution only after the target, signing identity, staging route and data lifecycle are known. A placeholder release record stays disabled.
5. Run a negative end-to-end release test: a changed artifact, wrong builder, missing scan, expired exception or incompatible migration must be rejected before credentials are exposed or deployment begins.

GitHub protection availability varies by account and repository visibility. Its current documentation lists public repositories on Free and public/private repositories on Pro, Team and Enterprise for protected branches; administrative bypass is a separate setting. Test the effective policy for this repository rather than relying on a plan name. [Protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

## Gate design

| Stage | Required result | Independent evidence | Typical owner |
| --- | --- | --- | --- |
| Candidate | Types, lint and risk-relevant behavior pass; required flow acceptance passes | SHA, exact commands, first failures and final result | Implementer plus fresh reviewer |
| Security | Secret, dependency, artifact and selected application-security checks complete | Scanner identity, policy revision, advisory timestamp, findings | Security/policy owner |
| Build | Reviewed inputs produce one identified artifact | Input hashes, build recipe, digest, builder, provenance | Trusted builder |
| Staging | That artifact passes real user and migration scenarios | Digest, target config, device/browser evidence, synthetic data | Product reviewer/operator |
| Promotion | Release policy accepts target, compatibility and evidence | Signed/attested release record, prior digest, deployment receipt | Authorized operator |

Missing evidence is a failed gate. A scanner outage is not a clean scan. A retried flaky test does not erase its first failure. An exception records the specific finding, reachability and exposure, compensating control, accountable owner, expiry and removal predicate. Reusing one generic exemption across unrelated artifacts is forbidden by Micro policy.

## Artifact evidence

Create an artifact-level software bill of materials (SBOM), using SPDX or CycloneDX, alongside its runtime dependency/license review and vulnerability report. Source-lockfile scanning misses operating-system packages and build-produced contents; scan the distributed image/binary as well. The SBOM is an inventory, not a finding that its components are safe. Preserve the source and artifact evidence separately so later advisories can identify affected deployed versions. [CycloneDX SBOM](https://cyclonedx.org/capabilities/sbom/), [SPDX 3.0.1 specification](https://spdx.github.io/spdx-spec/v3.0.1/)

Provenance connects the artifact to its source and build process. In-toto statements bind predicates to subjects identified by digest, allowing different evidence types to refer to the same object. Use interoperable evidence rather than a custom free-text “verified” field. [SLSA provenance](https://slsa.dev/spec/v1.2/provenance), [in-toto attestation model](https://github.com/in-toto/attestation/blob/main/spec/v1/README.md)

Cryptographic verification must also constrain who was allowed to produce the artifact. With Cosign, verify the expected certificate identity and OIDC issuer, then inspect the attestation predicate for the permitted source, workflow and inputs. Accepting any valid signature or using a wildcard identity defeats the intended producer restriction. Retain the verification output and trusted policy revision. [Cosign verification](https://docs.sigstore.dev/cosign/verifying/verify/)

GitHub artifact attestations associate workflow, source and builder claims with release outputs, but must be verified to provide useful protection. They do not prove product correctness. Current GitHub documentation limits native attestations for private/internal repositories to Enterprise Cloud, while non-legacy plans support them for public repositories. For an ordinary private Micro repository, evaluate a reviewed Cosign/Sigstore or other interoperable signing route, including what identity/metadata becomes public. [Attestation concepts](https://docs.github.com/en/actions/concepts/security/artifact-attestations), [availability and setup](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)

OIDC can replace stored cloud credentials with temporary credentials bound to a workflow identity. Restrict issuer, audience and subject to the intended repository, protected branch or environment. OIDC support at a cloud provider does not automatically exist for a homelab SSH target; that target needs its own narrowly scoped transport and authorization design. [GitHub OIDC](https://docs.github.com/en/actions/concepts/security/openid-connect)

## Release record

Before changing `enabled` to true, require a machine-validated record containing:

| Field group | Required contents |
| --- | --- |
| Identity | Product ID, source SHA, protected policy revision, target/environment |
| Artifact | Registry/binary location, immutable digest, build recipe and toolchain IDs |
| Assurance | CI receipt, security reports, SBOM, provenance and verification verdict |
| Operations | Staging smoke, recovery drill, prior digest, migration compatibility decision |
| Authorization | Distribution intent, scoped deployer, approver identity, exception references |

The deployer must parse this record, compare evidence against the artifact and target and run fixed allowlisted operations. It must not execute a shell command embedded in agent output. Serialize deployment per product/environment and reject old or already consumed records where replay would change state unexpectedly.

## Data-safe rollout

Use an expand-and-contract migration when old and new app versions overlap: introduce compatible schema, deploy code that tolerates both, migrate/backfill with checkpoints and verified invariants, then remove old schema only after the rollback window closes. State the product-specific compatibility rules; this is a Micro deployment policy, not a universal guarantee for every database.

A rollback to an earlier image is allowed only if the current data format remains readable and correct for that image. Otherwise use a reviewed forward repair or an explicitly authorized restore with a known data-loss boundary. Never let an agent replace live data because a smoke test failed.

Start with a simple staged promotion on Compose. Blue/green deployment helps when capacity and database compatibility support simultaneous versions. Canary release needs meaningful traffic, attribution and an observation window; a 1% rollout on ten users offers little statistical assurance. Flags need default behavior, an owner and removal criteria. Rollback, flag disable and migration failure deserve rehearsals before customers rely on them.

## Web, mobile and package variations

For web services, run the built image in staging and prove persistence/restart behavior. For static assets, attest the exact asset bundle and verify it after publishing. For mobile, preserve signed build identifiers, store configuration, entitlements, device acceptance, purchase/restore behavior and platform privacy declarations. Store review and install propagation complicate emergency rollback, so distinguish binary releases from server changes and permitted over-the-air updates. For libraries, test consumer installation and compatibility, then sign/publish through a reviewed publisher identity.

## Acceptance and adoption

The first-customer minimum is a protected-source decision, artifact digest, real staging acceptance, clean artifact security report or scoped exception, recoverable data and an observed deployment receipt. The operator must demonstrate that a digest mismatch and an unauthorized producer are refused, and that the previous compatible artifact can be restored without replacing user records.

Later add isolated reusable builders, reproducibility checks across clean machines, stricter provenance policies and multi-target promotion when the product needs them. Reproducibility means comparing rebuilt outputs under declared inputs; build-once promotion alone does not demonstrate bit-for-bit reproducibility.

Source audit: the [installed Micro kit](../../README.md) includes a hosted candidate CI template, independent local policy admission and separated source security checks. `templates/.factory/release.json` is disabled. The kit does not currently supply a product artifact builder, effective branch protection, provenance verifier, staging target or deployer. Existing docs describe those as requirements.

Implementation order: onboard one real repo, admit meaningful checks, build a synthetic distributable artifact, generate and verify its evidence, rehearse staging/recovery, then enable that product's authorized promotion. Connect operational observations to [P14 reliability](14-reliability.md) and per-product release events to [P16 improvement](16-improvement.md).
