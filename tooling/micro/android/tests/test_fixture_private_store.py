"""Known synthetic byte inventories and mocked private operations, no SQL/ADB/C."""
import copy
from dataclasses import replace
import hashlib
from io import BytesIO
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import Mock, patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import admission as a
import fixture_private_store as p
import fixture_store_validation as v
import device
from test_android_device import MockDevice
from test_android_pipeline import SyntheticFixture

BODY=b'FAKE opaque bytes, never opened as SQL'
SHA=hashlib.sha256(BODY).hexdigest()
LABEL='u:object_r:app_data_file:s0:c123,c456'
def inventory(files=True,parent=True):
    rows=['PACKAGE|10123','DIR|10123|10123|700|2|4096','LABEL|'+LABEL]
    if not parent:return ('\n'.join(rows+['PARENT|absent','STORE|absent'])+'\n').encode()
    rows+=['DIR|10123|10123|700|2|4096','LABEL|'+LABEL]
    if not files:return ('\n'.join(rows+['STORE|absent'])+'\n').encode()
    rows+=['STORE|10123|10123|700|2|4096','LABEL|'+LABEL,
        'FILE|factory-fixture.db|10123|10123|600|1|'+str(len(BODY)),
        'LABEL|'+LABEL,'SHA|'+SHA]
    return ('\n'.join(rows)+'\n').encode()

def tar_bytes(name='factory-fixture.db',body=BODY,kind=tarfile.REGTYPE):
    output=BytesIO()
    with tarfile.open(fileobj=output,mode='w',format=tarfile.USTAR_FORMAT) as archive:
        item=tarfile.TarInfo(name);item.size=len(body);item.uid=item.gid=10123;item.mode=0o600;item.type=kind
        archive.addfile(item,BytesIO(body) if item.isreg() else None)
    return output.getvalue()

class Inputs(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);self.store=a.Store(Path(tmp.name))
        path=self.store.path('input/factory-fixture.db');path.parent.mkdir();path.write_bytes(BODY)
        self.file=self.store.describe('input/factory-fixture.db')
        self.store.path('validation').mkdir()
        self.manifest=self.store.write('input/manifest.json',dict(schema='micro.fixture-store/1',
            package=p.PACKAGE,version=1,files=[dict(name='factory-fixture.db',bytes=len(BODY),sha256=SHA)]))
        self.source=self.store.write('input/collection.json',dict(schema='micro.android.fixture-store-collection/1',status='collected',
            collectorSha256=hashlib.sha256(Path(p.__file__).read_bytes()).hexdigest(),
            deviceControllerSha256=hashlib.sha256(Path(device.__file__).read_bytes()).hexdigest(),
            manifest=self.manifest.json(),files={'factory-fixture.db':self.file.json()}))
        self.collection=p.Collection(self.source,self.manifest,(('factory-fixture.db',self.file),))
        self.result=dict(schema='micro.fixture-store-supervisor/1',status='validated',
            manifest=self.manifest.json(),files={'factory-fixture.db':self.file.json()},image=v.IMAGE,
            cleanup={'absent':True},state=dict(Running=False,OOMKilled=False,ExitCode=0),
            runtime={k:True for k in ('identity','user','isolation','resources','exposure','logs','tmpfs','command','mounts')},
            worker=dict(status='validated',package=p.PACKAGE,userVersion=1,manifestSha256=self.manifest.sha256,
                files=self.store.json(self.manifest)['files'],rows=[dict(id='counter-a',value=2),dict(id='counter-b',value=1)]),
            supervisorSha256=hashlib.sha256(Path(v.__file__).read_bytes()).hexdigest(),
            workerSha256=hashlib.sha256(Path(v.__file__).with_name('recovery_store.py').read_bytes()).hexdigest(),
            commandHelperSha256=hashlib.sha256(Path(v.__file__).with_name('artifact_supervisor.py').read_bytes()).hexdigest())
    def receipt(self,result):return self.store.write('validation/'+p.uuid4().hex+'.json',result)
    def test_inventory_empty_parent_full_manifest_and_unsafe_variants(self):
        self.assertIsNone(p.parse_inventory(inventory(False))['store'])
        self.assertIsNone(p.parse_inventory(inventory(False,False))['parentMetadata'])
        self.assertEqual(p.parse_inventory(inventory())['files'][0]['sha256'],SHA)
        for raw in (inventory().replace(b'600|1',b'600|2'),
                    inventory().replace(b'factory-fixture.db|',b'other.db|'),
                    inventory().replace(b'600|1',b'602|1'),
                    inventory().replace(LABEL.encode(),b'u:object_r:other:s0',1),
                    inventory().replace(b'PACKAGE|10123',b'PACKAGE|999'),
                    inventory()+b'EXTRA\n',inventory().replace(b'10123|10123',b'10123|10124',1)):
            with self.subTest(raw=raw[:80]),self.assertRaises(a.Rejected):p.parse_inventory(raw)
    def test_archive_body_links_aliases_trailing_unknown_and_size_block(self):
        expected=p.parse_inventory(inventory())
        self.assertEqual(p.unpack(tar_bytes(),expected),{'factory-fixture.db':BODY})
        for raw in (tar_bytes('../factory-fixture.db'),tar_bytes(body=b'wrong'),
                    tar_bytes(kind=tarfile.SYMTYPE),tar_bytes()+b'unrecorded',
                    b'x'*(p.ARCHIVE_LIMIT+1)):
            with self.assertRaises(a.Rejected):p.unpack(raw,expected)
    def test_validation_exact_2_1_subject_runtime_authority_and_no_sentinel(self):
        p.validate_restore_input(self.store,self.collection,self.receipt(self.result))
        variants=[]
        for key,value in [('status','rejected'),('image','wrong'),('cleanup',{'absent':False}),
                          ('workerSha256','0'*64),('files',{}),('state',dict(Running=False,OOMKilled=True,ExitCode=0))]:
            variant=copy.deepcopy(self.result);variant[key]=value;variants.append(variant)
        variant=copy.deepcopy(self.result);variant['worker']['rows'].append(dict(id='sentinel',value=1));variants.append(variant)
        variant=copy.deepcopy(self.result);variant['runtime']['mounts']=False;variants.append(variant)
        for variant in variants:
            with self.assertRaises(a.Rejected):p.validate_restore_input(self.store,self.collection,self.receipt(variant))
    def test_wrong_product_and_incompatible_before_any_target_operation(self):
        for field,value in [('package','other'),('version',2)]:
            manifest=self.store.json(self.manifest);manifest[field]=value
            changed=self.store.write('input/'+p.uuid4().hex+'.json',manifest)
            collection=replace(self.collection,manifest=changed)
            source=self.store.json(self.source);source['manifest']=changed.json()
            collection=replace(collection,receipt=self.store.write('input/'+p.uuid4().hex+'.json',source))
            adapter=Mock(store=self.store,role='factory-target')
            with self.assertRaises(a.Rejected):p.restore(adapter,collection,self.receipt(self.result),self.file)
            adapter._fixture_private_operation.assert_not_called()
    def test_pending_binary_calibration_blocks_before_target_calls(self):
        adapter=Mock(store=self.store,role='factory-target')
        with self.assertRaisesRegex(a.Rejected,'calibration pending'):
            p.restore(adapter,self.collection,self.receipt(self.result),self.file)
        adapter._fixture_private_operation.assert_not_called()
    def run_restore(self,failures=(),parent=True):
        validation=self.receipt(self.result)
        class Adapter:
            role='factory-target';store=self.store;_lease_pin='FAKE-lease';_installed={'apkSha256':'FAKE-apk'}
            def __init__(inner):inner.calls=[];inner.committed=False
            def _fixture_private_operation(inner,operation,**kwargs):
                inner.calls.append(operation)
                if operation in failures:raise a.Rejected('FAKE '+operation+' failure')
                if operation=='inventory':return inventory(inner.committed,parent=parent or inner.committed)
                if operation=='stage-inventory':return inventory()
                if operation=='commit':inner.committed=True
                return b'FAKE bounded mocked helper response'
        adapter=Adapter()
        with patch.object(p,'admitted_helper',return_value=b'FAKE Android binary'):
            try:ref=p.restore(adapter,self.collection,validation,self.file)
            except a.Rejected as error:ref=error.restore_evidence
        return adapter,self.store.json(ref)
    def test_mocked_empty_target_restore_seals_before_hash_gate_then_commit(self):
        adapter,result=self.run_restore()
        self.assertEqual(result['status'],'committed')
        self.assertLess(adapter.calls.index('seal'),adapter.calls.index('stage-inventory'))
        self.assertLess(adapter.calls.index('stage-inventory'),adapter.calls.index('commit'))
        self.assertTrue(result['stageCleanup']['absent'])
        self.assertTrue(result['helperCleanup']['absent'])
    def test_never_launched_missing_files_parent_preserved_in_receipt(self):
        _,result=self.run_restore(parent=False)
        self.assertIsNone(result['emptyTarget']['parentMetadata'])
        self.assertEqual(result['status'],'committed')
    def test_first_transfer_failure_and_cleanup_failure_are_separate(self):
        adapter,result=self.run_restore({'transfer','cleanup'})
        self.assertIn('transfer',result['failure']['reason'])
        self.assertIn('cleanup',result['cleanupFailure']['reason'])
        self.assertIsNone(result['stageCleanup']['absent'])
        self.assertIn('helper-cleanup',adapter.calls);self.assertNotIn('commit',adapter.calls)
    def test_uncertain_commit_never_deletes_sqlite_or_launches(self):
        adapter,result=self.run_restore({'commit'})
        self.assertTrue(result['commitAttempted']);self.assertEqual(result['status'],'failed')
        self.assertIn('cleanup',adapter.calls)
        self.assertNotIn('launch',adapter.calls)
    def test_script_templates_reject_external_arguments_and_keep_fixed_paths(self):
        for operation in ('inventory','collect'):
            text=p.fixed_script(operation,10123)
            self.assertIn(p.ROOT,text);self.assertNotIn('adb root',text)
        for owner in ('../bad','f'*31,'G'*32):
            with self.assertRaises(a.Rejected):p.fixed_script('bootstrap',10123,owner=owner,label=LABEL,gid=10123)
        with self.assertRaises(a.Rejected):p.fixed_script('external-command',10123)
        with self.assertRaises(a.Rejected):p.fixed_script('bootstrap',True,owner='f'*32,label=LABEL,gid=10123)
        with self.assertRaises(a.Rejected):p.fixed_script('bootstrap',10123,owner='f'*32,label='label; command',gid=10123)


    def test_collection_freezes_complete_bytes_and_failure_has_separate_receipt(self):
        class Adapter:
            role='factory-source';store=self.store;_lease_pin='FAKE lease';_installed={'apkSha256':'FAKE APK'}
            def __init__(inner,changed=False):inner.calls=0;inner.changed=changed
            def _fixture_store_call(inner,operation):
                inner.calls+=1
                if operation=='collect':return tar_bytes()
                return inventory().replace(SHA.encode(),b'0'*64) if inner.changed and inner.calls==3 else inventory()
        collection=p.collect(Adapter())
        self.assertEqual(self.store.read(dict(collection.files)['factory-fixture.db']),BODY)
        self.assertEqual(self.store.json(collection.receipt)['status'],'collected')
        with self.assertRaises(a.Rejected) as caught:p.collect(Adapter(True))
        result=self.store.json(caught.exception.collection_evidence)
        self.assertEqual(result['status'],'failed');self.assertEqual(result['files'],{})
        self.assertIn('changed during collection',result['failure']['reason'])


class DeviceScope(unittest.TestCase):
    def test_scope_pending_calibration_never_calls_backend(self):
        adapter=device.Device('factory-target',backend=device.Backend(transport=Mock()),store=Mock())
        with self.assertRaisesRegex(a.Rejected,'calibration pending'):adapter.collect_fixture_store()
        adapter.backend.transport.assert_not_called()
        other=device.Device('budget-v3',backend=device.Backend(transport=Mock()),store=Mock())
        with self.assertRaises(a.Rejected):other.collect_fixture_store()
        other.backend.transport.assert_not_called()
    def test_transport_rejects_invalid_stdin_before_socket_or_child(self):
        with patch.object(device.socket,'create_connection') as socket,patch.object(device.subprocess,'Popen') as child:
            for payload in ('not bytes',b'x'*(p.ARCHIVE_LIMIT+1)):
                with self.assertRaises(a.Rejected):device._transport(('FAKE',),1,1,payload)
            socket.assert_not_called();child.assert_not_called()



    def adapter(self,wrong_hash=False,wrong_uid=False,helper_result=None):
        adapter=device.Device('factory-target',backend=device.Backend(transport=Mock(),transport_input=Mock(return_value=b'')),store=Mock())
        adapter._ensure_installed=Mock();adapter.verify_lease=Mock()
        owner='a'*32;binary='b'*64
        def call(args,**kwargs):
            if args[:4]==('shell','pm','list','packages'):
                return b'package:app.micro.factory.fixture uid:0\n' if wrong_uid else b'package:app.micro.factory.fixture uid:10123\n'
            if args[-1].endswith('sha256sum "$D/helper"\n'):
                return ((('0'*64) if wrong_hash else binary)+'  '+p.ROOT+'/files/.micro-fixture-helper-'+owner+'/helper\n').encode()
            return json.dumps(helper_result or dict(status='prepare-completed',owner=owner,uid=10123,gid=10123)).encode()
        adapter._call=Mock(side_effect=call)
        return adapter,owner,binary
    def test_fixed_helper_hash_is_rechecked_before_each_helper_mutation(self):
        adapter,owner,binary=self.adapter()
        with patch.object(p,'DEVICE_CALIBRATION',{'status':'reviewed','scope':'FAKE mock only'}),patch.object(p,'HELPER_BINARY_SHA256',binary):
            adapter._fixture_private_operation('prepare',owner=owner,sizes={'factory-fixture.db':len(BODY)})
        args=[entry.args[0] for entry in adapter._call.call_args_list]
        self.assertTrue(any('sha256sum "$D/helper"' in argv[-1] for argv in args))
        self.assertEqual(args[-1][0:3],('exec-out','/system/xbin/su','0'))
        self.assertEqual(args[-1][4:7],('prepare',owner,'10123'))
    def test_hash_mismatch_and_changed_uid_block_helper_execution(self):
        for kwargs in ({'wrong_hash':True},{'wrong_uid':True}):
            adapter,owner,binary=self.adapter(**kwargs)
            with patch.object(p,'DEVICE_CALIBRATION',{'status':'reviewed','scope':'FAKE mock only'}),patch.object(p,'HELPER_BINARY_SHA256',binary):
                with self.assertRaises(a.Rejected):adapter._fixture_private_operation('prepare',owner=owner,sizes={'factory-fixture.db':len(BODY)})
            self.assertFalse(any('/files/.micro-fixture-helper-' in entry.args[0][3] if len(entry.args[0])>3 else False for entry in adapter._call.call_args_list))
    def test_cleanup_cannot_default_missing_uid_or_unknown_stage_absence(self):
        for result in (dict(status='cleanup-completed',owner='a'*32,gid=10123,stageAbsent=True),
                       dict(status='cleanup-completed',owner='a'*32,uid=10123,gid=10123,stageAbsent=False)):
            adapter,owner,binary=self.adapter(helper_result=result)
            with patch.object(p,'DEVICE_CALIBRATION',{'status':'reviewed','scope':'FAKE mock only'}),patch.object(p,'HELPER_BINARY_SHA256',binary):
                with self.assertRaises(a.Rejected):adapter._fixture_private_operation('cleanup',owner=owner,sizes={'factory-fixture.db':len(BODY)})
    def test_exact_input_callback_uses_fixed_remote_timeout_and_invalid_owner_blocks_write(self):
        adapter,owner,binary=self.adapter()
        with patch.object(p,'DEVICE_CALIBRATION',{'status':'reviewed','scope':'FAKE mock only'}):
            adapter._fixture_private_operation('bootstrap',owner=owner,uid=10123,gid=10123,label=LABEL,input_bytes=b'FAKE binary')
            args=adapter.backend.transport_input.call_args.args
            self.assertEqual(args[0][6],'emulator-5586')
            self.assertEqual(args[0][7:16],('exec-out','/system/xbin/su','0','/system/bin/toybox','timeout','-s','KILL','20','/system/bin/sh'))
            self.assertEqual(args[3],b'FAKE binary')
            adapter.backend.transport_input.reset_mock()
            with self.assertRaises(a.Rejected):adapter._fixture_private_operation('bootstrap',owner='../invalid',uid=10123,gid=10123,label=LABEL,input_bytes=b'FAKE binary')
            adapter.backend.transport_input.assert_not_called()


class TransportLifecycle(unittest.TestCase):
    def setup_process(self):
        from test_fixture_health import FakeProcess,FakeSelector
        class Selector(FakeSelector):
            def close(self):pass
        process=FakeProcess();process.stdin=Mock();process.stdin.fileno.return_value=12
        process.returncode=0;process.wait=Mock(return_value=0);process.kill=Mock()
        return process,Selector
    def test_short_stdin_writes_drain_stdout_and_close_input_once_complete(self):
        process,selector=self.setup_process();requests=[]
        def write(fd,data):requests.append(bytes(data));return min(2,len(data))
        with patch.object(device.socket,'create_connection'),patch.object(device.subprocess,'Popen',return_value=process),patch.object(device.selectors,'DefaultSelector',selector),patch.object(device.os,'set_blocking'),patch.object(device.os,'read',side_effect=[b'OK',b'',b'']),patch.object(device.os,'write',side_effect=write):
            self.assertEqual(device._transport(('FAKE',),1,10,b'12345'),b'OK')
        self.assertEqual(requests,[b'12345',b'345',b'5']);process.kill.assert_not_called()
        self.assertTrue(process.stdin.close.called)
    def test_first_output_failure_prefix_and_secondary_cleanup_failure_survive(self):
        process,selector=self.setup_process();process.returncode=None
        process.kill.side_effect=OSError('FAKE kill failure')
        with patch.object(device.socket,'create_connection'),patch.object(device.subprocess,'Popen',return_value=process),patch.object(device.selectors,'DefaultSelector',selector),patch.object(device.os,'set_blocking'),patch.object(device.os,'read',return_value=b'OVERFLOW'):
            with self.assertRaisesRegex(a.Rejected,'output exceeded') as caught:device._transport(('FAKE',),1,1,b'123')
        self.assertEqual(caught.exception.stdout_prefix,b'OVERFLOW')
        self.assertEqual(caught.exception.transport_facts['stdinExpectedBytes'],3)
        self.assertIn('FAKE kill',str(caught.exception.transport_cleanup_failure))
        self.assertTrue(process.stdin.close.called)
    def test_deadline_preserves_diagnostics_and_stops_only_returned_process(self):
        process,selector=self.setup_process();process.returncode=None
        with patch.object(device.socket,'create_connection'),patch.object(device.subprocess,'Popen',return_value=process),patch.object(device.selectors,'DefaultSelector',selector),patch.object(device.os,'set_blocking'),patch.object(device.time,'monotonic',side_effect=[0,2,2]):
            with self.assertRaisesRegex(a.Rejected,'deadline') as caught:device._transport(('FAKE',),1,1,b'123')
        process.kill.assert_called_once();self.assertEqual(caught.exception.stdout_prefix,b'')
    def test_setup_failure_still_stops_the_created_process(self):
        process,_=self.setup_process();process.returncode=None
        selector=Mock();selector.register.side_effect=OSError('FAKE setup')
        with patch.object(device.socket,'create_connection'),patch.object(device.subprocess,'Popen',return_value=process),patch.object(device.selectors,'DefaultSelector',return_value=selector):
            with self.assertRaisesRegex(OSError,'FAKE setup'):device._transport(('FAKE',),1,1,b'123')
        process.kill.assert_called_once();self.assertTrue(process.stdin.close.called)


if __name__=='__main__':unittest.main()
