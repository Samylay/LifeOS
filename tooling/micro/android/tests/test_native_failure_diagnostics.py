from pathlib import Path
import sys
import tempfile
import unittest
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
import native_failure_diagnostics as diagnostics

class DiagnosticsTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.fixture=self.root/'fixture';self.fixture.mkdir()
        self.logs=self.fixture/'node_modules/react-native-worklets/android/build/intermediates/cxx/RelWithDebInfo/4g5r5p5j/logs/x86_64';self.logs.mkdir(parents=True)
    def test_known_generated_diagnostic_copied_without_execution(self):
        (self.logs/'prefab_command').write_text('#!/bin/sh\nexit 88\n');(self.logs/'prefab_command').chmod(0o755)
        (self.logs/'unknown-secret').write_text('excluded')
        out=self.root/'out';r=diagnostics.collect(self.fixture,out)
        self.assertEqual(len(r['files']),1);self.assertFalse(r['files'][0]['truncated']);self.assertEqual((out/'00-prefab_command').stat().st_mode&0o777,0o600)
    def test_oversize_diagnostic_prefix_explicitly_truncated(self):
        (self.logs/'prefab_stderr').write_bytes(b'x'*(diagnostics.SINGLE+1))
        r=diagnostics.collect(self.fixture,self.root/'out');self.assertEqual(r['capturedBytes'],diagnostics.SINGLE);self.assertTrue(r['files'][0]['truncated']);self.assertFalse(r['files'][0]['fullFileDigestClaimed'])
    def test_link_diagnostic_rejected(self):
        (self.logs/'prefab_command').symlink_to('/does-not-exist')
        with self.assertRaisesRegex(ValueError,'link'):diagnostics.collect(self.fixture,self.root/'out')

if __name__=='__main__':unittest.main()
