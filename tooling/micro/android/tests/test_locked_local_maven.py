import hashlib
import sys
import tempfile
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from locked_local_maven import verify_repository

class LocalMavenPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.fixture = Path(self.temporary.name)
        self.root = self.fixture / 'node_modules/example/local-maven-repo'
        self.root.mkdir(parents=True)
        for name, data in {'group/module/1/module-1.aar': b'public artifact', 'group/module/maven-metadata.xml': b'mutable metadata'}.items():
            path = self.root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
            path.with_name(path.name + '.sha256').write_text(hashlib.sha256(data).hexdigest())
        self.repository = {'root': 'node_modules/example/local-maven-repo', 'files': [{'path': str(p.relative_to(self.root)), 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in self.root.rglob('*') if p.is_file()], 'removeMetadata': ['group/module/maven-metadata.xml', 'group/module/maven-metadata.xml.sha256']}
    def test_verified_metadata_removed_only_after_full_check(self):
        result = verify_repository(self.fixture, self.repository, True)
        self.assertEqual(len(result['removedMetadata']), 2)
        self.assertTrue((self.root / 'group/module/1/module-1.aar').exists())
        self.assertFalse((self.root / 'group/module/maven-metadata.xml').exists())
    def test_postbuild_versioned_bytes_rechecked(self):
        verify_repository(self.fixture, self.repository, True)
        verify_repository(self.fixture, self.repository, metadata_removed=True)
        (self.root / 'group/module/1/module-1.aar').write_bytes(b'changed after build')
        with self.assertRaises(ValueError): verify_repository(self.fixture, self.repository, metadata_removed=True)
    def test_metadata_cannot_reappear_after_deletion(self):
        verify_repository(self.fixture, self.repository, True)
        (self.root / 'group/module/maven-metadata.xml').write_bytes(b'changed metadata')
        with self.assertRaises(ValueError): verify_repository(self.fixture, self.repository, metadata_removed=True)
    def test_changed_artifact_rejected_before_metadata_deletion(self):
        (self.root / 'group/module/1/module-1.aar').write_bytes(b'changed')
        with self.assertRaises(ValueError): verify_repository(self.fixture, self.repository, True)
        self.assertTrue((self.root / 'group/module/maven-metadata.xml').exists())
    def test_extra_artifact_rejected(self):
        (self.root / 'extra.jar').write_bytes(b'unknown')
        with self.assertRaises(ValueError): verify_repository(self.fixture, self.repository, True)
    def test_file_link_rejected(self):
        path = self.root / 'group/module/1/module-1.aar'
        path.unlink(); path.symlink_to('/etc/passwd')
        with self.assertRaises(ValueError): verify_repository(self.fixture, self.repository, True)
    def test_mutable_metadata_removal_not_general_file_deletion(self):
        self.repository['removeMetadata'] += ['group/module/1/module-1.aar']
        with self.assertRaises(ValueError): verify_repository(self.fixture, self.repository, True)
    def test_ancestor_link_rejected(self):
        current = self.fixture / 'node_modules/example'
        destination = self.fixture / 'saved'
        current.rename(destination); current.symlink_to(destination, target_is_directory=True)
        with self.assertRaises(ValueError): verify_repository(self.fixture, self.repository, True)

if __name__ == '__main__': unittest.main()
