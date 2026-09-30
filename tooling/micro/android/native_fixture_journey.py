#!/usr/bin/env python3
"""Protected fixed fixture UI observations. No generic E2E or health verdict.

An operator supplies an already installed Device and the admitted artifact record.
All device work uses its public guarded API. Successful counter observations are
pending until a separate actual crash/ANR authority exists; this controller cannot
emit a passed device stage. There is no success flag, health override or retry.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
import re
from uuid import uuid4

try:
    from . import admission, device, pipeline
except ImportError:
    import admission
    import device
    import pipeline

PACKAGE = 'app.micro.factory.fixture'
FIXTURE_COMPONENT_SHA256 = 'c204a2fb3737a5d7d84c8296c68a96fa51f8267cd283f129f7f03d4d676b25ff'
CASES = ('empty-counter-store', 'counter-a-first-write', 'counter-a-second-write',
         'counter-b-write', 'durable-offline-reopen')
SOURCE_FILES = {'README.md', 'package.json', 'package-lock.json', 'app.json',
                'tsconfig.json', 'app/_layout.tsx', 'app/index.tsx'}
REPORT_LIMIT = 2 * 1024**2


def _fixture_source(binding: admission.Binding, store: admission.Store) -> admission.Evidence:
    reference, exported = admission.source_export(binding, store)
    files = exported['tree']['files']
    if {item['path'] for item in files} != SOURCE_FILES or next(
            item['sha256'] for item in files if item['path'] == 'app/index.tsx') != FIXTURE_COMPONENT_SHA256:
        raise admission.Rejected('Journey requires the exact reviewed seven-file fixture source')
    return reference


def observe_counters(xml: bytes, dimensions: tuple[int, int], expected: tuple[int, int]) -> dict:
    """Read exact package-bound values, independently of the component's writes."""
    nodes = device.hierarchy(xml, PACKAGE, dimensions)
    values = {}
    for node in nodes:
        resource = node['resourceId'].removeprefix(PACKAGE + ':id/')
        text = node['text']
        if resource in ('fixture-error', 'fixture-retry') or text == 'Opening fixture store':
            raise admission.Rejected('Observed fixture error or store not ready')
        if resource == 'value-sentinel' or text.startswith('sentinel:'):
            raise admission.Rejected('Unexpected sentinel in counter journey')
        if resource.startswith('value-'):
            if resource not in ('value-counter-a', 'value-counter-b') or resource in values:
                raise admission.Rejected('Unknown or duplicate observed counter')
            values[resource] = text
    exact = {'value-counter-a': f'counter-a: {expected[0]}',
             'value-counter-b': f'counter-b: {expected[1]}'}
    if values != exact:
        raise admission.Rejected('Observed counter values differ from independent expected totals')
    if not any(node['text'] == 'Native factory fixture' for node in nodes):
        raise admission.Rejected('Fixed fixture screen title absent')
    return {'counterA': expected[0], 'counterB': expected[1], 'sentinelPresent': False,
            'basis': 'Exact values read from fresh package-bound hierarchy text'}


def run_fixture_journey(adapter: device.Device, job: pipeline.JobContext,
                        artifact_record: admission.Evidence) -> pipeline.Observation:
    """Execute fixed observations and retain first failure plus every prior receipt.

    The Device must use this job's protected Store for captures. The registry,
    source, installed APK and final security stay independently admitted. This
    helper never installs, clears data, touches sentinel or changes device policy.
    """
    if not isinstance(adapter, device.Device) or not isinstance(job, pipeline.JobContext) or job.stage != pipeline.Stage.DEVICE or not isinstance(artifact_record, admission.Evidence):
        raise admission.Rejected('Fixed journey requires Device and device-stage JobContext')
    if not re.fullmatch(r'[0-9a-f]{32}', job.run_id) or job.run_directory != 'runs/' + job.run_id:
        raise admission.Rejected('Journey output must belong to the current supervisor run')
    directory = job.run_directory + '/fixture-journeys/' + uuid4().hex
    job.store.path(directory).mkdir(mode=0o700, parents=True, exist_ok=False)
    clock = adapter.backend.clock
    started = clock(); step = 'admission'; events = []; evidence = []
    authority_paths = {'controllerSha256': Path(__file__), 'deviceControllerSha256': Path(device.__file__)}
    code_authority = {key: hashlib.sha256(path.read_bytes()).hexdigest() for key, path in authority_paths.items()}
    first_failure = None; source = None; lease = None; installed = None
    journey = persistence = offline_launch = 'unknown'

    def retain(name, value):
        payload = {'schema': 'micro.android.fixture-journey-event/1', 'runId': job.run_id,
                   'context': job.binding.context(), 'artifactSha256': job.artifact_sha256,
                   'suiteSha256': job.binding.identities['suite'].sha256, 'role': adapter.role,
                   'step': name, 'observedAt': clock(), 'observation': value}
        if len(admission.canonical(payload)) > REPORT_LIMIT:
            raise admission.Rejected('Journey observation report byte budget')
        reference = job.store.write(directory + f'/{len(events):02d}-{name}.json', payload)
        events.append(reference.json()); evidence.append(reference.json())
        return reference

    def capture(name, expected):
        nonlocal step
        step = name; before = clock()
        ticket = adapter.capture(name)
        if not isinstance(ticket, device.Capture): raise admission.Rejected('Missing typed device capture')
        # Retain the returned capture before assertion, including an adverse UI.
        retain(name + '-capture', {'token': ticket.token, 'role': ticket.role,
               'leaseSha256': ticket.lease_sha256, 'artifactSha256': ticket.artifact_sha256,
               'observedAt': ticket.observed_at, 'dimensions': list(ticket.dimensions),
               'png': ticket.png.json(), 'xml': ticket.xml.json(), 'receipt': ticket.receipt.json()})
        evidence.extend([ticket.png.json(), ticket.xml.json(), ticket.receipt.json()])
        observed = job.store.json(ticket.receipt)
        if ticket.role != adapter.role or ticket.artifact_sha256 != job.artifact_sha256 or ticket.lease_sha256 != identity['leaseSha256']:
            raise admission.Rejected('Capture belongs to another role, lease or artifact')
        now = clock()
        if not before <= ticket.observed_at <= now or now-ticket.observed_at > device.MAX_FRESH_SECONDS:
            raise admission.Rejected('Fresh observation ticket expired; calibration required, no retry')
        if observed.get('schema') != 'micro.android.device-observation/1' or observed.get('role') != adapter.role or observed.get('label') != name or observed.get('observedAt') != ticket.observed_at or observed.get('dimensions') != list(ticket.dimensions) or observed.get('files') != {'screen.png': ticket.png.json(), 'hierarchy.xml': ticket.xml.json()} or observed.get('scratchCleanup') != {'absent': True}:
            raise admission.Rejected('Capture receipt binding or scratch cleanup invalid')
        if observed['identity'] != identity or any(observed['installed'].get(key) != value for key, value in installed.items()):
            raise admission.Rejected('Capture installed identity or lease changed')
        png = job.store.read(ticket.png, device.PNG_LIMIT)
        if device.validate_png(png) != ticket.dimensions: raise admission.Rejected('Capture dimensions differ from actual PNG')
        counters = observe_counters(job.store.read(ticket.xml, device.XML_LIMIT), ticket.dimensions, expected)
        retain(name + '-assertion', {'capture': ticket.receipt.json(), 'expected': list(expected), 'observed': counters})
        return ticket

    try:
        if adapter.role not in ('factory-source', 'factory-target') or adapter.spec.package != PACKAGE or job.binding.package != PACKAGE:
            raise admission.Rejected('Journey is restricted to the two admitted fixture roles')
        if adapter.store is None or adapter.store.root != job.store.root:
            raise admission.Rejected('Device captures must use the current protected job Store')
        registry = adapter.registry or pipeline.load_registry()
        if registry.store.root != job.store.root or registry.select(job.binding.project_id, job.binding.adapter_id) != job.binding:
            raise admission.Rejected('Device registry differs from the current job binding')
        job.binding.validate(job.store, clock())
        if any(hashlib.sha256(path.read_bytes()).hexdigest() != code_authority[key] for key, path in authority_paths.items()):
            raise admission.Rejected('Protected journey controller authority changed during observations')
        source = _fixture_source(job.binding, job.store)
        record = job.store.json(artifact_record)
        admission.context(record.get('context'), job.binding)
        if record.get('apk', {}).get('sha256') != job.artifact_sha256:
            raise admission.Rejected('Journey artifact differs from current stage subject')
        if not job.prior_receipts or adapter.artifact_security != job.prior_receipts[-1]:
            raise admission.Rejected('Device must use this run final artifact-security predecessor')
        bound = adapter.bind_installed(artifact_record)
        installed = {key: bound[key] for key in ('apkSha256', 'package', 'versionCode', 'certificateSha256')}
        expected_installed = {'apkSha256': job.artifact_sha256, 'package': PACKAGE,
                              'versionCode': job.binding.version_code, 'certificateSha256': job.binding.certificate_sha256}
        if installed != expected_installed: raise admission.Rejected('Installed identity differs from admitted job')
        retain('bind-installed', {'artifactRecord': artifact_record.json(), 'installed': bound})
        identity = adapter.facts()
        lease = retain('lease', identity)
        step = 'initial-offline-launch'; retain(step, adapter.launch_offline())
        capture(CASES[0], (0, 0))
        for control, case, expected in (('counter-a', CASES[1], (1, 0)),
                                        ('counter-a', CASES[2], (2, 0)),
                                        ('counter-b', CASES[3], (2, 1))):
            # A new capture immediately precedes each public guarded tap.
            before_values = (0, 0) if case == CASES[1] else (1, 0) if case == CASES[2] else (2, 0)
            ticket = capture(case + '-before-tap', before_values)
            step = case + '-tap'; retain(step, adapter.tap(ticket, control))
            capture(case, expected)
        journey = 'passed'
        step = 'force-stop'; retain(step, adapter.force_stop())
        step = 'reopen-offline-launch'; retain(step, adapter.launch_offline())
        capture(CASES[4], (2, 1))
        persistence = offline_launch = 'passed'
        for reference in evidence:
            job.store.verify(admission.Evidence.parse(reference), device.PNG_LIMIT)
        job.binding.validate(job.store, clock())
        if any(hashlib.sha256(path.read_bytes()).hexdigest() != code_authority[key] for key, path in authority_paths.items()):
            raise admission.Rejected('Protected journey controller authority changed during observations')
    except Exception as error:
        first_failure = {'step': step, 'type': type(error).__name__, 'reason': str(error)[:1200],
                         'notes': [str(note)[:800] for note in getattr(error, '__notes__', [])[:4]]}

    finished = clock()
    raw = job.store.write(directory + '/journey.json', {
        'schema': 'micro.android.fixture-journey/1', 'runId': job.run_id,
        'context': job.binding.context(), 'artifactRecord': artifact_record.json(),
        'sourceExport': source.json() if source else None,
        'fixtureComponentSha256': FIXTURE_COMPONENT_SHA256,
        **code_authority,
        'artifactSha256': job.artifact_sha256, 'suiteSha256': job.binding.identities['suite'].sha256,
        'role': adapter.role, 'leaseReceipt': lease.json() if lease else None,
        'startedAt': started, 'finishedAt': finished, 'events': events, 'firstFailure': first_failure,
        'status': 'failed' if first_failure else 'ui-observed-health-pending',
        'journey': journey, 'persistence': persistence, 'offlineLaunch': offline_launch,
        'health': {'status': 'unknown', 'crashCount': None, 'anrCount': None},
        'limitations': ['No actual crash/ANR authority connected', 'No recovery verdict',
                        'No automatic retry or device health inferred from screenshots or launch']})
    evidence.append(raw.json())
    report = job.store.write(directory + '/stage-observation.json', {
        'schema': 'micro.android.stage-observation/1', 'runId': job.run_id,
        'stage': pipeline.Stage.DEVICE.value, 'status': 'failed' if first_failure else 'pending',
        'context': job.binding.context(), 'startedAt': started, 'finishedAt': finished,
        'exitCode': None, 'signal': None, 'timeout': False, 'oom': False, 'resourceError': None,
        'cleanup': {'absent': True} if not first_failure else None,
        'artifactSha256': job.artifact_sha256,
        'details': {'installed': installed, 'leaseReceipt': lease.json() if lease else None,
                    'suiteSha256': job.binding.identities['suite'].sha256, 'journey': journey,
                    'persistence': persistence, 'offlineLaunch': offline_launch,
                    'crashCount': None, 'anrCount': None, 'evidence': evidence}})
    return pipeline.Observation(report)
