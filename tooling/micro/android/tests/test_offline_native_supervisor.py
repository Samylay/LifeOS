"""Synthetic lease/cleanup negatives. No Docker jobs or readiness evidence."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent
ROOT=Path('/home/quorky/apps/lifeos/.scratch/software-factory-upgrade/tooling/micro/android')
sys.path[:0]=[str(HERE),str(ROOT)]
from offline_native_supervisor import OfflineSupervisor, IMAGE


class OfflineOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.subject = OfflineSupervisor.__new__(OfflineSupervisor)
        self.subject.container_id = 'a' * 64
        self.subject.create_attempted = True
        self.subject.owner = 'b' * 32
        self.subject.name = 'micro-native-' + self.subject.owner
        self.subject.env = {'PATH': '/usr/bin:/bin', 'DOCKER_CONFIG': '/owned/docker-config'}
        self.subject.receipt = {}
        self.value = {'Id': self.subject.container_id, 'Name': '/' + self.subject.name,
                      'Image': IMAGE, 'Config': {'Labels': {'micro.native.owner': self.subject.owner}}}

    def fake_inspect(self, value):
        return subprocess.CompletedProcess([], 0, json.dumps([value]), '')

    def test_exact_owned_identity_readback(self):
        with patch('offline_native_supervisor.subprocess.run', return_value=self.fake_inspect(self.value)) as run:
            self.assertEqual(self.subject.read_owned(), self.value)
            self.assertEqual(run.call_args.args[0], ['docker', 'inspect', 'a' * 64])
            self.assertEqual(run.call_args.kwargs['env'], self.subject.env)

    def test_each_lease_mismatch_rejected_before_removal(self):
        for field in ('Id', 'Name', 'Image', 'owner'):
            with self.subTest(field=field):
                value = copy.deepcopy(self.value)
                if field == 'owner': value['Config']['Labels']['micro.native.owner'] = 'c' * 32
                else: value[field] = 'wrong'
                with patch.object(self.subject, 'command', return_value=(json.dumps([value]), 0)) as command:
                    self.subject.cleanup()
                self.assertEqual(command.call_count, 1)
                self.assertEqual(self.subject.receipt['status'], 'cleanup-unresolved')
                self.assertEqual(len(self.subject.receipt['cleanupFailures']), 1)

    def test_absence_needs_actual_classification_and_empty_scoped_list(self):
        for absence, listing in ((('unrelated error', 1), ('', 0)),
                                 (('No such object: ' + 'a' * 64, 1), ('a' * 12, 0))):
            with self.subTest(absence=absence, listing=listing):
                with patch.object(self.subject, 'command', side_effect=[(json.dumps([self.value]), 0), ('', 0), absence, listing]):
                    self.subject.cleanup()
                self.assertTrue(self.subject.receipt['cleanupFailures'])

    def test_clean_absence_uses_full_id_and_generated_label_only(self):
        with patch.object(self.subject, 'command', side_effect=[(json.dumps([self.value]), 0), ('', 0), ('No such object: ' + 'a' * 64, 1), ('', 0)]) as command:
            self.subject.cleanup()
        self.assertEqual(self.subject.receipt['cleanupFailures'], [])
        self.assertEqual(command.call_args_list[1].args[1], ['docker', 'container', 'rm', '--force', 'a' * 64])
        self.assertIn('--filter=label=micro.native.owner=' + 'b' * 32, command.call_args_list[-1].args[1])
        self.assertIn('--filter=name=^/' + self.subject.name + '$', command.call_args_list[-1].args[1])

    def test_malformed_merged_create_output_never_assigned(self):
        for raw in ('warning\n' + 'a'*64, 'a'*12, ''):
            with self.subTest(raw=raw):
                self.subject.container_id = None
                with self.assertRaises(ValueError): self.subject.assign_created_id(raw)
                self.assertIsNone(self.subject.container_id)

    def test_timeout_or_nonzero_created_container_recovered_by_exact_name(self):
        self.subject.container_id = None
        with patch.object(self.subject, 'command', side_effect=[(json.dumps([self.value]), 0), ('', 0),
                          ('No such object: '+'a'*64, 1), ('', 0)]) as command:
            self.subject.cleanup()
        self.assertEqual(self.subject.receipt['cleanupFailures'], [])
        self.assertEqual(command.call_args_list[0].args[1], ['docker','inspect',self.subject.name])
        self.assertEqual(command.call_args_list[1].args[1], ['docker','container','rm','--force','a'*64])

    def test_create_timeout_foreign_owner_never_removed(self):
        self.subject.container_id = None
        value = copy.deepcopy(self.value)
        value['Config']['Labels']['micro.native.owner'] = 'foreign'
        with patch.object(self.subject, 'command', return_value=(json.dumps([value]),0)) as command:
            self.subject.cleanup()
        self.assertEqual(command.call_count,1)
        self.assertTrue(self.subject.receipt['cleanupFailures'])

    def test_inspect_command_error_is_not_absence(self):
        self.subject.container_id = None
        with patch.object(self.subject, 'command', return_value=('connection refused',1)) as command:
            self.subject.cleanup()
        self.assertEqual(command.call_count,1)
        self.assertTrue(self.subject.receipt['cleanupFailures'])

    def test_cleanup_command_independent_of_store_budget_failure(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'tests') as directory:
            self.subject.state = Path(directory)
            (self.subject.state/'receipts').mkdir()
            self.subject.receipt['commands'] = []
            with patch.object(self.subject,'headroom',side_effect=ValueError('over8GiB')):
                self.assertEqual(self.subject.command('cleanup-test',['/usr/bin/python3','-c','pass']),('',0))
            self.assertTrue(self.subject.receipt['commands'][0]['headroomSkippedForOwnerVerifiedCleanup'])

    def test_cleanup_immediate_exit_output_overflow_is_capped_and_receipted(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'tests') as directory:
            self.subject.state=Path(directory);(self.subject.state/'receipts').mkdir()
            self.subject.receipt['commands']=[]
            with self.assertRaisesRegex(ValueError,'log bound'):
                self.subject.command('cleanup-overflow',['/usr/bin/python3','-c',
                    "import os;os.write(1,b'x'*(2*1024**2+1))"])
            log=self.subject.state/'receipts/cleanup-overflow.log'
            self.assertEqual(log.stat().st_size,2*1024**2)
            receipt=self.subject.receipt['commands'][0]
            self.assertEqual(receipt['limitFailure'],'log-bytes')
            self.assertEqual(receipt['logBytes'],2*1024**2)
            self.assertFalse(receipt['timedOut'])
            self.assertIsInstance(receipt['exitCode'],int)
            self.assertEqual(receipt['logSha256'],__import__('hashlib').sha256(log.read_bytes()).hexdigest())

    def test_cleanup_timeout_retains_exit_hash_and_duration(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'tests') as directory:
            self.subject.state=Path(directory);(self.subject.state/'receipts').mkdir()
            self.subject.receipt['commands']=[]
            with self.assertRaisesRegex(ValueError,'wall bound'):
                self.subject.command('cleanup-timeout',['/usr/bin/python3','-c',
                    "import os,time;os.write(1,b'first diagnostic');time.sleep(5)"],timeout=.1)
            receipt=self.subject.receipt['commands'][0]
            self.assertTrue(receipt['timedOut'])
            self.assertEqual(receipt['limitFailure'],'wall-time')
            self.assertGreater(receipt['seconds'],.1)
            self.assertLess(receipt['seconds'],2)
            self.assertLess(receipt['exitCode'],0)
            self.assertEqual((self.subject.state/'receipts/cleanup-timeout.log').read_bytes(),b'first diagnostic')


if __name__ == '__main__': unittest.main()
