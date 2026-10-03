"""Known tiny Python children only; no product, npm, Docker, APK or device run."""
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import fixture_check_job as worker


class CaptureTests(unittest.TestCase):
    def capture(self, program, seconds=2):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = worker.capture_command([sys.executable, '-c', program], root,
                {'PATH': '/usr/bin:/bin'}, root/'command.log', seconds)
            self.assertEqual((root/'command.log').read_bytes(), result[2])
            return result

    def test_large_regular_dependency_file_does_not_share_the_log_limit(self):
        code, _, log, limit = self.capture(
            "from pathlib import Path; Path('dependency').write_bytes(b'x'*2097152); print('ready')")
        self.assertEqual(code, 0)
        self.assertEqual(log, b'ready\n')
        self.assertIsNone(limit)

    def test_oversized_stream_retains_only_bounded_prefix_and_fails(self):
        _, _, log, limit = self.capture("import sys; sys.stdout.buffer.write(b'x'*2097152)")
        self.assertEqual(log, b'x'*worker.LOG_BYTES)
        self.assertEqual(limit, 'command log-byte limit')

    def test_stalled_child_retains_prefix_and_is_reaped(self):
        code, duration, log, limit = self.capture("import time; print('before',flush=True); time.sleep(3)", .2)
        self.assertNotEqual(code, 0)
        self.assertLess(duration, 2)
        self.assertEqual(log, b'before\n')
        self.assertEqual(limit, 'command wall-time limit')


if __name__ == '__main__':
    unittest.main()
