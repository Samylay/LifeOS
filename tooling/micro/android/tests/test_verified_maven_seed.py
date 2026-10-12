"""Synthetic seed policy and real HTTP negatives, never native/Docker jobs."""
import copy
import hashlib
import http.client
from email.message import Message
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import maven_proxy as policy
import maven_proxy as proposed
import verified_maven_seed as module
REQUEST='/central/org/example/module/1.0/module-1.0.pom'
URL=policy.path_url(REQUEST)


class SeedTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(dir=ROOT/'tests')
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.bodies=self.root/'bodies';self.bodies.mkdir()
        self.data=b'exact public fixture'
        self.entry={'action':'artifact-acquired','time':'old-source-time','authority':'old TOFU authority',
            'url':URL,'finalUrl':URL,'redirects':[],'redirectPathSha256':None,
            'bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest(),'file':'a'*32+'.blob'}
        (self.bodies/self.entry['file']).write_bytes(self.data)
        self.manifest=self.root/'manifest.json'
        self.value={'schema':'verified-public-maven-seed/1','nativeReadiness':False,
            'source':{'attempt':'maven-attempt10','nativeStatus':'first-native-failure-retained'},
            'artifactCount':1,'artifactBytes':len(self.data),'artifacts':[self.entry]}
        self.write_manifest()

    def write_manifest(self):
        events=self.bodies/'events.jsonl'
        events.write_text(''.join(json.dumps(e)+'\n' for e in self.value['artifacts']))
        self.value['source']['eventsSha256']=hashlib.sha256(events.read_bytes()).hexdigest()
        self.manifest.write_text(json.dumps(self.value))
        self.sha=hashlib.sha256(self.manifest.read_bytes()).hexdigest()

    def seed(self,pins=None):
        return module.VerifiedMavenSeed(self.bodies,self.manifest,self.sha,
            policy.path_url,policy.check_upstream,policy.REACT_NATIVE_ARTIFACTS if pins is None else pins)

    def test_exact_original_receipt_and_body_reverified_after_use(self):
        seed=self.seed();body,receipt=seed.lookup(URL)
        self.assertEqual(body.read_bytes(),self.data);self.assertEqual(receipt,self.entry)
        self.assertEqual(seed.verify_all()['artifactBytes'],len(self.data))

    def test_manifest_digest_body_events_and_unknown_inventory_reject(self):
        with self.assertRaisesRegex(ValueError,'manifest changed'):
            module.VerifiedMavenSeed(self.bodies,self.manifest,'0'*64,policy.path_url,policy.check_upstream,{})
        seed=self.seed();(self.bodies/self.entry['file']).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'body bytes'):seed.lookup(URL)
        (self.bodies/self.entry['file']).write_bytes(self.data)
        (self.bodies/'events.jsonl').write_text('changed')
        with self.assertRaisesRegex(ValueError,'events changed'):seed.verify_all()
        self.write_manifest();(self.bodies/'extra.blob').write_bytes(b'extra')
        with self.assertRaisesRegex(ValueError,'inventory changed'):self.seed()

    def test_duplicate_url_or_file_and_traversal_rejected(self):
        for change in ('url','file','traversal'):
            with self.subTest(change=change):
                second=copy.deepcopy(self.entry)
                if change=='url':second['file']='b'*32+'.blob'
                if change=='file':second['url']=second['finalUrl']=URL.replace('module-1.0.pom','module-1.0.jar')
                if change=='traversal':second['file']='../outside.blob'
                self.value['artifacts']=[self.entry,second];self.value['artifactCount']=2;self.value['artifactBytes']=2*len(self.data)
                self.write_manifest()
                with self.assertRaises(ValueError):self.seed()

    def test_symlink_hardlink_and_ancestor_alias_rejected(self):
        body=self.bodies/self.entry['file'];body.unlink();body.symlink_to(self.manifest)
        with self.assertRaisesRegex(ValueError,'link'):self.seed()
        body.unlink();body.write_bytes(self.data)
        (self.root/'hardlink').hardlink_to(body)
        with self.assertRaisesRegex(ValueError,'hardlinked'):self.seed()
        (self.root/'hardlink').unlink();alias=self.root/'alias';alias.symlink_to(self.bodies,target_is_directory=True)
        with self.assertRaisesRegex(ValueError,'plain directory'):
            module.VerifiedMavenSeed(alias,self.manifest,self.sha,policy.path_url,policy.check_upstream,{})

    def test_credentials_unknown_origin_mutability_and_url_mismatch_rejected(self):
        for url in (URL+'?token=synthetic',URL.replace('https://','https://synthetic@'),
                    URL.replace('apache.org','other.test'),URL.replace('/1.0/','/LATEST/')):
            with self.subTest(url=url):
                self.entry['url']=self.entry['finalUrl']=url;self.write_manifest()
                with self.assertRaises(ValueError):self.seed()

    def test_cdn_hash_conflict_and_publisher_pin_change_rejected(self):
        self.entry['finalUrl']='https://plugins-artifacts.gradle.org/org.example/module/1.0/'+'0'*64+'/module-1.0.pom'
        self.entry['redirects']=[{'status':303,'url':self.entry['finalUrl']}]
        self.entry['redirectPathSha256']='0'*64;self.write_manifest()
        with self.assertRaisesRegex(ValueError,'body hash mismatch'):self.seed()
        self.entry['finalUrl']=URL;self.entry['redirects']=[];self.entry['redirectPathSha256']=None
        self.entry['publisherSha256']='0'*64;self.write_manifest()
        with self.assertRaisesRegex(ValueError,'publisher pin changed'):self.seed()

    def test_historical_absent_pin_is_strengthened_without_relabeling_original(self):
        artifact=next(iter(policy.REACT_NATIVE_ARTIFACTS))
        self.entry['url']=self.entry['finalUrl']=policy.REPOSITORIES['central']+artifact
        self.write_manifest()
        with patch.dict(policy.REACT_NATIVE_ARTIFACTS,{artifact:self.entry['sha256']}), \
             patch.dict(proposed.REACT_NATIVE_ARTIFACTS,{artifact:self.entry['sha256']}):
            seed=self.seed();self.new_cache();cache=proposed.Cache(self.root/'cache',seed=seed)
            body,fresh=cache.fetch('/central/'+artifact)
            self.assertTrue(fresh['publisherPinAddedIndependently'])
            self.assertEqual(fresh['publisherSha256'],self.entry['sha256'])
            self.assertEqual(fresh['sourceReceipt'],self.entry)
            self.assertEqual(fresh['authority'],self.entry['authority'])
            cache.verify_reuse_after(fresh,'GET',len(self.data),self.entry['sha256'])
        self.assertNotIn('publisherSha256',self.entry)

    def new_cache(self):
        (self.root/'cache').mkdir();return True

    def test_seed_input_is_reserved_and_reuse_never_fetches_or_copies(self):
        self.new_cache();seed=self.seed();cache=proposed.Cache(self.root/'cache',seed=seed)
        with patch.object(proposed,'build_opener',side_effect=AssertionError('seed must not fetch')):
            for _ in range(2):
                body,receipt=cache.fetch(REQUEST);cache.verify_reuse_after(receipt,'GET',len(self.data),self.entry['sha256'])
                self.assertEqual(body,self.bodies/self.entry['file'])
        self.assertEqual(cache.downloaded,len(self.data));self.assertEqual(cache.requests,2)
        self.assertEqual({p.name for p in (self.root/'cache').iterdir()},{'events.jsonl'})
        events=[json.loads(x) for x in (self.root/'cache/events.jsonl').read_text().splitlines()]
        self.assertEqual(sum(e['action']=='artifact-reused' for e in events),2)

    def test_seed_plus_fresh_download_counts_against_total_budget(self):
        self.new_cache();cache=proposed.Cache(self.root/'cache',seed=self.seed())
        response=io.BytesIO(b'new bytes');response.url=URL.replace('.pom','.jar');response.status=200
        response.headers={'Content-Length':'9'}
        with patch.object(proposed,'TOTAL_BYTES',len(self.data)+1),patch.object(proposed,'build_opener') as opener:
            opener.return_value.open.return_value=response
            with self.assertRaisesRegex(ValueError,'total byte budget'):
                cache.fetch(REQUEST.replace('.pom','.jar'))
        self.assertFalse(list((self.root/'cache').glob('*.blob')))

    def test_sealer_reference_rejects_path_alias_identity_and_authority_laundering(self):
        self.new_cache();seed=self.seed();cache=proposed.Cache(self.root/'cache',seed=seed)
        body,receipt=cache.fetch(REQUEST)
        self.assertEqual(module.resolve_reused_body(seed,receipt),body)
        for field,value in (('seedManifestSha256','0'*64),('seedFile','../outside.blob'),
                            ('file','new.blob'),('authority','new claimed signature authority'),
                            ('bytes',99),('sha256','0'*64),('publisherSha256','0'*64),
                            ('publisherPinAddedIndependently',True),('sourceReceipt',{})):
            with self.subTest(field=field):
                changed=copy.deepcopy(receipt);changed[field]=value
                with self.assertRaises(ValueError):module.resolve_reused_body(seed,changed)

    def test_prelookup_changed_then_restored_body_poison_is_sticky_and_recorded(self):
        self.new_cache();seed=self.seed();cache=proposed.Cache(self.root/'cache',seed=seed)
        (self.bodies/self.entry['file']).write_bytes(b'changed')
        with self.assertRaises(ValueError):cache.fetch(REQUEST)
        (self.bodies/self.entry['file']).write_bytes(self.data)
        seed.verify_all()
        with self.assertRaisesRegex(ValueError,'integrity failed'):cache.fetch(REQUEST)
        self.assertTrue((self.root/'cache/seed-integrity-failure.json').exists())
        events=[json.loads(x) for x in (self.root/'cache/events.jsonl').read_text().splitlines()]
        with self.assertRaisesRegex(ValueError,'response failure'):module.verify_reuse_events(events)

    def test_streamed_bytes_not_restored_path_hash_determine_GET_integrity(self):
        self.new_cache();seed=self.seed();cache=proposed.Cache(self.root/'cache',seed=seed)
        class SwappedBody:
            def open(_,mode):return io.BytesIO(b'X'*len(self.data))
        handler=proposed.Handler.__new__(proposed.Handler)
        handler.server=type('FixtureServer',(),{'cache':cache,'server_address':('127.0.0.1',8080)})()
        handler.path=REQUEST;handler.command='GET';handler.headers=Message();handler.headers['Host']='127.0.0.1:8080'
        handler.send_response=lambda _:None;handler.send_header=lambda *_:None;handler.end_headers=lambda:None
        handler.wfile=io.BytesIO()
        with patch.object(seed,'lookup',return_value=(SwappedBody(),self.entry)):
            with self.assertRaisesRegex(ValueError,'streamed public seed body'):handler.respond(body=True)
        seed.verify_all() # Both path checks see original bytes; actual streamed digest still fails.
        self.assertEqual(handler.wfile.getvalue(),b'X'*len(self.data))
        self.assertTrue(cache.failed);self.assertTrue((self.root/'cache/seed-integrity-failure.json').exists())

    def test_read_write_or_postcheck_error_poison_and_preserve_first_failure(self):
        self.new_cache();seed=self.seed();cache=proposed.Cache(self.root/'cache',seed=seed)
        _,receipt=cache.fetch(REQUEST)
        with self.assertRaisesRegex(ValueError,'response failed'):
            cache.verify_reuse_after(receipt,'GET',0,None,OSError('synthetic read/write failure'))
        marker=self.root/'cache/seed-integrity-failure.json';first=marker.read_bytes()
        with patch.object(seed,'verify_entry',side_effect=OSError('synthetic postcheck failure')):
            with self.assertRaises(OSError):cache.verify_reuse_after(receipt,'GET',len(self.data),self.entry['sha256'])
        self.assertEqual(marker.read_bytes(),first);self.assertLessEqual(len(first),4096)

    def test_exact_correlated_GET_and_HEAD_proof_reject_orphans_and_replay(self):
        self.new_cache();cache=proposed.Cache(self.root/'cache',seed=self.seed())
        _,receipt=cache.fetch(REQUEST)
        events=[json.loads(x) for x in (self.root/'cache/events.jsonl').read_text().splitlines()]
        with self.assertRaisesRegex(ValueError,'orphaned'):module.verify_reuse_events(events)
        cache.verify_reuse_after(receipt,'GET',len(self.data),self.entry['sha256'])
        _,head=cache.fetch(REQUEST,method='HEAD');cache.verify_reuse_after(head,'HEAD',0,None)
        self.assertNotEqual(receipt['useId'],head['useId'])
        events=[json.loads(x) for x in (self.root/'cache/events.jsonl').read_text().splitlines()]
        self.assertEqual(module.verify_reuse_events(events),{'reuseObservations':2,'GET':1,'HEAD':1,'allResponsesPostchecked':True})
        for mutated in (events+[events[1]],events+[events[0]],
                        [{**e,'streamedSha256':'0'*64} if e['action']=='artifact-reuse-postchecked' and e['method']=='GET' else e for e in events],
                        [{**e,'streamedSha256':self.entry['sha256']} if e['action']=='artifact-reuse-postchecked' and e['method']=='HEAD' else e for e in events]):
            with self.assertRaises(ValueError):module.verify_reuse_events(mutated)

    def test_http_credentials_and_authority_reject_before_seed_use(self):
        self.new_cache();cache=proposed.Cache(self.root/'cache',seed=self.seed())
        server=proposed.Server(('127.0.0.1',0),proposed.Handler);server.cache=cache
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            port=server.server_address[1]
            with patch.object(cache.seed,'lookup',wraps=cache.seed.lookup) as lookup:
                for headers in ({'Authorization':'synthetic'},{'Proxy-Authorization':'synthetic'},
                                {'Cookie':'synthetic'},{'Host':'synthetic@127.0.0.1:'+str(port)},
                                {'Host':'other.test:'+str(port)}):
                    client=http.client.HTTPConnection('127.0.0.1',port,timeout=3)
                    client.request('GET',REQUEST,headers=headers);response=client.getresponse()
                    self.assertEqual(response.status,502);response.read();client.close()
                lookup.assert_not_called()
                client=http.client.HTTPConnection('127.0.0.1',port,timeout=3)
                client.request('GET',REQUEST);response=client.getresponse()
                self.assertEqual(response.status,200);self.assertEqual(response.read(),self.data);client.close()
                self.assertEqual(lookup.call_count,1)
        finally:
            server.shutdown();server.server_close();thread.join(2)


if __name__=='__main__':unittest.main()
