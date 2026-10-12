"""Assembled synthetic exporter regressions. Fake bytes are never native evidence."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import native_seal_destination as destination_policy
import verified_maven_seed as seeds
import maven_proxy as policy
import maven_proxy as proxy
import seal_maven_inputs as sealer
REAL_ADMIT=seeds.STATE.parent/'android-builder/admit.py'
REAL_SPEC=importlib.util.spec_from_file_location


class AssembledSealerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(dir=ROOT/'tests');self.addCleanup(self.cleanup)
        self.root=Path(self.tmp.name);self.acquisition=self.root/'acquisition';self.acquisition.mkdir()
        self.integration=self.root/'integration';self.integration.mkdir(mode=0o700)
        self.attempt=self.acquisition/'synthetic-attempt';self.attempt.mkdir()
        for name in ('receipts','output/graph','protected/fixture','protected/tools','proxy-cache'):
            (self.attempt/name).mkdir(parents=True)
        (self.attempt/'protected/fixture/package.json').write_text('{"synthetic":true}')
        (self.attempt/'protected/patch-preimages.json').write_text('{}')
        apk=self.attempt/'output/fixture-release-unsigned.apk';apk.write_bytes(b'synthetic byte identity, never a real APK')
        metadata=self.attempt/'output/verification-metadata.xml';metadata.write_text('<verification-metadata/>')
        archive=self.attempt/'output/gradle-dependency-caches.tar'
        with tarfile.open(archive,'w') as target:
            folder=tarfile.TarInfo('modules-2');folder.type=tarfile.DIRTYPE;target.addfile(folder)
            info=tarfile.TarInfo('modules-2/synthetic-module.jar');data=b'synthetic module cache byte identity'
            info.size=len(data);target.addfile(info,io.BytesIO(data))
        self.archive_sha=sealer.digest(archive)
        self.job={'status':'trusted-fixture-native-task-closure-acquired','offline':False,
            'apk':{'bytes':apk.stat().st_size,'sha256':sealer.digest(apk)},
            'gradleDependencyCache':{'bytes':archive.stat().st_size,'sha256':self.archive_sha},
            'verificationMetadataSha256':sealer.digest(metadata)}
        self.supervisor={'status':'native-acquisition-task-closure-complete-offline-proof-pending',
            'cleanupFailures':[],'image':sealer.IMAGE,'npmSeedSealSha256':'1'*64}
        graph={'build':'/work/fixture/android','project':':app','scope':'project',
            'configuration':'releaseRuntimeClasspath','components':[{'group':'org.example','module':'module','version':'1.0'}]}
        (self.attempt/'output/graph/synthetic.json').write_text(json.dumps(graph))
        self.data=b'synthetic public Maven bytes'
        self.entry={'action':'artifact-acquired','time':'old-source-time','authority':'old TOFU authority',
            'url':policy.path_url('/central/org/example/module/1.0/module-1.0.pom'),
            'redirects':[],'redirectPathSha256':None,'bytes':len(self.data),
            'sha256':hashlib.sha256(self.data).hexdigest(),'file':'a'*32+'.blob'}
        self.entry['finalUrl']=self.entry['url']
        (self.attempt/'proxy-cache'/self.entry['file']).write_bytes(self.data)
        self.events=[self.entry]

    def cleanup(self):
        for p in self.root.rglob('*'):
            if p.is_dir():p.chmod(0o755)
            elif p.is_file():p.chmod(0o644)
        self.tmp.cleanup()

    def prepare_reuse(self):
        bodies=self.root/'seed-bodies';bodies.mkdir()
        (bodies/self.entry['file']).write_bytes(self.data)
        events=bodies/'events.jsonl';events.write_text(json.dumps(self.entry)+'\n')
        value={'schema':'verified-public-maven-seed/1','nativeReadiness':False,
            'source':{'attempt':'maven-attempt10','nativeStatus':'first-native-failure-retained',
                      'eventsSha256':hashlib.sha256(events.read_bytes()).hexdigest()},
            'artifactCount':1,'artifactBytes':len(self.data),'artifacts':[self.entry]}
        manifest=self.root/'seed-manifest.json';manifest.write_text(json.dumps(value));sha=sealer.digest(manifest)
        seed=seeds.VerifiedMavenSeed(bodies,manifest,sha,policy.path_url,policy.check_upstream,{})
        cache=self.attempt/'proxy-cache'
        (cache/self.entry['file']).unlink()
        proxy_cache=proxy.Cache(cache,seed=seed)
        _,receipt=proxy_cache.fetch('/central/org/example/module/1.0/module-1.0.pom')
        proxy_cache.verify_reuse_after(receipt,'GET',len(self.data),self.entry['sha256'])
        self.events=[json.loads(x) for x in (cache/'events.jsonl').read_text().splitlines()]
        (self.attempt/'protected/tools/verified-maven-seed.json').write_bytes(manifest.read_bytes())
        self.supervisor.update(publicMavenSeedBefore=seed.verify_all(),publicMavenSeedAfter=seed.verify_all())
        return seed

    def run_sealer(self,seed=None):
        (self.attempt/'output/native-job.json').write_text(json.dumps(self.job))
        (self.attempt/'receipts/maven-acquisition.json').write_text(json.dumps(self.supervisor))
        (self.attempt/'proxy-cache/events.jsonl').write_text(''.join(json.dumps(x)+'\n' for x in self.events))
        destination=self.integration/'sealed-native'/('b'*32)
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(sealer,'DEFAULT_STATE',self.acquisition))
            stack.enter_context(patch.object(destination_policy,'DEFAULT_STATE',self.acquisition))
            stack.enter_context(patch.object(destination_policy,'INTEGRATION_STATE',self.integration))
            stack.enter_context(patch.object(sealer.importlib.util,'spec_from_file_location',side_effect=lambda name,path:REAL_SPEC(name,REAL_ADMIT)))
            stack.enter_context(patch.object(sys,'argv',['synthetic-sealer','--attempt',str(self.attempt),'--destination',str(destination)]))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            if seed is not None:
                stack.enter_context(patch.object(seeds,'admitted_host_seed',return_value=seed))
                stack.enter_context(patch.object(seeds,'MANIFEST_SHA256',seed.manifest_sha256))
            sealer.main()
        return destination,json.loads((destination/'seal.json').read_text())

    def test_synthetic_seed_free_complete_export_preserves_archive_identity(self):
        destination,result=self.run_sealer()
        self.assertEqual(result['components']['gradle-caches']['archiveSha256'],self.archive_sha)
        self.assertEqual(result['mavenArtifacts'],1);self.assertIsNone(result['publicMavenSeedManifestSha256'])
        scope=json.loads((destination/'resolved-coordinate-union.json').read_text())[0]['scopes'][0]
        self.assertEqual(scope['project'],':app')

    def test_synthetic_reused_body_complete_export_preserves_archive_and_raw_proofs(self):
        seed=self.prepare_reuse();destination,result=self.run_sealer(seed)
        self.assertEqual(result['components']['gradle-caches']['archiveSha256'],self.archive_sha)
        self.assertEqual(result['reuseResponses']['GET'],1)
        self.assertEqual(result['publicMavenSeedManifestSha256'],seed.manifest_sha256)
        self.assertEqual((destination/'maven-use-events.jsonl').read_bytes(),(self.attempt/'proxy-cache/events.jsonl').read_bytes())

    def test_synthetic_reused_GET_missing_response_proof_cannot_seal(self):
        seed=self.prepare_reuse();self.events=self.events[:1]
        with self.assertRaisesRegex(ValueError,'orphaned'):self.run_sealer(seed)

    def test_seed_failure_marker_blocks_even_otherwise_complete_export(self):
        (self.attempt/'proxy-cache/seed-integrity-failure.json').write_text('{"synthetic":true}')
        with self.assertRaisesRegex(ValueError,'failure marker'):self.run_sealer()


if __name__=='__main__':unittest.main()
