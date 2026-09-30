#!/usr/bin/env python3
"""One fixed local Android stage graph, with administrative supervisor hooks.

No hook is registered by product JSON. The default runner cannot build, install
or pass: an operator must wire actual source, scanner, native and device jobs.
Trusted hooks execute jobs and retain observations. Replay is for verification,
never evidence that a new job ran. All tests use labelled synthetic observations.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
import time
from typing import Callable, Mapping
from uuid import uuid4

try:
    from .admission import (Binding, Evidence, Rejected, Store, admit_artifact,
                            context, exact, freshness, number,
                            validate_build_pair)
except ImportError:
    from admission import (Binding, Evidence, Rejected, Store, admit_artifact,
                           context, exact, freshness, number,
                           validate_build_pair)

DEFAULT_STATE = Path('/home/quorky/apps/lifeos/.scratch/software-factory-benchmark/run-20260930/controller/native-integration')
CONTROLLER_ROOT = DEFAULT_STATE
REGISTRY_PATH = 'registry.json'
RUNS_PATH = 'runs'
MAX_AGE = 3600


class Stage(str, Enum):
    SOURCE = 'source-admission'
    SOURCE_SECURITY = 'source-security'
    CHECKS = 'offline-checks'
    BUILD = 'native-build'
    INSPECTION = 'artifact-inspection'
    ARTIFACT_SECURITY = 'artifact-security'
    DEVICE = 'device-journey'
    RECOVERY = 'recovery'


class Status(str, Enum):
    PASSED = 'passed'
    FAILED = 'failed'
    ENVIRONMENT_INVALID = 'environment-invalid'
    PENDING = 'pending'


GRAPH = tuple(Stage)


@dataclass(frozen=True)
class JobContext:
    """Only trusted supervisors receive paths and immutable registry authority."""
    binding: Binding
    store: Store
    run_id: str
    run_directory: str
    stage: Stage
    prior_receipts: tuple[Evidence, ...]
    artifact_sha256: str | None


@dataclass(frozen=True)
class Observation:
    """A trusted hook retains a normalized report and its original raw references."""
    report: Evidence


Hook = Callable[[JobContext], Observation]


@dataclass(frozen=True)
class Registry:
    """Construct in administrative code, outside product source and jobs.

    Caller selects the storage root and approved bindings. Neither a maker nor
    a --record argument can populate it. Certificate and sealed input identities
    remain unset until independently retained and reviewed.
    """
    store: Store
    bindings: Mapping[tuple[str, str], Binding]

    def select(self, project_id: str, adapter_id: str) -> Binding:
        binding = self.bindings.get((project_id, adapter_id))
        if binding is None: raise Rejected('No administrative registry entry for project/adapter')
        if binding.project_id != project_id or binding.adapter_id != adapter_id:
            raise Rejected('Registry identity mismatch')
        return binding


def load_registry() -> Registry:
    """Read only the fixed operator-owned registry, with no product overrides."""
    store = Store(CONTROLLER_ROOT)
    if not store.path(REGISTRY_PATH).exists(): return Registry(store, {})
    raw = store.json(store.describe(REGISTRY_PATH))
    exact(raw, {'schema', 'entries'}, 'administrative registry')
    if raw['schema'] != 'micro.android.registry/1' or not isinstance(raw['entries'], list):
        raise Rejected('Unknown administrative registry')
    bindings = {}
    for entry in raw['entries']:
        try:
            from .admission import IDENTITIES, IMAGE
        except ImportError:
            from admission import IDENTITIES, IMAGE
        exact(entry, {'schema', 'projectKind', 'projectId', 'adapterId', 'sourceSha', 'identities',
                      'certificateSha256', 'expiresAt', 'versionCode', 'versionName', 'package',
                      'minSdk', 'targetSdk', 'permissions', 'admitted', 'image', 'runtimePolicy', 'nativeMapping'}, 'adapter registry entry')
        if entry['schema'] != 'micro.android.adapter/1' or entry['projectKind'] != 'fixture' or entry['image'] != IMAGE:
            raise Rejected('Adapter is outside admitted fixture scope')
        if entry['runtimePolicy'] != {'user': '1000:1000', 'network': 'none', 'memoryBytes': 6*1024**3,
                                      'memorySwapBytes': 6*1024**3, 'nanoCpus': 2_000_000_000, 'pids': 384}:
            raise Rejected('Adapter runtime differs from frozen policy')
        exact(entry['identities'], set(IDENTITIES), 'adapter immutable identities')
        if not isinstance(entry['permissions'], list) or any(not isinstance(v, str) for v in entry['permissions']) or len(set(entry['permissions'])) != len(entry['permissions']):
            raise Rejected('Invalid reviewed permissions')
        if type(entry['admitted']) is not bool or type(entry['versionCode']) is not int or entry['versionCode'] != 1 or entry['versionName'] != '1.0.0':
            raise Rejected('Invalid fixture admission/version fields')
        binding = Binding(entry['projectId'], entry['adapterId'], entry['sourceSha'],
                          {k: Evidence.parse(v) for k, v in entry['identities'].items()},
                          entry['certificateSha256'], entry['expiresAt'], entry['versionCode'],
                          entry['versionName'], entry['package'], entry['minSdk'], entry['targetSdk'],
                          tuple(entry['permissions']), entry['admitted'],
                          Evidence.parse(entry['nativeMapping']) if entry['nativeMapping'] is not None else None)
        key = (binding.project_id, binding.adapter_id)
        if key in bindings: raise Rejected('Duplicate administrative project/adapter entry')
        bindings[key] = binding
    return Registry(store, bindings)


def _reference(value: dict, store: Store, limit: int = 2 * 1024**2) -> Evidence:
    ref = Evidence.parse(value); store.verify(ref, limit)
    return ref


def _security(details: dict, binding: Binding, store: Store, now: float, artifact: str | None):
    exact(details, {'receipt', 'rawReceipt', 'databaseReceipt', 'databaseFiles', 'scannerPolicy', 'database', 'reports', 'coverage', 'nativeMap'}, 'security details')
    if artifact is None and details['nativeMap'] is not None: raise Rejected('Source scan cannot confer native artifact mapping')
    receipt = store.json(_reference(details['receipt'], store))
    exact(receipt, {'schema', 'context', 'status', 'startedAt', 'finishedAt', 'subjectSha256',
                    'scannerPolicySha256', 'databaseSha256', 'reports', 'exitCodes', 'cleanup',
                    'coverage', 'waiversExpireAt'}, 'normalized independent security receipt')
    context(receipt['context'], binding); freshness(receipt, now, MAX_AGE)
    if receipt['schema'] != 'micro.android.security-admission/1' or receipt['status'] != 'passed':
        raise Rejected('Independent scanner verdict unavailable or failed')
    subject = artifact or binding.identities['sourceArchive'].sha256
    if receipt['subjectSha256'] != subject: raise Rejected('Security scan used wrong source/artifact')
    policy = _reference(details['scannerPolicy'], store)
    if policy != binding.identities['scannerPolicy']: raise Rejected('Unadmitted scanner policy')
    config = store.json(policy)
    database = _reference(details['database'], store, int(number(config.get('acquisitionBytes'), 'database byte limit', 1)))
    if receipt['scannerPolicySha256'] != policy.sha256 or receipt['databaseSha256'] != database.sha256:
        raise Rejected('Scanner policy/database identity mismatch')
    config = store.json(policy)
    if config.get('databaseMaxAgeSeconds') is None: raise Rejected('Scanner database age policy unavailable')
    exact(receipt['coverage'], {'scope', 'status', 'databaseCreatedAt', 'runtime', 'buildOnly', 'omissions'}, 'scanner coverage')
    if receipt['coverage']['scope'] != ('final-artifact-and-native' if artifact else 'source-inputs'):
        raise Rejected('Scanner coverage belongs to a different stage subject')
    if receipt['coverage']['runtime'] is not True or receipt['coverage']['buildOnly'] is not True or receipt['coverage']['omissions'] != []:
        raise Rejected('Scanner inventory coverage incomplete')
    built = number(receipt['coverage'].get('databaseCreatedAt'), 'database creation')
    if not 0 <= now-built <= number(config['databaseMaxAgeSeconds'], 'database age limit', 1):
        raise Rejected('Scanner used stale/future database')
    if receipt['reports'] != details['reports']: raise Rejected('Security report identities mismatch')
    if set(details['reports']) != {'secrets', 'inventory', 'vulnerabilities'}:
        raise Rejected('Mandatory scanner reports absent')
    for ref in details['reports'].values(): _reference(ref, store, 64 * 1024**2)
    if receipt['exitCodes'] != {'secrets': 0, 'inventory': 0, 'vulnerabilities': 0} or receipt['cleanup'] != {'absent': True}:
        raise Rejected('Scanner failure or unknown cleanup')
    if receipt['coverage'] != details['coverage'] or receipt['coverage'].get('status') != 'complete-reviewed':
        raise Rejected('Unsupported or unknown scanner coverage')
    # Revalidate the scanner's actual retained worker, tool identities,
    # Docker observations and database, independently of a normalized pass flag.
    try:
        from . import security_native as scanner
    except ImportError:
        import security_native as scanner
    from datetime import datetime, timezone
    raw_ref = _reference(details['rawReceipt'], store, 64*1024**2)
    raw = store.json(raw_ref, 64*1024**2)
    try:
        from .admission import validate_scanner_supervisor
    except ImportError:
        from admission import validate_scanner_supervisor
    validate_scanner_supervisor(raw, 'scan', now, MAX_AGE)
    try:
        from .admission import source_export
    except ImportError:
        from admission import source_export
    _, exported = source_export(binding, store)
    if raw.get('sourceFiles') != exported['tree']['files']:
        raise Rejected('Actual scanner full source manifest differs from admitted export')
    stdout = store.describe(str(Path(raw_ref.path).parent / 'stdout.json'), 64 * 1024**2)
    if stdout.sha256 != raw.get('workerSha256') or store.json(stdout, 64*1024**2) != raw.get('worker'):
        raise Rejected('Actual scanner worker bytes changed')
    accepted = store.json(_reference(details['databaseReceipt'], store))
    file_manifest = accepted.get('files', [])
    if not isinstance(file_manifest, list) or not file_manifest or not isinstance(details['databaseFiles'], dict) or set(details['databaseFiles']) != {f['path'] for f in file_manifest}:
        raise Rejected('Actual scanner database manifest missing')
    for entry in file_manifest:
        file_ref = _reference(details['databaseFiles'][entry['path']], store, int(config['acquisitionBytes']))
        if file_ref.sha256 != entry['sha256'] or file_ref.bytes != entry['bytes']:
            raise Rejected('Actual scanner database manifest bytes changed')
    if accepted.get('importMetadata') is not None:
        imported = store.json(Evidence.parse(details['databaseFiles']['6/import.json']))
        if imported != accepted['importMetadata']: raise Rejected('Actual scanner database import metadata changed')
    actual_db = scanner.validate_database(accepted['metadata'], accepted['files'],
                  now=datetime.fromtimestamp(now, timezone.utc), imported=accepted.get('importMetadata'))
    if actual_db['sha256'] != database.sha256: raise Rejected('Actual scanner database bytes differ')
    expected_maven = []
    if artifact:
        try:
            from .admission import native_mapping_context, validate_native_mapping
        except ImportError:
            from admission import native_mapping_context, validate_native_mapping
        native_ref = Evidence.parse(details['nativeMap'])
        _, _, expected_maven = native_mapping_context(native_ref, binding, store)
    if raw.get('mavenFiles', []) != expected_maven: raise Rejected('Actual scanner Maven inputs differ from reviewed closure')
    verdict = scanner.validate_scan(raw['worker'], accepted,
                                   expected_lock_sha256=binding.identities['sourceLock'].sha256,
                                   expected_maven_files=expected_maven)
    if artifact:
        validate_native_mapping(native_ref, binding, store, artifact, raw['worker'], now, MAX_AGE)
    if verdict['verdict'] != 'pass': raise Rejected('Actual scanner finding blocks admission')
    report_names = {'secrets': 'secrets.json', 'inventory': 'sbom.cdx.json', 'vulnerabilities': 'vulnerabilities.json'}
    for name, worker_name in report_names.items():
        retained = store.json(Evidence.parse(details['reports'][name]), 64*1024**2) if name != 'secrets' else __import__('json').loads(store.read(Evidence.parse(details['reports'][name])))
        if retained != raw['worker']['reports'][worker_name]: raise Rejected('Actual scanner report bytes differ')
    expiry = receipt['waiversExpireAt']
    if expiry is not None and number(expiry, 'waiver expiry') <= now: raise Rejected('Security waiver expired')


def validate_observation(observation: Observation, job: JobContext, now: float) -> dict:
    report = job.store.json(observation.report)
    exact(report, {'schema', 'runId', 'stage', 'status', 'context', 'startedAt', 'finishedAt',
                   'exitCode', 'signal', 'timeout', 'oom', 'resourceError', 'cleanup',
                   'artifactSha256', 'details'}, 'stage observation')
    if report['schema'] != 'micro.android.stage-observation/1' or report['runId'] != job.run_id or report['stage'] != job.stage.value:
        raise Rejected('Wrong stage/run observation')
    # A report must have been retained by this invocation, not copied from a
    # previous run and renamed. Its raw historical observations remain inputs.
    if not observation.report.path.startswith(job.run_directory + '/'):
        raise Rejected('Stage receipt not owned by current run')
    context(report['context'], job.binding); freshness(report, now, MAX_AGE)
    if report['status'] not in {s.value for s in Status}: raise Rejected('Unknown stage status')
    if report['status'] != Status.PASSED.value: return report
    if type(report['exitCode']) is not int or report['exitCode'] != 0 or report['signal'] is not None or report['timeout'] is not False or report['oom'] is not False or report['resourceError'] is not None:
        raise Rejected('Passed flag contradicts command/resource result')
    if report['cleanup'] != {'absent': True}: raise Rejected('Stage cleanup unknown')
    if report['artifactSha256'] != job.artifact_sha256:
        raise Rejected('Stage artifact subject mismatch')
    details = report['details']; binding = job.binding; store = job.store
    if job.stage == Stage.SOURCE:
        exact(details, {'receipt'}, 'source details')
        receipt = store.json(_reference(details['receipt'], store))
        exact(receipt, {'schema', 'context', 'status', 'cleanCommit', 'archiveValidated',
                        'protectedInputsMatched', 'exporterSha256', 'sourceExport'}, 'source admission receipt')
        context(receipt['context'], binding)
        if receipt['schema'] != 'micro.android.source-admission/1' or receipt['status'] != 'admitted' or any(receipt[k] is not True for k in ('cleanCommit', 'archiveValidated', 'protectedInputsMatched')):
            raise Rejected('Clean admitted source/archive/protected inputs unavailable')
        # Exporter identity belongs to the independently admitted adapter record.
        try:
            from .admission import reviewed_adapter, source_export
        except ImportError:
            from admission import reviewed_adapter, source_export
        adapter = reviewed_adapter(binding, store)
        reference, _ = source_export(binding, store)
        if receipt['sourceExport'] != reference.json(): raise Rejected('Source admission export manifest differs from reviewed pin')
        if receipt['exporterSha256'] != adapter.get('sourceExporterSha256'):
            raise Rejected('Unadmitted source exporter')
    elif job.stage in (Stage.SOURCE_SECURITY, Stage.ARTIFACT_SECURITY):
        _security(details, binding, store, now, job.artifact_sha256)
    elif job.stage == Stage.CHECKS:
        exact(details, {'checks', 'mandatoryCases', 'offline', 'recipeSha256'}, 'checks details')
        required = {'lint', 'types', 'domain', 'storage'}
        if details['offline'] is not True or details['recipeSha256'] != binding.identities['recipe'].sha256 or set(details['checks']) != required or set(details['mandatoryCases']) != required:
            raise Rejected('Required offline checks not identified')
        for name in required:
            check = details['checks'][name]
            exact(check, {'exitCode', 'skipped', 'log'}, 'check result')
            if type(check['exitCode']) is not int or check['exitCode'] != 0 or check['skipped'] is not False or type(details['mandatoryCases'][name]) is not int or details['mandatoryCases'][name] < 1:
                raise Rejected('Missing mandatory cases or skipped/failed check')
            _reference(check['log'], store, 20 * 1024**2)
    elif job.stage == Stage.BUILD:
        exact(details, {'builds', 'comparison'}, 'native build details')
        comparison = validate_build_pair([Evidence.parse(r) for r in details['builds']], binding, store, now, MAX_AGE)
        if details['comparison'] != comparison: raise Rejected('Native comparison differs from actual bytes')
    elif job.stage == Stage.INSPECTION:
        exact(details, {'artifactRecord'}, 'artifact details')
        record = store.json(_reference(details['artifactRecord'], store))
        expected_preflight = {stage.value: ref.json() for stage, ref in zip(GRAPH[:3], job.prior_receipts[:3])}
        if job.prior_receipts and record['preflight'] != expected_preflight:
            raise Rejected('Artifact preflight differs from current graph')
        admit_artifact(record, binding, store, now, MAX_AGE)
    elif job.stage == Stage.DEVICE:
        exact(details, {'installed', 'leaseReceipt', 'suiteSha256', 'journey', 'persistence',
                        'offlineLaunch', 'crashCount', 'anrCount', 'evidence'}, 'device details')
        installed = details['installed']
        exact(installed, {'apkSha256', 'package', 'versionCode', 'certificateSha256'}, 'installed identity')
        if installed != {'apkSha256': job.artifact_sha256, 'package': binding.package,
                          'versionCode': binding.version_code, 'certificateSha256': binding.certificate_sha256}:
            raise Rejected('Installed artifact/version/certificate mismatch')
        _reference(details['leaseReceipt'], store)
        if details['suiteSha256'] != binding.identities['suite'].sha256 or any(details[k] != 'passed' for k in ('journey', 'persistence', 'offlineLaunch')):
            raise Rejected('Full device journey/persistence/offline launch unavailable')
        if type(details['crashCount']) is not int or details['crashCount'] != 0 or type(details['anrCount']) is not int or details['anrCount'] != 0:
            raise Rejected('Crash/ANR signal failed or unknown')
        if not isinstance(details['evidence'], list) or not details['evidence']: raise Rejected('Device assertion evidence missing')
        for ref in details['evidence']: _reference(ref, store, 20 * 1024**2)
    elif job.stage == Stage.RECOVERY:
        exact(details, {'fixtureSha256', 'backup', 'emptyTarget', 'integrity', 'semanticRestore',
                        'sentinelExcluded', 'durableNewWrite', 'reopened', 'recoveredPoint',
                        'elapsedSeconds', 'evidence'}, 'recovery details')
        if details['fixtureSha256'] != binding.identities['recovery'].sha256 or any(details[k] is not True for k in ('emptyTarget', 'integrity', 'semanticRestore', 'sentinelExcluded', 'durableNewWrite', 'reopened')):
            raise Rejected('Synthetic empty-target semantic recovery failed or unknown')
        _reference(details['backup'], store, 512 * 1024**2)
        number(details['elapsedSeconds'], 'recovery duration')
        if not isinstance(details['recoveredPoint'], str) or not details['recoveredPoint']: raise Rejected('Recovered point unknown')
        if not isinstance(details['evidence'], list) or not details['evidence']: raise Rejected('Recovery assertion evidence missing')
        for ref in details['evidence']: _reference(ref, store, 20 * 1024**2)
    return report


class Pipeline:
    def __init__(self, registry: Registry, hooks: Mapping[Stage, Hook] | None = None,
                 clock: Callable[[], float] = time.time):
        self.registry = registry
        self.hooks = dict(hooks or {})
        if any(not isinstance(stage, Stage) or not callable(hook) for stage, hook in self.hooks.items()):
            raise Rejected('Only trusted typed stage hooks can be registered')
        self.clock = clock

    def run(self, project_id: str, adapter_id: str, retry_of: Evidence | None = None) -> tuple[dict, Evidence]:
        store = self.registry.store
        run_id = uuid4().hex
        relative = RUNS_PATH + '/' + run_id
        store.path(RUNS_PATH).mkdir(mode=0o700, exist_ok=True)
        store.path(relative).mkdir(mode=0o700, exist_ok=False)
        summary = {'schema': 'micro.android.operations/1', 'runId': run_id,
                   'projectId': project_id, 'adapterId': adapter_id, 'target': 'local-benchmark',
                   'status': 'pending', 'startedAt': self.clock(), 'finishedAt': None,
                   'context': None, 'artifactSha256': None, 'stages': [], 'firstFailure': None,
                   'attemptKind': 'explicit-retry' if retry_of else 'first-attempt',
                   'retryOf': retry_of.json() if retry_of else None,
                   'crashCount': None, 'anrCount': None, 'recovery': 'unknown',
                   'storage': {'before': None, 'after': None},
                   'installed': None, 'journey': 'unknown', 'persistence': 'unknown', 'offlineLaunch': 'unknown',
                   'publishAuthorized': False, 'productionApproved': False,
                   'hostedCiObserved': False}
        binding = None; prior = []; blocked = False
        try:
            summary['storage']['before'] = store.budget()
            if retry_of:
                previous = store.json(retry_of)
                if previous.get('schema') != 'micro.android.operations/1' or previous.get('projectId') != project_id or previous.get('adapterId') != adapter_id:
                    raise Rejected('Explicit retry references another project/adapter')
            binding = self.registry.select(project_id, adapter_id)
            binding.validate(store, self.clock())
            summary['context'] = binding.context()
        except (Rejected, OSError, ValueError) as error:
            blocked = True; summary['firstFailure'] = {'stage': 'registry-admission', 'reason': str(error)[:1200]}
        for stage in GRAPH:
            event = {'stage': stage.value, 'status': 'pending', 'seconds': None,
                     'receipt': None, 'reason': None, 'resourceError': None,
                     'signal': None, 'cleanup': None}
            if blocked:
                event['reason'] = 'Mandatory predecessor or registry admission unavailable'
            elif stage not in self.hooks:
                event['reason'] = 'Actual stage supervisor is not connected'; blocked = True
            else:
                start = self.clock()
                try:
                    binding.validate(store, start)
                    job = JobContext(binding, store, run_id, relative, stage, tuple(prior), summary['artifactSha256'])
                    observation = self.hooks[stage](job)
                    if not isinstance(observation, Observation): raise Rejected('Trusted hook did not retain an observation')
                    event['receipt'] = observation.report.json()
                    raw_report = store.json(observation.report)
                    event['resourceError'] = raw_report.get('resourceError') if isinstance(raw_report.get('resourceError'), str) else None
                    event['signal'] = raw_report.get('signal') if type(raw_report.get('signal')) is int else None
                    event['cleanup'] = raw_report.get('cleanup') if isinstance(raw_report.get('cleanup'), dict) and set(raw_report['cleanup']) == {'absent'} and type(raw_report['cleanup']['absent']) is bool else None
                    report = validate_observation(observation, job, self.clock())
                    binding.validate(store, self.clock())
                    # Re-read all predecessors, detecting altered evidence while
                    # later jobs run. This is a local store, not signed provenance.
                    for ref in prior: store.read(ref)
                    event.update(status=report['status'], receipt=observation.report.json(),
                                 resourceError=report['resourceError'], signal=report['signal'], cleanup=report['cleanup'])
                    prior.append(observation.report)
                    if report['status'] != 'passed':
                        blocked = True; event['reason'] = 'Supervisor stage did not pass'
                    elif stage == Stage.INSPECTION:
                        record = store.json(Evidence.parse(report['details']['artifactRecord']))
                        summary['artifactSha256'] = record['apk']['sha256']
                    elif stage == Stage.DEVICE:
                        summary['installed'] = report['details']['installed']
                        summary['journey'] = report['details']['journey']
                        summary['persistence'] = report['details']['persistence']
                        summary['offlineLaunch'] = report['details']['offlineLaunch']
                        summary['crashCount'] = report['details']['crashCount']; summary['anrCount'] = report['details']['anrCount']
                    elif stage == Stage.RECOVERY:
                        summary['recovery'] = 'passed'
                except (Rejected, OSError, ValueError, KeyError, TypeError) as error:
                    event.update(status='failed', reason=str(error)[:1200]); blocked = True
                except Exception as error:
                    event.update(status='environment-invalid', reason=type(error).__name__ + ': ' + str(error)[:1000]); blocked = True
                event['seconds'] = max(0, self.clock()-start)
            if blocked and summary['firstFailure'] is None:
                summary['firstFailure'] = {'stage': stage.value, 'reason': event['reason']}
            summary['stages'].append(event)
            store.write(relative + '/' + str(len(summary['stages'])).zfill(2) + '-stage.json', event)
        statuses = {event['status'] for event in summary['stages']}
        summary['status'] = ('failed' if 'failed' in statuses else 'environment-invalid' if 'environment-invalid' in statuses else 'passed' if statuses == {'passed'} else 'pending')
        # Hash all raw and nested records again before returning acceptance.
        if summary['status'] == 'passed':
            try:
                for stage, ref in zip(GRAPH, prior):
                    report = store.json(ref)
                    subject = None if stage in GRAPH[:5] else summary['artifactSha256']
                    job = JobContext(binding, store, run_id, relative, stage, (), subject)
                    validate_observation(Observation(ref), job, self.clock())
                binding.validate(store, self.clock())
            except (Rejected, OSError, ValueError, KeyError, TypeError) as error:
                summary['status'] = 'failed'
                summary['firstFailure'] = {'stage': 'final-evidence-recheck', 'reason': str(error)[:1200]}
        try:
            summary['storage']['after'] = store.budget()
        except (Rejected, OSError) as error:
            summary['status'] = 'environment-invalid'
            if summary['firstFailure'] is None:
                summary['firstFailure'] = {'stage': 'storage-budget', 'reason': str(error)[:1200]}
        summary['finishedAt'] = self.clock()
        return summary, store.write(relative + '/operations.json', summary)
