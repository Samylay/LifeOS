"""Policy negatives. Actual scanner demonstrations live in controller receipts."""
import copy
import hashlib
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock
import subprocess
from types import SimpleNamespace

MODULE = Path(__file__).resolve().parents[1] / 'security_native.py'
spec = importlib.util.spec_from_file_location('security_native', MODULE)
security = importlib.util.module_from_spec(spec); spec.loader.exec_module(security)


class SecurityPolicyTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.checksum = 'a' * 64
        self.status = {'valid': True, 'built': self.now.isoformat(), 'checksum': 'sha256:' + self.checksum}
        self.files = [{'path': '6/vulnerability.db', 'bytes': 100, 'sha256': self.checksum}]
        self.database = security.validate_database(self.status, self.files, self.now)
        self.tools = {n: {'exitCode': 0, 'binarySha256': p['binarySha256'], 'versionOutput': 'Version: ' + p['version']}
                      for n, p in security.POLICY['tools'].items()}
        component = {'name': 'fixture', 'version': '1.0.0', 'purl': 'pkg:npm/fixture@1.0.0',
                     'properties': [{'name': 'micro:inventory-provenance', 'value': 'trusted-complete-npm-lock'},
                                    {'name': 'micro:packaged-presence', 'value': 'unknown'}]}
        inventory = {'schema': 'micro.native-build-input-inventory/1', 'lockSha256': self.checksum,
                     'lockEntries': [{'name': 'fixture', 'version': '1.0.0', 'lockPath': 'node_modules/fixture',
                                      'dev': False, 'optional': True, 'devOptional': False,
                                      'classification': 'runtime-input', 'packagedPresence': 'unknown'}],
                     'lockedEntryCount': 1, 'lockedUniqueComponentCount': 1, 'missingBefore': [], 'missingAfter': [],
                     'maven': {'status': 'pending', 'files': [], 'entries': []}}
        self.worker = {'tools': self.tools, 'databaseBefore': self.status, 'databaseAfter': self.status,
                       'commands': [{'binary': n, 'args': ['sbom:/tmp/sbom.cdx.json'] if n == 'grype' else ['dir'], 'exitCode': 0} for n in ('gitleaks', 'syft', 'grype')],
                       'reports': {'secrets.json': [], 'sbom.cdx.json': {'bomFormat': 'CycloneDX', 'components': [component]},
                                   'syft.sbom.cdx.json': {'bomFormat': 'CycloneDX', 'components': []},
                                   'trusted.inventory.json': inventory,
                                   'vulnerabilities.json': {'matches': [], 'descriptor': {'db': {'status': self.status}}}}}

    def rejects(self, action, text):
        with self.assertRaisesRegex(ValueError, text): action()

    def test_fresh_database_and_clean_scan_pass(self):
        self.assertEqual(security.validate_scan(self.worker, self.database)['verdict'], 'pass')

    def test_missing_database_fails(self):
        self.rejects(lambda: security.validate_database({'valid': False}, [], self.now), 'missing/corrupt')

    def test_stale_and_future_database_fail(self):
        for delta in (timedelta(days=5, seconds=1), timedelta(seconds=-301)):
            status = dict(self.status, built=(self.now - delta).isoformat())
            self.rejects(lambda: security.validate_database(status, self.files, self.now), 'stale/future')

    def test_exact_maximum_age_accepted(self):
        status = dict(self.status, built=(self.now - timedelta(seconds=432000)).isoformat())
        self.assertEqual(security.validate_database(status, self.files, self.now)['ageSeconds'], 432000)

    def test_corrupt_and_wrong_checksum_fail(self):
        self.rejects(lambda: security.validate_database(dict(self.status, error='corrupt'), self.files), 'corrupt')
        self.rejects(lambda: security.validate_database(dict(self.status, checksum='sha256:' + 'b' * 64), self.files), 'checksum')
        self.rejects(lambda: security.validate_database(self.status, []), 'file missing')

    def test_missing_creation_date_or_timezone_fails(self):
        for built in (None, '2026-09-30T00:00:00'):
            self.rejects(lambda: security.validate_database(dict(self.status, built=built), self.files), 'creation time')

    def test_binary_or_version_tamper_fails(self):
        for field in ('binarySha256', 'versionOutput'):
            tools = copy.deepcopy(self.tools); tools['grype'][field] = 'changed'
            self.rejects(lambda: security.validate_tools(tools), 'mismatch')

    def test_missing_report_and_crashed_scanner_fail(self):
        worker = copy.deepcopy(self.worker); del worker['reports']['vulnerabilities.json']
        self.rejects(lambda: security.validate_scan(worker, self.database), 'incomplete')
        worker = copy.deepcopy(self.worker); worker['commands'][2]['exitCode'] = None
        self.rejects(lambda: security.validate_scan(worker, self.database), 'crash')

    def test_low_findings_retained_and_high_critical_block(self):
        for severity, verdict, code in [('Low', 'pass', 0), ('High', 'blocked', 2), ('Critical', 'blocked', 2)]:
            worker = copy.deepcopy(self.worker)
            worker['reports']['vulnerabilities.json']['matches'] = [{'vulnerability': {'severity': severity}}]
            worker['commands'][2]['exitCode'] = code
            value = security.validate_scan(worker, self.database)
            self.assertEqual(value['verdict'], verdict); self.assertEqual(value['totalVulnerabilityCount'], 1)

    def test_secret_blocks_and_exit_disagreement_fails(self):
        worker = copy.deepcopy(self.worker); worker['reports']['secrets.json'] = [{'Secret': 'REDACTED'}]
        worker['commands'][0]['exitCode'] = 1
        self.assertEqual(security.validate_scan(worker, self.database)['verdict'], 'blocked')
        worker['commands'][0]['exitCode'] = 0
        self.rejects(lambda: security.validate_scan(worker, self.database), 'disagreement')

    def test_report_database_identity_and_usage_required(self):
        worker = copy.deepcopy(self.worker); worker['databaseAfter'] = dict(self.status, checksum='changed')
        self.rejects(lambda: security.validate_scan(worker, self.database), 'wrong/missing')
        worker = copy.deepcopy(self.worker)
        worker['reports']['vulnerabilities.json']['descriptor']['db']['status'] = dict(self.status, checksum='changed')
        self.rejects(lambda: security.validate_scan(worker, self.database), 'identity')

    def test_complete_locked_inventory_hash_identity_flags_and_provenance_are_required(self):
        self.rejects(lambda: security.validate_scan(self.worker, self.database, 'b'*64), 'lock hash mismatch')
        for mutation, expected in [
            (lambda w: w['reports']['sbom.cdx.json']['components'].clear(), 'omission'),
            (lambda w: w['reports']['sbom.cdx.json']['components'][0].update(purl='pkg:npm/wrong@1.0.0'), 'omission'),
            (lambda w: w['reports']['trusted.inventory.json']['lockEntries'][0].update(classification='build-only'), 'classification'),
            (lambda w: w['reports']['sbom.cdx.json']['components'][0]['properties'].clear(), 'provenance'),
            (lambda w: w['commands'][2].update(args=['sbom:/tmp/syft.sbom.cdx.json']), 'wrong vulnerability inventory'),
        ]:
            worker = copy.deepcopy(self.worker); mutation(worker)
            with self.subTest(expected=expected): self.rejects(lambda: security.validate_scan(worker, self.database), expected)

    def test_maven_manifest_binding_and_missing_scanned_component_fail(self):
        self.rejects(lambda: security.validate_scan(self.worker, self.database, expected_maven_files=[{'path':'different'}]), 'Maven graph hashes')
        worker = copy.deepcopy(self.worker)
        worker['reports']['trusted.inventory.json']['maven'].update(status='resolved-inputs-scanned', entries=[{'purl':'pkg:maven/org.example/fixture@1.0.0'}])
        self.rejects(lambda: security.validate_scan(worker, self.database), 'Maven inventory omission')

    def test_source_inventory_classifies_without_claiming_package_presence(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, 'package-lock.json').write_text(json.dumps({'packages': {
                '': {'name': 'app'}, 'node_modules/react': {'version': '19.2.3'},
                'node_modules/typescript': {'version': '6.0.3', 'dev': True}}}))
            report = security.source_coverage(tmp)
            self.assertEqual([x['classification'] for x in report['components']], ['runtime-input', 'build-only'])
            self.assertEqual({x['packagedPresence'] for x in report['components']}, {'unknown'})

    def test_symlink_source_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, 'link').symlink_to('/etc/passwd')
            self.rejects(lambda: security.tree_manifest(tmp), 'symlink')

    def test_maven_inventory_missing_and_invalid_coordinates_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.rejects(lambda: security.maven_coverage(tmp), 'missing')
            path = Path(tmp, 'runtime.json')
            path.write_text(json.dumps({'build': 'main', 'scope': 'project', 'configuration': 'releaseRuntimeClasspath',
                                        'components': [{'group': 'androidx.core', 'module': 'core', 'version': '1.16.0'}]}))
            component = security.maven_coverage(tmp)['components'][0]
            self.assertEqual(component['classification'], 'runtime-input'); self.assertEqual(component['packagedPresence'], 'unknown')
            path.write_text(json.dumps({'build': 'main', 'scope': 'project', 'configuration': 'runtime', 'components': [{'group': '../escape', 'module': 'x', 'version': '1'}]}))
            self.rejects(lambda: security.maven_coverage(tmp), 'identity')


class MavenGraphBudgetTests(unittest.TestCase):
    """Synthetic FAKE graph observations test policy, not actual native closure."""
    coordinate = {'group': 'org.fake', 'module': 'fixture', 'version': '1.0.0'}

    def graph(self, **changes):
        return {'build': '/FAKE/fixture/android', 'project': ':app', 'scope': 'project',
                'configuration': 'releaseRuntimeClasspath', 'components': [self.coordinate], **changes}

    def write(self, directory, name='graph.json', **changes):
        raw = json.dumps(self.graph(**changes), separators=(',', ':')).encode()
        Path(directory, name).write_bytes(raw)
        return raw

    def test_1528_raw_graphs_retain_all_23870_rows_projects_scopes_and_hashes(self):
        with tempfile.TemporaryDirectory() as tmp:
            expected = {}
            for index in range(1528):
                name = f'graph-{index:04d}.json'
                project = '<settings>' if index % 4 == 0 else f':FAKE-module-{index}'
                scope = 'settings-buildscript' if index % 4 == 0 else 'project'
                raw = self.write(tmp, name, project=project, scope=scope,
                                 components=[self.coordinate] * (16 if index < 950 else 15))
                expected[name] = (raw, project, scope)
            report = security.maven_coverage(tmp)
            self.assertEqual(len(report['graphFiles']), 1528)
            self.assertEqual(len(report['components']), 23870)
            self.assertEqual(report['graphFiles'], [
                {'path': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
                for name, (raw, _, _) in sorted(expected.items())])
            for entry in report['components']:
                raw, project, scope = expected[entry['graphPath']]
                self.assertEqual((entry['project'], entry['scope']), (project, scope))
                self.assertEqual(entry['graphSha256'], hashlib.sha256(raw).hexdigest())
                self.assertEqual(entry['receiptSha256'], entry['graphSha256'])
                self.assertEqual(entry['classification'], 'build-only' if 'buildscript' in scope else 'runtime-input')
                self.assertEqual(entry['packagedPresence'], 'unknown')
            self.assertTrue(any('separate review' in limit for limit in report['limits']))

    def test_2048_graph_count_boundary_and_2049_rejection(self):
        with tempfile.TemporaryDirectory() as tmp:
            for index in range(2048): self.write(tmp, f'graph-{index:04d}.json')
            self.assertEqual(len(security.maven_coverage(tmp)['graphFiles']), 2048)
            self.write(tmp, 'graph-2048.json')
            with self.assertRaisesRegex(ValueError, 'file budget'): security.maven_coverage(tmp)

    def test_project_scope_identity_is_never_inferred_or_collapsed(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.write(tmp, 'one.json', project=':one')
            self.write(tmp, 'two.json', project=':two')
            self.write(tmp, 'settings.json', project='<settings>', scope='settings-buildscript')
            legacy = self.graph(); del legacy['project']
            Path(tmp, 'legacy.json').write_text(json.dumps(legacy))
            self.write(tmp, 'buildscript.json', scope='project-buildscript', configuration='buildscriptRuntimeClasspath')
            self.write(tmp, 'nonruntime.json', configuration='compileClasspath')
            rows = {row['graphPath']: row for row in security.maven_coverage(tmp)['components']}
            self.assertEqual([rows[n]['project'] for n in ('one.json', 'two.json', 'settings.json', 'legacy.json')],
                             [':one', ':two', '<settings>', 'unknown'])
            self.assertEqual(rows['buildscript.json']['classification'], 'build-only')
            self.assertEqual(rows['nonruntime.json']['classification'], 'unknown')

    def test_supplied_malformed_projects_and_graph_schema_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            for project in (None, 7, {}, [], '', '   ', 'x' * 1025, 'é' * 513, '\ud800'):
                with self.subTest(project=repr(project)):
                    self.write(tmp, project=project)
                    with self.assertRaisesRegex(ValueError, 'project identity'): security.maven_coverage(tmp)
            self.write(tmp, project='é' * 512)
            self.assertEqual(security.maven_coverage(tmp)['components'][0]['project'], 'é' * 512)
            for key in ('build', 'scope', 'configuration', 'components'):
                value = self.graph(); del value[key]
                Path(tmp, 'graph.json').write_text(json.dumps(value))
                with self.subTest(missing=key), self.assertRaisesRegex(ValueError, 'schema'): security.maven_coverage(tmp)
            for version in ('latest.release', 'unspecified', '1.+'):
                self.write(tmp, components=[dict(self.coordinate, version=version)])
                with self.assertRaisesRegex(ValueError, 'identity'): security.maven_coverage(tmp)

    def test_duplicate_manifest_names_and_unrecognized_directory_entries_fail(self):
        item = {'path': 'FAKE.json', 'bytes': 1, 'sha256': 'a' * 64}
        with self.assertRaisesRegex(ValueError, 'duplicate'): security.validate_maven_files([item, dict(item)])
        with tempfile.TemporaryDirectory() as tmp:
            self.write(tmp)
            Path(tmp, 'ignored.txt').write_text('FAKE omitted input')
            with self.assertRaisesRegex(ValueError, 'file invalid'): security.maven_coverage(tmp)
            Path(tmp, 'ignored.txt').unlink(); Path(tmp, 'nested').mkdir()
            with self.assertRaisesRegex(ValueError, 'file invalid'): security.maven_coverage(tmp)

    def test_real_graph_byte_limits_are_inclusive_and_unchanged(self):
        self.assertEqual((security.MAVEN_LIMITS['graphBytes'], security.MAVEN_LIMITS['totalBytes']), (8*1024**2, 64*1024**2))
        with tempfile.TemporaryDirectory() as tmp:
            raw = json.dumps(self.graph(components=[])).encode()
            padded = raw + b' ' * (8*1024**2 - len(raw))
            Path(tmp, 'one.json').write_bytes(padded)
            self.assertEqual(security.maven_coverage(tmp)['graphFiles'][0]['bytes'], 8*1024**2)
            Path(tmp, 'one.json').write_bytes(padded + b' ')
            with self.assertRaisesRegex(ValueError, 'file invalid'): security.maven_coverage(tmp)
            Path(tmp, 'one.json').unlink()
            for index in range(8): Path(tmp, f'graph-{index}.json').write_bytes(padded)
            self.assertEqual(sum(item['bytes'] for item in security.maven_coverage(tmp)['graphFiles']), 64*1024**2)
            self.write(tmp, 'overflow.json', components=[])
            with self.assertRaisesRegex(ValueError, 'total byte budget'): security.maven_coverage(tmp)

    def test_100000_component_boundary_and_overflow_remain_enforced(self):
        self.assertEqual(security.MAVEN_LIMITS['componentCount'], 100000)
        with tempfile.TemporaryDirectory() as tmp:
            self.write(tmp, components=[self.coordinate] * 100000)
            self.assertEqual(len(security.maven_coverage(tmp)['components']), 100000)
            self.write(tmp, components=[self.coordinate] * 100001)
            with self.assertRaisesRegex(ValueError, 'component count budget'): security.maven_coverage(tmp)


class CleanupBoundaryTests(unittest.TestCase):
    container = 'b' * 64
    owner = 'a' * 32
    name = 'micro-native-security-' + owner

    def result(self, code=0, stdout='', stderr=''):
        return subprocess.CompletedProcess([], code, stdout, stderr)

    def inspected(self, owner=None):
        return {'Id': self.container, 'Name': '/' + self.name,
                'Config': {'Labels': {security.OWNER_LABEL: owner or self.owner}}, 'State': {'Running': True}}

    def test_daemon_failure_never_proves_absence_even_with_empty_list(self):
        with patch.object(security.subprocess, 'run', side_effect=[
                self.result(1, stderr='Cannot connect to Docker daemon'), self.result()]) as run:
            proof = security.prove_absence(self.container, self.name, self.owner)
        self.assertFalse(proof['absent']); self.assertEqual(len(run.call_args_list), 2)

    def test_no_such_object_requires_successful_scoped_empty_list(self):
        missing = self.result(1, stderr='Error: No such object: ' + self.container)
        for listed, expected in [(self.result(), True), (self.result(1), False), (self.result(stdout=self.container), False)]:
            with patch.object(security.subprocess, 'run', side_effect=[missing, listed]) as run:
                proof = security.prove_absence(self.container, self.name, self.owner)
            self.assertEqual(proof['absent'], expected)
            self.assertIn('name=^/' + self.name + '$', run.call_args_list[1].args[0])
            self.assertIn('label=' + security.OWNER_LABEL + '=' + self.owner, run.call_args_list[1].args[0])

    def test_foreign_owner_prevents_kill_and_removal(self):
        with patch.object(security.subprocess, 'run', return_value=self.result(stdout=json.dumps([self.inspected('foreign')]))) as run:
            result = security.cleanup_owned(self.container, self.name, self.owner)
        self.assertFalse(result['absent']); self.assertIn('label mismatch', result['errors'][0]['message'])
        self.assertEqual(len(run.call_args_list), 1)

    def test_create_timeout_recovers_only_exact_owned_name_and_id(self):
        observed = self.result(stdout=json.dumps([self.inspected()]))
        with patch.object(security.subprocess, 'run', side_effect=[observed, self.result(), observed, self.result(),
                self.result(1, stderr='Error: No such object: ' + self.container), self.result()]) as run:
            result = security.cleanup_owned(None, self.name, self.owner)
        self.assertTrue(result['absent']); self.assertEqual(result['containerId'], self.container)
        self.assertEqual(run.call_args_list[0].args[0], ['docker', 'inspect', self.name])
        self.assertEqual(run.call_args_list[1].args[0], ['docker', 'kill', self.container])
        self.assertEqual(run.call_args_list[3].args[0], ['docker', 'rm', '-f', self.container])

    def test_run_create_timeout_persists_first_failure_and_recovers_owned_container(self):
        with tempfile.TemporaryDirectory() as tmp:
            supervisor = object.__new__(security.Supervisor); supervisor.state = Path(tmp)
            def check(args, **_):
                if args[:3] == ['docker', 'ps', '-q']: return ''
                if args[:2] == ['docker', 'create']: raise subprocess.TimeoutExpired(args, 30, output=b'create diagnostic prefix', stderr=b'create timeout diagnostic')
                raise AssertionError(args)
            observed = self.result(stdout=json.dumps([self.inspected()]))
            with patch.object(security, 'authority', return_value={}), \
                 patch.object(security, 'available_memory', return_value=3 * 1024**3), \
                 patch.object(security.uuid, 'uuid4', return_value=SimpleNamespace(hex=self.owner)), \
                 patch.object(security.subprocess, 'check_output', side_effect=check), \
                 patch.object(security.subprocess, 'run', side_effect=[observed, self.result(), observed, self.result(),
                     self.result(1, stderr='Error: No such object: ' + self.container), self.result()]) as run:
                with self.assertRaisesRegex(ValueError, 'job failed'): supervisor.run('create-timeout-test', 'probe')
            receipt = json.loads(Path(tmp, 'create-timeout-test/receipt.json').read_text())
            self.assertEqual(receipt['failure']['type'], 'TimeoutExpired')
            self.assertEqual(receipt['recoveredContainerId'], self.container)
            self.assertTrue(receipt['cleanup']['absent']); self.assertEqual(receipt['cleanup']['errors'], [])
            self.assertEqual(Path(tmp, 'create-timeout-test/stdout.json').read_bytes(), b'create diagnostic prefix')
            self.assertEqual(Path(tmp, 'create-timeout-test/stderr.log').read_bytes(), b'create timeout diagnostic')
            self.assertEqual(run.call_args_list[0].args[0], ['docker', 'inspect', self.name])

    def test_output_budget_prefix_and_first_failure_survive_cleanup_daemon_error(self):
        class Selector:
            def __init__(self): self.mapping = {}
            def register(self, stream, _): self.mapping[stream] = SimpleNamespace(fileobj=stream)
            def get_map(self): return self.mapping
            def select(self, _): return [(next(iter(self.mapping.values())), None)]
            def close(self): pass

        with tempfile.TemporaryDirectory() as tmp:
            supervisor = object.__new__(security.Supervisor); supervisor.state = Path(tmp)
            process = MagicMock(); process.poll.return_value = 0
            def check(args, **_):
                if args[:3] == ['docker', 'ps', '-q']: return ''
                if args[:2] == ['docker', 'create']: return self.container
                if args[:2] == ['docker', 'inspect']: return json.dumps([self.inspected()])
                raise AssertionError(args)
            policy = dict(security.POLICY, outputBytes=4)
            with patch.object(security, 'POLICY', policy), patch.object(security, 'authority', return_value={}), \
                 patch.object(security, 'available_memory', return_value=3 * 1024**3), \
                 patch.object(security.uuid, 'uuid4', return_value=SimpleNamespace(hex=self.owner)), \
                 patch.object(security, 'validate_sandbox'), patch.object(security.subprocess, 'check_output', side_effect=check), \
                 patch.object(security.subprocess, 'Popen', return_value=process), \
                 patch.object(security.selectors, 'DefaultSelector', Selector), patch.object(security.os, 'read', return_value=b'bounded diagnostic'), \
                 patch.object(security.subprocess, 'run', side_effect=[self.result(1, stderr='daemon unavailable'),
                     self.result(1, stderr='daemon unavailable'), self.result(1, stderr='daemon unavailable')]):
                with self.assertRaisesRegex(ValueError, 'job failed'): supervisor.run('budget-test', 'probe')
            receipt = json.loads(Path(tmp, 'budget-test/receipt.json').read_text())
            self.assertEqual(receipt['failure']['message'], 'scanner output budget')
            self.assertFalse(receipt['cleanup']['absent']); self.assertTrue(receipt['cleanup']['errors'])
            self.assertEqual(Path(tmp, 'budget-test/stdout.json').read_bytes(), b'boun')
            self.assertEqual(receipt['capturedOutput']['stdoutBytes'], 4)


if __name__ == '__main__': unittest.main()
