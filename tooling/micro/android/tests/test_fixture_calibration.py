"""FAKE permit/profile/lease/APK and mocked Device operations."""
import copy
from dataclasses import replace
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import admission as a
import fixture_health as h
import fixture_calibration as c

class Adapter(c.CalibrationOperations):
    """Mocks admission boundary only, no production acceptance monkeypatch."""
    def __init__(self,store,record,ticket):
        self.role='factory-source';self.store=store;self._lease_pin='a'*64
        self._installed={'record':record,'apkSha256':'b'*64}
        self.backend=Mock(clock=Mock(return_value=1800000000))
        self._health_windows={ticket.token:{'ticket':ticket}}
        self._fixture_health_scope=Mock(side_effect=self.scope)
        self._ensure_installed=Mock();self.facts=Mock(return_value={'api':'36','abi':['x86_64'],'scope':'FAKE'})
        self._fixture_health_clock=Mock(return_value={'epochSeconds':1800000000,'timezone':'UTC'})
        self._call=Mock(side_effect=self.read)
        self._mutation=Mock(return_value=b'FAKE request accepted, no crash observation')
    def scope(self):
        if self.role not in c.ROLES:raise a.Rejected('FAKE fixed role guard')
    def read(self,args,**kwargs):
        return {('shell','getprop','ro.build.fingerprint'):b'FAKE/api36/x86_64:16/TEST/debug\n',
          ('shell','pm','list','packages','-U',c.PACKAGE):b'package:app.micro.factory.fixture uid:10123\n',
          ('shell','pidof',c.PACKAGE):b'12345\n'}[args]

class CalibrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.store=a.Store(Path(self.tmp.name))
        self.store.path('FAKE-input').mkdir()
        self.record=self.store.write('FAKE-input/record.json',{'context':{'sourceSha':c.SOURCE_SHA},'scope':'FAKE not artifact admission'})
        raw=self.store.write('FAKE-input/image-receipt.json',{'scope':'FAKE physical image, not reviewed'})
        self.store.path('native-health/image-profiles').mkdir(parents=True)
        profile=self.store.write('native-health/image-profiles/'+'c'*32+'.json',dict(schema='micro.android.fixture-image-profile/1',
            api=36,abi='x86_64',fingerprint='FAKE/api36/x86_64:16/TEST/debug',imageSourceReceipt=raw.json()))
        self.value=dict(schema='micro.android.fixture-calibration-permit/1',purpose='one-fixture-crash-positive-control',
            role='factory-source',artifactRecord=self.record.json(),leaseSha256='a'*64,sourceSha=c.SOURCE_SHA,
            imageProfile=profile.json(),controllerSha256=c.authority(),expiresAt=1800000030)
        baseline=self.store.write('FAKE-input/baseline.json',{'scope':'FAKE observation, no live health'})
        self.ticket=h.Ticket('d'*32,'factory-source','a'*64,'b'*64,hashlib.sha256(Path(h.__file__).read_bytes()).hexdigest(),baseline)
        self.adapter=Adapter(self.store,self.record,self.ticket)
        self.count=0
    def permit(self,value=None):
        self.store.path('native-health/calibration-permits').mkdir(parents=True,exist_ok=True)
        self.count+=1
        return self.store.write('native-health/calibration-permits/'+format(self.count,'032x')+'.json',value or self.value)
    def test_fixed_mocked_request_retained_never_health_pass(self):
        permit=self.permit();result=self.adapter.fixture_calibration_crash(self.ticket,permit)
        self.adapter._mutation.assert_called_once_with(c.CRASH,timeout=10,maximum=8192)
        self.assertEqual(result['fixturePid'],12345);self.assertEqual(result['packageUid'],10123)
        self.assertIn('unclaimed',result['healthVerdict']);self.assertNotIn('crashCount',result)
        self.assertEqual(self.store.json(a.Evidence.parse(result['receipt']))['failure'],None)
        self.assertGreaterEqual(self.adapter._ensure_installed.call_count,3)
    def test_persistent_replay_refused_even_new_adapter(self):
        permit=self.permit();self.adapter.fixture_calibration_crash(self.ticket,permit)
        other=Adapter(self.store,self.record,self.ticket)
        with self.assertRaisesRegex(a.Rejected,'already consumed'):other.fixture_calibration_crash(self.ticket,permit)
        other._mutation.assert_not_called()
    def test_cross_ticket_role_lease_apk_and_controller_refused(self):
        for field,value in [('role','factory-target'),('lease_sha256','e'*64),('apk_sha256','e'*64),('controller_sha256','e'*64)]:
            ticket=replace(self.ticket,**{field:value});adapter=Adapter(self.store,self.record,ticket)
            with self.subTest(field=field),self.assertRaises(a.Rejected):adapter.fixture_calibration_crash(ticket,self.permit())
            adapter._mutation.assert_not_called()
        with self.assertRaises(a.Rejected):self.adapter.fixture_calibration_crash(replace(self.ticket,token='f'*32),self.permit())
        self.adapter._mutation.assert_not_called()
    def test_unknown_role_and_extra_window_refused(self):
        for role in ('budget-v3','arbitrary'):
            adapter=Adapter(self.store,self.record,self.ticket);adapter.role=role
            with self.assertRaises(a.Rejected):adapter.fixture_calibration_crash(self.ticket,self.permit())
            adapter._mutation.assert_not_called()
        self.adapter._health_windows['extra']={'ticket':self.ticket}
        with self.assertRaises(a.Rejected):self.adapter.fixture_calibration_crash(self.ticket,self.permit())
        self.adapter._mutation.assert_not_called()
    def test_permit_unknown_expiry_subject_authority_fields_refused(self):
        for field,value in [('purpose','other'),('expiresAt',1800000000),('expiresAt',1800003601),('sourceSha','f'*40),
                            ('controllerSha256','f'*64),('leaseSha256','f'*64),('role','factory-target'),('extra',True)]:
            changed=copy.deepcopy(self.value);changed[field]=value
            with self.subTest(field=field),self.assertRaises(a.Rejected):self.adapter.fixture_calibration_crash(self.ticket,self.permit(changed))
        self.adapter._mutation.assert_not_called()
    def test_actual_foreign_source_refused_despite_matching_permit_subject(self):
        foreign=self.store.write('FAKE-input/foreign.json',{'context':{'sourceSha':'f'*40}})
        adapter=Adapter(self.store,foreign,self.ticket);changed=copy.deepcopy(self.value);changed['artifactRecord']=foreign.json()
        with self.assertRaisesRegex(a.Rejected,'frozen fixture source'):adapter.fixture_calibration_crash(self.ticket,self.permit(changed))
        adapter._mutation.assert_not_called()
    def test_actual_fingerprint_changed_or_unknown_uid_pid_refused(self):
        for key,raw in [('fingerprint',b'OTHER/image'),('uid',b'package:app.micro.factory.fixture uid:0\n'),('pid',b'12345 5678\n')]:
            adapter=Adapter(self.store,self.record,self.ticket)
            original=adapter.read
            def read(args,**kw):
                match={'fingerprint':args[1:3]==('getprop','ro.build.fingerprint'),
                       'uid':args[1:4]==('pm','list','packages'),'pid':args[1]=='pidof'}[key]
                return raw if match else original(args,**kw)
            adapter._call.side_effect=read
            with self.subTest(key=key),self.assertRaises(a.Rejected):adapter.fixture_calibration_crash(self.ticket,self.permit())
            adapter._mutation.assert_not_called()
    def test_installed_guard_failure_precedes_permit_and_mutation(self):
        self.adapter._ensure_installed.side_effect=a.Rejected('FAKE installed bytes changed')
        with self.assertRaisesRegex(a.Rejected,'installed bytes changed'):self.adapter.fixture_calibration_crash(self.ticket,self.permit())
        self.adapter._mutation.assert_not_called()
    def test_first_mutation_failure_and_cleanup_data_retained_no_retry(self):
        permit=self.permit();first=a.Rejected('FAKE first operation failure')
        first.stdout_prefix=b'FAKE prefix';first.transport_cleanup_failure=[{'reason':'FAKE secondary cleanup failure'}]
        self.adapter._mutation.side_effect=first
        with self.assertRaises(a.Rejected) as caught:self.adapter.fixture_calibration_crash(self.ticket,permit)
        self.assertIs(caught.exception,first)
        observed=self.store.json(first.calibration_evidence)
        self.assertEqual(observed['failure']['reason'],'FAKE first operation failure')
        self.assertIn('secondary cleanup',str(observed['failure']['transportCleanupFailure']))
        other=Adapter(self.store,self.record,self.ticket)
        with self.assertRaisesRegex(a.Rejected,'already consumed'):other.fixture_calibration_crash(self.ticket,permit)
        other._mutation.assert_not_called()
    def test_result_retention_failure_never_overwrites_first_failure(self):
        permit=self.permit();first=a.Rejected('FAKE first operation failure');self.adapter._mutation.side_effect=first
        original=self.store.write
        def write(path,value):
            if path.endswith('.result.json'):raise OSError('FAKE retention failure')
            return original(path,value)
        with patch.object(self.store,'write',side_effect=write),self.assertRaises(a.Rejected) as caught:
            self.adapter.fixture_calibration_crash(self.ticket,permit)
        self.assertIs(caught.exception,first);self.assertIn('retention failure',str(first.__notes__))
        self.assertTrue(self.store.path('native-health/calibration-use/'+permit.sha256+'.json').exists())

    def test_expiry_during_identity_blocks_before_consumption_or_mutation(self):
        permit=self.permit();original=self.adapter.fixture_calibration_identity
        def delayed_identity():
            identity=original()
            self.adapter.backend.clock.return_value=1800000060
            return identity
        self.adapter.fixture_calibration_identity=delayed_identity
        with self.assertRaisesRegex(a.Rejected,'expired during identity'):
            self.adapter.fixture_calibration_crash(self.ticket,permit)
        self.adapter._mutation.assert_not_called()
        self.assertFalse(self.store.path('native-health/calibration-use/'+permit.sha256+'.json').exists())
    def test_expiry_after_consumption_retains_first_failure_and_blocks_replay(self):
        permit=self.permit();original=self.store.write
        def delayed_consumption(path,value):
            result=original(path,value)
            if path=='native-health/calibration-use/'+permit.sha256+'.json':
                self.adapter.backend.clock.return_value=1800000060
            return result
        with patch.object(self.store,'write',side_effect=delayed_consumption):
            with self.assertRaisesRegex(a.Rejected,'expired before execution request') as caught:
                self.adapter.fixture_calibration_crash(self.ticket,permit)
        self.adapter._mutation.assert_not_called()
        self.assertTrue(self.store.path('native-health/calibration-use/'+permit.sha256+'.json').exists())
        observed=self.store.json(caught.exception.calibration_evidence)
        self.assertEqual(observed['failure']['reason'],'Calibration permit expired before execution request')
        self.assertEqual(observed['operation'],'fixture-calibration-crash-requested')
        self.assertIsNone(observed['stdoutSha256'])
        # Even a fresh adapter with a FAKE rewound clock cannot reuse that permit.
        other=Adapter(self.store,self.record,self.ticket)
        with self.assertRaisesRegex(a.Rejected,'already consumed'):
            other.fixture_calibration_crash(self.ticket,permit)
        other._mutation.assert_not_called()

if __name__=='__main__':unittest.main()
