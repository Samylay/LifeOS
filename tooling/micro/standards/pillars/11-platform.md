# P11. Platform, infrastructure and developer experience

Research checked: 2026-09-29. Scope: the reusable development environment, compute boundaries, infrastructure configuration and maintenance behind Micro products. The practices below are proposed factory policy unless the installed-status section identifies working code.

## Decision

Make the homelab a small platform with an explicit service catalogue, reproducible project setup and separate trust zones. Keep Compose for a single-host service until a measured requirement demands something larger. Docker documents single-server production deployment with Compose; adopting Kubernetes is a separate operating-cost decision. [Docker production guidance](https://docs.docker.com/compose/how-tos/production/)

Treat the platform as a product for its developer. Its success is fewer setup failures, less time waiting and safer releases. The CNCF maturity model evaluates investment, adoption, interfaces, operations and measurement independently. It explicitly warns that attaining the highest maturity level is not an end in itself. Its original repository is archived, so use the model as a reference, not a maintained runtime dependency. [CNCF maturity model](https://github.com/cncf/tag-app-delivery/blob/main/platforms-maturity-model/v1/index.md)

## The Micro path

1. **Declare the project.** Record stack, owner, data classification, distribution target, service dependencies, expected load, monthly spending ceiling and recovery needs in `PLATFORM.md`. A local prototype can choose no remote services. A paying-customer service must identify the operator and the supported operating hours.
2. **Reproduce development.** Pin the language runtime, package manager, lockfile and build images. Supply one documented setup command and one check command. Run setup in a clean disposable environment, not just the author's established shell. Commit a synthetic seed dataset and a safe environment-variable schema containing names and dummy examples, never credentials.
3. **Separate execution.** Keep interactive coding, untrusted candidate verification, trusted building and deployment as distinct roles. Candidate code receives neither live data nor the deployment account. The builder produces release evidence. The deployer accepts a validated artifact reference and fixed deployment procedure.
4. **Declare infrastructure.** Put each app's Compose configuration, service definitions, network intent and recovery instructions in version control. Use Ansible for repeated host configuration; use OpenTofu when managing resources through provider APIs. Keep account-specific inventories and state in protected storage.
5. **Operate the platform.** Assign ownership for runtime support, dependency updates, advisory freshness, disk capacity, image retention, certificates and recovery keys. A factory that works only while the original chat remains open is incomplete.

These steps are Micro's adaptation. Do not change existing homelab ports, shared networks, volumes or services while onboarding a product. Infrastructure changes need a scoped diff and an observed effect before rollout.

## Environment and isolation contract

| Role | Inputs | Permitted outputs | Evidence required |
| --- | --- | --- | --- |
| Attended developer | Approved repo, brief, synthetic fixtures | Candidate source | Scope, source revision, tool trace where agents act |
| Untrusted verifier | Exported candidate and reviewed checks | Logs and proposed result | Enforced resource limits, fresh workspace, no production credentials |
| Trusted security checker | Candidate artifact or source, independently selected policy | Scan reports | Scanner/tool versions, advisory timestamp, policy revision |
| Trusted builder | Protected source and reviewed build recipe | Immutable artifact and attestations | Commit, toolchain, input locks, artifact digest, builder identity |
| Deployer | Allowlisted release record | One scoped deployment | Policy verdict, running digest, smoke and recovery result |

A dev container is an ergonomic environment, not automatically a safe boundary. Its specification includes `initializeCommand`, which executes on the host, and later lifecycle commands that execute project-supplied instructions. Review the configuration before opening an untrusted repo; do not mount the home directory, SSH agent or Docker socket by default. [Dev Containers specification](https://github.com/devcontainers/spec/blob/main/docs/specs/devcontainerjson-reference.md)

Running a process with a non-root UID differs from running the Docker daemon in rootless mode. Rootless Docker also places the daemon in a user namespace. Neither choice creates a separate kernel. For unattended arbitrary agent execution, evaluate a disposable VM or dedicated isolated machine and explicitly deny access to the homelab control plane. Do not migrate the shared production Docker daemon as a side effect of this guide. [Docker rootless mode](https://docs.docker.com/engine/security/rootless/)

Hosted PR runners are the default boundary for externally supplied code. A persistent self-hosted runner can retain compromise between jobs and expose network-accessible services or credentials. An ephemeral registration token does not prove the underlying machine is clean. [GitHub runner security](https://docs.github.com/en/actions/reference/security/secure-use)

## Reproducibility and dependency provisioning

Create a reviewed stack adapter for each supported product family: web service, static web app, Expo/mobile and backend worker. Each adapter owns its setup, real behavioral checks, build output and acceptance environment. Unsupported stacks fail with a useful diagnostic instead of silently skipping checks.

For the local offline verifier, produce a dependency image from the committed lockfile in a separate trusted provisioning process. Record the lockfile hash, runtime digest, package-manager version, enabled lifecycle scripts and preloaded browser/native assets. Review newly required install scripts before permitting them. The verifier then receives that image by immutable reference, disables network access and proves it can run the locked checks. Online hosted CI remains an alternative when offline provisioning costs more than it saves.

Build credentials belong in short-lived secret mounts, with access restricted to the specific trusted build operation. Docker warns that build arguments and environment variables can persist in images; a mount reduces accidental persistence but still lets the build instruction read its contents. Therefore, a hostile build recipe must never receive the release credentials. [Docker build secrets](https://docs.docker.com/build/building/secrets/)

Cache immutable dependencies and reviewed build intermediates. Partition caches by trust zone, operating system, runtime and lockfile hash. Test the uncached path before calling a build reproducible. Set retention limits for caches, test traces, images and agent evidence, with longer retention for signed release records. Record both cold and warm setup times; faster warm builds must not hide a broken fresh install.

## Infrastructure as code and configuration changes

OpenTofu state can contain passwords and private resource attributes. Encryption at rest does not prevent an authorized command runner from reading those values, does not prevent stale-state replay and does not replace backups. Protect state, plans and decryption keys separately; test restoring all three before depending on them. [Sensitive state](https://opentofu.org/docs/language/state/sensitive-data/), [state and plan encryption](https://opentofu.org/docs/language/state/encryption/)

Ansible check and diff modes help preview changes, but module support varies and tasks can override check mode to execute. Inspect the playbook and suppress sensitive diffs. Prove idempotence by applying to a disposable target, then applying again with no unexpected changes. A dry-run log alone is insufficient evidence. [Ansible validation modes](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_checkmode.html)

Use an infrastructure change record with desired effect, affected services, plan hash, source revision, author, reviewer, maintenance impact, post-change predicate and recovery procedure. Serialize applies and deployments per target. Detect drift against declared state, but require a reviewed reconciliation decision before correcting anything that could replace data or identifiers.

## Adoption levels

| Level | Introduce | Avoid until there is evidence |
| --- | --- | --- |
| Prototype | Version pins, synthetic fixtures, one setup command, isolated checks | A portal, service mesh, multi-host orchestration |
| First customer | Service catalogue, scoped deployer, staging, dependency update ownership, cost alerts | Unlimited parallel agent/build workers |
| Several products | Shared reviewed stack adapters, infrastructure modules, capacity and recovery drills | Duplicating an authentication or telemetry platform per app |
| Larger operational need | Disposable builder VMs, distributed scheduling, stronger policy enforcement | Kubernetes merely to claim maturity |

Managed hosting reduces host maintenance but introduces provider cost and identity dependencies. Compose offers a familiar operating model but retains a single-host failure domain. OpenTofu manages provider resources; it does not replace host configuration or application migrations. A developer portal becomes worthwhile when discovery and onboarding are demonstrated bottlenecks.

## Acceptance, ownership and evidence

The platform owner accepts a stack adapter only when a clean disposable setup reaches a running app, real checks pass on the committed source, a known broken fixture fails and the environment has no production mounts or credentials. Retain setup/check logs, adapter revision and image/lock hashes.

The operator accepts infrastructure only when its declarations match observed resources, a second apply has no unintended changes, access is scoped to the target and a recovery rehearsal succeeds. Record the plan and observed state without publishing sensitive inventory.

The product owner chooses setup-time and spending limits from measured baseline and budget. CI/agent timeout, memory, process and concurrency ceilings must be enforced rather than mentioned in a prompt. Capacity tests must show that a failing build does not starve the app or its backup process.

## Installed status and implementation order

Source audit: the [Micro kit](../../README.md) and `micro.py` contain deterministic workspace creation, a one-worker local verifier, resource-bounded candidate containers, exported committed source and independently retained scanner evidence. `verify.mjs` requires an npm lockfile and actual lint/type/behavior/end-to-end commands. This does not provision a dependency-heavy adapter automatically, isolate the attended host coding agent, prove a rootless daemon or install a release deployer.

Implement first: the platform catalogue and one chosen app adapter. Next: clean-environment reproduction and an admitted dependency image or hosted CI route. Before customers: scoped deployment identity, operating budgets and recovery coverage. Only add orchestration after concurrent demand, failure isolation or uptime requirements justify it.

Handoff: [P12 delivery](12-delivery.md) consumes the adapter's artifacts. [P14 reliability](14-reliability.md) validates the actual running service and recovery path.
