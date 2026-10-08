"""Synthetic receipt replay only. No APK parse, signing, Docker or network.

Two-build validator and public certificate are mocked for replay fixtures.
No key bytes are read. Separate parser tests use only constructed synthetic JKS.
Tests
must never be retained as observed build or signing proof.
"""
import copy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import admission as a
import signing_normalization as n
import signing_authority as authority
import pipeline
from fake_signing_authority import measurement as fake_measurement, authorization as fake_authorization

SYNTHETIC_KEY=b'explicit synthetic key, not a public or private JKS'
REAL_PUBLIC_CERTIFICATE=n.public_certificate


class Binding:
    source_sha=n.FIXTURE_SOURCE
    package='app.micro.factory.fixture'
    permissions=('app.micro.factory.fixture.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',)
    certificate_sha256=n.CERTIFICATE_SHA
    def validate(self, store, now):pass  # Explicit synthetic binding, no admission.
    def context(self):return {'synthetic':True,'sourceSha':self.source_sha}


class Tests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.root=Path(self.temporary.name)
        self.source=self.root/'signing';self.source.mkdir(mode=0o700)
        self.state=self.source/'synthetic';self.state.mkdir(mode=0o700)
        self.store_root=self.root/'store';self.store_root.mkdir(mode=0o700);self.store=a.Store(self.store_root)
        self.binding=Binding();self.owner='a'*32;self.identifier='b'*64
        self.binding.identities={'toolchain':self.store.write('synthetic-toolchain.json',{'artifactToolsSha256':{q:n.TOOLS[q]for q in ('aapt','apksigner')}})}
        self.started=1790767000;self.finished=self.started+10;self.now=self.finished+1
        self.iso=lambda t:datetime.fromtimestamp(t,timezone.utc).isoformat()
        def synthetic_certificate(data):
            if data!=SYNTHETIC_KEY:raise a.Rejected('Synthetic certificate input changed')
            return n.CERTIFICATE_SHA
        # Test-only overrides: real Binding, build admission and key verification
        # remain required by production proposal code. No fixture proves admission.
        self.patches=[patch.object(n,'SOURCE_ROOT',self.source),
                      patch.object(authority,'TEST_ONLY_SOURCE_ROOT',self.source),
                      patch.object(authority,'TEST_ONLY_BINDING_TYPE',Binding),
                      patch.object(pipeline,'CONTROLLER_ROOT',self.store.root),
                      patch.object(n,'public_certificate',side_effect=synthetic_certificate),
                      patch.object(a,'validate_build_pair',return_value={'unsignedApkSha256':[hashlib.sha256(b'synthetic unsigned').hexdigest()]*2})]
        self.builds=[self.store.write('synthetic-build1.json',{'finishedAt':self.started-2}),
                     self.store.write('synthetic-build2.json',{'finishedAt':self.started-1})]
        for p in self.patches:p.start()
        self.addCleanup(lambda:[p.stop()for p in reversed(self.patches)])
        self.addCleanup(self.temporary.cleanup)
        self.unsigned=b'synthetic unsigned';self.signed=b'synthetic signed'
        self.paths={'/input/app.apk':self.state/'unsigned.apk','/input/debug.keystore':self.state/'debug.keystore','/tools':self.state/'tools','/output':self.state/'artifacts'}
        self.state.joinpath('tools').mkdir();self.state.joinpath('artifacts').mkdir()
        self.state.joinpath('unsigned.apk').write_bytes(self.unsigned)
        self.state.joinpath('debug.keystore').write_bytes(SYNTHETIC_KEY)
        self.state.joinpath('artifacts/app.apk').write_bytes(self.signed)
        kit=n.KIT_ROOT
        for name in ('sign_fixture_worker.py','inspect_apk.py'):self.state.joinpath('tools',name).write_bytes((kit/name).read_bytes())
        self.before={'Id':self.identifier,'Name':'/micro-artifact-'+self.owner,'Image':a.IMAGE,'Path':'python3','Args':['/tools/sign_fixture_worker.py'],
                     'Config':{'User':'1000:1000','Labels':{'micro.artifact.owner':self.owner},'Entrypoint':['python3'],'Cmd':['/tools/sign_fixture_worker.py'],'Env':n.ENVIRONMENT,'WorkingDir':'/tmp'},
                     'HostConfig':{'NetworkMode':'none','ReadonlyRootfs':True,'Privileged':False,'Memory':1073741824,'MemorySwap':1073741824,'NanoCpus':1000000000,'PidsLimit':128,'CapAdd':None,'Binds':None,'VolumesFrom':None,'PidMode':'','IpcMode':'private','UsernsMode':'','CgroupnsMode':'private','Runtime':'runc','Ulimits':[{'Name':name,'Soft':value,'Hard':value}for name,value in n.ULIMITS.items()],'CapDrop':['ALL'],'SecurityOpt':['no-new-privileges'],'Devices':[],'PortBindings':{},'ExtraHosts':[],'LogConfig':{'Type':'none'},'Tmpfs':{'/tmp':'rw,nosuid,nodev,noexec,size=67108864,mode=1777'}},
                     'Mounts':[{'Source':str(source),'Destination':dest,'RW':dest=='/output','Type':'bind'}for dest,source in self.paths.items()],
                     'State':{'Status':'created','Running':False,'OOMKilled':False,'ExitCode':0,'Error':''}}
        self.after=copy.deepcopy(self.before);self.after['State']={'Status':'exited','Running':False,'OOMKilled':False,'ExitCode':0,'Error':'','StartedAt':self.iso(self.started+1),'FinishedAt':self.iso(self.finished-1)}
        self.inspection={'schema':'micro.android.apk-inspection/1','status':'inspected','apkSha256':hashlib.sha256(self.signed).hexdigest(),'apkBytes':len(self.signed),'certificateSha256':n.CERTIFICATE_SHA,
                         'toolSha256':{q:n.TOOLS[q]for q in ('aapt','apksigner')},'bundle':{'sha256':'c'*64,'bytes':20,'entryCount':10,'declaredExpandedBytes':100},
                         'metadata':{'package':self.binding.package,'versionCode':1,'versionName':'1.0.0','minSdk':24,'targetSdk':36,'debuggable':False,'abis':['x86_64'],'permissions':list(self.binding.permissions)},
                         'scope':'artifact identity only; no source, vulnerability, installation or product verdict'}
        self.worker={'schema':'micro.fixture-signing-worker/1','status':'signed','unsignedApkSha256':hashlib.sha256(self.unsigned).hexdigest(),'publicKeySha256':n.KEY_SHA,'inspection':self.inspection,'toolSha256':n.TOOLS,'scope':'public synthetic test key only; no production signing authority'}
        self.raw={'schema':'micro.fixture-signing-supervisor/1','owner':self.owner,'image':a.IMAGE,'supervisorSha256':n.PINS['sign_fixture.py'],'startedAt':self.iso(self.started),'finishedAt':self.iso(self.finished),'commands':[],
                  'status':'signed','cleanup':{'absent':True},'scope':'public fixture test signing only','inputs':{'unsignedApkSha256':hashlib.sha256(self.unsigned).hexdigest(),'unsignedApkBytes':len(self.unsigned),'publicKeySha256':n.KEY_SHA,'workerSha256':n.PINS['sign_fixture_worker.py'],'inspectorSha256':n.PINS['inspect_apk.py'],'commandHelperSha256':n.PINS['artifact_supervisor.py']},
                  'runtimePolicy':n.runtime_policy(self.before,self.identifier,self.owner,self.paths),'state':self.after['State'],'worker':self.worker}
        self.refresh()
        measured=fake_measurement(self.store,self.source,self.now)
        self.binding.identities['toolchain']=self.store.write('FAKE-measured-toolchain.json',
            {'artifactToolsSha256':{q:n.TOOLS[q] for q in ('aapt','apksigner')},'signingTools':measured})

    def refresh(self):
        name='micro-artifact-'+self.owner
        data=[self.identifier+'\n',json.dumps([self.before]),json.dumps(self.raw['worker'])+'\n',json.dumps([self.after]),json.dumps([self.after]),self.identifier+'\n','Error: No such object: '+self.identifier+'\n','']
        argvs=[n.create_argv(self.owner,self.paths),['docker','inspect',self.identifier],['docker','start','--attach',self.identifier],['docker','inspect',self.identifier],['docker','inspect',self.identifier],['docker','rm','--force',self.identifier],['docker','inspect',self.identifier],['docker','ps','--all','--quiet','--no-trunc','--filter','name=^/'+name+'$','--filter','label=micro.artifact.owner='+self.owner]]
        self.raw['commands']=[]
        for index,label in enumerate(n.COMMANDS):
            content=data[index].encode();self.state.joinpath(label+'.log').write_bytes(content)
            self.raw['commands'].append({'argv':argvs[index],'exitCode':1 if label=='cleanup-absent'else 0,'seconds':0.1,'capturedBytes':len(content),'sha256':hashlib.sha256(content).hexdigest(),'limitFailure':None})
        self.write_raw()

    def write_raw(self):self.state.joinpath('receipt.json').write_text(json.dumps(self.raw)+'\n')
    def replay(self):
        unsigned=self.store_root/('FAKE-unsigned-'+__import__('uuid').uuid4().hex)
        unsigned.write_bytes(self.unsigned);unsigned.chmod(0o400)
        raw_authority=fake_authorization(self.store,self.binding,self.builds,
            self.store.describe(unsigned.name),self.started-0.5)
        self.raw['authorization']=raw_authority.json();self.write_raw()
        selected=authority.bind_terminal_signer('synthetic',a.Store(self.source).describe('synthetic/receipt.json'))
        snapshot=n.copy_terminal(self.store,selected,'snapshot'+str(len(list(self.store_root.iterdir()))))
        return n.replay(snapshot,self.store,self.binding,self.builds,self.now)

    def test_synthetic_success_preserves_raw_time_log_refs_and_replays(self):
        result=self.replay();self.assertEqual(result['startedAt'],self.started);self.assertEqual(result['finishedAt'],self.finished)
        self.assertEqual(result['certificateSha256'],n.CERTIFICATE_SHA)
        n.validate_normalized(result,self.store,self.binding,self.builds,self.now)
        self.assertIn('receipt.json',result['rawReceipt']['path'])

    def test_raw_failed_or_extra_authority_never_normalizes(self):
        for patch_value in ({'status':'failed'},{'failure':{'message':'synthetic'}},{'cleanup':{'absent':False}},{'owner':'short'}):
            with self.subTest(value=patch_value):
                original=copy.deepcopy(self.raw);self.raw.update(patch_value);self.write_raw()
                with self.assertRaises(a.Rejected):self.replay()
                self.raw=original

    def test_clock_mismatch_expiry_future_and_runtime_interval(self):
        for field,value in [('startedAt',self.iso(self.finished+1)),('finishedAt',self.iso(self.now+1)),('finishedAt',self.iso(self.now-4000)),('startedAt','no-zone')]:
            with self.subTest(field=field,value=value):
                original=copy.deepcopy(self.raw);self.raw[field]=value;self.write_raw()
                with self.assertRaises(a.Rejected):self.replay()
                self.raw=original
        self.after['State']['FinishedAt']=self.iso(self.finished+1);self.raw['state']=self.after['State'];self.refresh()
        with self.assertRaises(a.Rejected):self.replay()

    def test_actual_runtime_failure_or_full_owner_change(self):
        for state in ({'OOMKilled':True},{'ExitCode':1},{'Running':True}):
            original=copy.deepcopy(self.after);self.after['State'].update(state);self.raw['state']=self.after['State'];self.refresh()
            with self.assertRaises(a.Rejected):self.replay()
            self.after=original
        self.after['Id']='f'*64;self.refresh()
        with self.assertRaises(a.Rejected):self.replay()

    def test_certificate_input_output_and_binding_mismatches(self):
        self.binding.certificate_sha256='f'*64
        with self.assertRaises(a.Rejected):self.replay()
        self.binding.certificate_sha256=n.CERTIFICATE_SHA;self.raw['worker']['inspection']['certificateSha256']='f'*64;self.refresh()
        with self.assertRaises(a.Rejected):self.replay()

    def test_fixed_public_key_hash_and_size_mismatch(self):
        self.state.joinpath('debug.keystore').write_bytes(b'x'*2257)
        with self.assertRaises(a.Rejected):self.replay()
        with self.assertRaises(a.Rejected):REAL_PUBLIC_CERTIFICATE(SYNTHETIC_KEY+b'x')

    def test_signed_unsigned_tool_or_metadata_bytes_change(self):
        for name in ('unsigned.apk','artifacts/app.apk','tools/inspect_apk.py'):
            f=self.state/name;original=f.read_bytes();f.write_bytes(original+b'x')
            with self.assertRaises(a.Rejected):self.replay()
            f.write_bytes(original)
        self.raw['worker']['inspection']['metadata']['debuggable']=True;self.refresh()
        with self.assertRaises(a.Rejected):self.replay()

    def test_command_exit_limits_hash_duration_and_recipe(self):
        for field,value in [('exitCode',1),('limitFailure','output-limit'),('sha256','e'*64),('seconds',126),('capturedBytes',True),('argv',['docker','run'])]:
            original=copy.deepcopy(self.raw);self.raw['commands'][2][field]=value;self.write_raw()
            with self.assertRaises(a.Rejected):self.replay()
            self.raw=original
        self.raw['commands'][0]['argv']=['docker','create','--network=host'];self.write_raw()
        with self.assertRaises(a.Rejected):self.replay()

    def test_missing_or_tampered_cleanup_actual_list(self):
        self.state.joinpath('cleanup-list.log').write_text(self.identifier+'\n');c=self.raw['commands'][-1];c['capturedBytes']=65;c['sha256']=hashlib.sha256((self.identifier+'\n').encode()).hexdigest();self.write_raw()
        with self.assertRaises(a.Rejected):self.replay()

    def test_runtime_unknown_env_socket_mount_or_float_bounds(self):
        for group,key,value in [('Config','Env',['TOKEN=synthetic']),('HostConfig','Memory',1073741824.0),('HostConfig','NetworkMode','bridge')]:
            original=copy.deepcopy(self.before);self.before[group][key]=value;self.refresh()
            with self.assertRaises(a.Rejected):self.replay()
            self.before=original
        self.before['Mounts'].append({'Source':'/var/run/docker.sock','Destination':'/socket','RW':True,'Type':'bind'});self.refresh()
        with self.assertRaises(a.Rejected):self.replay()

    def test_snapshot_changed_after_copy_or_normalized_booleans_do_not_pass(self):
        value=self.replay();bad=copy.deepcopy(value);bad['cleanup']={'absent':True,'syntheticPass':True}
        with self.assertRaises(a.Rejected):n.validate_normalized(bad,self.store,self.binding,self.builds,self.now)
        path=self.store.path(value['rawReceipt']['path']);path.chmod(0o600);path.write_text('{}')
        with self.assertRaises(a.Rejected):n.validate_normalized(value,self.store,self.binding,self.builds,self.now)

    def test_source_alias_missing_extra_and_hardlinks_rejected(self):
        p=self.state/'unexpected';p.write_text('synthetic')
        with self.assertRaises(a.Rejected):self.replay()
        p.unlink();(self.state/'unsigned.apk').unlink();(self.state/'unsigned.apk').symlink_to(self.root/'absent')
        with self.assertRaises(a.Rejected):self.replay()

    def test_actual_hardlink_private_root_and_build_failure_rejected(self):
        os.link(self.state/'unsigned.apk',self.root/'unsigned-alias')
        with self.assertRaises(a.Rejected):self.replay()
        (self.root/'unsigned-alias').unlink();self.state.chmod(0o755)
        with self.assertRaises(a.Rejected):self.replay()
        self.state.chmod(0o700)
        with patch.object(a,'validate_build_pair',side_effect=a.Rejected('Actual two builds unavailable')):
            with self.assertRaisesRegex(a.Rejected,'two builds'):self.replay()

    def test_wrong_context_or_fake_normalized_time_rejected(self):
        result=self.replay()
        for field,value in [('context',{'synthetic':False}),('startedAt',self.started+1),('rawReceipt',{'path':'unknown','sha256':'f'*64,'bytes':0})]:
            bad={**result,field:value}
            with self.assertRaises(a.Rejected):n.validate_normalized(bad,self.store,self.binding,self.builds,self.now)

    def test_complete_copy_extra_file_hardlink_or_wrong_toolchain_rejected(self):
        value=self.replay();root=self.store.path(value['snapshot']['path']).parent
        (root/'unexpected').write_text('synthetic');(root/'unexpected').chmod(0o400)
        with self.assertRaises(a.Rejected):n.validate_normalized(value,self.store,self.binding,self.builds,self.now)
        (root/'unexpected').unlink()
        self.binding.identities['toolchain']=self.store.write('wrong-toolchain.json',{'artifactToolsSha256':{'aapt':'f'*64,'apksigner':'f'*64}})
        with self.assertRaises(a.Rejected):self.replay()

    def test_closed_schema_requires_raw_and_rejects_boolean_exit_extra_authority(self):
        from jsonschema import Draft202012Validator
        schema=json.loads(Path(n.__file__).with_name('signing-receipt.schema.json').read_bytes())
        value=self.replay();value['context']={'projectId':'synthetic-fixture','adapterId':'expo-android','sourceSha':n.FIXTURE_SOURCE,'identities':{key:'f'*64 for key in a.IDENTITIES}}
        validator=Draft202012Validator(schema);validator.validate(value)
        for field,change in [('rawReceipt',None),('exitCode',True),('cleanup',{'absent':True,'pretend':True})]:
            bad=copy.deepcopy(value)
            if change is None:bad.pop(field)
            else:bad[field]=change
            self.assertTrue(list(validator.iter_errors(bad)))



    def test_actual_host_projection_rejects_each_mutation_in_both_observations(self):
        mutations=[('CapAdd',['SYS_ADMIN']),('SecurityOpt',['no-new-privileges','seccomp=unconfined']),
                   ('SecurityOpt',['no-new-privileges','apparmor=unconfined']),
                   ('Ulimits',[]),('PidMode','host'),('IpcMode','host'),('UsernsMode','host'),
                   ('CgroupnsMode','host'),('Runtime','unapproved-runtime'),('Privileged',0),
                   ('Binds',['/var/run/docker.sock:/socket']),('VolumesFrom',['host-data']),
                   ('Ulimits',[{'Name':name,'Soft':float(value),'Hard':value}for name,value in n.ULIMITS.items()]),
                   ('Ulimits',[{'Name':'core','Soft':0,'Hard':0}]*3)]
        for observation in ('before','after'):
            for key,value in mutations:
                with self.subTest(observation=observation,key=key,value=value):
                    saved=copy.deepcopy(getattr(self,observation))
                    getattr(self,observation)['HostConfig'][key]=value
                    self.refresh()
                    with self.assertRaises(a.Rejected):self.replay()
                    setattr(self,observation,saved)
        self.refresh()
        self.replay()

    def test_original_source_is_retained_and_rechecked_at_replay(self):
        value=self.replay()
        path=self.state/'create.log';data=path.read_bytes()
        path.write_bytes(data+b'changed')
        with self.assertRaisesRegex(a.Rejected,'lineage'):
            n.validate_normalized(value,self.store,self.binding,self.builds,self.now)
        path.write_bytes(data)
        (self.state/'unexpected').write_text('synthetic')
        with self.assertRaises(a.Rejected):n.validate_normalized(value,self.store,self.binding,self.builds,self.now)
        (self.state/'unexpected').unlink()
        self.state.rename(self.source/'removed-original')
        with self.assertRaises(a.Rejected):n.validate_normalized(value,self.store,self.binding,self.builds,self.now)

    def test_source_lineage_rechecked_after_replay(self):
        value=self.replay();original=n._verify_lineage;calls=[]
        def changing_source(root,refs):
            calls.append(root)
            if len(calls)==2:(self.state/'create.log').write_bytes(b'changed')
            return original(root,refs)
        with patch.object(n,'_verify_lineage',side_effect=changing_source):
            with self.assertRaisesRegex(a.Rejected,'lineage'):
                n.validate_normalized(value,self.store,self.binding,self.builds,self.now)
        self.assertEqual(len(calls),2)

    def test_malformed_runtime_json_and_unicode_use_caller_rejected_class(self):
        for content in (b'[null]',b'[42]',b'[{"HostConfig":null}]',b'not json',b'\xff'):
            with self.subTest(content=content):
                self.refresh();path=self.state/'inspect-before.log';path.write_bytes(content)
                command=self.raw['commands'][1];command['capturedBytes']=len(content);command['sha256']=hashlib.sha256(content).hexdigest();self.write_raw()
                with self.assertRaises(a.Rejected):self.replay()

    def test_signing_must_start_after_both_admitted_builds_and_exit(self):
        value=self.replay()
        self.builds[1]=self.store.write('late-build.json',{'finishedAt':self.started+1})
        with self.assertRaisesRegex(a.Rejected,'both admitted builds'):
            n.validate_normalized(value,self.store,self.binding,self.builds,self.now)
        self.builds[1]=self.store.describe('synthetic-build2.json')
        self.after['State']['Status']='dead';self.raw['state']=self.after['State'];self.refresh()
        with self.assertRaisesRegex(a.Rejected,'not exited'):self.replay()

    def test_code_reads_are_bounded_nofollow_and_race_checked(self):
        code=self.root/'code.py';code.write_bytes(b'synthetic code')
        self.assertEqual(n.code_evidence(code,'code.py').bytes,14)
        with self.assertRaises(a.Rejected):n.code_evidence(code,'code.py',13)
        alias=self.root/'alias.py';alias.symlink_to(code)
        with self.assertRaises(a.Rejected):n.code_evidence(alias,'alias.py')
        os.link(code,self.root/'hardlink.py')
        with self.assertRaises(a.Rejected):n.code_evidence(code,'code.py')
        (self.root/'hardlink.py').unlink()
        original=os.read;changed=False
        def racing_read(fd,size):
            nonlocal changed
            data=original(fd,size)
            if data and not changed:
                changed=True;code.write_bytes(b'changed content')
            return data
        with patch.object(n.os,'read',side_effect=racing_read):
            with self.assertRaises(a.Rejected):n.code_evidence(code,'code.py')

    def test_package_import_uses_the_same_admission_and_rejected_class(self):
        import importlib
        import sys
        import types
        package_name='_synthetic_signing_package'
        package=types.ModuleType(package_name)
        package.__path__=[str(n.KIT_ROOT),str(Path(n.__file__).parent)]
        sys.modules[package_name]=package
        try:
            admission=importlib.import_module(package_name+'.admission')
            normalization=importlib.import_module(package_name+'.signing_normalization')
            self.assertIs(normalization.a,admission)
            self.assertIs(normalization.a.Rejected,admission.Rejected)
            self.assertNotIn(package_name+'.sign_fixture',sys.modules)
            with self.assertRaises(admission.Rejected):
                normalization.replay(None,None,None,None,None)
        finally:
            for name in list(sys.modules):
                if name==package_name or name.startswith(package_name+'.'):
                    del sys.modules[name]

    def test_copy_budget_reserves_code_snapshot_and_rechecks_during_copy(self):
        files=sum(a.Store(self.state).describe(name,limit).bytes for name,limit in n.FILES.items())
        budget=self.store.budget();baseline=max(budget['regularBytes'],budget['allocatedBytes'])
        # Previously the 8MiB slack would allow this, despite 12MiB code+manifest maxima.
        with patch.object(a,'STORE_BYTES',baseline+files+9*n.LOG_LIMIT):
            with self.assertRaisesRegex(a.Rejected,'complete copy'):self.replay()
        original=self.store.budget;calls=[]
        def growing_budget():
            current=original();calls.append(current)
            if len(calls)>=4:current['allocatedBytes']=a.STORE_BYTES
            return current
        with patch.object(self.store,'budget',side_effect=growing_budget):
            with self.assertRaises(a.Rejected):self.replay()
        self.assertGreaterEqual(len(calls),4)


class PublicParserTests(unittest.TestCase):
    def test_real_parser_rejects_wrong_size_hash_without_real_key_reads(self):
        for data in (b'',SYNTHETIC_KEY,b'x'*2257,b'x'*2258):
            with self.subTest(size=len(data)):
                with self.assertRaisesRegex(a.Rejected,'Known public signing input differs'):
                    REAL_PUBLIC_CERTIFICATE(data)

    def test_constructed_jks_exercises_structure_integrity_and_certificate_pins(self):
        import struct
        def integer(value):return struct.pack('>I',value)
        def utf(value):return struct.pack('>H',len(value))+value
        cert=b'\x30synthetic certificate'
        prefix=b''.join([integer(0xFEEDFEED),integer(2),integer(1),integer(1),utf(b'androiddebugkey'),b'\x00'*8])
        suffix=integer(1)+utf(b'X.509')+integer(len(cert))+cert
        encrypted=b'X'*(2257-20-len(prefix)-4-len(suffix))
        body=prefix+integer(len(encrypted))+encrypted+suffix
        checksum=hashlib.sha1('android'.encode('utf-16be')+b'Mighty Aphrodite'+body).digest()
        data=body+checksum
        # Explicit test-only pins let the unchanged restricted parser process
        # constructed bytes; they are never usable by replay/capability admission.
        with patch.object(n,'KEY_SHA',hashlib.sha256(data).hexdigest()),patch.object(n,'CERTIFICATE_SHA',hashlib.sha256(cert).hexdigest()):
            self.assertEqual(REAL_PUBLIC_CERTIFICATE(data),hashlib.sha256(cert).hexdigest())
            with patch.object(n,'CERTIFICATE_SHA','f'*64):
                with self.assertRaisesRegex(a.Rejected,'fingerprint'):REAL_PUBLIC_CERTIFICATE(data)
        bad=data[:-1]+bytes([data[-1]^1])
        with patch.object(n,'KEY_SHA',hashlib.sha256(bad).hexdigest()):
            with self.assertRaisesRegex(a.Rejected,'checksum'):REAL_PUBLIC_CERTIFICATE(bad)
        bad=integer(0)+data[4:]
        with patch.object(n,'KEY_SHA',hashlib.sha256(bad).hexdigest()):
            with self.assertRaisesRegex(a.Rejected,'structure'):REAL_PUBLIC_CERTIFICATE(bad)


if __name__=='__main__':unittest.main()
