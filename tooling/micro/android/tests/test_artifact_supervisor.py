import copy
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('artifact_supervisor', Path(__file__).resolve().parents[1]/'artifact_supervisor.py')
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)


class SupervisorTests(unittest.TestCase):
    def test_input_growth_is_rejected_before_copying_beyond_budget(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp)/'source.apk'; source.write_bytes(b'abc')
            destination = Path(temp)/'admitted.apk'
            read = supervisor.os.read
            first = True
            def grow(descriptor, size):
                nonlocal first
                if first:
                    first = False
                    source.write_bytes(b'abcdefghi')
                return read(descriptor, size)
            with patch.object(supervisor, 'APK_LIMIT', 4), patch.object(supervisor.os, 'read', side_effect=grow):
                with self.assertRaisesRegex(ValueError, 'grew'): supervisor.admit_apk(source, destination)
            self.assertLessEqual(destination.stat().st_size, 4)

    def test_admission_copies_exact_regular_bytes_and_refuses_symlink(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp)/'source.apk'; source.write_bytes(b'fixture')
            destination = Path(temp)/'admitted.apk'
            digest, count = supervisor.admit_apk(source, destination)
            self.assertEqual(digest, supervisor.digest(source)); self.assertEqual(count, 7)
            self.assertEqual(destination.read_bytes(), b'fixture')
            link = Path(temp)/'link.apk'; link.symlink_to(source)
            with self.assertRaises(OSError): supervisor.admit_apk(link, Path(temp)/'other.apk')

    def test_nonregular_input_cannot_block_before_type_check(self):
        with tempfile.TemporaryDirectory() as temp:
            fifo = Path(temp)/'input.apk'; supervisor.os.mkfifo(fifo)
            # The test has its own watchdog so a future regression cannot hang
            # the trusted test runner on the deliberately writer-free FIFO.
            script = 'import runpy,sys; m=runpy.run_path(sys.argv[1]); m["admit_apk"](m["Path"](sys.argv[2]),m["Path"](sys.argv[3]))'
            result = supervisor.bounded([sys.executable, '-c', script,
                                         str(Path(__file__).resolve().parents[1]/'artifact_supervisor.py'),
                                         str(fifo), str(Path(temp)/'output.apk')], Path(temp)/'capture.log', seconds=1)
            self.assertIsNone(result['limitFailure'])
            self.assertNotEqual(result['exitCode'], 0)
            self.assertIn('bounded regular input', (Path(temp)/'capture.log').read_text())

    def fixture(self):
        return {'Id': 'a'*64, 'Image': 'sha256:'+'b'*64,
                'Config': {'Labels': {'micro.artifact.owner': 'owned'}, 'User': '1000:1000',
                           'Env': ['HOME=/tmp', 'PATH=/usr/bin'],
                           'Entrypoint': ['python3'], 'Cmd': ['/inspector.py']},
                'HostConfig': {'NetworkMode': 'none', 'ReadonlyRootfs': True,
                               'CapDrop': ['ALL'], 'SecurityOpt': ['no-new-privileges'],
                               'Memory': supervisor.MEMORY, 'MemorySwap': supervisor.MEMORY,
                               'NanoCpus': 1_000_000_000, 'PidsLimit': 128,
                               'LogConfig': {'Type': 'none'},
                               'Tmpfs': {'/tmp': 'rw,nosuid,nodev,noexec,size=134217728,mode=1777'}},
                'Mounts': [{'Type': 'bind', 'RW': False, 'Destination': destination}
                           for destination in ('/input/app.apk', '/inspector.py')]}

    def test_extra_credential_mount_network_or_resource_privileges_are_rejected(self):
        clean = self.fixture()
        self.assertTrue(all(supervisor.runtime_policy(clean, 'a'*64, 'sha256:'+'b'*64, 'owned').values()))
        for group, key, value in [('Config', 'Env', ['TOKEN=synthetic']),
                                  ('Config', 'User', '0:0'),
                                  ('Config', 'Cmd', ['/candidate.py']),
                                  ('HostConfig', 'NetworkMode', 'bridge'),
                                  ('HostConfig', 'ReadonlyRootfs', False),
                                  ('HostConfig', 'MemorySwap', supervisor.MEMORY*2),
                                  ('HostConfig', 'LogConfig', {'Type': 'json-file'}),
                                  ('HostConfig', 'CapDrop', []),
                                  ('HostConfig', 'Tmpfs', {'/tmp': 'rw'})]:
            bad = copy.deepcopy(clean); bad[group][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                supervisor.runtime_policy(bad, 'a'*64, 'sha256:'+'b'*64, 'owned')
        bad = copy.deepcopy(clean)
        bad['Mounts'].append({'Type': 'bind', 'RW': False, 'Destination': '/var/run/docker.sock'})
        with self.assertRaises(ValueError): supervisor.runtime_policy(bad, 'a'*64, 'sha256:'+'b'*64, 'owned')

    def test_output_is_capped_and_noisy_child_stops(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)/'capture.log'
            result = supervisor.bounded([sys.executable, '-c', 'import os; os.write(1,b"x"*2097152)'], output, seconds=3)
            self.assertEqual(result['limitFailure'], 'output-limit')
            self.assertLessEqual(output.stat().st_size, supervisor.OUTPUT_LIMIT)

    def test_silent_child_stops_at_wall_limit(self):
        with tempfile.TemporaryDirectory() as temp:
            result = supervisor.bounded([sys.executable, '-c', 'import time; time.sleep(10)'], Path(temp)/'capture.log', seconds=0.1)
            self.assertEqual(result['limitFailure'], 'wall-time-limit')
            self.assertLess(result['seconds'], 2)


if __name__ == '__main__': unittest.main()
