# Native security gate execution contract

Scope: the synthetic native-smoke fixture and controller-owned security state.
Preserve existing factory modules, candidate products, vault/app content, services,
devices, SDKs, AVDs, secrets and environment files. No commit, push or remote.

The accepted `security_policy.json` freezes scanner image, exact versions and
binary hashes, a 120-hour database age limit and high/critical failure threshold.
There are no waivers, vulnerability filters or network fallback during a scan.
The controller hashes scanner configuration and executor code independently of
source. Tool versions and binary hashes must match actual container readback.

Execution uses user 65534, dropped capabilities, no new privileges, a read-only
root and input mounts, no network, no Docker socket, no log driver, 1 GiB RAM
with no additional swap, one CPU, 128 processes, 384 MiB temporary storage,
64 MiB collected output and a 300-second total job deadline. Retain actual Docker
configuration/state and prove the owned container absent after removal. Each job
uses a unique owner label and exact generated name. Inspect the label, name and
full ID before kill/removal; a create error recovers only that exact identity.
Absence requires inspect exit 1 with the matching no-such-object diagnostic and
a successful empty list scoped by both exact name and owner label. Daemon errors
remain cleanup failures. Preserve bounded partial stdout/stderr and the first
execution failure even when cleanup inspection or removal fails. A scan
may overlap a 6 GiB native job only if actual MemAvailable at scan start is at
least 9 GiB; otherwise it blocks. Standalone minimum headroom is 2 GiB.

Public advisory acquisition is a separate trusted job with no candidate source,
host credentials or proxy environment. Its fixed public URL is Anchore's Grype
database endpoint. A hashed copy of the public system CA bundle is the only
added trust input; TLS verification stays enabled. The initial missing-CA failure
is retained. Grype creates private cache directories, so acquisition now measures
bytes inside the job as well as on the supervisor. File-size limits and budget
failures remain enforced. Do not accept an update message as database evidence.

The controller explicitly authorized a 4 GiB expanded database/acquisition cap
and 8 GiB owned state cap after the current official database measured
3,139,592,192 bytes. The original 2 GiB overrun stays a failed receipt. Retained
completed public bytes received a new read-only admission under the authorized
cap after exact tree, SHA256, public source and actual Grype validation readback.
No scanner execution memory, age or severity threshold changed.

Grype 0.119 status exposes no SHA256 checksum. Its `import.json` records an
xxh64 digest which the scanner validates at every invocation. The supervisor
independently hashes the full database with SHA256. Scans mount that exact cache
read-only and disable updates, hash-check the accepted tree, collect database
status before and after execution, and compare the vulnerability report's
`descriptor.db.status` identity. Changed bytes, stale creation time, invalid
checksum, missing/corrupt database or a scanner error block acceptance.

Required evidence:

1. Run policy tests with `python3 -m unittest discover -s tooling/micro/android/tests -p test_native_security.py -v` from the upgrade kit.
2. Retain a real clean scan and real redacted secret/known vulnerability blockers.
3. Retain actual missing, corrupt and wrong-checksum database scanner readbacks
   and actual unavailable-scanner execution. Age testing uses a trusted future
   clock in the controller against the real database creation time. It does not
   claim Grype ran with a changed clock.
4. Scan the original fixture lock without dependency edits or finding suppression.
   Keep every reported finding, including lower severities. Classify npm build
   inputs using the lock's dev flag, but mark packaged presence unknown.
5. Add actual resolved Maven receipts and sandboxed packaged APK/native-library
   inventory when those inputs exist. Require consequential unknown components
   to be reviewed before final admission. Source coverage alone cannot pass the
   final artifact gate. Hermes bytecode cannot recover complete npm inventory.

`security_packaged.mjs` parses ZIP metadata and selected native/bundle bytes only
inside the admitted sandbox. It bounds file count, compressed/expanded bytes and
selected extraction, rejects unsafe paths/links/encryption, and hashes native
libraries. A file hash is not a component version or a vulnerability verdict.
The final fixture APK and Maven closure are pending. Existing product artifacts
cannot substitute for synthetic fixture authority.

Done means observed receipts satisfy each applicable predicate. Preserve first
failures, retry labels and cleanup evidence. Report partial coverage and blockers;
do not call this native-factory readiness, certification, hosted CI or production
security assurance.

Primary references: [Grype database and age policy](https://oss.anchore.com/docs/guides/vulnerability/database/),
[Grype severity exit codes](https://oss.anchore.com/docs/guides/vulnerability/filter-results/).
