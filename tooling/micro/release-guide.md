# Micro delivery

The installed kit creates product repositories, supplies hosted CI and runs
bounded local verification. Hosted CI activates after an actual repository
is pushed to GitHub. Branch protection and required reviews are configured
per repository, not by the presence of CODEOWNERS.

## Repository onboarding

After selecting the stack, commit its lockfile and real lint/type/behavior/
end-to-end scripts. Native dependencies may require an explicit reviewed
install step after `npm ci --ignore-scripts`. Install Playwright's browsers
for web acceptance; use simulator/device acceptance for native products.
Keep untrusted checks on hosted runners with read-only tokens and no live
data. Changes to the factory policy and acceptance fixtures need owner review.
Create a private repository only when requested for that product. Require
Micro candidate checks and reviews on main using the account's available
ruleset features. Do not claim protections enabled without reading them back.

## Artifact and release contract

Add a reviewed Dockerfile for a web service, or the platform's signed native
build configuration. Record the source commit, locked toolchain, produced
artifact digest and builder. Build once from protected source, test that
artifact, retain an SPDX/CycloneDX software bill of materials, vulnerability
and secret scan reports, and provenance that can be verified against the
builder and source. A scan failure blocks release or needs a dated, reviewed
exception that records the concrete exposure and remediation.

For OCI services use the existing Compose hosting model. Promote by digest,
use synthetic staging data, and keep deployment credentials outside PR jobs.
The separate deployer accepts a validated release record, not an arbitrary
command from an agent. Before enabling `.factory/release.json`, supply:

1. The tested image digest and source SHA, with successful CI and independent
   acceptance evidence for this revision.
2. A staging target and observable product smoke, including failure/recovery.
3. Secret transport, least privilege and tailnet/public exposure choices for
   this particular app.
4. A verified backup/restore procedure where data exists, the prior digest,
   and an explicit schema/data rollback compatibility decision.
5. The authorized distribution target, support/privacy information and
   monitoring that detects a failed user journey or unhealthy release.

Deploy the configured app, run its smoke and retain the receipt. On failure,
restore the previous image only when data compatibility permits. Do not
blindly reverse a migration or replace user data. Read back the running digest.
Native store publication additionally requires the real developer account,
signing identity, entitlements, purchase restore/cancellation checks where
applicable and actual device testing. The studio does not invent those accounts.

## Agent evaluation

`eval-cases.json` is the initial adversarial corpus. Run each case in a
disposable test workspace with a fresh agent context. Record the case ID,
model, skill version, source revision, raw tool trace, independent predicate
result and actual cost/time. Keep first failures, even after a successful repair.
Separate a held-out regression set from cases used to revise the skill.
Compare repeated pass rate, unauthorized actions and product correctness;
do not treat six samples or a text judge as a production reliability estimate.

## Control references

These are implementation targets, not certifications:
[NIST SSDF](https://csrc.nist.gov/Projects/ssdf),
[SLSA](https://slsa.dev/spec/v1.2/),
[OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/),
[WCAG 2.2](https://www.w3.org/TR/WCAG22/),
[GitHub Actions security](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions).
