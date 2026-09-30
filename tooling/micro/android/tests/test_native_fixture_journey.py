"""Mock-only fixture journey checks. No ADB, emulator or native build runs.

Real Device public guards run against authored FAKE transport observations. UI
tests isolate the already-tested source admission boundary; the source gate also
has a separate real Store/hash test below. APK/security receipts remain FAKE.
"""
import hashlib
from dataclasses import replace
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4
from xml.sax.saxutils import quoteattr

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import admission
import device
import native_fixture_journey as journey
import pipeline
from test_android_device import MockDevice
from test_android_pipeline import SyntheticFixture


def fake_screen(a='0', b='0', *, sentinel=False, package=journey.PACKAGE,
                error=False, duplicate=False):
    """Authored observed text, independent of controller expectations."""
    nodes = [('title', 'Native factory fixture', '', False, '[0,0][128,20]'),
             ('value-counter-a', 'counter-a: '+a, '', False, '[0,20][128,40]'),
             ('value-counter-b', 'counter-b: '+b, '', False, '[0,40][128,60]'),
             ('write-counter-a', 'Write counter-a', 'Write counter-a', True, '[10,80][110,110]'),
             ('write-counter-b', 'Write counter-b', 'Write counter-b', True, '[10,120][110,150]'),
             ('write-sentinel', 'Write sentinel', 'Write sentinel', True, '[10,160][110,190]')]
    if sentinel: nodes.append(('value-sentinel', 'sentinel: 1', '', False, '[0,200][128,220]'))
    if error: nodes.append(('fixture-error', 'FAKE write failed', '', False, '[0,220][128,240]'))
    if duplicate: nodes.append(nodes[1])
    return ('<hierarchy>' + ''.join('<node '+ ' '.join(
        key+'='+quoteattr(value) for key, value in {
            'package': package, 'resource-id': resource, 'text': text,
            'content-desc': desc, 'class': 'android.view.View', 'enabled': 'true',
            'clickable': 'true' if clickable else 'false', 'bounds': bounds}.items())
        + '/>' for resource, text, desc, clickable, bounds in nodes) + '</hierarchy>').encode()


class ScriptedTransport(MockDevice):
    def __init__(self, fixture, role='factory-source'):
        super().__init__(fixture, role)
        self.xml = fake_screen()
        # Authored snapshots deliberately do not implement a counter algorithm.
        self.after_taps = [fake_screen('1', '0'), fake_screen('2', '0'), fake_screen('2', '1')]
        self.reopened = fake_screen('2', '1')
        self.launches = 0; self.tap_coordinates = []

    def transport(self, argv, timeout, maximum):
        result = super().transport(argv, timeout, maximum)
        args = argv[7:]
        if args == ('shell', 'am', 'start', '-W', '-n', self.spec.package+'/.MainActivity'):
            self.launches += 1
            if self.launches == 2: self.xml = self.reopened
        if args[:3] == ('shell', 'input', 'tap'):
            self.tap_coordinates.append(args[3:])
            if not self.after_taps: raise AssertionError('Unexpected retry or extra tap')
            self.xml = self.after_taps.pop(0)
        return result


class FixtureJourneyTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        self.fixture = SyntheticFixture(tmp.name)
        operations, _ = self.fixture.run()
        inspection = self.fixture.store.json(admission.Evidence.parse(operations['stages'][4]['receipt']))
        self.record = admission.Evidence.parse(inspection['details']['artifactRecord'])
        self.security = admission.Evidence.parse(operations['stages'][5]['receipt'])
        self.mock = ScriptedTransport(self.fixture)
        self.adapter = self.make_adapter()
        self.adapter.install(self.record)
        self.mock.calls.clear(); self.mock.mutations.clear()
        run_id = uuid4().hex
        self.fixture.store.path('runs/'+run_id).mkdir(parents=True, mode=0o700)
        self.job = pipeline.JobContext(self.fixture.binding, self.fixture.store, run_id,
                                      'runs/'+run_id, pipeline.Stage.DEVICE,
                                      (self.security,), self.fixture.signed.sha256)

    def make_adapter(self, role='factory-source'):
        return device.Device(role, backend=self.mock.backend(), registry=self.fixture.registry,
                             store=self.fixture.store, artifact_security=self.security)

    def run_ui(self, adapter=None, job=None, record=None):
        # Isolate UI policy, preserving all real Device artifact/security guards.
        with patch.object(journey, '_fixture_source', return_value=self.fixture.source_export):
            observation = journey.run_fixture_journey(adapter or self.adapter, job or self.job,
                                                       record or self.record)
        report = self.fixture.store.json(observation.report)
        raw = self.fixture.store.json(admission.Evidence.parse(report['details']['evidence'][-1]))
        return observation, report, raw

    def test_mock_ui_values_and_reopen_retained_but_health_unknown_stage_pending(self):
        observation, report, raw = self.run_ui()
        self.assertEqual(report['status'], 'pending')
        self.assertEqual(raw['status'], 'ui-observed-health-pending')
        self.assertIsNone(raw['firstFailure'])
        self.assertEqual((raw['journey'], raw['persistence'], raw['offlineLaunch']), ('passed', 'passed', 'passed'))
        self.assertEqual(raw['health'], {'status': 'unknown', 'crashCount': None, 'anrCount': None})
        self.assertEqual(self.mock.tap_coordinates, [('60','95'), ('60','95'), ('60','135')])
        self.assertEqual(self.mock.launches, 2)
        self.assertEqual(len([m for m in self.mock.mutations if m[:3] == ('shell','am','force-stop')]), 1)
        self.assertEqual(raw['context'], self.fixture.binding.context())
        self.assertEqual(raw['artifactRecord'], self.record.json())
        self.assertEqual(raw['suiteSha256'], self.fixture.binding.identities['suite'].sha256)
        self.assertEqual(raw['role'], 'factory-source')
        for reference in report['details']['evidence']:
            self.fixture.store.verify(admission.Evidence.parse(reference), device.PNG_LIMIT)
        events = [self.fixture.store.json(admission.Evidence.parse(ref)) for ref in raw['events']]
        assertions = [event for event in events if event['step'].endswith('-assertion')]
        self.assertEqual([e['observation']['observed'] for e in assertions][-1]['counterB'], 1)
        self.assertEqual(len([e for e in events if e['step'].endswith('-capture')]), 8)
        self.assertEqual(pipeline.validate_observation(observation, self.job, self.mock.now)['status'], 'pending')
        # Changing a normalized pending flag cannot turn unknown health into pass.
        report['status'] = 'passed'; report['exitCode'] = 0
        forged = pipeline.Observation(self.fixture.store.write(self.job.run_directory+'/FAKE-forged-pass.json', report))
        with self.assertRaisesRegex(admission.Rejected, 'Crash/ANR'):
            pipeline.validate_observation(forged, self.job, self.mock.now)

    def test_wrong_observed_total_fails_with_first_adverse_capture_no_retries(self):
        self.mock.after_taps[1] = fake_screen('7', '0')
        _, report, raw = self.run_ui()
        self.assertEqual(report['status'], 'failed')
        self.assertEqual(raw['firstFailure']['step'], 'counter-a-second-write')
        self.assertIn('independent expected totals', raw['firstFailure']['reason'])
        self.assertEqual(len(self.mock.tap_coordinates), 2)
        self.assertEqual(self.mock.launches, 1)
        self.assertTrue(raw['events'][-1]['path'].endswith('-counter-a-second-write-capture.json'))
        self.assertIsNone(report['details']['crashCount'])

    def test_reopen_loss_fails_even_successful_launch_and_screenshots(self):
        self.mock.reopened = fake_screen('0', '0')
        _, report, raw = self.run_ui()
        self.assertEqual(report['status'], 'failed')
        self.assertEqual(raw['journey'], 'passed')
        self.assertEqual(raw['persistence'], 'unknown')
        self.assertEqual(raw['firstFailure']['step'], 'durable-offline-reopen')
        self.assertEqual(self.mock.launches, 2)
        self.assertEqual(len(self.mock.tap_coordinates), 3)

    def test_dirty_initial_counter_sentinel_error_or_wrong_package_block_writes(self):
        for data in (fake_screen('1','0'), fake_screen(sentinel=True), fake_screen(error=True),
                     fake_screen(duplicate=True), fake_screen(package='app.wrong.fixture')):
            with self.subTest(data=data):
                self.mock.xml = data; self.mock.tap_coordinates.clear()
                _, report, raw = self.run_ui()
                self.assertEqual(report['status'], 'failed')
                self.assertEqual(raw['firstFailure']['step'], 'empty-counter-store')
                self.assertEqual(self.mock.tap_coordinates, [])

    def test_stale_fresh_capture_fails_without_ticket_retry(self):
        original = self.adapter.capture
        def expired(label):
            ticket = original(label); self.mock.now += device.MAX_FRESH_SECONDS + 1
            return ticket
        with patch.object(self.adapter, 'capture', side_effect=expired) as capture:
            _, report, raw = self.run_ui()
        self.assertEqual(report['status'], 'failed')
        self.assertIn('calibration required', raw['firstFailure']['reason'])
        self.assertEqual(capture.call_count, 1)
        self.assertEqual(self.mock.tap_coordinates, [])

    def test_boolean_capture_cannot_replace_observed_ui(self):
        with patch.object(self.adapter, 'capture', return_value=True):
            _, report, raw = self.run_ui()
        self.assertEqual(report['status'], 'failed')
        self.assertIn('typed device capture', raw['firstFailure']['reason'])
        self.assertEqual(self.mock.tap_coordinates, [])

    def test_oversized_transport_and_capture_cleanup_failure_are_retained(self):
        for kind in ('oversized', 'cleanup'):
            with self.subTest(kind=kind):
                self.mock.xml = b'x' * (device.XML_LIMIT+1) if kind == 'oversized' else fake_screen()
                self.mock.cleanup_ok = kind != 'cleanup'
                _, report, raw = self.run_ui()
                self.assertEqual(report['status'], 'failed')
                self.assertEqual(raw['firstFailure']['step'], 'empty-counter-store')
                self.assertEqual(self.mock.tap_coordinates, [])
                self.assertIsNone(report['cleanup'])

    def test_wrong_role_store_artifact_or_predecessor_refused_before_journey(self):
        for kind in ('role', 'store', 'artifact', 'security'):
            adapter = self.make_adapter('budget-v3' if kind == 'role' else 'factory-source')
            job = self.job
            if kind == 'store': adapter.store = None
            if kind == 'artifact': job = replace(job, artifact_sha256='b'*64)
            if kind == 'security': adapter.artifact_security = None
            self.mock.calls.clear(); self.mock.mutations.clear()
            _, report, raw = self.run_ui(adapter=adapter, job=job)
            self.assertEqual(report['status'], 'failed')
            self.assertEqual(raw['firstFailure']['step'], 'admission')
            self.assertEqual(self.mock.calls, [])

    def test_both_fixed_fixture_roles_supported_and_repeated_runs_append(self):
        _, first, _ = self.run_ui()
        self.mock = ScriptedTransport(self.fixture, 'factory-target')
        self.adapter = self.make_adapter('factory-target')
        self.adapter.install(self.record)
        _, second, raw = self.run_ui()
        self.assertEqual(second['status'], 'pending')
        self.assertEqual(raw['role'], 'factory-target')
        self.assertNotEqual(first['details']['evidence'][-1]['path'], second['details']['evidence'][-1]['path'])
        self.fixture.store.verify(admission.Evidence.parse(first['details']['evidence'][-1]))

    def test_scope_rejects_other_stage_or_non_supervisor_path_without_device_calls(self):
        self.mock.calls.clear()
        for job in (replace(self.job, stage=pipeline.Stage.RECOVERY),
                    replace(self.job, run_directory='../outside')):
            with self.assertRaises(admission.Rejected): journey.run_fixture_journey(self.adapter, job, self.record)
        self.assertEqual(self.mock.calls, [])

    def test_source_gate_independently_requires_actual_seven_file_manifest_and_component_hash(self):
        # Actual public committed fixture bytes, copied into an isolated FAKE
        # administrative Store. This is source validation, not native proof.
        root = Path(journey.__file__).with_name('fixtures')/'native-smoke'
        tree = self.fixture.fake_tree('FAKE-journey-source', {name: (root/name).read_bytes() for name in journey.SOURCE_FILES})
        tree['files'].sort(key=lambda row: Path(row['path']))
        tree['manifestSha256'] = hashlib.sha256(admission.canonical(tree['files'])).hexdigest()
        export = self.fixture.store.json(self.fixture.source_export)
        # Its lock evidence must refer to the exact copied lock in this tree.
        lock = self.fixture.store.describe(tree['path']+'/package-lock.json')
        identities = dict(self.fixture.binding.identities, sourceLock=lock)
        export.update(tree=tree, sourceLock=lock.json())
        reference = self.fixture.put(export)
        adapter = self.fixture.store.json(identities['adapter']); adapter['sourceExport'] = reference.json()
        identities['adapter'] = self.fixture.put(adapter)
        binding = replace(self.fixture.binding, identities=identities)
        self.assertEqual(journey._fixture_source(binding, self.fixture.store), reference)
        # A changed component is independently hashed, then pinned in a reviewed
        # export: the journey still refuses the different fixture behavior.
        changed_tree = self.fixture.fake_tree('FAKE-changed-source', {
            name: b'FAKE changed component' if name == 'app/index.tsx' else (root/name).read_bytes()
            for name in journey.SOURCE_FILES})
        changed_tree['files'].sort(key=lambda row: Path(row['path']))
        changed_tree['manifestSha256'] = hashlib.sha256(admission.canonical(changed_tree['files'])).hexdigest()
        changed_lock = self.fixture.store.describe(changed_tree['path']+'/package-lock.json')
        export.update(tree=changed_tree, sourceLock=changed_lock.json())
        changed_export = self.fixture.put(export); adapter['sourceExport'] = changed_export.json()
        changed_ids = dict(identities, adapter=self.fixture.put(adapter), sourceLock=changed_lock)
        with self.assertRaisesRegex(admission.Rejected, 'seven-file fixture'):
            journey._fixture_source(replace(binding, identities=changed_ids), self.fixture.store)


if __name__ == '__main__': unittest.main()
