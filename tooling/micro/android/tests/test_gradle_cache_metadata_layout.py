"""Authored plain bytes exercise the cache/module seam, not a real Gradle seal."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET

import task_verification_metadata as metadata

class GradleCacheLayoutTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.local = Path(metadata.__file__).resolve().parent / 'locked-local-maven-manifest.json'
        self.output = self.root / 'verification.xml'
        self.manifest = {'entries': []}
        self.events = []
        self.group, self.module, self.version = 'org.synthetic', 'library-android', '1.0'
        self.filename, self.urlname = 'library-release.aar', 'library-android-1.0.aar'
        self.body = b'authored synthetic plain artifact, never an archive'
        self.file = {'name': self.filename, 'url': self.urlname, 'size': len(self.body)}
        self.file.update({alg: hashlib.new(alg, self.body).hexdigest() for alg in ('sha256', 'sha1', 'sha512', 'md5')})
        self.document = {'formatVersion': '1.1', 'component': {'group': self.group, 'module': 'library', 'version': self.version, 'url': '../../library/1.0/library-1.0.module'}, 'variants': [{'name': 'runtime', 'files': [self.file]}]}
        self.artifact = self.add_cache(self.filename, self.body)
        self.events.append(self.receipt(self.urlname, self.body))
        self.metadata_entry = None
        self.publish_module()

    def receipt(self, name, body):
        return {'url': 'https://repo.maven.apache.org/maven2/' + self.group.replace('.', '/') + '/' + self.module + '/' + self.version + '/' + name, 'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body), 'action': 'artifact-acquired'}

    def add_cache(self, name, body):
        relative = '/'.join(('modules-2', 'files-2.1', self.group, self.module, self.version, hashlib.sha1(body).hexdigest(), name))
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
        entry = {'path': relative, 'type': 'file', 'size': len(body), 'sha256': hashlib.sha256(body).hexdigest()}
        self.manifest['entries'].append(entry)
        return entry

    def publish_module(self, raw=None):
        if self.metadata_entry is not None:
            (self.root / self.metadata_entry['path']).unlink()
            self.manifest['entries'].remove(self.metadata_entry)
            self.events.pop()
        self.module_body = raw if raw is not None else json.dumps(self.document, sort_keys=True, separators=(',', ':')).encode()
        name = self.module + '-' + self.version + '.module'
        self.metadata_entry = self.add_cache(name, self.module_body)
        self.events.append(self.receipt(name, self.module_body))

    def generate(self):
        return metadata.generate(self.root, self.manifest, self.events, self.local, self.output)

    def rejected(self):
        with self.assertRaises(ValueError):
            self.generate()
        self.assertFalse(self.output.exists())

    def move_hash_directory(self, entry, directory):
        old = self.root / entry['path']
        parts = entry['path'].split('/')
        parts[5] = directory
        entry['path'] = '/'.join(parts)
        target = self.root / entry['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        old.rename(target)

    def direct_artifact(self):
        self.manifest['entries'] = []
        self.events = []
        for index in range(100000):
            body = ('deterministic SHA1 fixture ' + str(index)).encode()
            if hashlib.sha1(body).hexdigest().startswith('00'):
                break
        else:
            self.fail('No bounded deterministic leading-zero SHA1 fixture')
        name = self.module + '-' + self.version + '.jar'
        entry = self.add_cache(name, body)
        self.events.append(self.receipt(name, body))
        return entry, body

    def test_canonical_short_sha1_and_exact_full_sha1_positive(self):
        entry, body = self.direct_artifact()
        self.assertTrue(self.generate()['rows'])
        full = hashlib.sha1(body).hexdigest()
        self.move_hash_directory(entry, format(int(full, 16), 'x'))
        row = next(r for r in self.generate()['rows'] if r['group'] == self.group)
        self.assertEqual(row['cachePaths'], [entry['path']])

    def test_arbitrary_truncation_and_partial_padding_rejected(self):
        entry, body = self.direct_artifact()
        full = hashlib.sha1(body).hexdigest()
        self.move_hash_directory(entry, full[1:])
        self.rejected()
        self.move_hash_directory(entry, full[3:])
        self.rejected()

    def test_hash_directory_mismatch_uppercase_and_overlength_rejected(self):
        entry, body = self.direct_artifact()
        for directory in ('1', hashlib.sha1(body).hexdigest().upper(), '0' * 41):
            with self.subTest(directory=directory):
                self.move_hash_directory(entry, directory)
                self.rejected()

    def test_published_alias_retains_receipts_paths_and_both_exact_xml_names(self):
        result = self.generate()
        rows = {r['artifact']: r for r in result['rows'] if r['group'] == self.group}
        self.assertEqual(set(rows), {self.filename, self.urlname, self.module + '-' + self.version + '.module'})
        for name in (self.filename, self.urlname):
            row = rows[name]
            self.assertEqual(row['sha256'], self.file['sha256'])
            self.assertEqual(row['bytes'], len(self.body))
            self.assertEqual(row['cachePaths'], [self.artifact['path']])
            binding = row['moduleFileAliases'][0]
            self.assertEqual(binding['name'], self.filename)
            self.assertEqual(binding['url'], self.urlname)
            self.assertEqual(binding['moduleSha256'], hashlib.sha256(self.module_body).hexdigest())
            self.assertEqual(binding['moduleCachePath'], self.metadata_entry['path'])
            self.assertEqual(binding['moduleAuthorities'][0]['url'], self.events[1]['url'])
            self.assertEqual(binding['artifactAuthorities'][0]['url'], self.events[0]['url'])
            self.assertEqual(binding['publishedFile'], self.file)
        ns = {'v': 'https://schema.gradle.org/dependency-verification'}
        top = ET.fromstring(self.output.read_bytes())
        artifacts = top.findall("v:components/v:component[@group='" + self.group + "']/v:artifact", ns)
        self.assertEqual({a.get('name') for a in artifacts}, set(rows))
        self.assertTrue(all(len(a.findall('v:sha256', ns)) == 1 for a in artifacts))
        self.assertEqual(top.findall('.//v:trusted-artifacts', ns), [])

    def test_optional_published_hashes_and_size_can_be_absent(self):
        self.document['variants'][0]['files'] = [{'name': self.filename, 'url': self.urlname}]
        self.publish_module()
        self.assertTrue(self.generate()['rows'])

    def test_unused_cross_project_location_is_not_followed(self):
        self.document['variants'].append({'name': 'external', 'available-at': {'url': '../../different/1.0/different-1.0.module', 'group': 'org.other', 'module': 'different', 'version': '1.0'}})
        self.document['variants'].append({'name': 'unused', 'files': [{'name': 'unused.jar', 'url': '../other/unused.jar'}]})
        self.publish_module()
        self.assertTrue(self.generate()['rows'])

    def test_module_tamper_and_missing_independent_authority_rejected(self):
        (self.root / self.metadata_entry['path']).write_bytes(b'{bad module')
        self.rejected()
        (self.root / self.metadata_entry['path']).write_bytes(self.module_body)
        self.events.pop()
        self.rejected()

    def test_module_manifest_and_receipt_hash_drift_rejected(self):
        self.metadata_entry['sha256'] = 'a' * 64
        self.rejected()
        self.metadata_entry['sha256'] = hashlib.sha256(self.module_body).hexdigest()
        self.events[1]['sha256'] = 'b' * 64
        self.rejected()

    def test_wrong_source_gav_cannot_authorize_alias(self):
        self.events[1]['url'] = self.events[1]['url'].replace('/library-android/', '/library/')
        self.rejected()

    def test_wrong_artifact_gav_and_receipt_url_cannot_authorize_alias(self):
        original = self.events[0]['url']
        for url in (original.replace('/library-android/', '/other/'), original.replace('/maven2/', '/maven2/elsewhere/'), original.replace('repo.maven.apache.org', 'plugins.gradle.org').replace('/maven2/', '/m2/')):
            with self.subTest(url=url):
                self.events[0]['url'] = url
                self.rejected()

    def test_artifact_receipt_hash_and_size_drift_rejected(self):
        original = self.events[0].copy()
        for field, value in (('sha256', 'c' * 64), ('bytes', len(self.body) + 1)):
            with self.subTest(field=field):
                self.events[0] = {**original, field: value}
                self.rejected()

    def test_published_hash_and_size_drift_rejected(self):
        original = copy.deepcopy(self.document)
        for field, value in (('size', len(self.body) + 1), ('sha256', 'd' * 64), ('sha1', 'd' * 40), ('sha512', 'd' * 128), ('md5', 'd' * 32)):
            with self.subTest(field=field):
                self.document = copy.deepcopy(original)
                self.document['variants'][0]['files'][0][field] = value
                self.publish_module()
                self.rejected()

    def test_unsafe_alias_and_url_declarations_rejected(self):
        original = copy.deepcopy(self.document)
        for field, value in (('name', '../library-release.aar'), ('name', 'library-release.aar?x'), ('url', '../library-android-1.0.aar'), ('url', 'https://repo.maven.apache.org/file.aar'), ('url', 'library-android-1.0.aar?x'), ('url', '%2e%2e.aar'), ('url', 'library-android-2.0.aar')):
            with self.subTest(field=field, value=value):
                self.document = copy.deepcopy(original)
                self.document['variants'][0]['files'][0][field] = value
                self.publish_module()
                self.rejected()

    def test_missing_published_declaration_rejected(self):
        self.document['variants'][0]['files'] = []
        self.publish_module()
        self.rejected()

    def test_ambiguous_alias_even_with_same_public_body_rejected(self):
        alternate = copy.deepcopy(self.file)
        alternate['url'] = self.module + '-' + self.version + '-other.aar'
        self.document['variants'].append({'name': 'ambiguous', 'files': [alternate]})
        self.events.insert(1, self.receipt(alternate['url'], self.body))
        self.publish_module()
        self.rejected()

    def test_authenticated_duplicate_json_keys_and_invalid_json_rejected(self):
        for body in (b'{"variants": [], "variants": []}', b'{bad json'):
            with self.subTest(body=body):
                self.publish_module(body)
                self.rejected()

    def test_module_body_over_existing_graph_limit_rejected(self):
        self.publish_module(b' ' * (8 * 1024**2 + 1))
        self.rejected()
