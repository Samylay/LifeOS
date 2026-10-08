"""PROPOSAL ONLY: fixed counter-fixture recovery observations, never admission.

No operation runs on import. Existing guarded Device APIs own all device work;
SQL validation occurs only through the existing bounded container supervisor.
Actual calibration and an independent recovery admission predicate are pending.
"""
from pathlib import Path
import hashlib
import os
import re
import stat
import time
from uuid import uuid4

import admission as a
import device
import fixture_health as health
import fixture_private_store as private
import fixture_store_validation as validator
import native_fixture_journey as journey
import pipeline

SOURCE_SHA = '8cfb316455a451d2781bfd4dc589acb91bb7ef52'
# Administrative callable identity, not a source hash claim about a substitute.
# Synthetic tests replace this pin explicitly alongside their FAKE validator.
REVIEWED_VALIDATE = validator.validate_collected_store
# Explicit FAKE test seam, unset in the uninstalled production proposal.
TEST_ONLY_VALIDATE = None
REVIEWED_DEVICE_METHODS = {'offline-launch': device.Device.launch_offline,
                          'force-stop': device.Device.force_stop}
REVIEWED_TRANSPORT = device._transport
# Explicit FAKE seams, unset for the uninstalled production proposal.
TEST_ONLY_DEVICE_TRANSPORTS = None
TEST_ONLY_OPERATION_METHODS = None
MAX_SECONDS = 600
REPORT_BYTES = 2 * 1024**2


def run_fixture_recovery(source: device.Device, target: device.Device,
                         job: pipeline.JobContext, artifact: a.Evidence,
                         helper: a.Evidence) -> pipeline.Observation:
    """Observe 2/1 backup, later source3/1, restored target2/1, new/reopened3/1.

    Neither target launch nor target force-stop occurs before the guarded restore
    proves empty SQLite inventory. Existing private APIs require no health window,
    so the three UI windows are finalized before collection or restore. There is
    no clear/uninstall/retry, generic command, SQL parser, or capability override.
    """
    if (not isinstance(source, device.Device) or not isinstance(target, device.Device)
            or not isinstance(job, pipeline.JobContext) or job.stage != pipeline.Stage.RECOVERY
            or not isinstance(artifact, a.Evidence) or not isinstance(helper, a.Evidence)):
        raise a.Rejected('Recovery requires fixed Devices, recovery JobContext and Evidence')
    if (not re.fullmatch(r'[0-9a-f]{32}', job.run_id)
            or job.run_directory != 'runs/' + job.run_id
            or not job.store.path(job.run_directory).is_dir()):
        raise a.Rejected('Recovery requires the current supervisor-owned run directory')
    directory = job.run_directory + '/fixture-recovery/' + uuid4().hex
    job.store.path(directory).mkdir(mode=0o700, parents=True, exist_ok=False)
    clock = source.backend.clock
    started = clock(); monotonic_start = time.monotonic()
    step = 'admission'; events = []; evidence = []; cleanup = []
    first = None; first_error = None
    cleanup_failures = []; health_findings = []; health_failures = []; active_window = None
    source_export = None; collection = validation = restored = None
    observed_points = {}; identities = {}; installed = {}; blocked = []
    validator_names_before = None; validator_names_after_failure = None
    validator_returned_untyped = False; receipt_lineage_limits = []
    validator_domain_error = None; validator_domain_receipt = None
    collection_cleanup_index = restore_cleanup_index = None
    administrative_operations = []; health_evidence_lineage = []
    health_retention_failures = []
    paths = {'orchestrator': Path(__file__), 'device': Path(device.__file__),
             'journey': Path(journey.__file__), 'health': Path(health.__file__),
             'collector': Path(private.__file__), 'validator': Path(validator.__file__),
             'sqlWorker': Path(validator.__file__).with_name('recovery_store.py'),
             'admission': Path(a.__file__), 'pipeline': Path(pipeline.__file__),
             'calibration': Path(private.__file__).with_name('fixture_calibration.py'),
             'helperSource': Path(private.__file__).with_name('fixture_store_commit.c'),
             'validatorCommand': Path(validator.__file__).with_name('artifact_supervisor.py')}
    authority = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in paths.items()}

    def callable_identity(function):
        module = getattr(function, '__module__', None)
        qualname = getattr(function, '__qualname__', None)
        filename = getattr(getattr(function, '__code__', None), 'co_filename', None)
        return {'module': module if isinstance(module, str) else None,
                'qualname': qualname if isinstance(qualname, str) else None,
                'codePath': str(Path(filename).resolve()) if isinstance(filename, str) else None}

    canonical_callable = {'module': 'fixture_store_validation',
        'qualname': 'validate_collected_store', 'codePath': str(paths['validator'].resolve())}
    observed_callable = callable_identity(validator.validate_collected_store)
    validator_callable = {'canonical': canonical_callable, 'observed': observed_callable,
        'authoritySha256': authority['validator'],
        'canonicalIdentityMatches': observed_callable == canonical_callable,
        'testOnlySubstitution': TEST_ONLY_VALIDATE is not None
            and validator.validate_collected_store is TEST_ONLY_VALIDATE
            and REVIEWED_VALIDATE is TEST_ONLY_VALIDATE}

    def require_validator_callable():
        current = validator.validate_collected_store
        if current is not REVIEWED_VALIDATE:
            raise a.Rejected('Validator callable differs from reviewed controller function')
        if current is TEST_ONLY_VALIDATE and TEST_ONLY_VALIDATE is not None:
            return  # Explicit synthetic substitute, always recorded as FAKE.
        if callable_identity(current) != canonical_callable:
            raise a.Rejected('Validator callable differs from hashed canonical module/qualname/code path')

    def retain(name, value):
        payload = {'schema': 'micro.android.fixture-recovery-event/1',
                   'runId': job.run_id, 'context': job.binding.context(),
                   'artifactSha256': job.artifact_sha256, 'step': name,
                   'observedAt': clock(), 'observation': value}
        if len(a.canonical(payload)) > REPORT_BYTES:
            raise a.Rejected('Recovery event exceeds retained diagnostic bound')
        reference = job.store.write(directory + f'/{len(events):02d}-{name}.json', payload)
        events.append(reference.json()); evidence.append(reference.json())
        return reference

    def checkpoint():
        if time.monotonic() - monotonic_start > MAX_SECONDS:
            raise a.Rejected('Recovery observation duration exceeded600seconds')
        job.store.budget()
        job.binding.validate(job.store, clock())
        if any(hashlib.sha256(path.read_bytes()).hexdigest() != authority[name]
               for name, path in paths.items()):
            raise a.Rejected('Recovery controller authority changed during observations')

    def operation_authority(adapter, kind, method):
        expected = REVIEWED_DEVICE_METHODS[kind]
        attribute = 'launch_offline' if kind == 'offline-launch' else 'force_stop'
        canonical = {'module': 'device', 'qualname': 'Device.' + attribute,
                     'codePath': str(paths['device'].resolve())}
        if (getattr(device.Device, attribute) is not expected
                or callable_identity(expected) != canonical
                or hashlib.sha256(paths['device'].read_bytes()).hexdigest() != authority['device']):
            raise a.Rejected('Device operation reviewed producer authority differs')
        actual_method = (getattr(method, '__self__', None) is adapter
                         and getattr(method, '__func__', None) is expected)
        fake_method = (not actual_method and isinstance(TEST_ONLY_OPERATION_METHODS, dict)
                       and TEST_ONLY_OPERATION_METHODS.get((adapter.role, kind)) is method)
        if not actual_method and not fake_method:
            raise a.Rejected('Device operation requires exact reviewed bound method')
        transport = adapter.backend.transport
        actual_transport = (transport is REVIEWED_TRANSPORT and device._transport is REVIEWED_TRANSPORT
            and callable_identity(REVIEWED_TRANSPORT) == {'module':'device','qualname':'_transport',
                'codePath':str(paths['device'].resolve())})
        fake_transport = (not actual_transport and isinstance(TEST_ONLY_DEVICE_TRANSPORTS, dict)
                          and TEST_ONLY_DEVICE_TRANSPORTS.get(adapter.role) is transport)
        if not actual_transport and not fake_transport:
            raise a.Rejected('Device operation requires reviewed transport or explicit FAKE test pin')
        if (adapter._lease_pin != identities[adapter.role]['leaseSha256']
                or not isinstance(adapter._installed, dict)
                or any(adapter._installed.get(key) != value for key,value in installed[adapter.role].items())):
            raise a.Rejected('Device operation current lease/installed subject differs')
        return {'producer':canonical, 'transport':callable_identity(transport),
                'testOnlyMethodSubstitution':fake_method,'testOnlyTransportSubstitution':fake_transport}

    def operation(adapter, name, method):
        nonlocal step
        checkpoint(); step = name
        index = len(cleanup); cleanup.append(None)
        kinds = {'source-snapshot-launch':'offline-launch','source-quiesce':'force-stop',
                 'source-later-launch':'offline-launch','source-later-quiesce':'force-stop',
                 'target-restored-launch':'offline-launch','target-new-stop':'force-stop',
                 'target-reopen':'offline-launch','target-final-stop':'force-stop'}
        kind = kinds[name]
        guarantee = {'kind':'reviewed-fixed-producer-administrative-guarantee',
            'step':name,'operation':kind,'role':adapter.role,'package':private.PACKAGE,
            'apkSha256':job.artifact_sha256,'leaseSha256':identities[adapter.role]['leaseSha256'],
            'authoritySha256':authority['device'],'independentCleanupReceipt':None,
            'guaranteeApplied':False,
            'limit':'Fixed reviewed transport returns only after reaping/cleanup; no independent original cleanup receipt'}
        administrative_operations.append(guarantee)
        guarantee.update(operation_authority(adapter,kind,method))
        before = adapter.backend.clock()
        result = method()
        now = adapter.backend.clock()
        keys = {'operation','role','package','apkSha256','observedAt'}
        if kind == 'offline-launch': keys |= {'journey','crashCount','anrCount'}
        if (not isinstance(result, dict) or set(result) != keys
                or result.get('operation') != kind or result.get('role') != adapter.role
                or result.get('package') != private.PACKAGE or result.get('apkSha256') != job.artifact_sha256
                or type(result.get('observedAt')) not in (int,float) or not before <= result['observedAt'] <= now
                or kind == 'offline-launch' and (result['journey'] != 'not-evaluated'
                    or result['crashCount'] is not None or result['anrCount'] is not None)):
            raise a.Rejected('Device operation successful outcome schema/current subject differs')
        attribute = 'launch_offline' if kind == 'offline-launch' else 'force_stop'
        after_method = getattr(adapter, attribute)
        operation_authority(adapter,kind,after_method)
        # Success is an administrative guarantee of the fixed reviewed producer,
        # not independently replayable raw ADB cleanup lineage or admission.
        checkpoint()
        reference = retain(name, result)
        guarantee.update(guaranteeApplied=True,outcomeEvent=reference.json(),observedAt=result['observedAt'])
        cleanup[index] = {'absent': True}
        return result

    def capture(adapter, name, expected, tap_name=None):
        nonlocal step
        checkpoint(); step = name; before = adapter.backend.clock()
        pending = []; failure = None; failure_step = None; ticket = None
        try:
            try:
                ticket = adapter.capture(name)
            except Exception:
                # No typed capture proves affirmative owned scratch cleanup.
                cleanup.append(None)
                raise
            if not isinstance(ticket, device.Capture):
                cleanup.append(None)
                raise a.Rejected('Recovery capture did not return a typed ticket')
            capture_cleanup_index = len(cleanup); cleanup.append(None)
            # Keep exact diagnostic facts in memory until the guarded tap finishes.
            # No controller retention, budget/binding check or code hash runs in
            # the fresh capture-to-tap interval. Device owns its identity rechecks.
            pending.append((name + '-capture', {
                'role': ticket.role, 'token': ticket.token,
                'leaseSha256': ticket.lease_sha256, 'artifactSha256': ticket.artifact_sha256,
                'observedAt': ticket.observed_at, 'dimensions': list(ticket.dimensions),
                'png': ticket.png.json(), 'xml': ticket.xml.json(), 'receipt': ticket.receipt.json()}))
            evidence.extend([ticket.png.json(), ticket.xml.json(), ticket.receipt.json()])
            receipt = job.store.json(ticket.receipt)
            now = adapter.backend.clock()
            if (ticket.role != adapter.role or ticket.lease_sha256 != identities[adapter.role]['leaseSha256']
                    or ticket.artifact_sha256 != job.artifact_sha256
                    or not before <= ticket.observed_at <= now
                    or now - ticket.observed_at > device.MAX_FRESH_SECONDS):
                raise a.Rejected('Recovery capture subject or freshness differs')
            if (receipt.get('schema') != 'micro.android.device-observation/1'
                    or receipt.get('role') != adapter.role or receipt.get('label') != name
                    or receipt.get('observedAt') != ticket.observed_at
                    or receipt.get('dimensions') != list(ticket.dimensions)
                    or receipt.get('identity') != identities[adapter.role]
                    or any(receipt.get('installed', {}).get(k) != v for k, v in installed[adapter.role].items())
                    or receipt.get('files') != {'screen.png': ticket.png.json(), 'hierarchy.xml': ticket.xml.json()}
                    or receipt.get('scratchCleanup') != {'absent': True}):
                raise a.Rejected('Recovery capture receipt/installed identity/cleanup differs')
            cleanup[capture_cleanup_index] = receipt['scratchCleanup']
            if device.validate_png(job.store.read(ticket.png, device.PNG_LIMIT)) != ticket.dimensions:
                raise a.Rejected('Recovery PNG dimensions differ from capture')
            values = journey.observe_counters(job.store.read(ticket.xml, device.XML_LIMIT), ticket.dimensions, expected)
            pending.append((name + '-assertion', {
                'role': adapter.role, 'capture': ticket.receipt.json(),
                'expected': list(expected), 'observed': values}))
            if tap_name is not None:
                step = tap_name
                result = adapter.tap(ticket, 'counter-a')
                pending.append((tap_name, result))
        except Exception as error:
            failure = error; failure_step = step
            if tap_name is not None and step == tap_name:
                # A failed guarded tap has no complete operation cleanup receipt.
                # Its re-dump may have left owned scratch or a live ADB child.
                cleanup.append(None)
                cleanup_failures.append({'step': tap_name, 'kind': 'guarded-tap-cleanup-unknown',
                    'failure': private.failure(error),
                    'notes': [str(note)[:1000] for note in getattr(error, '__notes__', [])[:8]]})
                pending.append((tap_name + '-failure', {
                    'role': adapter.role, 'capture': ticket.receipt.json(),
                    'control': 'counter-a', 'failure': private.failure(error)}))
        finally:
            for event_name, value in pending:
                try:
                    reference = retain(event_name, value)
                    if event_name == name + '-assertion': observed_points[name] = reference.json()
                except Exception as error:
                    cleanup_failures.append({'step': 'capture-evidence-retention',
                                             'kind': 'diagnostic-retention',
                                             'event': event_name, **private.failure(error)})
                    if failure is None: failure = error; failure_step = step
        if failure is not None:
            step = failure_step
            raise failure
        checkpoint()
        return ticket

    def register_health_observation(adapter, reference, phase):
        if not isinstance(reference, a.Evidence):
            raise a.Rejected('Health observation requires original typed Evidence')
        if reference.json() not in evidence: evidence.append(reference.json())
        lineage = {'kind':phase,'role':adapter.role,'observation':reference.json(),
                   'raw':None,'bindingValidated':False}
        health_evidence_lineage.append(lineage)
        facts = job.store.json(reference)
        raw_ref = None
        # Discover the exact original nested reference from hash-verified parent
        # bytes before domain rejection. Registration is diagnostic identity,
        # not bound admission; final verification classifies it independently.
        if isinstance(facts, dict) and facts.get('raw') is not None:
            raw_ref = a.Evidence.parse(facts['raw']);lineage['raw'] = raw_ref.json()
            if raw_ref.json() not in evidence: evidence.append(raw_ref.json())
        if (not isinstance(facts, dict) or facts.get('schema') != 'micro.android.fixture-exit-info/1'
                or facts.get('role') != adapter.role or facts.get('package') != private.PACKAGE
                or facts.get('leaseSha256') != identities[adapter.role]['leaseSha256']
                or facts.get('apkSha256') != job.artifact_sha256
                or facts.get('controllerSha256') != authority['health']
                or not re.fullmatch(r'fixture-health/' + re.escape(adapter.role) + r'/[0-9a-f]{32}/observation\.json', reference.path)
                or type(facts.get('observedAt')) not in (int,float)
                or not started <= facts['observedAt'] <= adapter.backend.clock()
                or facts.get('failure') is not None and not isinstance(facts['failure'], dict)):
            raise a.Rejected('Health observation role/lease/APK/controller/schema binding differs')
        if raw_ref is not None:
            if raw_ref.path != str(Path(reference.path).parent) + '/exit-info.txt':
                raise a.Rejected('Health observation raw dump namespace differs')
            data = job.store.read(raw_ref, health.DUMP_LIMIT)
        if facts['failure'] is None:
            clock_facts = facts.get('clock')
            if (raw_ref is None or not isinstance(clock_facts, dict)
                    or type(clock_facts.get('epochSeconds')) is not int or clock_facts['epochSeconds'] <= 0
                    or not isinstance(clock_facts.get('timezone'), str)
                    or type(facts.get('packageUid')) is not int or not 10000 <= facts['packageUid'] < 100000
                    or not isinstance(facts.get('records'), list)
                    or health.parse_exit_info(data,facts['packageUid'],clock_facts['timezone']) != facts['records']):
                raise a.Rejected('Health observation raw/clock/UID/record binding differs')
        lineage['bindingValidated'] = True
        return facts

    def health_retention_error(phase, reference, error):
        health_retention_failures.append({'step':step,'kind':phase,
            'reference':reference.json() if isinstance(reference,a.Evidence) else reference,
            'bindingValidated':False, **private.failure(error)})

    def preregister_health_references(references, phase):
        originals = []; failures = []
        # Keep every supplied ORIGINAL reference before any sibling read. A
        # reference establishes identity only; its binding is inspected below.
        for supplied in references:
            try:
                original = supplied if isinstance(supplied,a.Evidence) else a.Evidence.parse(supplied)
                if original.json() not in evidence: evidence.append(original.json())
                originals.append(original)
            except Exception as error:
                health_retention_error(phase,supplied,error); failures.append(error)
        return originals, failures

    def inspect_health_observations(adapter, references, phase):
        originals, failures = preregister_health_references(references,phase)
        for original in originals:
            try: register_health_observation(adapter,original,phase)
            except Exception as error:
                health_retention_error(phase,original,error); failures.append(error)
        return failures

    def start_window(adapter, name):
        nonlocal step, active_window
        checkpoint(); step = name + '-health-start'
        cleanup.append(None)
        ticket = adapter.start_fixture_health_window()
        active_window = (adapter, ticket, name, len(cleanup)-1)
        if not isinstance(ticket, health.Ticket) or not isinstance(ticket.baseline, a.Evidence):
            raise a.Rejected('Typed health ticket/original baseline missing')
        # Register its original hash immediately, even if reading it then fails.
        if ticket.baseline.json() not in evidence: evidence.append(ticket.baseline.json())
        if (ticket.role != adapter.role or ticket.lease_sha256 != identities[adapter.role]['leaseSha256']
                or ticket.apk_sha256 != job.artifact_sha256 or ticket.controller_sha256 != authority['health']):
            raise a.Rejected('Health ticket current subject/controller differs')
        register_health_observation(adapter,ticket.baseline,'baseline')
        retain(step, {'role': adapter.role, 'baseline': ticket.baseline.json(), 'token': ticket.token})

    def finish_window():
        nonlocal active_window, step
        adapter, ticket, name, index = active_window
        step = name + '-health-finish'
        try:
            reference = adapter.finish_fixture_health_window(ticket)
            if not isinstance(reference, a.Evidence):
                raise a.Rejected('Typed health window receipt missing')
            evidence.append(reference.json()); facts = job.store.json(reference)
            if (not isinstance(facts, dict) or facts.get('schema') != 'micro.android.fixture-health-window/1'
                    or not isinstance(ticket, health.Ticket) or ticket.role != adapter.role
                    or ticket.lease_sha256 != identities[adapter.role]['leaseSha256']
                    or ticket.apk_sha256 != job.artifact_sha256 or ticket.controller_sha256 != authority['health']
                    or facts.get('role') != ticket.role or facts.get('package') != private.PACKAGE
                    or facts.get('leaseSha256') != ticket.lease_sha256
                    or facts.get('apkSha256') != ticket.apk_sha256
                    or facts.get('controllerSha256') != ticket.controller_sha256
                    or facts.get('baseline') != ticket.baseline.json()):
                raise a.Rejected('Health window receipt schema or ticket binding differs')
            siblings = [ticket.baseline]
            if facts.get('final') is not None: siblings.append(facts['final'])
            retention_errors = inspect_health_observations(adapter,siblings,'window-observation')
            if facts.get('final') is None and facts.get('failure') is None:
                missing = a.Rejected('Bound final health observation missing')
                health_retention_error('window-final',None,missing); retention_errors.append(missing)
            stream = facts.get('stream')
            # Device can retain stream=None when stream.finish raises. Its bound
            # receipt still carries the exact cleanupFailure. Keep unknown until
            # a complete cleanup dict exists, and retain the actual error below.
            if isinstance(stream, dict) and cleanup_schema(stream.get('cleanup')):
                # This parent receipt is already bound to the current ticket.
                # Negative cleanup survives observation failures; affirmative
                # absence still requires intact, bound observation evidence.
                if (stream['cleanup'] == {'absent':False}
                        or not retention_errors and not facts.get('failure')):
                    cleanup[index] = stream['cleanup']
            stream_cleanup_failure = stream.get('cleanupFailure') if isinstance(stream,dict) else None
            summary = facts.get('summary') or {}
            # Record adverse signals independently of stream/cleanup failures.
            if summary.get('status') == 'failed':
                health_findings.append({'step': step, 'kind': 'matching-crash-anr',
                                        'receipt': reference.json(), 'summary': summary})
            if facts.get('failure'):
                health_failures.append({'step': step, 'kind': 'health-observation',
                                        'failure': facts['failure'], 'receipt': reference.json()})
            if facts.get('cleanupFailure') or stream_cleanup_failure or cleanup[index] != {'absent': True}:
                cleanup_failures.append({'step': step, 'kind': 'owned-stream-cleanup',
                    'failure': facts.get('cleanupFailure'), 'cleanup': cleanup[index],
                    'streamCleanupFailure':stream_cleanup_failure,
                    'receipt': reference.json()})
            failure = None
            if facts.get('failure'):
                cause = facts['failure']
                failure = a.Rejected(cause.get('reason','Recovery health observation failed'))
                failure.health_cause_failure = cause
                failure.health_cause_receipt = reference.json()
            elif summary.get('status') == 'failed':
                failure = a.Rejected('Matching crash/ANR signal observed during recovery UI window')
                failure.health_cause_failure = {'kind':'matching-crash-anr','summary':summary}
                failure.health_cause_receipt = reference.json()
            elif (facts.get('cleanupFailure') or stream_cleanup_failure
                    or cleanup[index] == {'absent':False}):
                failure = a.Rejected('Recovery owned-stream cleanup failed or unknown')
                failure.health_cause_failure = {'kind':'owned-stream-cleanup',
                    'failure':facts.get('cleanupFailure'),'streamCleanupFailure':stream_cleanup_failure,
                    'cleanup':cleanup[index]}
                failure.health_cause_receipt = reference.json()
            elif retention_errors:
                failure = retention_errors[0]
            elif cleanup[index] != {'absent': True}:
                failure = a.Rejected('Recovery owned-stream cleanup failed or unknown')
                failure.health_cause_failure = {'kind':'owned-stream-cleanup',
                    'failure':facts.get('cleanupFailure'),'streamCleanupFailure':stream_cleanup_failure,
                    'cleanup':cleanup[index]}
                failure.health_cause_receipt = reference.json()
            try:
                retain(step, {'role': adapter.role, 'receipt': reference.json()})
            except Exception as error:
                cleanup_failures.append({'step': 'health-evidence-retention',
                    'kind': 'diagnostic-retention', 'event': step,
                    'receipt': reference.json(), **private.failure(error)})
                if failure is None: raise
            if failure is not None: raise failure
        finally:
            active_window = None

    def validator_namespaces():
        """Inventory only protected Store-owned generated validator namespaces."""
        root = job.store.path('store-validation')
        try: root_info = root.lstat()
        except FileNotFoundError: return {}
        def owned_directory(info):
            return (stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
                    and not info.st_mode & 0o022)
        # The validator creates intermediate parents with the process umask.
        # Store's protected root governs access; the parent can be group-writable
        # inside that root without changing who can traverse the Store.
        if not stat.S_ISDIR(root_info.st_mode) or root_info.st_uid != os.getuid():
            raise a.Rejected('Validator namespace root is not an owned directory')
        names = {}
        for entry in sorted(root.iterdir(), key=lambda path: path.name):
            if not re.fullmatch(r'[0-9a-f]{32}', entry.name):
                raise a.Rejected('Unexpected entry in owned validator namespace root')
            # Store.path rejects links in every path component before lstat.
            path = job.store.path('store-validation/' + entry.name)
            info = path.lstat()
            if not owned_directory(info):
                raise a.Rejected('Validator namespace is not a protected owned directory')
            names[entry.name] = {'device': info.st_dev, 'inode': info.st_ino,
                                'ownerUid': info.st_uid, 'mode': stat.S_IMODE(info.st_mode)}
        after = root.lstat()
        if (root_info.st_dev, root_info.st_ino, root_info.st_uid, root_info.st_mode) != (
                after.st_dev, after.st_ino, after.st_uid, after.st_mode):
            raise a.Rejected('Validator namespace root identity changed during inventory')
        return names

    def transport_cleanup_fact(facts, origin, receipt=None, command_index=None, notes=None):
        cleanup.append(None)
        cleanup_failures.append({'step': step, 'kind': 'adb-transport-cleanup',
            'source': origin, 'failure': facts, 'receipt': receipt,
            'commandIndex': command_index, 'notes': notes or []})

    def transport_causes(error, receipt=None):
        # Inspect both explicit and implicit causal links, with an identity set
        # and a fixed bound. A cyclic cause cannot hide the node's own facts.
        pending = [error]; seen = set()
        while pending and len(seen) < 16:
            current = pending.pop()
            if id(current) in seen: continue
            seen.add(id(current))
            facts = getattr(current, 'transport_cleanup_failure', None)
            if facts:
                transport_cleanup_fact(facts, 'exception-cause', receipt, notes=[
                    str(note)[:1000] for note in getattr(current, '__notes__', [])[:8]])
            for child in (current.__cause__, current.__context__):
                if isinstance(child, BaseException) and id(child) not in seen:
                    pending.append(child)
        if any(id(current) not in seen for current in pending):
            cleanup.append(None)
            cleanup_failures.append({'step': step, 'kind': 'causal-inspection-bound',
                'receipt': receipt, 'reason': 'More than 16 distinct exception causes; cleanup unknown'})

    def child_transport_facts(child, reference):
        commands = child.get('commands', [])
        if not isinstance(commands, list):
            cleanup.append(None)
            cleanup_failures.append({'step': step, 'kind': 'child-command-facts-unknown',
                                     'receipt': reference.json()})
            return
        for index, command in enumerate(commands[:64]):
            failure = command.get('failure') if isinstance(command, dict) else None
            if isinstance(failure, dict) and failure.get('transportCleanupFailure'):
                transport_cleanup_fact(failure['transportCleanupFailure'], 'child-command',
                                       reference.json(), index)
        if len(commands) > 64:
            cleanup.append(None)
            cleanup_failures.append({'step': step, 'kind': 'child-command-inspection-bound',
                'receipt': reference.json(), 'reason': 'More than 64 child commands; cleanup unknown'})

    def cleanup_schema(value):
        return (isinstance(value, dict) and set(value) == {'absent'}
                and (value['absent'] is None or type(value['absent']) is bool))

    def private_receipt_binding(child, reference, role, kind):
        if not isinstance(child, dict): raise a.Rejected('Private child receipt is not a dict')
        owner = child.get('owner')
        expected = ('fixture-stores/' + role + '/' + str(owner) + '/collection.json'
                    if kind == 'collection' else 'fixture-restores/' + str(owner) + '/receipt.json')
        if (not isinstance(owner, str) or not re.fullmatch(r'[0-9a-f]{32}', owner)
                or reference.path != expected
                or child.get('schema') != 'micro.android.fixture-store-' + kind + '/1'
                or child.get('status') not in ('failed', 'collected' if kind == 'collection' else 'committed')
                or child.get('role') != role
                or child.get('leaseSha256') != identities[role]['leaseSha256']
                or child.get('apkSha256') != job.artifact_sha256
                or any(child.get(key) is not None and not isinstance(child[key], dict)
                       for key in ('failure', 'cleanupFailure', 'helperCleanupFailure'))
                or not isinstance(child.get('commands'), list) or len(child['commands']) > 64
                or any(not isinstance(command, dict) or not isinstance(command.get('operation'), str)
                       or (command.get('failure') is not None and not isinstance(command['failure'], dict))
                       for command in child['commands'])):
            raise a.Rejected('Private child receipt identity/schema differs')
        allowed = ({'inventory', 'collect'} if kind == 'collection' else
                   {'inventory','bootstrap','verify-helper','metadata','prepare','transfer',
                    'seal','stage-inventory','commit','cleanup','helper-cleanup'})
        if not child['commands'] or child['commands'][0]['operation'] != 'inventory':
            raise a.Rejected('Private child completed command proof missing')
        for command in child['commands']:
            if command['operation'] not in allowed:
                raise a.Rejected('Private child command operation differs')
            if command.get('failure') is None:
                count_key = 'bytes' if kind == 'collection' else 'stdoutBytes'
                hash_key = 'sha256' if kind == 'collection' else 'stdoutSha256'
                if (type(command.get(count_key)) is not int or command[count_key] < 0
                        or not isinstance(command.get(hash_key), str)
                        or not re.fullmatch(r'[0-9a-f]{64}', command[hash_key])):
                    raise a.Rejected('Private child completed command schema differs')
        if kind == 'collection':
            if (child.get('collectorSha256') != authority['collector']
                    or child.get('deviceControllerSha256') != authority['device']):
                raise a.Rejected('Collection child controller authority differs')
            if child.get('manifest') is not None:
                manifest_ref = a.Evidence.parse(child['manifest'])
                files = {name: a.Evidence.parse(ref) for name, ref in child.get('files', {}).items()}
                directory = 'fixture-stores/' + role + '/' + owner + '/'
                if (manifest_ref.path != directory + 'manifest.json'
                        or any(ref.path != directory + name for name, ref in files.items())):
                    raise a.Rejected('Collection child retained input namespace differs')
                validator.retained_files(job.store, manifest_ref, files)

        elif (collection is None or validation is None
                or child.get('collection') != collection.receipt.json()
                or child.get('validation') != validation.json() or child.get('helper') != helper.json()
                or child.get('helperSourceSha256') != authority['helperSource']
                or any(not cleanup_schema(child.get(key)) for key in ('stageCleanup', 'helperCleanup'))):
            raise a.Rejected('Restore child input/helper/cleanup schema differs')

    def validation_cleanup_binding(facts, reference, *, thrown=False):
        # Cleanup authority is independent of product/row/status admission.
        # This API binds the current run indirectly through its current collection;
        # it supplies no independent run ID or originally pinned cleanup log refs.
        source_facts = job.store.json(collection.receipt)
        private_receipt_binding(source_facts, collection.receipt, source.role, 'collection')
        file_refs = {name: ref.json() for name, ref in collection.files}
        manifest = validator.retained_files(job.store, collection.manifest, dict(collection.files))
        owner = facts.get('owner') if isinstance(facts, dict) else None
        if (not isinstance(facts, dict) or not isinstance(owner, str)
                or not re.fullmatch(r'[0-9a-f]{32}', owner)
                or reference.path != 'store-validation/' + owner + '/receipt.json'
                or owner in (validator_names_before or {})
                or owner not in validator_namespaces()
                or source_facts.get('status') != 'collected'
                or source_facts.get('manifest') != collection.manifest.json()
                or source_facts.get('files') != file_refs
                or facts.get('schema') != 'micro.fixture-store-supervisor/1'
                or facts.get('manifest') != collection.manifest.json() or facts.get('files') != file_refs
                or facts.get('image') != validator.IMAGE
                or (not cleanup_schema(facts.get('cleanup')) and facts.get('cleanup') is not None)
                or any(facts.get(key) != authority[name] for key, name in (
                    ('supervisorSha256', 'validator'), ('workerSha256', 'sqlWorker'),
                    ('commandHelperSha256', 'validatorCommand')))):
            raise a.Rejected('Validator cleanup receipt subject/authority differs')
        runtime = facts.get('runtime'); state = facts.get('state'); worker = facts.get('worker')
        expected = {'identity','user','isolation','resources','exposure','logs','tmpfs','command','mounts'}
        identifier = facts.get('containerId'); commands = facts.get('commands')
        if (not isinstance(identifier, str) or not re.fullmatch(r'[0-9a-f]{64}', identifier)
                or not isinstance(runtime, dict) or set(runtime) != expected
                or any(value is not True for value in runtime.values())
                or not isinstance(state, dict) or state.get('Running') is not False
                or state.get('OOMKilled') is not False or type(state.get('ExitCode')) is not int
                or state['ExitCode'] not in (0, 1)
                or not isinstance(worker, dict)
                or not isinstance(commands, list) or not 4 <= len(commands) <= 64):
            raise a.Rejected('Validator cleanup actual execution binding differs')
        allowed_parent = (facts.get('status') == 'validated' if state['ExitCode'] == 0
                          else facts.get('status') == 'rejected')
        # The real API marks infrastructure/cleanup exceptions failed after a
        # worker completed. An optional original typed thrown receipt can retain
        # that actual child diagnostic without weakening normal return admission.
        if thrown and facts.get('status') == 'failed' and isinstance(facts.get('failure'), dict):
            allowed_parent = True
        if state['ExitCode'] == 0:
            if (not allowed_parent or worker.get('schema') != 'micro.fixture-store-validation/1'
                    or worker.get('status') != 'validated'
                    or worker.get('manifestSha256') != collection.manifest.sha256
                    or worker.get('files') != manifest['files']):
                raise a.Rejected('Validator successful worker input binding differs')
        else:
            domain_error = worker.get('error')
            if (not allowed_parent or set(worker) != {'schema', 'status', 'error'}
                    or worker['schema'] != 'micro.fixture-store-validation/1' or worker['status'] != 'failed'
                    or not isinstance(domain_error, dict) or set(domain_error) != {'type', 'message'}
                    or not isinstance(domain_error['type'], str) or not domain_error['type']
                    or not isinstance(domain_error['message'], str) or len(domain_error['message']) > 1000):
                raise a.Rejected('Validator rejected worker outcome shape differs')
        for command in commands:
            if (not isinstance(command, dict) or not isinstance(command.get('argv'), list)
                    or not all(isinstance(value, str) for value in command['argv'])
                    or type(command.get('exitCode')) is not int or command.get('limitFailure') is not None
                    or type(command.get('capturedBytes')) is not int or command['capturedBytes'] < 0
                    or not isinstance(command.get('sha256'), str)
                    or not re.fullmatch(r'[0-9a-f]{64}', command['sha256'])
                    or type(command.get('seconds')) not in (int, float) or command['seconds'] < 0):
                raise a.Rejected('Validator cleanup command schema differs')
        create, before, execution, after = commands[:4]
        argv = create['argv']; name = 'micro-artifact-' + owner
        if (argv[:2] != ['docker', 'create'] or argv[-2:] != [validator.IMAGE, '/worker.py']
                or '--name' not in argv or argv[argv.index('--name')+1] != name
                or '--label' not in argv or argv[argv.index('--label')+1] != 'micro.artifact.owner='+owner
                or create['exitCode'] != 0
                or before['argv'] != ['docker','inspect',identifier] or before['exitCode'] != 0
                or execution['argv'] != ['docker','start','--attach',identifier]
                or execution['exitCode'] != state['ExitCode']
                or after['argv'] != ['docker','inspect',identifier] or after['exitCode'] != 0):
            raise a.Rejected('Validator cleanup command identity differs')
        if facts.get('cleanup') == {'absent': True}:
            if (commands[-2]['argv'] != ['docker','inspect',identifier] or commands[-2]['exitCode'] != 1
                    or commands[-1]['argv'] != ['docker','ps','--all','--quiet','--no-trunc',
                        '--filter','name=^/'+name+'$','--filter','label=micro.artifact.owner='+owner]
                    or commands[-1]['exitCode'] != 0):
                raise a.Rejected('Validator scoped cleanup command identity differs')
        return facts.get('cleanup')

    def retain_child_failure(error):
        nonlocal validator_names_after_failure
        children = [(name, getattr(error, name, None)) for name in ('collection_evidence', 'restore_evidence')]
        receipt = next((ref.json() for _, ref in children if isinstance(ref, a.Evidence)), None)
        # Keep host cleanup facts even if reading or retaining a child receipt fails.
        transport_causes(error, receipt)
        for name, reference in children:
            if isinstance(reference, a.Evidence):
                evidence.append(reference.json())
                try: child = job.store.json(reference)
                except Exception:
                    cleanup.append(None)
                    raise
                kind = 'collection' if name == 'collection_evidence' else 'restore'
                role = source.role if kind == 'collection' else target.role
                private_receipt_binding(child, reference, role, kind)
                child_transport_facts(child, reference)
                if first is not None and isinstance(child.get('failure'), dict):
                    first['childFailure'] = child['failure']
                if kind == 'collection' and collection_cleanup_index is not None:
                    if all(not command.get('failure') for command in child['commands']):
                        cleanup[collection_cleanup_index] = {'absent': True}
                if kind == 'restore' and restore_cleanup_index is not None:
                    cleanup[restore_cleanup_index:restore_cleanup_index+2] = [child['stageCleanup'], child['helperCleanup']]
                    for key in ('cleanupFailure', 'helperCleanupFailure'):
                        if child.get(key): cleanup_failures.append({'step': key, 'failure': child[key],
                                                                  'receipt': reference.json()})
                retain('failed-child', {'receipt': reference.json()})
        # Existing validator reports its generated namespace in this exact error.
        # This is not an arbitrary exception path or command interpretation.
        if step == 'validate-collected-store':
            match = re.fullmatch(r'Fixture validation failed; retained (store-validation/[0-9a-f]{32}/receipt\.json)', str(error))
            if match:
                cleanup_index = len(cleanup); cleanup.append(None)
                original = getattr(error, 'validation_evidence', None)
                if isinstance(original, a.Evidence):
                    # Optional future API extension. Never substitute current bytes
                    # for the original typed Evidence supplied by the exception.
                    try:
                        if original.path != match[1]:
                            raise a.Rejected('Original validator receipt path differs')
                        facts = job.store.json(original)
                        bound_cleanup = validation_cleanup_binding(facts, original, thrown=True)
                    except Exception:
                        receipt_lineage_limits.append({'kind': 'validator-original-unaccepted',
                            'originalReference': original.json(), 'cleanupTrusted': False,
                            'limit': 'Original typed receipt failed integrity/schema/current subject binding; retained unverified'})
                        raise
                    evidence.append(original.json())
                    cleanup[cleanup_index] = bound_cleanup
                    if first is not None and isinstance(facts.get('failure'), dict):
                        first['childFailure'] = facts['failure']
                    if facts.get('cleanupFailure'):
                        cleanup_failures.append({'step': 'validator-cleanup',
                            'failure': facts['cleanupFailure'], 'receipt': original.json()})
                    retain('failed-validator', {'receipt': original.json(), 'lineage': 'original-typed-evidence'})
                else:
                    # Actual API supplies only a path. Current bytes are diagnostics
                    # and must never enter verified original receipt evidence.
                    reference = job.store.describe(match[1])
                    lineage = {'kind': 'validator-path-only-receipt', 'path': match[1],
                        'originalReference': None, 'currentDiagnosticReference': reference.json(),
                        'cleanupTrusted': False,
                        'limit': 'Validator exception supplies no original typed Evidence; current bytes may have been replaced'}
                    receipt_lineage_limits.append(lineage)
                    if first is not None and isinstance(error.__cause__, BaseException):
                        first['validatorCauseFailure'] = private.failure(error.__cause__)
                    facts = job.store.json(reference)
                    if not isinstance(facts, dict): raise a.Rejected('Validator diagnostic receipt is not a dict')
                    lineage['reportedCleanup'] = facts.get('cleanup')
                    if first is not None and facts.get('failure'):
                        first['childFailure'] = facts['failure']
                        first['childFailureLineage'] = 'Unverified current path-only receipt diagnostic'
                    if facts.get('cleanupFailure'):
                        cleanup_failures.append({'step': 'validator-cleanup',
                            'failure': facts['cleanupFailure'], 'receipt': reference.json(),
                            'lineage': 'unverified-current-diagnostic'})
                    retain('failed-validator', {'receipt': reference.json(), 'lineage': lineage})
            elif validation is None:
                try:
                    require_validator_callable()
                    checkpoint()
                    validator_names_after_failure = validator_namespaces()
                    before = validator_names_before or {}
                    unretained_namespace = validator_names_after_failure != before
                except Exception as inventory_error:
                    # Unreadable/replaced namespace facts cannot prove no child.
                    cleanup.append(None)
                    cleanup_failures.append({'step': 'validator-namespace-inventory',
                        'kind': 'cleanup-evidence-unknown', **private.failure(inventory_error)})
                else:
                    # The reviewed validator creates its fresh namespace before
                    # any child. No new namespace means a raised pre-child failure.
                    # A namespace without a retained typed receipt, or an untyped
                    # return, supplies no affirmative child cleanup proof.
                    if unretained_namespace or validator_returned_untyped:
                        cleanup.append(None)
        originals, _ = preregister_health_references(getattr(error,'health_evidence',[]),'failed-health')
        for original in originals:
            try:
                facts = job.store.json(original)
                if not isinstance(facts, dict): raise a.Rejected('Health failure receipt is not a dict')
                adapter = source if facts.get('role') == source.role else target if facts.get('role') == target.role else None
                if adapter is None:
                    raise a.Rejected('Health failure receipt role differs')
                if facts.get('schema') == 'micro.android.fixture-exit-info/1':
                    register_health_observation(adapter,original,'failed-observation')
                elif facts.get('schema') == 'micro.android.fixture-health-start-failure/1':
                    nested_errors = inspect_health_observations(adapter,[facts.get('baseline')],'failed-start-baseline')
                    if nested_errors: continue  # Exact sibling diagnostic is already retained.
                else:
                    raise a.Rejected('Health failure receipt schema differs')
            except Exception as retention_error:
                health_retention_error('failed-health',original,retention_error)

    try:
        if job.binding.package != private.PACKAGE or job.binding.source_sha != SOURCE_SHA:
            raise a.Rejected('Recovery is restricted to the exact frozen synthetic fixture source')
        for adapter, role in ((source, 'factory-source'), (target, 'factory-target')):
            if adapter.role != role or adapter.spec != device.ROLES[role] or adapter.store is None or adapter.store.root != job.store.root:
                raise a.Rejected('Recovery requires distinct exact source/target roles and protected Store')
            registry = adapter.registry or pipeline.load_registry()
            if registry.store.root != job.store.root or registry.select(job.binding.project_id, job.binding.adapter_id) != job.binding:
                raise a.Rejected('Recovery Device registry differs from stage authority')
        step = 'validator-callable-authority'
        require_validator_callable()
        checkpoint(); source_export = journey._fixture_source(job.binding, job.store)
        previous = pipeline.GRAPH[:pipeline.GRAPH.index(pipeline.Stage.RECOVERY)]
        if len(job.prior_receipts) != len(previous):
            raise a.Rejected('Recovery requires every actual mandatory predecessor')
        for index, (stage, reference) in enumerate(zip(previous, job.prior_receipts)):
            step = 'revalidate-' + stage.value
            subject = None if stage in pipeline.GRAPH[:5] else job.artifact_sha256
            predecessor_job = pipeline.JobContext(job.binding, job.store, job.run_id,
                job.run_directory, stage, job.prior_receipts[:index], subject)
            facts = pipeline.validate_observation(pipeline.Observation(reference), predecessor_job, clock())
            if facts['status'] != 'passed':
                raise a.Rejected('Recovery predecessor is missing, foreign or unaccepted')
        security = job.prior_receipts[previous.index(pipeline.Stage.ARTIFACT_SECURITY)]
        if source.artifact_security != security or target.artifact_security != security:
            raise a.Rejected('Recovery Devices require this run artifact-security predecessor')
        record = job.store.json(artifact); a.context(record.get('context'), job.binding)
        if record.get('apk', {}).get('sha256') != job.artifact_sha256:
            raise a.Rejected('Recovery artifact differs from current stage subject')
        if not isinstance(private.DEVICE_CALIBRATION, dict) or private.DEVICE_CALIBRATION.get('status') != 'reviewed':
            blocked.append('Actual owned-image private-store/alias/SELinux/atomic helper calibration pending')
        if private.HELPER_BINARY_SHA256 is None or private.HELPER_SOURCE_SHA256 is None:
            blocked.append('Reviewed helper binary/source admission pins unset')
        if not isinstance(health.IMAGE_CALIBRATION, dict) or health.IMAGE_CALIBRATION.get('status') != 'reviewed':
            blocked.append('Actual bounded health image/parser/clock/transport calibration pending')
        if not blocked:
            private.admitted_helper(job.store, helper)
            for adapter in (source, target):
                step = adapter.role + '-bind-installed'
                bound = adapter.bind_installed(artifact)
                installed[adapter.role] = {k: bound[k] for k in ('apkSha256','package','versionCode','certificateSha256')}
                if installed[adapter.role] != {'apkSha256': job.artifact_sha256, 'package': private.PACKAGE,
                        'versionCode': job.binding.version_code, 'certificateSha256': job.binding.certificate_sha256}:
                    raise a.Rejected('Recovery installed artifact identity differs')
                identities[adapter.role] = adapter.facts()
                retain(step, {'installed': bound, 'identity': identities[adapter.role]})

            start_window(source, 'source-snapshot')
            operation(source, 'source-snapshot-launch', source.launch_offline)
            capture(source, 'source-snapshot-point', (2, 1))
            operation(source, 'source-quiesce', source.force_stop)
            finish_window()
            checkpoint(); step = 'collect-source-store'
            collection_cleanup_index = len(cleanup); cleanup.append(None)
            collected = source.collect_fixture_store()
            if not isinstance(collected, private.Collection): raise a.Rejected('Typed complete collection missing')
            collection = collected
            evidence.extend([collection.receipt.json(), collection.manifest.json(), *[r.json() for _, r in collection.files]])
            collection_facts = job.store.json(collection.receipt)
            private_receipt_binding(collection_facts, collection.receipt, source.role, 'collection')
            commands = collection_facts.get('commands')
            if (collection_facts.get('schema') != 'micro.android.fixture-store-collection/1'
                    or collection_facts.get('status') != 'collected'
                    or collection_facts.get('role') != source.role
                    or collection_facts.get('leaseSha256') != identities[source.role]['leaseSha256']
                    or collection_facts.get('apkSha256') != job.artifact_sha256
                    or collection_facts.get('manifest') != collection.manifest.json()
                    or collection_facts.get('files') != {name: ref.json() for name, ref in collection.files}
                    or not isinstance(commands, list) or len(commands) != 3
                    or any(not isinstance(command, dict) or command.get('failure') for command in commands)
                    or [command.get('operation') for command in commands] != ['inventory', 'collect', 'inventory']):
                raise a.Rejected('Collection receipt subject or completed command proof differs')
            # The reviewed typed collector returned three completed bounded
            # calls; no raised transport/child cleanup failure is in this receipt.
            cleanup[collection_cleanup_index] = {'absent': True}
            retain(step, {'receipt': collection.receipt.json(), 'manifest': collection.manifest.json()})
            checkpoint(); step = 'validator-namespace-baseline'
            validator_names_before = validator_namespaces()
            step = 'validator-callable-authority'
            require_validator_callable()
            step = 'validate-collected-store'
            validated = validator.validate_collected_store(job.store, collection.manifest, dict(collection.files))
            if not isinstance(validated, a.Evidence):
                validator_returned_untyped = True
                raise a.Rejected('Typed isolated validation missing')
            validation = validated
            evidence.append(validation.json())
            validation_cleanup_index = len(cleanup); cleanup.append(None)
            validation_facts = job.store.json(validation)
            cleanup[validation_cleanup_index] = validation_cleanup_binding(validation_facts, validation)
            if validation_facts['state']['ExitCode'] == 1:
                validator_domain_error = dict(validation_facts['worker']['error'])
                validator_domain_receipt = validation.json()
            accepted = private.validate_restore_input(job.store, collection, validation)
            facts = accepted['collection']
            if facts.get('role') != source.role or facts.get('leaseSha256') != identities[source.role]['leaseSha256'] or facts.get('apkSha256') != job.artifact_sha256:
                raise a.Rejected('Collection belongs to another source lease/artifact')
            retain(step, {'receipt': validation.json(), 'rows': accepted['validation']['worker']['rows']})

            start_window(source, 'source-later-write')
            operation(source, 'source-later-launch', source.launch_offline)
            capture(source, 'source-later-before-write', (2, 1), 'source-later-a-write')
            capture(source, 'source-later-point', (3, 1))
            operation(source, 'source-later-quiesce', source.force_stop)
            finish_window()

            checkpoint(); step = 'restore-empty-target'
            restore_cleanup_index = len(cleanup); cleanup.extend([None, None])
            restored_result = target.restore_fixture_store(collection, validation, helper)
            if not isinstance(restored_result, a.Evidence): raise a.Rejected('Typed restore receipt missing')
            restored = restored_result
            evidence.append(restored.json()); facts = job.store.json(restored)
            private_receipt_binding(facts, restored, target.role, 'restore')
            expected = {n: {'bytes': r.bytes, 'sha256': r.sha256} for n, r in collection.files}
            committed = {r['name']: {'bytes': r['bytes'], 'sha256': r['sha256']}
                         for r in facts.get('committed', {}).get('files', [])}
            empty = facts.get('emptyTarget')
            if (facts.get('schema') != 'micro.android.fixture-store-restore/1' or facts.get('status') != 'committed'
                    or facts.get('role') != target.role or facts.get('leaseSha256') != identities[target.role]['leaseSha256']
                    or facts.get('apkSha256') != job.artifact_sha256 or facts.get('collection') != collection.receipt.json()
                    or facts.get('validation') != validation.json() or facts.get('helper') != helper.json()
                    or not isinstance(empty, dict) or set(empty) != {'packageUid','packageMetadata','parentMetadata','store','files'}
                    or empty['store'] is not None or empty['files'] != []
                    or committed != expected or any(c != {'absent': True}
                        for c in [facts.get('stageCleanup'), facts.get('helperCleanup')])):
                raise a.Rejected('Actual empty-target commit/hash/cleanup proof missing or changed')
            cleanup[restore_cleanup_index:restore_cleanup_index+2] = [facts['stageCleanup'], facts['helperCleanup']]
            retain(step, {'receipt': restored.json(), 'emptyTarget': empty, 'committedFiles': committed})
            start_window(target, 'target-restored-write-reopen')
            operation(target, 'target-restored-launch', target.launch_offline)
            capture(target, 'target-restored-point', (2, 1), 'target-new-a-write')
            capture(target, 'target-new-point', (3, 1))
            operation(target, 'target-new-stop', target.force_stop)
            operation(target, 'target-reopen', target.launch_offline)
            capture(target, 'target-reopened-point', (3, 1))
            operation(target, 'target-final-stop', target.force_stop)
            finish_window()
            checkpoint()
    except Exception as error:
        first_error = error
        first = {'step': step, **private.failure(error)}
        if hasattr(error,'health_cause_failure'):
            first['healthCauseFailure'] = error.health_cause_failure
            first['healthCauseReceipt'] = error.health_cause_receipt
        if validator_domain_error is not None:
            first['validatorDomainError'] = validator_domain_error
            first['validatorDomainReceipt'] = validator_domain_receipt
        try: retain_child_failure(error)
        except Exception as retention_error:
            cleanup_failures.append({'step': 'failure-evidence-retention', **private.failure(retention_error)})
    finally:
        if active_window is not None:
            try: finish_window()
            except Exception as error:
                health_failures.append({'step': 'health-finish-after-failure',
                                        'windowStep': step, 'kind': 'finish-error', **private.failure(error)})
                try: retain_child_failure(error)
                except Exception as retention_error:
                    cleanup_failures.append({'step': 'failure-evidence-retention', **private.failure(retention_error)})
                if first is None:
                    first_error = error
                    first = {'step': step, **private.failure(error)}

    verified_evidence = []; unverified_evidence = []; integrity_failures = []

    def verify_final(reference):
        nonlocal first, first_error
        try:
            job.store.verify(a.Evidence.parse(reference), 20 * 1024**2)
        except Exception as error:
            unverified_evidence.append(reference)
            integrity_failures.append({'step': 'final-evidence-verification',
                                       'reference': reference, **private.failure(error)})
            if first is None:
                first_error = error
                first = {'step': 'final-evidence-verification', **private.failure(error)}
            return False
        verified_evidence.append(reference)
        return True

    # Verify each original reference independently. Corrupt bytes remain exactly
    # referenced as unverified diagnostics, never in the verified evidence list.
    for reference in evidence: verify_final(reference)
    aggregate = {'absent': False} if {'absent': False} in cleanup else None if any(c != {'absent': True} for c in cleanup) else {'absent': True}
    finished = clock(); elapsed = time.monotonic() - monotonic_start
    raw_payload = {
        'schema': 'micro.android.fixture-recovery-observation/1', 'context': job.binding.context(),
        'runId': job.run_id, 'artifactRecord': artifact.json(), 'artifactSha256': job.artifact_sha256,
        'sourceExport': source_export.json() if source_export else None, 'authority': authority,
        'validatorCallable': validator_callable,
        'operationAdministrativeGuarantees':administrative_operations,
        'healthEvidenceLineage':health_evidence_lineage,
        'healthEvidenceRetentionFailures':health_retention_failures,
        'startedAt': started, 'finishedAt': finished, 'elapsedSeconds': elapsed, 'boundSeconds': MAX_SECONDS,
        'events': events, 'observedPoints': observed_points, 'firstFailure': first,
        'cleanupFailures': cleanup_failures, 'cleanupObservations': cleanup,
        'healthFindings': health_findings, 'healthObservationFailures': health_failures,
        'integrityFailures': integrity_failures, 'unverifiedEvidence': unverified_evidence,
        'verifiedEvidence': verified_evidence,
        'collection': collection.receipt.json() if collection else None,
        'validation': validation.json() if validation else None, 'restore': restored.json() if restored else None,
        'receiptLineageLimits': receipt_lineage_limits,
        'validatorNamespaceBaseline': validator_names_before,
        'validatorNamespaceFailureInventory': validator_names_after_failure,
        'blockedCapabilities': blocked, 'status': 'failed' if first else 'pending',
        'laterWriteSentinel': 'Source counter-a3 versus backup counter-a2; no sentinel row write',
        'health': {'status': 'failed' if health_findings else 'unknown', 'crashCount': None, 'anrCount': None},
        'limitations': ['Proposal only; no independent actual recovery admission connected',
                        'No SQL parsed on host; no customer backup/restore claim',
                        'Store write failures can still prevent a returned stage observation',
                        'Synthetic callable substitutions are FAKE observations, never validator admission',
                        'Thrown validator path-only receipts have unverified lineage and never establish clean cleanup',
                        'Launch/stop success supplies only an explicitly bound fixed-producer administrative cleanup guarantee; no independent raw cleanup receipt',
                        'Capabilities blocked: ' + '; '.join(blocked) if blocked else 'Mock/observed sequence remains admission pending',
                        '600second checkpoints surround bounded calls; dispatch/cleanup may finish later']}

    def persist_final(name, payload, raw_observation=None):
        """A missing final write throws, retaining causes without producing a stage."""
        try:
            return job.store.write(directory + '/' + name, payload)
        except Exception as error:
            error.recovery_failure = {
                'schema':'micro.android.fixture-recovery-persistence-failure/1',
                'persistencePhase':name,'stageObservationProduced':False,
                'firstFailure':first,'cleanup':aggregate,
                'persistenceFailure':private.failure(error),
                'diagnostics':{**raw_payload,'cleanupAggregate':aggregate},
                'rawObservation':raw_observation}
            if first_error is not None:
                raise error from first_error
            raise

    raw = persist_final('recovery.json', raw_payload)
    raw_verified = verify_final(raw.json())
    report = persist_final('stage-observation.json', {
        'schema': 'micro.android.stage-observation/1', 'runId': job.run_id,
        'stage': pipeline.Stage.RECOVERY.value, 'status': 'failed' if first else 'pending',
        'context': job.binding.context(), 'startedAt': started, 'finishedAt': finished,
        'exitCode': None, 'signal': None, 'timeout': None, 'oom': None, 'resourceError': None,
        'cleanup': aggregate, 'artifactSha256': job.artifact_sha256,
        'details': {'fixtureSha256': job.binding.identities['recovery'].sha256,
                    'backup': collection.manifest.json() if collection and collection.manifest.json() in verified_evidence else None,
                    'emptyTarget': None, 'integrity': None, 'semanticRestore': None,
                    'sentinelExcluded': None, 'durableNewWrite': None, 'reopened': None,
                    'recoveredPoint': None, 'elapsedSeconds': elapsed, 'evidence': verified_evidence,
                    'firstFailure': first, 'integrityFailures': integrity_failures,
                    'unverifiedEvidence': unverified_evidence,
                    'rawObservation': {'reference': raw.json(), 'verified': raw_verified}}},
        {'reference':raw.json(),'verified':raw_verified})
    return pipeline.Observation(report)
