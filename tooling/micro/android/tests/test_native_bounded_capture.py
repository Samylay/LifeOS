"""Actual harmless child processes, never Docker jobs or native readiness."""
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from native_acquire import Supervisor


class NativeCaptureTests(unittest.TestCase):
    def subject(self,root):
        (root/'receipts').mkdir()
        result=Supervisor(root)
        result.headroom=lambda:{'ownedBytes':0,'ownedAllocatedBytes':0,
            'memoryAvailableBytes':10*1024**3,'diskFreeBytes':100*1024**3}
        return result

    def test_immediate_overflow_never_persists_more_than_twenty_mib(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'tests') as directory:
            root=Path(directory);subject=self.subject(root)
            with self.assertRaisesRegex(ValueError,'log bound'):
                subject.command('capture-overflow',['/usr/bin/python3','-c',
                    "import os;os.write(1,b'x'*(20*1024**2+1))"])
            log=root/'receipts/capture-overflow.log';fact=subject.receipt['commands'][0]
            self.assertEqual(log.stat().st_size,20*1024**2)
            self.assertEqual(fact['logBytes'],20*1024**2)
            self.assertEqual(fact['limitFailure'],'log-bytes')
            self.assertEqual(fact['logSha256'],hashlib.sha256(log.read_bytes()).hexdigest())
            self.assertIsInstance(fact['exitCode'],int)

    def test_timeout_always_retains_first_bytes_exit_hash_and_duration(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'tests') as directory:
            root=Path(directory);subject=self.subject(root)
            with self.assertRaisesRegex(ValueError,'wall bound'):
                subject.command('capture-timeout',['/usr/bin/python3','-c',
                    "import os,time;os.write(1,b'first');time.sleep(5)"],timeout=.1)
            fact=subject.receipt['commands'][0]
            self.assertEqual((root/'receipts/capture-timeout.log').read_bytes(),b'first')
            self.assertTrue(fact['timedOut']);self.assertEqual(fact['limitFailure'],'wall-time')
            self.assertLess(fact['exitCode'],0);self.assertGreater(fact['seconds'],.1)

    def test_allocated_stage_bytes_are_bounded_alongside_logical(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'tests') as directory:
            root=Path(directory);subject=self.subject(root)
            subject.headroom=lambda:{'ownedBytes':0,'ownedAllocatedBytes':9*1024**3,
                'memoryAvailableBytes':10*1024**3,'diskFreeBytes':100*1024**3}
            with self.assertRaisesRegex(ValueError,'resource bound'):
                subject.command('capture-allocated',['/usr/bin/python3','-c','pass'])
            self.assertEqual(subject.receipt['commands'][0]['limitFailure'],'resources')

    def test_native_loop_still_samples_owned_cgroups(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'tests') as directory:
            root=Path(directory);subject=self.subject(root)
            with patch.object(subject,'sample_owned_jobs') as sample:
                subject.command('native-client-run',['/usr/bin/python3','-c','pass'])
            sample.assert_called()


if __name__=='__main__':unittest.main()
