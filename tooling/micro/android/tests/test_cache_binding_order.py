"""Regression for real directory-prefix cache names and unchanged identity gates."""
import copy
import hashlib
from pathlib import Path
import tempfile
import unittest

import admission as a
import fixture_integration as f


class CacheBindingOrderTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for name, body in [('activity/a.module', b'FAKE ordinary module'),
                           ('activity-compose/a.aar', b'FAKE prefixed module')]:
            path = self.root/name
            path.parent.mkdir(mode=0o700, exist_ok=True)
            path.write_bytes(body)
        inventory = f.inventory(self.root, 1024)
        self.tree = {'path': '.', **inventory}
        # Archive order is deliberately different from physical Path ordering.
        entries = [{'path': row['path'], 'type': 'file', 'mode': 0o444,
                    'size': row['bytes'], 'sha256': row['sha256']}
                   for row in reversed(inventory['files'])]
        self.archive = {'schema': 1, 'entries': entries, 'entryCount': len(entries),
                        'fileBytes': sum(row['size'] for row in entries)}
        self.component = {'canonicalTreeSha256': hashlib.sha256(a.canonical(self.archive)).hexdigest()}

    def authority(self, archive):
        return {'canonicalTreeSha256': hashlib.sha256(a.canonical(archive)).hexdigest()}

    def test_prefix_directory_cache_binds_exact_bytes_in_existing_tree_order(self):
        self.assertEqual([row['path'] for row in self.tree['files']], ['activity/a.module', 'activity-compose/a.aar'])
        f.bind_sealed_cache(self.tree, self.archive, self.component)

    def test_changed_digest_is_still_rejected(self):
        tree = copy.deepcopy(self.tree)
        tree['files'][0]['sha256'] = 'a'*64
        with self.assertRaises(a.Rejected): f.bind_sealed_cache(tree, self.archive, self.component)

    def test_omitted_file_is_still_rejected(self):
        tree = copy.deepcopy(self.tree)
        tree['files'].pop()
        with self.assertRaises(a.Rejected): f.bind_sealed_cache(tree, self.archive, self.component)

    def test_extra_file_is_still_rejected(self):
        tree = copy.deepcopy(self.tree)
        tree['files'].append({'path': 'extra', 'bytes': 1, 'sha256': 'b'*64})
        with self.assertRaises(a.Rejected): f.bind_sealed_cache(tree, self.archive, self.component)

    def test_duplicate_archive_path_is_still_rejected(self):
        archive = copy.deepcopy(self.archive)
        archive['entries'].append(copy.deepcopy(archive['entries'][0]))
        archive['entryCount'] += 1
        with self.assertRaises(a.Rejected): f.bind_sealed_cache(self.tree, archive, self.authority(archive))

    def test_archive_byte_total_is_still_rejected(self):
        archive = copy.deepcopy(self.archive)
        archive['fileBytes'] += 1
        with self.assertRaises(a.Rejected): f.bind_sealed_cache(self.tree, archive, self.authority(archive))

    def test_different_archive_manifest_authority_is_still_rejected(self):
        with self.assertRaises(a.Rejected): f.bind_sealed_cache(self.tree, self.archive, {'canonicalTreeSha256': 'a'*64})


if __name__ == '__main__':
    unittest.main()
