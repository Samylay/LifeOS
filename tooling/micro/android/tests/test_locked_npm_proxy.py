import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('locked_npm_proxy', Path(__file__).resolve().parents[1] / 'locked_npm_proxy.py')
proxy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proxy)
FIXTURE = Path(__file__).resolve().parents[1] / 'fixtures/native-smoke/package-lock.json'

class LockedNpmTests(unittest.TestCase):
    def test_approved_lock_yields_only_exact_https_tarballs(self):
        items = proxy.approved_inputs(FIXTURE.read_bytes())
        self.assertEqual(len(items), 846)
        self.assertEqual(items['/expo/-/expo-57.0.25.tgz']['version'], '57.0.25')
    def test_lock_tamper_cannot_be_admitted(self):
        with self.assertRaisesRegex(ValueError, 'Unapproved'):
            proxy.approved_inputs(FIXTURE.read_bytes() + b' ')
    def test_unknown_tarball_rejected_without_network(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = proxy.Cache(Path(directory), {})
            with patch.object(proxy, 'build_opener', side_effect=AssertionError('Network forbidden')):
                with self.assertRaisesRegex(ValueError, 'absent'):
                    cache.fetch('/arbitrary/-/package.tgz')
    def test_dirty_and_symlink_cache_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            (p / 'keep').write_text('keep')
            with self.assertRaisesRegex(ValueError, 'fresh'):
                proxy.Cache(p, {})
            with self.assertRaisesRegex(ValueError, 'fresh'):
                proxy.Cache(p / 'missing', {})

if __name__ == '__main__':
    unittest.main()
