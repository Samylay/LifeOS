import copy
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4

from tooling.micro.android import admission as a
from tooling.micro.android import fixture_store_validation as module


class CollectedStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name); root.chmod(0o700); self.store = a.Store(root)
        (root/'factory-fixture.db').write_bytes(b'bounded synthetic bytes, SQL unopened on host')
        self.file = self.store.describe('factory-fixture.db')
        self.value = {'schema': 'micro.fixture-store/1', 'package': module.PACKAGE, 'version': 1,
                      'files': [{'name': 'factory-fixture.db', 'bytes': self.file.bytes, 'sha256': self.file.sha256}]}

    def manifest(self):
        self.latest = self.store.write('manifest-'+uuid4().hex+'.json', self.value)
        return self.latest

    def test_manifest_and_complete_original_bytes_bound(self):
        self.assertEqual(module.retained_files(self.store, self.manifest(), {'factory-fixture.db': self.file}), self.value)
        (self.store.root/'factory-fixture.db').write_bytes(b'changed')
        with self.assertRaises(a.Rejected):
            module.retained_files(self.store, self.latest, {'factory-fixture.db': self.file})

    def test_missing_or_extra_store_files_rejected(self):
        reference = self.manifest()
        for files in ({}, {'factory-fixture.db': self.file, 'unrecorded': self.file}):
            with self.subTest(files=list(files)), self.assertRaises(a.Rejected):
                module.retained_files(self.store, reference, files)

    def test_duplicate_traversal_boolean_size_and_excess_rejected(self):
        original = copy.deepcopy(self.value)
        for kind in ('duplicate', 'traversal', 'boolean', 'excess'):
            self.value = copy.deepcopy(original)
            row = self.value['files'][0]
            if kind == 'duplicate': self.value['files'].append(dict(row))
            if kind == 'traversal': row['name'] = '../factory-fixture.db'
            if kind == 'boolean': row['bytes'] = True
            if kind == 'excess': row['bytes'] = module.MAX_BYTES+1
            with self.subTest(kind=kind), self.assertRaises(a.Rejected):
                module.retained_files(self.store, self.manifest(), {'factory-fixture.db': self.file})

    def test_wrong_product_and_incompatible_version_retained_for_worker_rejection(self):
        self.value['package'] = 'app.other.fixture'; self.value['version'] = 999
        result = module.retained_files(self.store, self.manifest(), {'factory-fixture.db': self.file})
        self.assertEqual(result['package'], 'app.other.fixture')
        self.assertEqual(result['version'], 999)

    def test_alias_file_reference_rejected(self):
        (self.store.root/'alias').symlink_to('factory-fixture.db')
        alias = a.Evidence('alias', self.file.sha256, self.file.bytes)
        with self.assertRaises(a.Rejected):
            module.retained_files(self.store, self.manifest(), {'factory-fixture.db': alias})


if __name__ == '__main__': unittest.main()
