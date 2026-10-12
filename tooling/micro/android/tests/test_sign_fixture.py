import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import sign_fixture as signer


class FixtureSigningTests(unittest.TestCase):
    def test_warning_in_create_output_recovers_exact_owned_name_without_losing_first_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);source=root/'source.apk';source.write_bytes(b'synthetic unsigned bytes')
            key=root/'test-public.key';key.write_bytes(b'p'*2257)
            owner='a'*32;identifier='b'*64;name='micro-artifact-'+owner;commands=[]
            def command(argv,log,seconds=30):
                label=log.stem;commands.append(argv);code=0;data=''
                if label=='create':data='synthetic warning\n'+identifier+'\n'
                elif label=='cleanup-owner':
                    data=json.dumps([{'Id':identifier,'Name':'/'+name,'Image':signer.IMAGE,
                                      'Config':{'Labels':{'micro.artifact.owner':owner}}}])
                elif label=='cleanup-absent':code=1;data='Error: No such object: '+identifier+'\n'
                log.write_text(data)
                return {'argv':argv,'exitCode':code,'limitFailure':None,'capturedBytes':log.stat().st_size,'sha256':signer.digest(log)}
            # These mocked public-key bytes only reach the lifecycle supervisor;
            # no signing worker, APK parser or cryptography runs in this test.
            with patch.object(signer,'STATE',root/'state'),patch.object(signer,'PUBLIC_KEY',key), \
                 patch.object(signer,'KEY_SHA256',signer.digest(key)),patch.object(signer,'uuid4',return_value=SimpleNamespace(hex=owner)), \
                 patch.object(signer,'bounded',side_effect=command):
                with self.assertRaisesRegex(ValueError,'Invalid signer container identity'):
                    signer.sign(source,signer.digest(source),'malformed-create')
            receipt=json.loads((root/'state/malformed-create/receipt.json').read_text())
            self.assertEqual(receipt['cleanup'],{'absent':True})
            self.assertIn(['docker','inspect',name],commands)
            self.assertIn(['docker','rm','--force',identifier],commands)
            self.assertEqual(receipt['failure']['message'],'Invalid signer container identity')

    def fixture(self):
        paths={destination:Path('/owned'+destination) for destination in ('/input/app.apk','/input/debug.keystore','/tools','/output')}
        observed={'Id':'a'*64,'Name':'/micro-artifact-owned','Image':signer.IMAGE,
                  'Config':{'User':'1000:1000','Labels':{'micro.artifact.owner':'owned'},
                            'Entrypoint':['python3'],'Cmd':['/tools/sign_fixture_worker.py'],'Env':['HOME=/tmp','PATH=/usr/bin']},
                  'HostConfig':{'NetworkMode':'none','ReadonlyRootfs':True,'Privileged':False,
                                'Memory':1073741824,'MemorySwap':1073741824,'NanoCpus':1000000000,'PidsLimit':128,
                                'CapDrop':['ALL'],'SecurityOpt':['no-new-privileges'],'Devices':[],'PortBindings':{},'ExtraHosts':[],
                                'LogConfig':{'Type':'none'},'Tmpfs':{'/tmp':'rw,nosuid,nodev,noexec,size=67108864,mode=1777'}},
                  'Mounts':[{'Destination':dest,'Source':str(source),'RW':dest=='/output','Type':'bind'} for dest,source in paths.items()]}
        return observed,paths

    def test_only_public_fixture_sandbox_policy_is_accepted(self):
        observed,paths=self.fixture()
        self.assertTrue(all(signer.policy(observed,'a'*64,'owned',paths).values()))
        for group,key,value in [('Config','User','0:0'),('Config','Env',['BUSINESS_TOKEN=synthetic']),
                                ('HostConfig','NetworkMode','bridge'),('HostConfig','MemorySwap',2147483648),
                                ('HostConfig','Privileged',True),('HostConfig','Devices',[{'PathOnHost':'/dev/kvm'}])]:
            bad=copy.deepcopy(observed);bad[group][key]=value
            with self.subTest(key=key),self.assertRaises(ValueError): signer.policy(bad,'a'*64,'owned',paths)
        bad=copy.deepcopy(observed);bad['Mounts'][0]['RW']=True
        with self.assertRaises(ValueError):signer.policy(bad,'a'*64,'owned',paths)

    def test_changed_unsigned_artifact_fails_before_container_or_key_use(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);source=root/'source.apk';source.write_bytes(b'known trusted test bytes')
            with patch.object(signer,'STATE',root/'state'),patch.object(signer,'bounded') as docker:
                with self.assertRaisesRegex(ValueError,'Unsigned APK identity'):signer.sign(source,'a'*64,'wrong-source')
                docker.assert_not_called()
            receipt=json.loads((root/'state/wrong-source/receipt.json').read_text())
            self.assertEqual(receipt['status'],'failed');self.assertEqual(receipt['cleanup'],{'absent':True})

    def test_unknown_signing_key_never_reaches_container(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);source=root/'source.apk';source.write_bytes(b'known trusted test bytes')
            key=root/'unknown.keystore';key.write_bytes(b'public fake bytes')
            with patch.object(signer,'STATE',root/'state'),patch.object(signer,'PUBLIC_KEY',key),patch.object(signer,'bounded') as docker:
                with self.assertRaisesRegex(ValueError,'Public signing input'):signer.sign(source,signer.digest(source),'wrong-key')
                docker.assert_not_called()
            receipt=json.loads((root/'state/wrong-key/receipt.json').read_text())
            self.assertEqual(receipt['status'],'failed');self.assertEqual(receipt['cleanup'],{'absent':True})

    def test_unknown_identity_and_path_labels_cannot_create_state(self):
        with patch.object(signer,'bounded') as docker:
            for label,sha in [('../outside','a'*64),('valid','not-a-digest')]:
                with self.assertRaises(ValueError):signer.sign(Path('unused'),sha,label)
            docker.assert_not_called()


if __name__=='__main__':unittest.main()
