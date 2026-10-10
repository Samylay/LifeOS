"""Real local Git export tests in synthetic temporary repositories only.

No actual fixture is exported/admitted, no native/scanner/device/network runs.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import admission as a
import source_export as exporter


class SourceExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); self.repo = self.root/'repo'; self.repo.mkdir(mode=0o700)
        self.state = self.root/'state'; self.state.mkdir(mode=0o700); self.store = a.Store(self.state)
        self.fixture = self.repo/exporter.SUBTREE; self.fixture.mkdir(parents=True)
        self.lock = b'{"name":"FAKE-fixture","lockfileVersion":3,"packages":{}}\n'
        for name in exporter.REQUIRED:
            path = self.fixture/name; path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(self.lock if name == 'package-lock.json' else ('FAKE synthetic '+name+'\n').encode())
        self.git('init', '-b', 'main'); self.git('config', 'user.name', 'FAKE controller test')
        self.git('config', 'user.email', 'fake-fixture@example.invalid')
        self.git('add', '.'); self.git('commit', '-m', 'FAKE fixture initial snapshot')
        self.sha = self.git('rev-parse', 'HEAD').decode().strip()

    def git(self, *args):
        return subprocess.run(['/usr/bin/git', '-C', str(self.repo), *args], check=True,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C', 'GIT_CONFIG_NOSYSTEM':'1',
                                   'GIT_CONFIG_GLOBAL':'/dev/null'}, timeout=10).stdout

    def checkpoint(self):
        self.git('add', '.'); self.git('commit', '-m', 'FAKE changed fixture snapshot')
        return self.git('rev-parse', 'HEAD').decode().strip()

    def export(self, **kwargs):
        return exporter.export_fixture(self.repo, kwargs.pop('commit', self.sha), store=self.store,
                       expected_lock_sha256=kwargs.pop('lock_sha', hashlib.sha256(self.lock).hexdigest()),
                       expected_lock_bytes=kwargs.pop('lock_bytes', len(self.lock)), **kwargs)

    def failed_receipt(self):
        paths = list(self.state.glob('source-exports/*/raw.json'))
        self.assertTrue(paths)
        receipt = self.store.json(self.store.describe(paths[-1].relative_to(self.state).as_posix()))
        self.assertEqual(receipt['status'], 'failed'); self.assertTrue(receipt['failure'])
        for command in receipt['commands']:
            self.store.verify(a.Evidence.parse(command['stdout']), exporter.SOURCE_BYTES)
            self.store.verify(a.Evidence.parse(command['stderr']), exporter.LOG_BYTES)
        return receipt

    def test_actual_git_output_cap_is_enforced_before_persisting_excess_bytes(self):
        directory = 'FAKE-bounded-git'; self.store.path(directory).mkdir(mode=0o700)
        git = exporter._Git(self.repo, self.store, directory)
        with self.assertRaisesRegex(a.Rejected, 'exceeded its bound'):
            git.run(['ls-tree', '-rz', self.sha+':'+exporter.SUBTREE], maximum=10)
        command = git.commands[0]
        self.assertEqual(command['limitFailure'], 'output-bytes')
        self.assertEqual(command['stdout']['bytes'], 10)
        self.store.verify(a.Evidence.parse(command['stdout']), 10)
        self.assertLessEqual(command['stderr']['bytes'], exporter.LOG_BYTES)

    def test_actual_git_clean_fixture_archive_exact_blobs_and_closed_export_manifest(self):
        result = self.export(); raw = self.store.json(result.raw_receipt)
        self.assertEqual(raw['status'], 'exported'); self.assertIsNone(raw['failure'])
        self.assertGreaterEqual(len(raw['commands']), 11)
        for command in raw['commands']:
            self.assertEqual(command['exitCode'], 0); self.assertFalse(command['timeout'])
            self.assertIsNone(command['limitFailure']); self.assertEqual(command['argv'][0], '/usr/bin/git')
        manifest = self.store.json(result.manifest)
        a.exact(manifest, {'schema','sourceSha','sourceArchiveSha256','sourceLock','exporterSha256','tree'}, 'source export')
        self.assertEqual(manifest['sourceSha'], self.sha)
        self.assertEqual(manifest['sourceArchiveSha256'], result.archive.sha256)
        self.assertEqual(manifest['sourceLock'], result.lock.json())
        self.assertEqual(result.lock.sha256, hashlib.sha256(self.lock).hexdigest())
        self.assertEqual({row['path'] for row in a.validate_tree(manifest['tree'], self.store)}, exporter.REQUIRED)
        with tarfile.open(fileobj=io.BytesIO(self.store.read(result.archive, exporter.SOURCE_BYTES)), mode='r:') as tar:
            self.assertEqual({member.name[len(exporter.SUBTREE)+1:] for member in tar if member.isfile()}, exporter.REQUIRED)
        self.assertEqual(result.exporter_sha256, exporter.exporter_sha256())

    def test_unrelated_tracked_and_untracked_changes_survive_and_are_never_archived(self):
        outside = self.repo/'FAKE-outside.txt'; outside.write_bytes(b'FAKE initial outside')
        self.sha = self.checkpoint(); outside.write_bytes(b'FAKE unrelated dirty')
        untracked = self.repo/'FAKE-untracked.txt'; untracked.write_bytes(b'FAKE unrelated untracked')
        result = self.export()
        self.assertEqual(outside.read_bytes(), b'FAKE unrelated dirty')
        self.assertEqual(untracked.read_bytes(), b'FAKE unrelated untracked')
        self.assertNotIn(b'FAKE unrelated dirty', self.store.read(result.archive, exporter.SOURCE_BYTES))
        self.assertNotIn(b'FAKE unrelated untracked', self.store.read(result.archive, exporter.SOURCE_BYTES))

    def test_dirty_tracked_untracked_and_ignored_fixture_files_retain_failed_receipts(self):
        for kind in ('tracked', 'untracked', 'ignored'):
            with self.subTest(kind=kind):
                if kind == 'tracked':
                    path = self.fixture/'app/index.tsx'; original = path.read_bytes(); path.write_bytes(b'FAKE dirty tracked')
                elif kind == 'untracked': path = self.fixture/'FAKE-untracked'; path.write_bytes(b'FAKE dirty untracked')
                else:
                    ignore = self.repo/'.git/info/exclude'; ignore.write_text(exporter.SUBTREE+'/FAKE-ignored\n')
                    path = self.fixture/'FAKE-ignored'; path.write_bytes(b'FAKE ignored dirty')
                with self.assertRaisesRegex(a.Rejected, 'dirty, untracked or ignored'): self.export()
                self.failed_receipt()
                if kind == 'tracked': path.write_bytes(original)
                else: path.unlink()

    def test_old_commit_with_changed_fixture_and_wrong_commit_are_rejected(self):
        (self.fixture/'app/index.tsx').write_bytes(b'FAKE different committed subtree')
        new = self.checkpoint()
        with self.assertRaises(a.Rejected): self.export(commit=self.sha)
        self.failed_receipt()
        # Exact new selected commit works; unrelated historical identities do not.
        self.assertEqual(self.export(commit=new).source_sha, new)
        for commit in ('HEAD', 'f'*40):
            with self.assertRaises(a.Rejected): self.export(commit=commit)
            self.failed_receipt()

    def test_wrong_operator_lock_hash_or_byte_count_blocks_real_export(self):
        for kwargs in ({'lock_sha':'d'*64}, {'lock_bytes':len(self.lock)+1}):
            with self.subTest(kwargs=kwargs), self.assertRaisesRegex(a.Rejected, 'operator-admitted locked inputs'):
                self.export(**kwargs)
            self.failed_receipt()

    def test_export_ignore_required_or_extra_tracked_source_and_export_subst_are_rejected(self):
        attributes = self.fixture/'.gitattributes'
        for rule in ('app/index.tsx export-ignore\n', 'README.md export-ignore\n', 'README.md export-subst\n'):
            with self.subTest(rule=rule):
                attributes.write_text(rule)
                if 'export-subst' in rule: (self.fixture/'README.md').write_text('FAKE $Format:%H$\n')
                selected = self.checkpoint()
                with self.assertRaisesRegex(a.Rejected, 'omitted or substituted'): self.export(commit=selected)
                self.failed_receipt()

    def test_committed_links_submodules_and_forbidden_credentials_block_before_archive(self):
        target = self.fixture/'FAKE-link'; target.symlink_to('README.md'); selected = self.checkpoint()
        with self.assertRaisesRegex(a.Rejected, 'link, submodule'): self.export(commit=selected)
        raw = self.failed_receipt(); self.assertFalse(any('archive' in c['argv'] for c in raw['commands']))
        target.unlink(); selected = self.checkpoint()
        submodule = self.fixture/'FAKE-submodule'; submodule.mkdir()
        self.git('update-index', '--add', '--cacheinfo', '160000,'+selected+','+exporter.SUBTREE+'/FAKE-submodule')
        self.git('commit', '-m', 'FAKE unsupported gitlink')
        selected = self.git('rev-parse', 'HEAD').decode().strip()
        with self.assertRaises(a.Rejected): self.export(commit=selected)
        raw = self.failed_receipt(); self.assertFalse(any('archive' in c['argv'] for c in raw['commands']))
        self.git('update-index', '--force-remove', exporter.SUBTREE+'/FAKE-submodule'); submodule.rmdir()
        (self.fixture/'FAKE.key').write_bytes(b'FAKE credential test only'); selected = self.checkpoint()
        with self.assertRaisesRegex(a.Rejected, 'credential filename'): self.export(commit=selected)
        raw = self.failed_receipt(); self.assertFalse(any('archive' in c['argv'] for c in raw['commands']))

    def test_assume_unchanged_cannot_hide_changed_actual_fixture_bytes(self):
        path = self.fixture/'app/index.tsx'
        self.git('update-index', '--assume-unchanged', exporter.SUBTREE+'/app/index.tsx')
        path.write_bytes(b'FAKE hidden dirty bytes')
        with self.assertRaisesRegex(a.Rejected, 'exact committed blobs'): self.export()
        self.failed_receipt()

    def test_safe_extractor_rejects_traversal_links_collision_duplicates_and_broad_archive(self):
        for kind in ('traversal','symlink','collision','duplicate','outside'):
            data = io.BytesIO()
            with tarfile.open(fileobj=data, mode='w') as tar:
                name = exporter.SUBTREE+'/app/index.tsx'
                if kind == 'traversal': name = exporter.SUBTREE+'/../../escaped'
                elif kind == 'outside': name = 'vault/private-note.md'
                entry = tarfile.TarInfo(name); entry.size = 4
                if kind == 'symlink': entry.type = tarfile.SYMTYPE; entry.linkname = 'README.md'; entry.size = 0; tar.addfile(entry)
                else: tar.addfile(entry, io.BytesIO(b'FAKE'))
                if kind == 'duplicate': tar.addfile(entry, io.BytesIO(b'FAKE'))
                elif kind == 'collision':
                    child = tarfile.TarInfo(name+'/child'); child.size = 4; tar.addfile(child, io.BytesIO(b'FAKE'))
            output = self.root/('extract-'+kind); output.mkdir(mode=0o700)
            with self.subTest(kind=kind), self.assertRaises((a.Rejected,ValueError)):
                exporter.extract_fixture_archive(data.getvalue(), output)
            self.assertEqual(list(output.iterdir()), [])

    def test_real_export_source_stage_details_match_current_pipeline_and_recheck_dirty_source(self):
        result = self.export()
        from test_android_pipeline import SyntheticFixture
        from dataclasses import replace
        fixture = SyntheticFixture(str(self.state))
        identities = {**fixture.binding.identities, 'sourceArchive':result.archive, 'sourceLock':result.lock}
        adapter = self.store.json(identities['adapter']); adapter['sourceExport'] = result.manifest.json(); adapter['sourceExporterSha256'] = result.exporter_sha256
        identities['adapter'] = fixture.put(adapter)
        binding = replace(fixture.binding, source_sha=result.source_sha, identities=identities)
        details = result.stage_details(binding, self.store)
        receipt = self.store.json(a.Evidence.parse(details['receipt']))
        self.assertEqual(receipt['sourceExport'], result.manifest.json()); self.assertEqual(receipt['context'], binding.context())
        self.assertTrue(receipt['cleanCommit']); self.assertTrue(receipt['archiveValidated']); self.assertTrue(receipt['protectedInputsMatched'])
        import pipeline as pipeline
        import time
        run_id = 'FAKE-real-git-source-check'; run_directory = 'runs/'+run_id
        self.store.path(run_directory).mkdir(parents=True, mode=0o700)
        now = time.time()
        observation = self.store.write(run_directory+'/observation.json', {
            'schema':'micro.android.stage-observation/1', 'runId':run_id,
            'stage':pipeline.Stage.SOURCE.value, 'status':'passed', 'context':binding.context(),
            'startedAt':now, 'finishedAt':now, 'exitCode':0, 'signal':None, 'timeout':False,
            'oom':False, 'resourceError':None, 'cleanup':{'absent':True},
            'artifactSha256':None, 'details':details})
        job = pipeline.JobContext(binding, self.store, run_id, run_directory, pipeline.Stage.SOURCE, (), None)
        self.assertEqual(pipeline.validate_observation(pipeline.Observation(observation), job, now)['status'], 'passed')
        (self.fixture/'app/index.tsx').write_bytes(b'FAKE change after export')
        with self.assertRaises(a.Rejected): result.stage_details(binding, self.store)
        failed = [json.loads(path.read_bytes()) for path in self.state.glob(result.directory+'/source-stage-*/raw.json')]
        self.assertEqual(sorted(row['status'] for row in failed), ['admitted', 'failed'])


if __name__ == '__main__': unittest.main()
