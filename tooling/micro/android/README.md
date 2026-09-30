# Android factory adapter

This directory contains staged Android factory controls. It is not yet an
installed or accepted native pipeline. The existing npm-only verifier remains
the default. Native compilation, recovery and CI acceptance require separate
receipts before promotion.

## Current controls

- `fixtures/native-smoke` is a protected synthetic SQLite fixture. Its two
  counters and post-backup sentinel distinguish persistence from successful
  empty-target restore. It shares the benchmark's locked Expo dependencies.
- `maven_proxy.py` permits reviewed fixture acquisition from fixed public HTTPS
  repositories. It rejects credentials, arbitrary authorities, coordinate
  changes, snapshots and mutable version metadata. It retains bounded download
  hashes and failures. Observed hashes alone do not establish publisher identity.
- `inspect_apk.py` reads a fixed read-only APK inside the admitted Android image.
  It reports bundle, package, version, permissions, ABI and verified certificate
  identity. It never installs or executes the app.
- `artifact_supervisor.py` copies and hashes inputs, creates a bounded container,
  verifies its actual policy, captures bounded results, and removes only its
  own verified container. Its successful result is an identity inspection,
  not permission, source, vulnerability or device acceptance.
- `recovery_store.py` validates the complete quiescent synthetic SQLite file set
  in a sandbox. It checks hashes, schema, record identities and values, including
  committed WAL data. It is fixture-specific and does not demonstrate a device
  restore or provide a customer backup format.

The acquisition proxy is only for trusted fixture dependency preparation. Run
its client on an owned internal bridge with isolated gateway mode. Only the
proxy may join a separate egress network. Publish no ports. Prove the actual
route, credential and redirect behavior before acquisition. Candidate builds
must have `network=none`, no host homes, credentials, Docker socket or ADB.
The trusted outer supervisor must enforce an absolute acquisition-job timeout
and remove only its owned proxy/client containers. The proxy's 300-second
download-body checks and socket idle timeouts do not prove an absolute deadline
across DNS resolution, TLS and response headers.

## APK inspection

Use the exact admitted local image ID and a fresh task-owned output directory:

```sh
python3 tooling/micro/android/artifact_supervisor.py \
  --apk /absolute/path/to/retained.apk \
  --image sha256:ADMITTED_IMAGE_ID \
  --output /absolute/path/to/fresh-inspection
```

`result.json` retains the input hashes, actual runtime policy, container state,
inspection result and scoped cleanup. Failures remain in their original output
directory. Each retry uses a new directory. The container has 1 GiB RAM with no
additional swap, one CPU, 128 processes, no network, a read-only root, a bounded
temporary filesystem and two read-only input mounts. SDK parser output is
bounded by the container and supervisor.

Inspecting an APK does not bind it to source. Native builds must supply an
independent admitted source/configuration/dependency record. A separate trusted
policy must check the expected package, version, certificate, permissions and
ABIs before installation. Do not derive approval from candidate declarations.

Run the trusted adapter checks:

```sh
python3 -m unittest discover -s tooling/micro/android/tests -v
```

Keep image construction receipts separate from candidate execution. Docker
daemon image loading and layer copies do not inherit a client's memory limit.
Bound their inputs, duration and host headroom, and retain this limitation.
