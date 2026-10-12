"""Additive generator regressions; public fixture bytes do not prove a real seal."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET

import task_verification_metadata as metadata

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'fixtures'
GROUP = 'org.jetbrains.kotlin.jvm'
MODULE = 'org.jetbrains.kotlin.jvm.gradle.plugin'
VERSION = '2.1.20'
NAME = MODULE + '-' + VERSION + '.pom'
SUFFIX = 'org/jetbrains/kotlin/jvm/' + MODULE + '/' + VERSION + '/' + NAME
VARIANTS = (
    ('https://repo.maven.apache.org/maven2/' + SUFFIX, '5ccb905a796717218c1bb4eed8bb31fc674c5803cdd54c23753ead380f7a11b5', 1397, 'kotlin-marker-central-2.1.20.pom'),
    ('https://plugins.gradle.org/m2/' + SUFFIX, 'abc4c3875e3f97553a176a90f51788ec0f5eae8e1d26423ea8ebdbf8aa6a1786', 673, 'kotlin-marker-portal-2.1.20.pom'),
)

class KotlinMarkerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.local = Path(metadata.__file__).resolve().parent / 'locked-local-maven-manifest.json'
        self.output = self.root / 'verification.xml'
        self.manifest = {'entries': []}
        self.events = []
        self.bodies = []
        for url, sha, size, name in VARIANTS:
            source = SOURCE / name
            self.assertFalse(source.is_symlink())
            self.assertLessEqual(source.stat().st_size, 2048)
            body = source.read_bytes()
            self.assertEqual(len(body), size)
            self.assertEqual(hashlib.sha256(body).hexdigest(), sha)
            self.bodies.append(body)
            self.events.append({'url': url, 'action': 'artifact-reused', 'bytes': size, 'sha256': sha, 'useId': name})
            self.cache(body)

    def cache(self, body, group=GROUP, module=MODULE, version=VERSION, name=NAME):
        relative = '/'.join(('modules-2', 'files-2.1', group, module, version, hashlib.sha1(body).hexdigest(), name))
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
        self.manifest['entries'].append({'path': relative, 'type': 'file', 'size': len(body), 'sha256': hashlib.sha256(body).hexdigest()})
        return relative

    def generate(self):
        return metadata.generate(self.root, self.manifest, self.events, self.local, self.output)

    def rejected(self, pattern='Conflicting|matching independent|authority URL|Duplicate|link|unsafe'):
        with self.assertRaisesRegex(ValueError, pattern):
            self.generate()
        self.assertFalse(self.output.exists())

    def test_two_poms_keep_individual_authority_and_cache_paths_with_nested_also_trust(self):
        result = self.generate()
        rows = [r for r in result['rows'] if r['group'] == GROUP]
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual((row['module'], row['version'], row['artifact']), (MODULE, VERSION, NAME))
        self.assertEqual(set(row['cachePaths']), {e['path'] for e in self.manifest['entries']})
        variants = row['variants']
        self.assertEqual(len(variants), 2)
        for variant, event, entry in zip(variants, self.events, self.manifest['entries']):
            self.assertEqual(variant['sha256'], event['sha256'])
            self.assertEqual(variant['bytes'], event['bytes'])
            self.assertEqual(variant['cachePaths'], [entry['path']])
            self.assertEqual(len(variant['authorities']), 1)
            authority = variant['authorities'][0]
            self.assertEqual(authority['url'], event['url'])
            self.assertEqual(authority['useId'], event['useId'])
            self.assertEqual(authority['sourceReceiptSha256'], hashlib.sha256(json.dumps(event, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
        ns = {'v': 'https://schema.gradle.org/dependency-verification'}
        top = ET.fromstring(self.output.read_bytes())
        artifact = top.find("v:components/v:component[@group='" + GROUP + "']/v:artifact", ns)
        self.assertEqual(len(artifact.findall('v:sha256', ns)), 1)
        sha = artifact.find('v:sha256', ns)
        self.assertEqual(sha.get('value'), VARIANTS[0][1])
        self.assertEqual([a.get('value') for a in sha.findall('v:also-trust', ns)], [VARIANTS[1][1]])
        self.assertEqual(artifact.findall('v:also-trust', ns), [])
        self.assertEqual(len(top.findall('.//v:also-trust', ns)), 1)
        self.assertEqual(top.findall('.//v:trusted-artifacts', ns), [])
        self.assertFalse(result['verifySignatures'])
        self.assertIn('TOFU', result['authenticity'])

    def test_single_observed_variant_does_not_invent_other_checksum(self):
        for index in (0, 1):
            with self.subTest(index=index):
                events, entries = self.events, self.manifest['entries']
                self.events = [events[index]]
                self.manifest['entries'] = [entries[index]]
                try:
                    row = next(r for r in self.generate()['rows'] if r['group'] == GROUP)
                    self.assertEqual([v['sha256'] for v in row['variants']], [VARIANTS[index][1]])
                    self.assertNotIn(b'also-trust', self.output.read_bytes())
                finally:
                    self.events, self.manifest['entries'] = events, entries

    def test_reverse_event_and_cache_order_still_checks_each_body(self):
        self.events.reverse()
        self.manifest['entries'].reverse()
        row = next(r for r in self.generate()['rows'] if r['group'] == GROUP)
        self.assertEqual([v['sha256'] for v in row['variants']], [v[1] for v in VARIANTS])
        self.assertEqual([v['cachePaths'] for v in row['variants']], [[self.manifest['entries'][1]['path']], [self.manifest['entries'][0]['path']]])

    def test_same_origin_byte_drift_rejected(self):
        self.events.append({**self.events[0], 'sha256': 'd' * 64})
        self.rejected()

    def test_swapped_origin_hashes_and_sizes_rejected(self):
        for fields in (('sha256',), ('bytes',), ('sha256', 'bytes')):
            with self.subTest(fields=fields):
                original = [e.copy() for e in self.events]
                for field in fields:
                    self.events[0][field], self.events[1][field] = self.events[1][field], self.events[0][field]
                self.rejected()
                self.events = original

    def test_unknown_third_digest_rejected(self):
        self.events.append({**self.events[1], 'sha256': 'c' * 64, 'bytes': 777})
        self.rejected()

    def test_unknown_origin_for_known_marker_digest_rejected(self):
        for prefix in ('https://dl.google.com/dl/android/maven2/', 'https://repo.maven.apache.org/maven2/extra/', 'https://unknown.invalid/'):
            with self.subTest(prefix=prefix):
                old = self.events[0]['url']
                self.events[0]['url'] = prefix + SUFFIX
                # The inserted coordinate path is a different unknown conflict.
                if '/extra/' in prefix:
                    self.events.append({**self.events[0], 'sha256': VARIANTS[1][1], 'bytes': VARIANTS[1][2]})
                self.rejected()
                if '/extra/' in prefix:
                    self.events.pop()
                self.events[0]['url'] = old

    def test_binary_variants_rejected(self):
        self.events = [{**e, 'url': e['url'][:-4] + '.jar'} for e in self.events]
        self.rejected()

    def test_other_marker_coordinate_conflict_rejected(self):
        self.events = [{**e, 'url': e['url'].replace('2.1.20', '2.1.21')} for e in self.events]
        self.rejected()

    def test_local_locked_maven_conflict_still_rejected(self):
        document = json.loads(self.local.read_bytes())
        repo = document['repositories'][0]
        info = next(f for f in repo['files'] if f['path'].endswith('.pom') and f['path'] not in repo['removeMetadata'])
        self.events.append({'url': 'https://repo.maven.apache.org/maven2/' + info['path'], 'action': 'artifact-reused', 'sha256': 'c' * 64, 'bytes': info['bytes']})
        self.rejected()

    def test_cache_body_tamper_cannot_use_other_variant_authority(self):
        path = self.root / self.manifest['entries'][0]['path']
        path.write_bytes(self.bodies[1])
        self.manifest['entries'][0].update(size=VARIANTS[1][2], sha256=VARIANTS[1][1])
        self.rejected()

    def test_cache_manifest_hash_and_size_tamper_rejected(self):
        for field, value in (('sha256', VARIANTS[1][1]), ('size', VARIANTS[1][2])):
            with self.subTest(field=field):
                old = self.manifest['entries'][0][field]
                self.manifest['entries'][0][field] = value
                self.rejected()
                self.manifest['entries'][0][field] = old

    def test_cache_unobserved_variant_rejected(self):
        self.events.pop()
        self.rejected()

    def test_cache_third_body_rejected_even_with_matching_manifest(self):
        self.cache(b'synthetic unknown marker POM')
        self.rejected()

    def test_cache_path_tamper_rejected(self):
        entry = self.manifest['entries'][0]
        old = self.root / entry['path']
        entry['path'] = entry['path'].replace(hashlib.sha1(self.bodies[0]).hexdigest(), '0' * 40)
        target = self.root / entry['path']
        target.parent.mkdir(parents=True)
        old.rename(target)
        self.rejected()

    def test_cache_symlink_rejected(self):
        path = self.root / self.manifest['entries'][0]['path']
        target = self.root / 'plain-public-pom'
        path.rename(target)
        path.symlink_to(target)
        self.rejected()
