"""Replay the real worker setup with FAKE read-only cache seeds, no runners.

The extracted main prefix stops before npm/Gradle execution. Filesystem copying
and permission checks are real, confined to a disposable test directory.
"""
import argparse
import ast
import contextlib
import hashlib
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import ssl
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
from unittest.mock import patch
import zipfile

WORKER = Path(__file__).resolve().parents[1] / 'native_fixture_job.py'


class CacheCopyPermissions(unittest.TestCase):
    def setUp(self):
        self.effects = []
        self.guards = contextlib.ExitStack()
        self.addCleanup(self.guards.close)

        def denied(*args, **kwargs):
            self.effects.append('forbidden effect')
            raise AssertionError('External runner/network/database/archive forbidden')

        for obj, name in ((subprocess, 'Popen'), (subprocess, 'run'),
                          (socket, 'socket'), (socket, 'create_connection'),
                          (os, 'system'), (sqlite3, 'connect'),
                          (zipfile, 'ZipFile'), (tarfile, 'open'),
                          (tarfile.TarFile, 'open')):
            self.guards.enter_context(patch.object(obj, name, denied))

    def tearDown(self):
        self.assertEqual(self.effects, [])

    def replay(self, offline, require_writable=True):
        with tempfile.TemporaryDirectory(prefix='FAKE-cache-copy-') as raw:
            root = Path(raw)
            for name in ('work', 'out', 'seed/fixture', 'seed/npm-cache',
                         'seed/gradle-caches'):
                (root / name).mkdir(parents=True, exist_ok=True)
            (root / 'seed/fixture/FAKE.txt').write_bytes(b'FAKE source\n')
            seed_files = []
            for cache in ('npm-cache', 'gradle-caches'):
                seed = root / 'seed' / cache
                (seed / 'existing').mkdir()
                blob = seed / 'existing/FAKE.bin'
                blob.write_bytes(b'FAKE dependency bytes\n')
                executable = seed / 'existing/FAKE-executable'
                executable.write_bytes(b'FAKE executable bytes, never executed\n')
                blob.chmod(0o444)
                executable.chmod(0o555)
                (seed / 'existing').chmod(0o555)
                seed.chmod(0o555)
                seed_files.extend((seed, seed / 'existing', blob, executable))

            def snapshots():
                return {str(p.relative_to(root)): (
                    p.stat().st_mode & 0o777,
                    hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None
                ) for p in seed_files}

            before = snapshots()

            def mapped_path(value='.'):
                value = str(value)
                if value == '/work' or value.startswith('/work/') or value == '/out' or value.startswith('/out/') or value == '/seed' or value.startswith('/seed/'):
                    return root / value.lstrip('/')
                return Path(value)

            # Execute actual setup statements, stopping before the first npm
            # config write. Neither generated build code nor imports execute.
            module = ast.parse(WORKER.read_text())
            main = next(node for node in module.body
                        if isinstance(node, ast.FunctionDef) and node.name == 'main')
            stop = next(i for i, node in enumerate(main.body)
                        if isinstance(node, ast.Expr) and
                        "'empty-user.npmrc'" in ast.unparse(node))
            main.body = main.body[:stop]
            namespace = {'argparse': argparse, 'time': time, 'Path': mapped_path,
                         'shutil': type('Copies', (), {
                             'copytree': staticmethod(lambda src, dst:
                                 shutil.copytree(mapped_path(src), mapped_path(dst)))})}
            with patch.object(sys, 'argv', ['FAKE-worker'] + (['--offline'] if offline else [])):
                exec(compile(ast.Module(body=[main], type_ignores=[]), str(WORKER), 'exec'), namespace)
                namespace['main']()

            copied = [('npm-cache', root / 'work/npm-cache')]
            if offline:
                copied.append(('gradle-caches', root / 'work/gradle-home/caches'))
            else:
                self.assertFalse((root / 'work/gradle-home/caches').exists())
            for cache, target in copied:
                if require_writable:
                    self.assertEqual(target.stat().st_mode & 0o777, 0o755,
                                     'Private cache root must allow new Gradle/npm entries')
                    (target / 'new-jvms').mkdir()
                    (target / 'new-jvms/FAKE-new.bin').write_bytes(b'FAKE new entry\n')
                self.assertEqual((target / 'existing').stat().st_mode & 0o777, 0o755)
                self.assertEqual((target / 'existing/FAKE.bin').stat().st_mode & 0o777, 0o644)
                self.assertEqual((target / 'existing/FAKE-executable').stat().st_mode & 0o777, 0o755)
                for name in ('FAKE.bin', 'FAKE-executable'):
                    self.assertEqual((target / 'existing' / name).read_bytes(),
                                     (root / 'seed' / cache / 'existing' / name).read_bytes())
            self.assertEqual(snapshots(), before, 'Read-only seeds must retain bytes and modes')
            # Restore owner access only on this disposable FAKE source so its
            # temporary-directory cleanup works. Real seeds are never opened.
            for p in seed_files:
                p.chmod(0o755 if p.is_dir() else 0o644)

    def test_offline_roots_accept_new_entries_and_preserve_seed_bytes(self):
        self.replay(True)

    def test_acquisition_npm_root_accepts_new_entries_without_gradle_seed(self):
        self.replay(False)

    def test_copy_preserves_read_only_seeds_and_existing_executable_bits(self):
        self.replay(True, require_writable=False)


if __name__ == '__main__':
    unittest.main()
