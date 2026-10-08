"""Authored FAKE SQL/APK/lease/validator/private operations; no live execution.

Real guarded Device capture/tap/install readback and private collection, input
validator and restore control flow use synthetic bytes. Health windows bypass
the real baseline/stream with explicitly FAKE observations, never calibration.
No SQLite body is opened on host, no Docker command or device is issued.
"""
import copy
import hashlib
from dataclasses import replace
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

KIT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(KIT/'tests'), str(KIT)]
import admission as a
import device
import fixture_health as health
import fixture_private_store as private
import fixture_store_validation as validator
import fixture_recovery as recovery
REAL_VALIDATE = validator.validate_collected_store
import pipeline
from test_android_pipeline import SyntheticFixture
from test_native_fixture_journey import ScriptedTransport, fake_screen
from test_fixture_private_store import inventory, tar_bytes


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        self.fixture = f = SyntheticFixture(tmp.name)
        self.checks_scope = f.checks_test_scope()
        self.checks_scope.__enter__()
        self.addCleanup(self.checks_scope.__exit__, None, None, None)
        result, _ = f.run()
        self.assertEqual(result['status'], 'passed', result['firstFailure'])
        receipts = tuple(a.Evidence.parse(s['receipt']) for s in result['stages'][:7])
        self.artifact = a.Evidence.parse(f.store.json(receipts[4])['details']['artifactRecord'])
        self.job = pipeline.JobContext(f.binding, f.store, result['runId'],
            'runs/'+result['runId'], pipeline.Stage.RECOVERY, receipts, f.signed.sha256)
        self.source_mock = ScriptedTransport(f, 'factory-source')
        self.target_mock = ScriptedTransport(f, 'factory-target')
        for transport in (self.source_mock, self.target_mock):
            transport.xml = fake_screen('2','1'); transport.after_taps = [fake_screen('3','1')]
        self.target_mock.reopened = fake_screen('3','1')
        self.source = device.Device('factory-source', backend=self.source_mock.backend(),
            registry=f.registry, store=f.store, artifact_security=receipts[5])
        self.target = device.Device('factory-target', backend=self.target_mock.backend(),
            registry=f.registry, store=f.store, artifact_security=receipts[5])
        # This is mocked installation, not an APK or device admission result.
        for adapter, transport in ((self.source,self.source_mock),(self.target,self.target_mock)):
            adapter.install(self.artifact); transport.calls.clear(); transport.mutations.clear()
        f.store.path('FAKE-helper').write_bytes(b'FAKE Android helper body, never executable')
        self.helper = f.store.describe('FAKE-helper')
        self.target_calls = []; self.committed = False; self.fault = None
        self.validator_failure_ref = None; self.health_refs = []
        self.tampered_ref = None; self.unreadable_ref = None
        self.health_baselines=[];self.health_observations=[];self.health_raw_refs=[]

    def health_observation(self, adapter):
        """FAKE exact Device observation/raw shapes, no dump or stream command."""
        store=self.fixture.store;directory='fixture-health/'+adapter.role+'/'+uuid4().hex
        store.path(directory).mkdir(mode=0o700,parents=True)
        raw=(health.HEADER+'\nLast Timestamp of Persistence Into Persistent Storage: 2026-09-30 12:00:00.000\n').encode()
        path=store.path(directory+'/exit-info.txt');path.write_bytes(raw);path.chmod(0o400)
        raw_ref=store.describe(directory+'/exit-info.txt',health.DUMP_LIMIT)
        now=adapter.backend.clock()
        reference=store.write(directory+'/observation.json',{
            'schema':'micro.android.fixture-exit-info/1','role':adapter.role,'package':private.PACKAGE,
            'leaseSha256':adapter._lease_pin,'apkSha256':self.fixture.signed.sha256,
            'observedAt':now,'clock':{'epochSeconds':int(now),'timezone':'UTC',
                'hostStartedAt':now,'hostFinishedAt':now,'hostMonotonicStartedAt':now,'hostMonotonicFinishedAt':now},
            'packageUid':10123,'raw':raw_ref.json(),'records':[], 'failure':None,
            'controllerSha256':hashlib.sha256(Path(health.__file__).read_bytes()).hexdigest()})
        self.health_observations.append(reference);self.health_raw_refs.append(raw_ref)
        return reference

    def health_start(self, adapter):
        baseline = self.health_observation(adapter);self.health_baselines.append(baseline)
        ticket = health.Ticket(uuid4().hex, adapter.role, adapter._lease_pin,
            self.fixture.signed.sha256, hashlib.sha256(Path(health.__file__).read_bytes()).hexdigest(), baseline)
        adapter._health_windows[ticket.token] = {'ticket':ticket,
            'stream':SimpleNamespace(failure=None,finished=False), 'stops':[]}
        return ticket

    def health_finish(self, adapter, ticket):
        adapter._health_windows.pop(ticket.token)
        final=self.health_observation(adapter)
        bad = self.fault in ('health-cleanup','health-crash-cleanup') and adapter is self.target
        directory='fixture-health/'+ticket.role+'/'+ticket.token
        self.fixture.store.path(directory).mkdir(mode=0o700,parents=True)
        reference = self.fixture.store.write(directory+'/window.json',{'schema':'micro.android.fixture-health-window/1',
            'role':ticket.role,'package':private.PACKAGE,'leaseSha256':ticket.lease_sha256,
            'apkSha256':ticket.apk_sha256,'controllerSha256':ticket.controller_sha256,
            'baseline':ticket.baseline.json(),'final':final.json(),'expectedStops':[],
            'imageCalibration':health.IMAGE_CALIBRATION,
            'failure':None, 'cleanupFailure':{'reason':'FAKE owned stream remains'} if bad else None,
            'stream':{'argv':list(health.stream_argv(adapter.role,int(self.fixture.now))),
                'pid':12345,'startTicks':67890,'seconds':0.01,'stdoutBytes':0,'stderrBytes':0,'lines':0,
                'events':[],'failure':None,'cleanupFailure':'FAKE owned stream remains' if bad else None,
                'cleanup':{'absent':not bad},'exitCode':-9,'readiness':'image-calibration-pending'},
            'summary':{'status':'failed' if self.fault in ('health-crash','health-crash-cleanup') and adapter is self.target else 'unknown',
                'observedMatchingCrashEvents':1 if self.fault in ('health-crash','health-crash-cleanup') and adapter is self.target else 0,
                'observedMatchingAnrEvents':0,'crashCount':None,'anrCount':None}})
        self.health_refs.append(reference)
        return reference

    def validate(self, store, manifest, files):
        if self.fault=='namespace-disappeared':
            store.path('store-validation/'+'b'*32).rmdir()
            raise a.Rejected('FAKE validator namespace disappeared')
        if self.fault == 'prechild-budget':
            # Only the validator's headroom observation is synthetic; its actual
            # retained_files and budget rejection control flow run unchanged.
            budget = store.budget()
            budget.update(regularBytes=a.STORE_BYTES-1,allocatedBytes=a.STORE_BYTES-1)
            with patch.object(store,'budget',return_value=budget):
                return REAL_VALIDATE(store,manifest,files)
        if self.fault == 'persistent-tampered-file':
            reference=files['factory-fixture.db'];path=store.path(reference.path)
            self.tampered_ref=reference
            path.chmod(0o600);path.write_bytes(b'FAKE persistently tampered synthetic file');path.chmod(0o400)
            return REAL_VALIDATE(store,manifest,files)
        if self.fault == 'prechild-tampered-file':
            # Tamper only a temp synthetic byte file and restore it before report
            # retention, preserving the original collection evidence afterward.
            reference=files['factory-fixture.db']; path=store.path(reference.path)
            original=store.read(reference,validator.MAX_BYTES);mode=path.stat().st_mode & 0o777
            path.chmod(0o600)
            try:
                path.write_bytes(b'FAKE tampered synthetic file')
                return REAL_VALIDATE(store,manifest,files)
            finally:
                path.write_bytes(original);path.chmod(mode)
        if self.fault == 'namespace-without-receipt':
            store.path('store-validation/'+uuid4().hex).mkdir(mode=0o700,parents=True)
            raise a.Rejected('FAKE failure after namespace creation, receipt unavailable')
        if self.fault == 'nontyped-validation':return {'scope':'FAKE nontyped validator return'}
        if self.fault == 'missing-validation': return None
        status = 'rejected' if self.fault == 'corrupt-validation' else 'validated'
        worker = dict(schema='micro.fixture-store-validation/1',status='validated',package=private.PACKAGE,userVersion=1,
            manifestSha256=manifest.sha256,files=store.json(manifest)['files'],
            rows=[dict(id='counter-a',value=2),dict(id='counter-b',value=1)])
        rejection = {'wrong-product':'Wrong product or incompatible fixture backup',
            'wrong-version':'Incompatible fixture schema',
            'corrupt-validation':'Fixture SQLite integrity failed'}
        if self.fault in rejection:
            status='rejected'
            worker={'schema':'micro.fixture-store-validation/1','status':'failed',
                'error':{'type':'ValueError','message':rejection[self.fault]}}
        worker_exit = 1 if status == 'rejected' else 0
        if self.fault == 'wrong-snapshot': worker['rows'][0]['value'] = 3
        raw = dict(schema='micro.fixture-store-supervisor/1',status=status,
            scope='FAKE validator/container facts, no SQL executed',
            manifest=manifest.json(),files={n:r.json() for n,r in files.items()},image=validator.IMAGE,
            cleanup={'absent':self.fault != 'validation-cleanup'},
            state=dict(Running=False,OOMKilled=False,ExitCode=worker_exit),
            runtime={k:True for k in ('identity','user','isolation','resources','exposure','logs','tmpfs','command','mounts')},
            worker=worker,supervisorSha256=hashlib.sha256(Path(validator.__file__).read_bytes()).hexdigest(),
            workerSha256=hashlib.sha256(Path(validator.__file__).with_name('recovery_store.py').read_bytes()).hexdigest(),
            commandHelperSha256=hashlib.sha256(Path(validator.__file__).with_name('artifact_supervisor.py').read_bytes()).hexdigest())
        # Exact receipt identity/command facts below are synthetic, no child runs.
        owner=uuid4().hex;identifier='c'*64;name='micro-artifact-'+owner
        directory='store-validation/'+owner
        store.path(directory).mkdir(mode=0o700,parents=True)
        def command(argv,exit_code=0):
            return dict(argv=argv,exitCode=exit_code,seconds=0.01,capturedBytes=0,
                sha256=hashlib.sha256(b'FAKE supervisor log').hexdigest(),limitFailure=None)
        raw.update(owner=owner,containerId=identifier,commands=[
            command(['docker','create','--name',name,'--label','micro.artifact.owner='+owner,validator.IMAGE,'/worker.py']),
            command(['docker','inspect',identifier]),command(['docker','start','--attach',identifier],worker_exit),
            command(['docker','inspect',identifier]),command(['docker','inspect',identifier],1),
            command(['docker','ps','--all','--quiet','--no-trunc','--filter','name=^/'+name+'$',
                '--filter','label=micro.artifact.owner='+owner])])
        if self.fault in ('validator-thrown-cleanup','validator-thrown-replaced'):
            raw.update(status='failed',cleanup=None,
                failure={'type':'Rejected','message':'FAKE first worker failure'},
                cleanupFailure={'type':'Rejected','message':'FAKE validator child remains'})
            self.validator_failure_ref=store.write(directory+'/receipt.json',raw)
            error=a.Rejected('Fixture validation failed; retained '+self.validator_failure_ref.path)
            if self.fault=='validator-thrown-replaced':
                replacement=dict(raw,cleanup={'absent':True},failure={'type':'Rejected','message':'FAKE replacement diagnostic reason'})
                path=store.path(self.validator_failure_ref.path);path.chmod(0o600)
                path.write_bytes(a.canonical(replacement));path.chmod(0o400)
                raise error from a.Rejected('FAKE original validator cause before receipt replacement')
            error.validation_evidence=self.validator_failure_ref
            raise error
        reference=store.write(directory+'/receipt.json',raw)
        if self.fault=='unreadable-typed-validation':
            self.unreadable_ref=reference;path=store.path(reference.path)
            path.chmod(0o600)
            path.write_bytes(b'FAKE replaced validator receipt, no longer its retained hash')
            path.chmod(0o400)
        return reference

    def target_operation(self, operation, **kwargs):
        self.target_calls.append(operation)
        self.assertFalse(self.target._health_windows, 'Private operations must follow window finalization')
        if self.fault=='wrapped-restore-transport' and operation=='transfer':
            error=a.Rejected('FAKE first restore transfer transport failure')
            error.transport_cleanup_failure=[{'scope':'FAKE owned ADB client, no actual process','reason':'FAKE restore client remains'}]
            raise error
        if self.fault == 'transfer-cleanup' and operation in ('transfer','cleanup'):
            raise a.Rejected('FAKE first transfer failure' if operation=='transfer' else 'FAKE secondary stage cleanup failure')
        if operation == 'inventory': return inventory(self.committed or self.fault=='target-nonempty')
        if operation == 'stage-inventory': return inventory()
        if operation == 'commit': self.committed = True
        return b'FAKE bounded typed helper observation'

    def collection_call(self, operation):
        self.assertFalse(self.source._health_windows, 'Source collection must follow health window finalization')
        if self.fault in ('wrapped-collection-transport','wrapped-collection-transport-cycle') and operation=='collect':
            error=a.Rejected('FAKE first collection transport failure')
            error.transport_cleanup_failure=[{'scope':'FAKE owned ADB client, no actual process','reason':'FAKE collection client remains'}]
            if self.fault=='wrapped-collection-transport-cycle':error.__cause__=error
            raise error
        return tar_bytes() if operation=='collect' else inventory()

    def run_proposal(self, *, admit_fake=True, source_gate=True, health_calibration=..., substitute_validator=True, explicit_test_pin=True, explicit_transports=True, explicit_operation_methods=True):
        fake_validator=Mock(side_effect=self.validate)
        patches = [patch.object(validator,'validate_collected_store',fake_validator),
            patch.object(self.source,'_fixture_store_call',side_effect=self.collection_call),
            patch.object(self.target,'_fixture_private_operation',side_effect=self.target_operation)]
        if substitute_validator and hasattr(recovery,'REVIEWED_VALIDATE'):
            # Explicit FAKE administrative function pin only for synthetic tests.
            # It is never an actual validator/health/device admission observation.
            patches.append(patch.object(recovery,'REVIEWED_VALIDATE',fake_validator))
            if explicit_test_pin and hasattr(recovery,'TEST_ONLY_VALIDATE'):
                patches.append(patch.object(recovery,'TEST_ONLY_VALIDATE',fake_validator))
        if explicit_transports and hasattr(recovery,'TEST_ONLY_DEVICE_TRANSPORTS'):
            patches.append(patch.object(recovery,'TEST_ONLY_DEVICE_TRANSPORTS',{
                self.source.role:self.source.backend.transport,self.target.role:self.target.backend.transport}))
        if explicit_operation_methods and hasattr(recovery,'TEST_ONLY_OPERATION_METHODS'):
            # Exact target pointers are explicit FAKE instrumentation pins for
            # the preserved ordering wrapper predicate, never production proof.
            patches.append(patch.object(recovery,'TEST_ONLY_OPERATION_METHODS',{
                (self.target.role,'offline-launch'):self.target.launch_offline,
                (self.target.role,'force-stop'):self.target.force_stop}))
        if source_gate:
            # Isolate the separately tested frozen-source gate for FAKE binding1.
            patches.extend([patch.object(recovery,'SOURCE_SHA',self.fixture.binding.source_sha),
                patch.object(recovery.journey,'_fixture_source',return_value=self.fixture.source_export)])
        if admit_fake:
            patches.extend([patch.object(private,'DEVICE_CALIBRATION',{'status':'reviewed','scope':'FAKE mocks only'}),
                patch.object(private,'HELPER_BINARY_SHA256',self.helper.sha256),
                patch.object(private,'HELPER_SOURCE_SHA256',hashlib.sha256((KIT/'fixture_store_commit.c').read_bytes()).hexdigest()),
                patch.object(health,'IMAGE_CALIBRATION',{'status':'reviewed','scope':'FAKE image, no actual calibration'})])
        if health_calibration is not ...:
            patches.append(patch.object(health,'IMAGE_CALIBRATION',health_calibration))
        for adapter in (self.source,self.target):
            patches.extend([patch.object(adapter,'start_fixture_health_window',side_effect=lambda adapter=adapter:self.health_start(adapter)),
                patch.object(adapter,'finish_fixture_health_window',side_effect=lambda ticket,adapter=adapter:self.health_finish(adapter,ticket)),
                patch.object(adapter,'_fixture_health_clock',return_value={'epochSeconds':int(self.fixture.now),'timezone':'UTC'})])
        for item in patches:item.start()
        try: observation = recovery.run_fixture_recovery(self.source,self.target,self.job,self.artifact,self.helper)
        finally:
            for item in reversed(patches):item.stop()
        report = self.fixture.store.json(observation.report)
        raw = self.fixture.store.json(a.Evidence.parse(report['details']['evidence'][-1]))
        return observation, report, raw

    def test_observed_sequence_preserves_snapshot_and_never_admits_recovery_or_counts(self):
        observation, report, raw = self.run_proposal()
        self.assertEqual(report['status'],'pending'); self.assertIsNone(raw['firstFailure'])
        self.assertIsNone(report['details']['semanticRestore']); self.assertIsNone(raw['health']['crashCount'])
        self.assertIsNone(raw['health']['anrCount']); self.assertEqual(report['cleanup'],{'absent':True})
        self.assertEqual(set(raw['observedPoints']),{'source-snapshot-point','source-later-before-write',
            'source-later-point','target-restored-point','target-new-point','target-reopened-point'})
        self.assertTrue(self.committed); self.assertEqual(len(self.source_mock.tap_coordinates),1)
        self.assertEqual(len(self.target_mock.tap_coordinates),1)
        self.assertLess(self.target_calls.index('seal'),self.target_calls.index('commit'))
        self.assertEqual(self.fixture.store.json(a.Evidence.parse(raw['validation']))['worker']['rows'],
            [dict(id='counter-a',value=2),dict(id='counter-b',value=1)])
        self.assertEqual(pipeline.validate_observation(observation,self.job,self.fixture.now)['status'],'pending')

    def test_unset_real_capabilities_stop_before_any_device_mutation_or_validation(self):
        _, report, raw = self.run_proposal(admit_fake=False)
        self.assertEqual(report['status'],'pending'); self.assertTrue(raw['blockedCapabilities'])
        self.assertEqual(self.source_mock.calls,[]); self.assertEqual(self.target_mock.calls,[])
        self.assertIsNone(raw['collection']); self.assertIsNone(raw['validation']); self.assertFalse(self.target_calls)

    def test_real_source_guard_rejects_foreign_fake_commit_before_device_operations(self):
        _, report, raw = self.run_proposal(source_gate=False)
        self.assertEqual(report['status'],'failed'); self.assertIn('frozen synthetic fixture source',raw['firstFailure']['reason'])
        self.assertEqual(self.source_mock.calls,[]); self.assertEqual(self.target_mock.calls,[])

    def test_missing_corrupt_wrong_product_wrong_point_and_cleanup_validation_block_target(self):
        for fault in ('missing-validation','corrupt-validation','wrong-product','wrong-snapshot','validation-cleanup'):
            with self.subTest(fault=fault):
                self.fault=fault
                _, report, raw = self.run_proposal()
                self.assertEqual(report['status'],'failed'); self.assertFalse(self.target_calls)
                self.assertEqual(raw['firstFailure']['step'],'validate-collected-store')
                self.assertEqual(self.source_mock.tap_coordinates,[])
                expected = None if fault=='missing-validation' else {'absent':fault!='validation-cleanup'}
                self.assertEqual(report['cleanup'],expected)

    def test_nonempty_target_blocks_bootstrap_transfer_commit_and_launch(self):
        self.fault='target-nonempty'; _, report, raw = self.run_proposal()
        self.assertEqual(report['status'],'failed'); self.assertEqual(self.target_calls,['inventory'])
        self.assertEqual(self.target_mock.launches,0); self.assertFalse(self.committed)
        self.assertIn('Target SQLite is occupied',str(raw['firstFailure']))

    def test_wrong_restored_sum_or_present_row_blocks_new_target_write(self):
        for screen in (fake_screen('3','1'),fake_screen('2','1',sentinel=True)):
            with self.subTest(screen=screen):
                # Each case starts with a distinct source/target Store, because
                # the first case intentionally leaves its source counter at3.
                case = RecoveryTests()
                try:
                    case.setUp()
                    case.target_mock.xml=screen
                    _, report, raw = case.run_proposal()
                    self.assertEqual(report['status'],'failed'); self.assertEqual(raw['firstFailure']['step'],'target-restored-point')
                    self.assertEqual(case.target_mock.tap_coordinates,[])
                finally:
                    case.doCleanups()

    def test_source_later_write_must_actually_be_observed_before_restore(self):
        self.source_mock.after_taps=[fake_screen('2','1')]
        _, report, raw = self.run_proposal()
        self.assertEqual(report['status'],'failed'); self.assertEqual(raw['firstFailure']['step'],'source-later-point')
        self.assertFalse(self.target_calls)

    def test_new_target_write_and_reopen_must_independently_match(self):
        self.target_mock.after_taps=[fake_screen('2','1')]
        _, report, raw = self.run_proposal()
        self.assertEqual(report['status'],'failed'); self.assertEqual(raw['firstFailure']['step'],'target-new-point')

    def test_reopen_loss_fails_after_successful_new_write(self):
        self.target_mock.reopened=fake_screen('2','1')
        _, report, raw = self.run_proposal()
        self.assertEqual(report['status'],'failed'); self.assertEqual(raw['firstFailure']['step'],'target-reopened-point')
        self.assertIn('target-new-point',raw['observedPoints'])

    def test_first_transfer_and_secondary_cleanup_remain_separate_without_commit(self):
        self.fault='transfer-cleanup'; _, report, raw = self.run_proposal()
        self.assertEqual(report['status'],'failed'); self.assertIn('first transfer',str(raw['firstFailure']))
        self.assertIn('secondary stage cleanup',str(raw['cleanupFailures']))
        self.assertIsNone(report['cleanup']); self.assertNotIn('commit',self.target_calls)

    def test_first_ui_failure_survives_separate_owned_stream_cleanup_failure(self):
        self.fault='health-cleanup'; self.target_mock.xml=fake_screen('3','1')
        _, report, raw = self.run_proposal()
        self.assertEqual(raw['firstFailure']['step'],'target-restored-point')
        self.assertTrue(raw['cleanupFailures']); self.assertEqual(report['cleanup'],{'absent':False})
        self.assertEqual(report['status'],'failed')


    def test_all_predecessors_use_stage_context_and_real_pipeline_validation(self):
        with patch.object(pipeline,'validate_observation',wraps=pipeline.validate_observation) as validate:
            _, report, raw = self.run_proposal()
        self.assertIsNone(raw['firstFailure']); self.assertEqual(report['status'],'pending')
        # Security re-admission and Device checks also call this validator.
        # Require each exact predecessor context rather than trusting call count.
        for index, stage in enumerate(pipeline.GRAPH[:7]):
            calls=[call for call in validate.call_args_list
                if call.args[1].stage==stage
                and call.args[1].prior_receipts==self.job.prior_receipts[:index]]
            self.assertTrue(calls,stage.value)
            for call in calls:
                observation, job, now=call.args
                self.assertEqual(observation.report,self.job.prior_receipts[index])
                self.assertEqual(job.run_id,self.job.run_id)
                self.assertEqual(job.run_directory,self.job.run_directory)
                self.assertEqual(job.artifact_sha256,None if index<5 else self.job.artifact_sha256)

    def test_same_run_passed_predecessor_with_stale_or_failed_raw_facts_blocks_devices(self):
        for fault in ('stale','failed','command','cleanup','crash','anr','security'):
            with self.subTest(fault=fault):
                index=5 if fault=='security' else 6
                report=copy.deepcopy(self.fixture.store.json(self.job.prior_receipts[index]))
                if fault=='stale':
                    report['finishedAt']=self.fixture.now-pipeline.MAX_AGE-1
                    report['startedAt']=report['finishedAt']-1
                elif fault=='failed':report['status']='failed'
                elif fault=='command':report['exitCode']=1
                elif fault=='cleanup':report['cleanup']=None
                elif fault=='crash':report['details']['crashCount']=1
                elif fault=='anr':report['details']['anrCount']=1
                elif fault=='security':report['details']={}
                ref=self.fixture.store.write(self.job.run_directory+'/FAKE-'+fault+'.json',report)
                original=self.job
                self.job=replace(original,prior_receipts=original.prior_receipts[:index]+(ref,)+original.prior_receipts[index+1:])
                try:
                    _, stage, raw=self.run_proposal()
                    self.assertEqual(stage['status'],'failed'); self.assertIsNotNone(raw['firstFailure'])
                    self.assertEqual(self.source_mock.calls,[]); self.assertEqual(self.target_mock.calls,[])
                    self.assertFalse(self.target_calls)
                finally:self.job=original

    def test_thrown_validator_retains_exact_first_and_separate_cleanup_receipt(self):
        self.fault='validator-thrown-cleanup'
        _, report, raw=self.run_proposal()
        self.assertEqual(report['status'],'failed'); self.assertIsNone(report['cleanup'])
        child=self.fixture.store.json(self.validator_failure_ref)
        self.assertEqual(raw['firstFailure']['childFailure'],child['failure'])
        failure=next(f for f in raw['cleanupFailures'] if f['step']=='validator-cleanup')
        self.assertEqual(failure['failure'],child['cleanupFailure'])
        self.assertEqual(failure['receipt'],self.validator_failure_ref.json())
        self.assertIn(self.validator_failure_ref.json(),report['details']['evidence'])
        self.assertFalse(self.target_calls)

    def test_capture_to_tap_has_no_controller_checkpoint_hash_or_retention(self):
        armed=set(); taps=[]; store=self.fixture.store
        original_write=store.write; original_budget=store.budget; original_validate=a.Binding.validate
        original_read=Path.read_bytes
        def write(*args,**kwargs):
            self.assertFalse(armed,'Controller retention occurred before guarded tap')
            return original_write(*args,**kwargs)
        def budget(*args,**kwargs):
            self.assertFalse(armed,'Store budget checkpoint occurred before guarded tap')
            return original_budget(*args,**kwargs)
        def validate(*args,**kwargs):
            self.assertFalse(armed,'Binding checkpoint occurred before guarded tap')
            return original_validate(*args,**kwargs)
        def read(path,*args,**kwargs):
            if path.suffix in ('.py','.c'):self.assertFalse(armed,'Code rehash occurred before guarded tap')
            return original_read(path,*args,**kwargs)
        patches=[]
        for adapter in (self.source,self.target):
            capture=adapter.capture; tap=adapter.tap
            def observe(label,adapter=adapter,capture=capture):
                ticket=capture(label)
                if label in ('source-later-before-write','target-restored-point'):armed.add(adapter.role)
                return ticket
            def act(ticket,control,adapter=adapter,tap=tap):
                self.assertIn(adapter.role,armed); armed.remove(adapter.role)
                taps.append((adapter.role,ticket.receipt.json()))
                return tap(ticket,control)
            patches.extend([patch.object(adapter,'capture',side_effect=observe),patch.object(adapter,'tap',side_effect=act)])
        patches.extend([patch.object(store,'write',side_effect=write),patch.object(store,'budget',side_effect=budget),
            patch.object(a.Binding,'validate',validate),patch.object(Path,'read_bytes',read)])
        for item in patches:item.start()
        try:_,report,raw=self.run_proposal()
        finally:
            for item in reversed(patches):item.stop()
        self.assertIsNone(raw['firstFailure'],raw['firstFailure']); self.assertFalse(armed)
        self.assertEqual(len(taps),2)
        events=[store.json(a.Evidence.parse(r)) for r in raw['events']]
        for role,ref in taps:
            capture=next(e for e in events if e['step'].endswith('-capture') and e['observation']['receipt']==ref)
            assertion=next(e for e in events if e['step'].endswith('-assertion') and e['observation']['capture']==ref)
            tap=next(e for e in events if e['observation'].get('operation')=='fixture-tap' and e['observation']['observation']==ref)
            self.assertEqual(capture['observation']['role'],role); self.assertEqual(assertion['observation']['role'],role)
            self.assertIn(ref,report['details']['evidence']); self.assertEqual(tap['observation']['control'],'counter-a')

    def test_target_launch_and_stop_are_after_committed_restore(self):
        launch=self.target.launch_offline;stop=self.target.force_stop
        def launched():self.assertTrue(self.committed);return launch()
        def stopped():self.assertTrue(self.committed);return stop()
        with patch.object(self.target,'launch_offline',side_effect=launched) as launch_mock, patch.object(self.target,'force_stop',side_effect=stopped) as stop_mock:
            _, report, raw=self.run_proposal()
        self.assertIsNone(raw['firstFailure']); self.assertEqual(launch_mock.call_count,2); self.assertEqual(stop_mock.call_count,2)

    def test_unreviewed_health_calibration_blocks_before_device_calls(self):
        for calibration in ({},{'status':'pending'},'reviewed'):
            with self.subTest(calibration=calibration):
                _,report,raw=self.run_proposal(health_calibration=calibration)
                self.assertEqual(report['status'],'pending')
                self.assertTrue(any('health' in b for b in raw['blockedCapabilities']))
                self.assertFalse(self.source_mock.calls); self.assertFalse(self.target_mock.calls)

    def test_matching_crash_is_adverse_evidence_and_keeps_unknown_counts(self):
        self.fault='health-crash'
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed'); self.assertEqual(report['cleanup'],{'absent':True})
        self.assertIn('crash/ANR',raw['firstFailure']['reason']); self.assertFalse(raw['cleanupFailures'])
        self.assertEqual(raw['health']['status'],'failed'); self.assertIsNone(raw['health']['crashCount'])
        finding=raw['healthFindings'][0]
        self.assertEqual(finding['kind'],'matching-crash-anr'); self.assertEqual(finding['receipt'],self.health_refs[-1].json())

    def test_matching_crash_after_ui_failure_is_separate_from_cleanup_failure(self):
        self.fault='health-crash-cleanup';self.target_mock.xml=fake_screen('3','1')
        _,report,raw=self.run_proposal()
        self.assertEqual(raw['firstFailure']['step'],'target-restored-point')
        self.assertEqual(report['status'],'failed');self.assertEqual(report['cleanup'],{'absent':False})
        self.assertEqual(len(raw['healthFindings']),1)
        self.assertEqual(raw['healthFindings'][0]['kind'],'matching-crash-anr')
        self.assertTrue(raw['cleanupFailures'])
        self.assertTrue(all(f.get('kind')!='matching-crash-anr' for f in raw['cleanupFailures']))


    def test_tap_failure_keeps_exact_capture_assertion_and_failure_events(self):
        def refused(ticket,control):raise a.Rejected('FAKE first guarded tap failure')
        with patch.object(self.source,'tap',side_effect=refused):
            _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed')
        self.assertEqual(raw['firstFailure']['step'],'source-later-a-write')
        self.assertEqual(raw['firstFailure']['reason'],'FAKE first guarded tap failure')
        events=[self.fixture.store.json(a.Evidence.parse(r)) for r in raw['events']]
        capture=next(e['observation'] for e in events if e['step']=='source-later-before-write-capture')
        assertion=next(e['observation'] for e in events if e['step']=='source-later-before-write-assertion')
        failure=next(e['observation'] for e in events if e['step']=='source-later-a-write-failure')
        self.assertEqual(assertion['capture'],capture['receipt']);self.assertEqual(failure['capture'],capture['receipt'])
        self.assertEqual(failure['failure']['reason'],raw['firstFailure']['reason'])
        self.assertIn(capture['receipt'],report['details']['evidence']);self.assertFalse(self.target_calls)

    def test_first_tap_reason_survives_secondary_diagnostic_retention_failure(self):
        original_write=self.fixture.store.write
        def write(path,payload):
            if path.endswith('-source-later-before-write-capture.json'):
                raise a.Rejected('FAKE secondary capture retention failure')
            return original_write(path,payload)
        def refused(ticket,control):raise a.Rejected('FAKE first guarded tap failure')
        with patch.object(self.source,'tap',side_effect=refused),patch.object(self.fixture.store,'write',side_effect=write):
            _,report,raw=self.run_proposal()
        self.assertEqual(raw['firstFailure']['step'],'source-later-a-write')
        self.assertEqual(raw['firstFailure']['reason'],'FAKE first guarded tap failure')
        self.assertIn('secondary capture retention',str(raw['cleanupFailures']))
        self.assertIn('source-later-before-write',raw['observedPoints'])
        self.assertFalse(self.target_calls);self.assertEqual(report['status'],'failed')

    def test_guarded_tap_rejects_changed_hierarchy_installed_apk_and_lease(self):
        for fault in ('hierarchy','apk','lease'):
            with self.subTest(fault=fault):
                # Each injected identity change is confined to a new synthetic case.
                case=RecoveryTests()
                try:
                    case.setUp();capture=case.source.capture
                    def changed(label):
                        ticket=capture(label)
                        if label=='source-later-before-write':
                            if fault=='hierarchy':case.source_mock.xml=fake_screen('2','1',duplicate=True)
                            elif fault=='apk':case.source_mock.installed=b'FAKE replaced installed APK'
                            else:case.source_mock.process['startTicks']+=1
                        return ticket
                    with patch.object(case.source,'capture',side_effect=changed):
                        _,report,raw=case.run_proposal()
                    self.assertEqual(report['status'],'failed')
                    self.assertEqual(raw['firstFailure']['step'],'source-later-a-write')
                    self.assertFalse(case.source_mock.tap_coordinates);self.assertFalse(case.target_calls)
                    self.assertIn('source-later-before-write',raw['observedPoints'])
                finally:case.doCleanups()

    def test_expired_capture_blocks_tap_and_retains_observed_capture(self):
        capture=self.source.capture
        def expired(label):
            ticket=capture(label)
            if label=='source-later-before-write':self.source_mock.now+=device.MAX_FRESH_SECONDS+1
            return ticket
        with patch.object(self.source,'capture',side_effect=expired):
            _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIn('freshness',raw['firstFailure']['reason'])
        self.assertFalse(self.source_mock.tap_coordinates);self.assertFalse(self.target_calls)
        events=[self.fixture.store.json(a.Evidence.parse(r)) for r in raw['events']]
        self.assertTrue(any(e['step']=='source-later-before-write-capture' for e in events))


    def test_real_validator_prechild_budget_rejection_has_no_phantom_cleanup(self):
        # Existing owned namespaces must not be attributed to this invocation.
        old=self.fixture.store.path('store-validation/'+'a'*32)
        old.mkdir(mode=0o700,parents=True)
        self.fault='prechild-budget'
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertEqual(report['cleanup'],{'absent':True})
        self.assertEqual(raw['firstFailure']['step'],'validate-collected-store')
        self.assertEqual(raw['firstFailure']['reason'],'Fixture validation would exceed Store budget')
        self.assertNotIn(None,raw['cleanupObservations']);self.assertFalse(self.target_calls)
        self.assertEqual([p.name for p in old.parent.iterdir()],['a'*32])

    def test_real_validator_prechild_tampered_file_rejection_has_no_phantom_cleanup(self):
        self.fault='prechild-tampered-file'
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertEqual(report['cleanup'],{'absent':True})
        self.assertEqual(raw['firstFailure']['step'],'validate-collected-store')
        self.assertIn('Evidence hash/byte identity mismatch',raw['firstFailure']['reason'])
        self.assertNotIn(None,raw['cleanupObservations']);self.assertFalse(self.target_calls)
        self.assertFalse(self.fixture.store.path('store-validation').exists())

    def test_new_validator_namespace_without_receipt_keeps_cleanup_unknown(self):
        self.fault='namespace-without-receipt'
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['step'],'validate-collected-store')
        self.assertEqual(raw['firstFailure']['reason'],'FAKE failure after namespace creation, receipt unavailable')
        self.assertIn(None,raw['cleanupObservations']);self.assertFalse(self.target_calls)
        owners=list(self.fixture.store.path('store-validation').iterdir())
        self.assertEqual(len(owners),1);self.assertFalse((owners[0]/'receipt.json').exists())

    def test_nontyped_validator_return_has_unknown_cleanup_without_namespace(self):
        self.fault='nontyped-validation'
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['step'],'validate-collected-store')
        self.assertEqual(raw['firstFailure']['reason'],'Typed isolated validation missing')
        self.assertIn(None,raw['cleanupObservations']);self.assertFalse(self.target_calls)
        self.assertFalse(self.fixture.store.path('store-validation').exists())


    def test_actual_guarded_tap_scratch_cleanup_failure_is_unknown_and_keeps_notes(self):
        for dump_fails in (False,True):
            with self.subTest(dump_fails=dump_fails):
                case=RecoveryTests()
                try:
                    case.setUp();armed=False;removals=0;capture=case.source.capture;backend=case.source.backend
                    def observed(label):
                        nonlocal armed
                        ticket=capture(label)
                        if label=='source-later-before-write':
                            armed=True;case.source_mock.dump_ok=not dump_fails
                        return ticket
                    def transport(argv,timeout,maximum):
                        nonlocal removals
                        if armed and argv[7:10]==('shell','rm','-f'):
                            removals+=1
                            if removals==2:raise a.Rejected('FAKE tap scratch rm failure')
                        return backend.transport(argv,timeout,maximum)
                    case.source.backend=replace(backend,transport=transport)
                    with patch.object(case.source,'capture',side_effect=observed):
                        _,report,raw=case.run_proposal()
                    self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
                    self.assertEqual(raw['firstFailure']['step'],'source-later-a-write')
                    self.assertEqual(removals,2);self.assertFalse(case.source_mock.tap_coordinates)
                    failure=next(f for f in raw['cleanupFailures'] if f.get('kind')=='guarded-tap-cleanup-unknown')
                    self.assertEqual(failure['failure']['reason'],raw['firstFailure']['reason'])
                    if dump_fails:self.assertTrue(any('Owned hierarchy scratch cleanup failed' in n for n in failure['notes']))
                    self.assertFalse(case.target_calls)
                finally:case.doCleanups()

    def test_wrapped_collection_transport_cleanup_failure_keeps_child_and_unknown(self):
        self.fault='wrapped-collection-transport'
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['step'],'collect-source-store')
        events=[self.fixture.store.json(a.Evidence.parse(r)) for r in raw['events']]
        ref=next(e['observation']['receipt'] for e in events if e['step']=='failed-child')
        child=self.fixture.store.json(a.Evidence.parse(ref))
        command=next(c for c in child['commands'] if c['operation']=='collect')
        failure=next(f for f in raw['cleanupFailures'] if f.get('source')=='child-command')
        self.assertEqual(failure['failure'],command['failure']['transportCleanupFailure'])
        self.assertEqual(failure['receipt'],ref);self.assertFalse(self.target_calls)

    def test_wrapped_restore_transport_failure_is_unknown_despite_private_cleanup_absence(self):
        self.fault='wrapped-restore-transport'
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['step'],'restore-empty-target')
        failure=next(f for f in raw['cleanupFailures'] if f.get('source')=='child-command')
        child=self.fixture.store.json(a.Evidence.parse(failure['receipt']))
        self.assertEqual(child['stageCleanup'],{'absent':True});self.assertEqual(child['helperCleanup'],{'absent':True})
        command=next(c for c in child['commands'] if c['operation']=='transfer')
        self.assertEqual(failure['failure'],command['failure']['transportCleanupFailure'])
        self.assertIn('first restore transfer',raw['firstFailure']['childFailure']['reason'])
        self.assertFalse(self.committed);self.assertEqual(self.target_mock.launches,0)

    def test_persistently_tampered_collected_file_returns_failed_stage_and_keeps_first_reason(self):
        self.fault='persistent-tampered-file'
        observation,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertEqual(report['cleanup'],{'absent':True})
        self.assertEqual(raw['firstFailure']['step'],'validate-collected-store')
        self.assertEqual(raw['firstFailure']['reason'],'Evidence hash/byte identity mismatch')
        self.assertIn(self.tampered_ref.json(),raw['unverifiedEvidence'])
        self.assertNotIn(self.tampered_ref.json(),report['details']['evidence'])
        self.assertTrue(any(f['reference']==self.tampered_ref.json() for f in raw['integrityFailures']))
        self.assertFalse(self.target_calls)
        self.assertEqual(pipeline.validate_observation(observation,self.job,self.fixture.now)['status'],'failed')
        for reference in report['details']['evidence']:self.fixture.store.verify(a.Evidence.parse(reference))
        with self.assertRaises(a.Rejected):self.fixture.store.verify(self.tampered_ref)

    def test_unreadable_typed_validator_receipt_keeps_unknown_cleanup_and_unverified_ref(self):
        self.fault='unreadable-typed-validation'
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['step'],'validate-collected-store')
        self.assertIn(self.unreadable_ref.json(),raw['unverifiedEvidence'])
        self.assertNotIn(self.unreadable_ref.json(),report['details']['evidence']);self.assertFalse(self.target_calls)

    def test_validator_callable_substitution_requires_explicit_synthetic_pin(self):
        _,report,raw=self.run_proposal(substitute_validator=False)
        self.assertEqual(report['status'],'failed')
        self.assertIn('Validator callable differs',raw['firstFailure']['reason'])
        self.assertFalse(self.target_calls);self.assertIsNone(raw['validation'])

    def test_wrapped_transport_cause_cycle_is_bounded_and_retained(self):
        self.fault='wrapped-collection-transport-cycle'
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['step'],'collect-source-store')
        causes=[f for f in raw['cleanupFailures'] if f.get('source')=='exception-cause']
        self.assertEqual(len(causes),1);self.assertIn('collection client remains',str(causes[0]))
        self.assertFalse(self.target_calls)


    def test_actual_device_capture_receipt_corruption_keeps_cleanup_unknown(self):
        capture=self.source.capture;corrupted=[]
        def replaced(label):
            ticket=capture(label)
            if label=='source-snapshot-point':
                path=self.fixture.store.path(ticket.receipt.path);path.chmod(0o600)
                path.write_bytes(b'FAKE corrupted actual scripted Device receipt');path.chmod(0o400)
                corrupted.append(ticket.receipt)
            return ticket
        with patch.object(self.source,'capture',side_effect=replaced):
            _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['step'],'source-snapshot-point')
        self.assertIn(corrupted[0].json(),raw['unverifiedEvidence'])
        self.assertNotIn(corrupted[0].json(),report['details']['evidence']);self.assertFalse(self.target_calls)

    def test_real_synthetic_restore_return_receipt_corruption_keeps_cleanup_unknown(self):
        restore=self.target.restore_fixture_store;corrupted=[]
        def replaced(*args):
            reference=restore(*args)
            path=self.fixture.store.path(reference.path);path.chmod(0o600)
            path.write_bytes(b'FAKE corrupted returned committed restore receipt');path.chmod(0o400)
            corrupted.append(reference)
            return reference
        with patch.object(self.target,'restore_fixture_store',side_effect=replaced):
            _,report,raw=self.run_proposal()
        self.assertTrue(self.committed);self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['step'],'restore-empty-target')
        self.assertIn(corrupted[0].json(),raw['unverifiedEvidence'])
        self.assertNotIn(corrupted[0].json(),report['details']['evidence']);self.assertEqual(self.target_mock.launches,0)

    def test_health_window_receipt_corruption_preserves_reserved_unknown_cleanup(self):
        finish=self.health_finish;corrupted=[]
        def replaced(adapter,ticket):
            reference=finish(adapter,ticket)
            path=self.fixture.store.path(reference.path);path.chmod(0o600)
            path.write_bytes(b'FAKE corrupted returned health-window receipt');path.chmod(0o400)
            corrupted.append(reference)
            return reference
        with patch.object(self,'health_finish',side_effect=replaced):
            _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['step'],'source-snapshot-health-finish')
        self.assertIn(corrupted[0].json(),raw['unverifiedEvidence']);self.assertFalse(self.target_calls)

    def test_collection_return_receipt_corruption_keeps_cleanup_unknown(self):
        collect=self.source.collect_fixture_store;corrupted=[]
        def replaced():
            collected=collect()
            path=self.fixture.store.path(collected.receipt.path);path.chmod(0o600)
            path.write_bytes(b'FAKE corrupted returned collection receipt');path.chmod(0o400)
            corrupted.append(collected.receipt)
            return collected
        with patch.object(self.source,'collect_fixture_store',side_effect=replaced):
            _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['step'],'collect-source-store')
        self.assertIn(corrupted[0].json(),raw['unverifiedEvidence']);self.assertFalse(self.target_calls)

    def test_untyped_collection_success_return_keeps_unknown_cleanup(self):
        with patch.object(self.source,'collect_fixture_store',return_value=None):
            _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['step'],'collect-source-store');self.assertFalse(self.target_calls)

    def test_untyped_restore_success_return_keeps_unknown_cleanup(self):
        with patch.object(self.target,'restore_fixture_store',return_value=True):
            _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['step'],'restore-empty-target');self.assertFalse(self.target_calls)

    def test_replaced_thrown_validator_path_is_diagnostic_only_with_unknown_lineage(self):
        self.fault='validator-thrown-replaced'
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['step'],'validate-collected-store')
        self.assertEqual(raw['firstFailure']['reason'],'Fixture validation failed; retained '+self.validator_failure_ref.path)
        self.assertEqual(raw['firstFailure']['validatorCauseFailure']['reason'],'FAKE original validator cause before receipt replacement')
        limitation=raw['receiptLineageLimits'][0]
        self.assertEqual(limitation['originalReference'],None)
        self.assertNotEqual(limitation['currentDiagnosticReference']['sha256'],self.validator_failure_ref.sha256)
        self.assertEqual(limitation['cleanupTrusted'],False);self.assertFalse(self.target_calls)

    def test_disappeared_owned_temporary_validator_namespace_invalidates_unchanged_proof(self):
        namespace=self.fixture.store.path('store-validation/'+'b'*32)
        namespace.mkdir(mode=0o700,parents=True)
        self.fault='namespace-disappeared'
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['reason'],'FAKE validator namespace disappeared')
        self.assertIn('b'*32,raw['validatorNamespaceBaseline'])
        self.assertEqual(raw['validatorNamespaceFailureInventory'],{})
        self.assertFalse(namespace.exists());self.assertFalse(self.target_calls)

    def test_bare_collection_throw_keeps_reserved_cleanup_unknown(self):
        with patch.object(self.source,'collect_fixture_store',side_effect=a.Rejected('FAKE bare collection failure')):
            _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['reason'],'FAKE bare collection failure')
        self.assertFalse(self.target_calls)

    def test_bare_restore_throw_keeps_reserved_cleanup_unknown(self):
        with patch.object(self.target,'restore_fixture_store',side_effect=a.Rejected('FAKE bare restore failure')):
            _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['reason'],'FAKE bare restore failure')
        self.assertEqual(self.target_mock.launches,0);self.assertFalse(self.committed)

    def test_foreign_collection_child_cannot_supply_cleanup(self):
        original=self.source.collect_fixture_store
        def failed():
            child=original();facts=self.fixture.store.json(child.receipt)
            facts.update(role='factory-target',failure={'reason':'FAKE foreign child'})
            error=a.Rejected('FAKE original collection reason')
            error.collection_evidence=self.fixture.put(facts);raise error
        with patch.object(self.source,'collect_fixture_store',side_effect=failed):
            _,report,raw=self.run_proposal()
        self.assertIsNone(report['cleanup']);self.assertEqual(report['status'],'failed')
        self.assertEqual(raw['firstFailure']['reason'],'FAKE original collection reason')
        self.assertNotIn('childFailure',raw['firstFailure']);self.assertFalse(self.target_calls)

    def test_malformed_collection_child_cannot_supply_cleanup(self):
        error=a.Rejected('FAKE original malformed collection reason')
        error.collection_evidence=self.fixture.put(['FAKE scalar child'])
        with patch.object(self.source,'collect_fixture_store',side_effect=error):
            _,report,raw=self.run_proposal()
        self.assertIsNone(report['cleanup']);self.assertEqual(report['status'],'failed')
        self.assertEqual(raw['firstFailure']['reason'],'FAKE original malformed collection reason')

    def test_foreign_restore_child_cannot_supply_cleanup(self):
        original=self.target.restore_fixture_store
        def failed(*args):
            reference=original(*args);facts=self.fixture.store.json(reference)
            facts.update(helper=self.artifact.json(),failure={'reason':'FAKE foreign restore child'})
            error=a.Rejected('FAKE original restore reason')
            error.restore_evidence=self.fixture.put(facts);raise error
        with patch.object(self.target,'restore_fixture_store',side_effect=failed):
            _,report,raw=self.run_proposal()
        self.assertIsNone(report['cleanup']);self.assertEqual(report['status'],'failed')
        self.assertEqual(raw['firstFailure']['reason'],'FAKE original restore reason')
        self.assertNotIn('childFailure',raw['firstFailure']);self.assertEqual(self.target_mock.launches,0)

    def test_malformed_restore_child_cannot_supply_cleanup(self):
        error=a.Rejected('FAKE original malformed restore reason')
        error.restore_evidence=self.fixture.put(['FAKE scalar restore child'])
        with patch.object(self.target,'restore_fixture_store',side_effect=error):
            _,report,raw=self.run_proposal()
        self.assertIsNone(report['cleanup']);self.assertEqual(report['status'],'failed')
        self.assertEqual(raw['firstFailure']['reason'],'FAKE original malformed restore reason')
        self.assertEqual(self.target_mock.launches,0)

    def corrupt_validation(self, mutate):
        original=self.validate
        def changed(store,manifest,files):
            reference=original(store,manifest,files);facts=store.json(reference);mutate(facts)
            path=store.path(reference.path);path.chmod(0o600);path.write_bytes(a.canonical(facts));path.chmod(0o400)
            return store.describe(reference.path)
        self.validate=changed

    def test_foreign_validator_manifest_cannot_supply_cleanup(self):
        self.corrupt_validation(lambda facts:facts.update(manifest=self.helper.json()))
        _,report,raw=self.run_proposal()
        self.assertIsNone(report['cleanup']);self.assertEqual(report['status'],'failed')
        self.assertEqual(raw['firstFailure']['step'],'validate-collected-store');self.assertFalse(self.target_calls)

    def test_foreign_validator_files_cannot_supply_cleanup(self):
        self.corrupt_validation(lambda facts:facts.update(files={'factory-fixture.db':self.helper.json()}))
        _,report,raw=self.run_proposal()
        self.assertIsNone(report['cleanup']);self.assertEqual(report['status'],'failed');self.assertFalse(self.target_calls)

    def test_foreign_validator_authority_cannot_supply_cleanup(self):
        self.corrupt_validation(lambda facts:facts.update(commandHelperSha256='0'*64))
        _,report,raw=self.run_proposal()
        self.assertIsNone(report['cleanup']);self.assertEqual(report['status'],'failed');self.assertFalse(self.target_calls)

    def test_validator_current_collection_artifact_binding_precedes_cleanup(self):
        original=self.validate
        def foreign(store,manifest,files):
            receipt=next(p for p in store.path(manifest.path).parent.iterdir() if p.name=='collection.json')
            facts=store.json(store.describe(str(receipt.relative_to(store.root))))
            facts['apkSha256']='0'*64;receipt.chmod(0o600);receipt.write_bytes(a.canonical(facts));receipt.chmod(0o400)
            return original(store,manifest,files)
        self.validate=foreign
        _,report,raw=self.run_proposal()
        self.assertIsNone(report['cleanup']);self.assertEqual(report['status'],'failed');self.assertFalse(self.target_calls)

    def test_foreign_validator_generated_execution_owner_cannot_supply_cleanup(self):
        self.corrupt_validation(lambda facts:facts.update(owner='f'*32))
        _,report,raw=self.run_proposal()
        self.assertIsNone(report['cleanup']);self.assertEqual(report['status'],'failed');self.assertFalse(self.target_calls)

    def test_replaced_validator_diagnostic_never_enters_verified_evidence(self):
        self.fault='validator-thrown-replaced';_,report,raw=self.run_proposal()
        diagnostic=raw['receiptLineageLimits'][0]['currentDiagnosticReference']
        self.assertNotIn(diagnostic,report['details']['evidence'])
        self.assertNotIn(diagnostic,raw['verifiedEvidence']);self.assertIsNone(report['cleanup'])

    def replace_synthetic_receipt(self, reference, facts):
        path=self.fixture.store.path(reference.path);path.chmod(0o600)
        path.write_bytes(a.canonical(facts));path.chmod(0o400)
        return self.fixture.store.describe(reference.path)

    def test_same_namespace_foreign_collection_lease_or_artifact_stays_unknown(self):
        for key in ('leaseSha256','apkSha256','collectorSha256'):
            with self.subTest(key=key):
                case=RecoveryTests();case.setUp()
                try:
                    original=case.source.collect_fixture_store
                    def fail():
                        result=original();facts=case.fixture.store.json(result.receipt)
                        facts.update(status='failed',failure={'reason':'FAKE foreign collection child'})
                        facts[key]='0'*64
                        error=a.Rejected('FAKE same namespace collection reason')
                        error.collection_evidence=case.replace_synthetic_receipt(result.receipt,facts);raise error
                    with patch.object(case.source,'collect_fixture_store',side_effect=fail):
                        _,report,raw=case.run_proposal()
                    self.assertIsNone(report['cleanup']);self.assertNotIn('childFailure',raw['firstFailure'])
                    self.assertEqual(raw['firstFailure']['reason'],'FAKE same namespace collection reason')
                finally:case.doCleanups()

    def test_same_namespace_foreign_restore_input_or_authority_stays_unknown(self):
        for key in ('leaseSha256','apkSha256','collection','validation','helper','helperSourceSha256'):
            with self.subTest(key=key):
                case=RecoveryTests();case.setUp()
                try:
                    original=case.target.restore_fixture_store
                    def fail(*args):
                        reference=original(*args);facts=case.fixture.store.json(reference)
                        facts.update(status='failed',failure={'reason':'FAKE foreign restore child'})
                        facts[key]=case.artifact.json() if key in ('collection','validation','helper') else '0'*64
                        error=a.Rejected('FAKE same namespace restore reason')
                        error.restore_evidence=case.replace_synthetic_receipt(reference,facts);raise error
                    with patch.object(case.target,'restore_fixture_store',side_effect=fail):
                        _,report,raw=case.run_proposal()
                    self.assertIsNone(report['cleanup']);self.assertNotIn('childFailure',raw['firstFailure'])
                    self.assertEqual(case.target_mock.launches,0)
                finally:case.doCleanups()

    def test_unreadable_child_original_reference_preserves_unknown_and_first(self):
        for attribute,adapter,method in (('collection_evidence',self.source,'collect_fixture_store'),
                                        ('restore_evidence',self.target,'restore_fixture_store')):
            with self.subTest(attribute=attribute):
                reference=self.fixture.put({'scope':'FAKE original child bytes'})
                path=self.fixture.store.path(reference.path);path.chmod(0o600);path.write_bytes(b'FAKE replaced');path.chmod(0o400)
                error=a.Rejected('FAKE original unreadable child reason');setattr(error,attribute,reference)
                with patch.object(adapter,method,side_effect=error):
                    _,report,raw=self.run_proposal()
                self.assertIsNone(report['cleanup']);self.assertEqual(report['status'],'failed')
                self.assertEqual(raw['firstFailure']['reason'],'FAKE original unreadable child reason')
                self.assertIn(reference.json(),raw['unverifiedEvidence'])

    def test_foreign_validator_runtime_or_execution_cannot_supply_cleanup(self):
        for kind in ('runtime','execution','schema'):
            with self.subTest(kind=kind):
                case=RecoveryTests();case.setUp()
                try:
                    def change(facts):
                        if kind=='runtime':facts['runtime']['identity']=False
                        elif kind=='execution':facts['commands'][2]['argv'][-1]='f'*64
                        else:facts['schema']='FAKE foreign schema'
                    case.corrupt_validation(change)
                    _,report,raw=case.run_proposal()
                    self.assertIsNone(report['cleanup']);self.assertEqual(report['status'],'failed')
                    self.assertFalse(case.target_calls)
                finally:case.doCleanups()

    def test_replayed_existing_validator_namespace_cannot_supply_cleanup(self):
        owner='d'*32;directory='store-validation/'+owner
        self.fixture.store.path(directory).mkdir(mode=0o700,parents=True)
        original=self.validate
        def replay(store,manifest,files):
            reference=original(store,manifest,files);facts=store.json(reference)
            previous=facts['owner'];facts['owner']=owner
            for command in facts['commands']:
                command['argv']=[value.replace(previous,owner) for value in command['argv']]
            return store.write(directory+'/receipt.json',facts)
        self.validate=replay
        _,report,raw=self.run_proposal()
        self.assertIsNone(report['cleanup']);self.assertEqual(report['status'],'failed');self.assertFalse(self.target_calls)

    def test_foreign_original_typed_validator_failure_stays_unverified(self):
        self.fault='validator-thrown-cleanup';original=self.validate;refs=[]
        def foreign(*args):
            try:return original(*args)
            except a.Rejected as error:
                reference=error.validation_evidence;facts=self.fixture.store.json(reference)
                facts['manifest']=self.helper.json()
                error.validation_evidence=self.replace_synthetic_receipt(reference,facts)
                refs.append(error.validation_evidence.json());raise
        self.validate=foreign
        _,report,raw=self.run_proposal()
        self.assertIsNone(report['cleanup']);self.assertEqual(report['status'],'failed')
        self.assertNotIn(refs[0],report['details']['evidence'])
        self.assertEqual(raw['receiptLineageLimits'][0]['originalReference'],refs[0]);self.assertFalse(self.target_calls)

    def test_same_namespace_scalar_restore_failure_is_malformed_and_unknown(self):
        original=self.target.restore_fixture_store
        def failed(*args):
            reference=original(*args);facts=self.fixture.store.json(reference)
            facts.update(status='failed',failure='FAKE scalar failure, not a dict')
            error=a.Rejected('FAKE original scalar restore failure')
            error.restore_evidence=self.replace_synthetic_receipt(reference,facts);raise error
        with patch.object(self.target,'restore_fixture_store',side_effect=failed):
            _,report,raw=self.run_proposal()
        self.assertIsNone(report['cleanup']);self.assertEqual(report['status'],'failed')
        self.assertEqual(raw['firstFailure']['reason'],'FAKE original scalar restore failure')
        self.assertEqual(self.target_mock.launches,0);self.assertNotIn('childFailure',raw['firstFailure'])

    def test_empty_or_malformed_bound_collection_commands_cannot_prove_absence(self):
        for commands in ([],[{'operation':'inventory'}]):
            with self.subTest(commands=commands):
                case=RecoveryTests();case.setUp()
                try:
                    original=case.source.collect_fixture_store
                    def failed():
                        result=original();facts=case.fixture.store.json(result.receipt)
                        facts.update(status='failed',commands=commands,failure={'reason':'FAKE malformed command proof'})
                        error=a.Rejected('FAKE original incomplete collection proof')
                        error.collection_evidence=case.replace_synthetic_receipt(result.receipt,facts);raise error
                    with patch.object(case.source,'collect_fixture_store',side_effect=failed):
                        _,report,raw=case.run_proposal()
                    self.assertIsNone(report['cleanup']);self.assertEqual(report['status'],'failed')
                    self.assertEqual(raw['firstFailure']['reason'],'FAKE original incomplete collection proof')
                finally:case.doCleanups()

    def assert_real_shape_rejection(self, fault, message):
        self.fault=fault;_,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertEqual(report['cleanup'],{'absent':True})
        self.assertFalse(self.target_calls);self.assertEqual(self.target_mock.launches,0)
        self.assertEqual(self.source_mock.tap_coordinates,[])
        receipt=self.fixture.store.json(a.Evidence.parse(raw['validation']))
        self.assertEqual(receipt['status'],'rejected');self.assertEqual(receipt['state']['ExitCode'],1)
        worker={'schema':'micro.fixture-store-validation/1','status':'failed',
                'error':{'type':'ValueError','message':message}}
        self.assertEqual(receipt['worker'],worker)
        self.assertEqual(receipt['commands'][2]['exitCode'],1)
        self.assertEqual(raw['firstFailure']['validatorDomainError'],worker['error'])
        self.assertEqual(raw['firstFailure']['validatorDomainReceipt'],raw['validation'])
        self.assertEqual(raw['firstFailure']['step'],'validate-collected-store')

    def test_real_shape_wrong_product_rejection_keeps_cleanup_and_domain_error(self):
        # Synthetic protocol shape. Actual retained_files defers product/version
        # rejection to the worker; no SQL/worker execution is claimed here.
        self.assert_real_shape_rejection('wrong-product','Wrong product or incompatible fixture backup')

    def test_real_shape_wrong_version_rejection_keeps_cleanup_and_domain_error(self):
        self.assert_real_shape_rejection('wrong-version','Incompatible fixture schema')

    def test_real_shape_integrity_rejection_keeps_cleanup_and_domain_error(self):
        self.assert_real_shape_rejection('corrupt-validation','Fixture SQLite integrity failed')

    def test_malformed_rejected_worker_does_not_supply_clean_cleanup(self):
        self.fault='corrupt-validation'
        self.corrupt_validation(lambda facts:facts['worker'].update(manifestSha256='0'*64))
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertFalse(self.target_calls);self.assertNotIn('validatorDomainError',raw['firstFailure'])

    def test_rejected_worker_requires_exit_one_and_current_parent_subject(self):
        self.fault='corrupt-validation'
        def mismatch(facts):
            facts['state']['ExitCode']=0;facts['commands'][2]['exitCode']=0
        self.corrupt_validation(mismatch)
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup']);self.assertFalse(self.target_calls)

    def test_foreign_health_ticket_bindings_cannot_supply_clean_cleanup(self):
        for key in ('role','leaseSha256','apkSha256','controllerSha256','baseline'):
            with self.subTest(key=key):
                case=RecoveryTests();case.setUp()
                try:
                    original=case.health_finish
                    def foreign(adapter,ticket):
                        reference=original(adapter,ticket);facts=case.fixture.store.json(reference)
                        facts[key]=case.helper.json() if key=='baseline' else 'FAKE foreign health binding'
                        return case.replace_synthetic_receipt(reference,facts)
                    case.health_finish=foreign
                    _,report,raw=case.run_proposal()
                    self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
                    self.assertIn('Health window receipt',raw['firstFailure']['reason']);self.assertFalse(case.target_calls)
                finally:case.doCleanups()

    def test_callable_identity_and_explicit_fake_substitution_are_recorded(self):
        _,report,raw=self.run_proposal()
        identity=raw['validatorCallable']
        self.assertEqual(identity['canonical']['module'],validator.__name__)
        self.assertEqual(identity['canonical']['qualname'],'validate_collected_store')
        self.assertEqual(identity['canonical']['codePath'],str(Path(validator.__file__).resolve()))
        self.assertEqual(identity['authoritySha256'],raw['authority']['validator'])
        self.assertTrue(identity['testOnlySubstitution']);self.assertFalse(identity['canonicalIdentityMatches'])
        self.assertEqual(report['status'],'pending')

    def test_reviewed_callable_identity_mismatch_needs_explicit_test_pin(self):
        # The callable and REVIEWED_VALIDATE pointers agree, but its canonical
        # metadata does not. No explicit TEST_ONLY_VALIDATE authorizes this fake.
        _,report,raw=self.run_proposal(explicit_test_pin=False)
        self.assertEqual(report['status'],'failed');self.assertFalse(self.target_calls)
        self.assertIn('Validator callable differs',raw['firstFailure']['reason'])
        self.assertFalse(raw['validatorCallable']['testOnlySubstitution'])

    def test_hash_mismatched_manifest_cannot_be_stage_backup(self):
        original=self.validate;refs=[]
        def corrupt(store,manifest,files):
            reference=original(store,manifest,files);refs.append(manifest)
            path=store.path(manifest.path);path.chmod(0o600);path.write_bytes(b'FAKE persistent corrupt manifest');path.chmod(0o400)
            return reference
        self.validate=corrupt
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['details']['backup'])
        self.assertIn(refs[0].json(),raw['unverifiedEvidence']);self.assertNotIn(refs[0].json(),report['details']['evidence'])
        self.assertFalse(self.target_calls)

    def test_bound_health_stream_finish_failure_retains_actual_cleanup_reason(self):
        original=self.health_finish;refs=[]
        failure={'type':'Rejected','reason':'FAKE actual stream.finish exception shape'}
        def failed(adapter,ticket):
            reference=original(adapter,ticket);facts=self.fixture.store.json(reference)
            facts.update(stream=None,summary=None,cleanupFailure=failure)
            reference=self.replace_synthetic_receipt(reference,facts);refs.append(reference.json())
            return reference
        self.health_finish=failed
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        cleanup=next(f for f in raw['cleanupFailures'] if f.get('kind')=='owned-stream-cleanup')
        self.assertEqual(cleanup['failure'],failure);self.assertEqual(cleanup['receipt'],refs[0])
        self.assertEqual(raw['firstFailure']['reason'],'Recovery owned-stream cleanup failed or unknown')
        self.assertFalse(self.target_calls)

    def test_bad_callable_pointer_blocks_all_source_and_target_operations(self):
        _,report,raw=self.run_proposal(substitute_validator=False)
        self.assertEqual(report['status'],'failed');self.assertIn('Validator callable differs',raw['firstFailure']['reason'])
        self.assertEqual(self.source_mock.calls,[]);self.assertEqual(self.target_mock.calls,[])
        self.assertEqual(self.source_mock.mutations,[]);self.assertEqual(self.target_mock.mutations,[])
        self.assertEqual(self.health_baselines,[]);self.assertFalse(self.target_calls)

    def test_bad_callable_metadata_blocks_all_source_and_target_operations(self):
        _,report,raw=self.run_proposal(explicit_test_pin=False)
        self.assertEqual(report['status'],'failed');self.assertIn('Validator callable differs',raw['firstFailure']['reason'])
        self.assertEqual(self.source_mock.calls,[]);self.assertEqual(self.target_mock.calls,[])
        self.assertEqual(self.source_mock.mutations,[]);self.assertEqual(self.target_mock.mutations,[])
        self.assertEqual(self.health_baselines,[]);self.assertFalse(self.target_calls)

    def bare_operation_failure(self, operation, reason):
        transport=self.source.backend.transport
        def failed(argv,timeout,maximum):
            args=argv[7:]
            if args[:3]==('shell','am',operation):raise a.Rejected(reason)
            return transport(argv,timeout,maximum)
        self.source.backend=replace(self.source.backend,transport=failed)
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['reason'],reason);self.assertFalse(self.target_calls)
        self.assertTrue(self.health_refs)
        self.assertEqual(self.fixture.store.json(self.health_refs[-1])['stream']['cleanup'],{'absent':True})

    def test_bare_actual_launch_failure_cannot_report_absent_cleanup(self):
        self.bare_operation_failure('start','FAKE bare reviewed launch failure')

    def test_bare_actual_force_stop_failure_cannot_report_absent_cleanup(self):
        self.bare_operation_failure('force-stop','FAKE bare reviewed stop failure')

    def test_operation_success_is_explicit_administrative_guarantee_without_raw_receipt(self):
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'pending');self.assertEqual(report['cleanup'],{'absent':True})
        guarantees=raw['operationAdministrativeGuarantees'];self.assertEqual(len(guarantees),8)
        for guarantee in guarantees:
            self.assertTrue(guarantee['guaranteeApplied'])
            self.assertEqual(guarantee['kind'],'reviewed-fixed-producer-administrative-guarantee')
            self.assertIsNone(guarantee['independentCleanupReceipt']);self.assertTrue(guarantee['testOnlyTransportSubstitution'])
            self.assertEqual(guarantee['authoritySha256'],raw['authority']['device'])

    def test_unreviewed_operation_transport_blocks_mutation_with_unknown_cleanup(self):
        _,report,raw=self.run_proposal(explicit_transports=False)
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(self.source_mock.mutations,[]);self.assertEqual(self.target_mock.mutations,[])
        self.assertFalse(self.target_calls)

    def test_foreign_or_malformed_operation_outcomes_cannot_prove_cleanup(self):
        for kind in ('foreign','malformed'):
            with self.subTest(kind=kind):
                case=RecoveryTests();case.setUp()
                try:
                    original=case.target.launch_offline
                    def outcome():
                        facts=original()
                        if kind=='foreign':facts['apkSha256']='0'*64
                        else:facts.pop('observedAt')
                        return facts
                    with patch.object(case.target,'launch_offline',side_effect=outcome):
                        _,report,raw=case.run_proposal()
                    self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
                    self.assertFalse(raw['operationAdministrativeGuarantees'][-1]['guaranteeApplied'])
                finally:case.doCleanups()

    def tamper_health_ref(self, reference):
        path=self.fixture.store.path(reference.path);path.chmod(0o600)
        path.write_bytes(b'FAKE persistent late health evidence replacement');path.chmod(0o400)

    def test_original_health_baseline_registered_before_failed_read(self):
        original=self.health_start;refs=[]
        def corrupted(adapter):
            ticket=original(adapter);refs.append(ticket.baseline);self.tamper_health_ref(ticket.baseline)
            return ticket
        self.health_start=corrupted
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertIn(refs[0].json(),raw['unverifiedEvidence']);self.assertNotIn(refs[0].json(),report['details']['evidence'])
        self.assertFalse(self.source_mock.mutations);self.assertFalse(self.target_calls)

    def late_health_tamper(self, kind):
        original=self.fixture.store.write;refs=[]
        def write(path,payload):
            result=original(path,payload)
            if payload.get('schema')=='micro.android.fixture-recovery-event/1' and payload.get('step')=='target-restored-write-reopen-health-finish':
                reference=self.health_baselines[0] if kind=='baseline' else self.health_observations[-1]
                if kind=='raw':reference=a.Evidence.parse(self.fixture.store.json(reference)['raw'])
                refs.append(reference);self.tamper_health_ref(reference)
            return result
        with patch.object(self.fixture.store,'write',side_effect=write):
            _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertEqual(len(refs),1)
        self.assertIn(refs[0].json(),raw['unverifiedEvidence']);self.assertNotIn(refs[0].json(),report['details']['evidence'])
        self.assertEqual(raw['firstFailure']['step'],'final-evidence-verification')
        self.assertTrue(any(f['reference']==refs[0].json() for f in raw['integrityFailures']))

    def test_late_original_health_baseline_tamper_is_finally_unverified(self):
        self.late_health_tamper('baseline')

    def test_late_bound_health_final_tamper_is_finally_unverified(self):
        self.late_health_tamper('final')

    def test_late_bound_health_raw_tamper_is_finally_unverified(self):
        self.late_health_tamper('raw')

    def test_bound_health_observations_and_raw_refs_are_final_evidence(self):
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'pending')
        for reference in self.health_observations+self.health_raw_refs:
            self.assertIn(reference.json(),raw['verifiedEvidence'])
            self.assertIn(reference.json(),report['details']['evidence'])
        self.assertEqual(len(self.health_baselines),3);self.assertEqual(len(self.health_observations),6)

    def corrupt_before_health_finish(self, kind, prior_failure=False):
        original=self.health_finish;refs={}
        def finish(adapter,ticket):
            baseline=ticket.baseline
            baseline_raw=a.Evidence.parse(self.fixture.store.json(baseline)['raw'])
            corrupted=baseline if kind=='baseline' else baseline_raw
            path=self.fixture.store.path(corrupted.path);original_bytes=path.read_bytes()
            path.chmod(0o600);path.write_bytes(b'!' + original_bytes[1:]);path.chmod(0o400)
            # Real Device obtains final before it rereads baseline. Its returned
            # window therefore still supplies original final/raw refs when the
            # baseline read raises. No original bytes are redescribed as proof.
            reference=original(adapter,ticket);facts=self.fixture.store.json(reference)
            final=a.Evidence.parse(facts['final']);final_raw=a.Evidence.parse(self.fixture.store.json(final)['raw'])
            if kind=='baseline':
                try:self.fixture.store.json(baseline)
                except a.Rejected as error:
                    facts['failure']={'type':type(error).__name__,'reason':str(error)}
                    facts['summary']=None
                    reference=self.replace_synthetic_receipt(reference,facts)
            refs.update(corrupted=corrupted,baseline=baseline,final=final,final_raw=final_raw,
                        window=reference,producer_failure=facts.get('failure'))
            return reference
        self.health_finish=finish
        if prior_failure:
            transport=self.source.backend.transport
            def failed(argv,timeout,maximum):
                if argv[7:10]==('shell','am','force-stop'):raise a.Rejected('FAKE original operational stop reason')
                return transport(argv,timeout,maximum)
            self.source.backend=replace(self.source.backend,transport=failed)
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertIn(refs['corrupted'].json(),raw['unverifiedEvidence'])
        self.assertNotIn(refs['corrupted'].json(),report['details']['evidence'])
        for reference in (refs['final'],refs['final_raw'],refs['window']):
            self.assertIn(reference.json(),raw['verifiedEvidence'])
            self.assertIn(reference.json(),report['details']['evidence'])
        self.assertTrue(raw['healthEvidenceRetentionFailures'])
        if prior_failure:
            self.assertEqual(raw['firstFailure']['reason'],'FAKE original operational stop reason')
            self.assertTrue(any(f.get('failure')==refs['producer_failure'] for f in raw['healthObservationFailures']))
        elif kind=='baseline':
            self.assertEqual(raw['firstFailure']['healthCauseFailure'],refs['producer_failure'])
            self.assertEqual(raw['firstFailure']['reason'],refs['producer_failure']['reason'])
        else:self.assertEqual(raw['firstFailure']['reason'],'Evidence hash mismatch')
        self.assertFalse(self.target_calls)

    def test_bad_baseline_before_finish_keeps_bound_final_and_raw_originals(self):
        self.corrupt_before_health_finish('baseline')

    def test_bad_baseline_raw_before_finish_keeps_bound_final_and_raw_originals(self):
        self.corrupt_before_health_finish('raw')

    def test_original_operation_cause_survives_bad_baseline_sibling_retention(self):
        self.corrupt_before_health_finish('baseline',prior_failure=True)

    def test_health_failure_list_preregisters_later_original_before_bad_first_read(self):
        refs={}
        def failed(adapter):
            baseline=self.health_observation(adapter)
            directory='fixture-health/'+adapter.role
            later=self.fixture.store.write(directory+'/'+uuid4().hex+'.json',{
                'schema':'micro.android.fixture-health-start-failure/1','role':adapter.role,
                'baseline':baseline.json(),'error':{'type':'Rejected','reason':'FAKE original stream start error'}})
            self.tamper_health_ref(baseline);refs.update(baseline=baseline,later=later)
            error=a.Rejected('FAKE first start operational failure')
            error.health_evidence=[baseline.json(),later.json()];raise error
        self.health_start=failed
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['reason'],'FAKE first start operational failure')
        self.assertIn(refs['baseline'].json(),raw['unverifiedEvidence'])
        self.assertIn(refs['later'].json(),raw['verifiedEvidence']);self.assertIn(refs['later'].json(),report['details']['evidence'])
        self.assertTrue(raw['healthEvidenceRetentionFailures']);self.assertFalse(self.source_mock.mutations)
        self.assertFalse(self.target_calls)


    def final_health_controller_change(self, corrupt_raw=False):
        """FAKE returned producer construction, no canonical source mutation."""
        original=self.health_finish;refs={}
        producer_failure={'type':'Rejected','reason':'Health lease/artifact/controller changed'}
        def changed(adapter,ticket):
            reference=original(adapter,ticket);facts=self.fixture.store.json(reference)
            final=a.Evidence.parse(facts['final']);final_facts=self.fixture.store.json(final)
            raw_ref=a.Evidence.parse(final_facts['raw'])
            # Model the actual final producer writing the current changed health
            # hash after its original raw dump. These newly constructed receipts
            # have not yet been returned to recovery. No live source is edited.
            final_facts['controllerSha256']='0'*64
            final=self.replace_synthetic_receipt(final,final_facts)
            facts.update(final=final.json(),failure=producer_failure,summary=None)
            reference=self.replace_synthetic_receipt(reference,facts)
            if corrupt_raw:
                path=self.fixture.store.path(raw_ref.path);data=path.read_bytes()
                path.chmod(0o600);path.write_bytes(b'!'+data[1:]);path.chmod(0o400)
            refs.update(final=final,raw=raw_ref,window=reference)
            return reference
        self.health_finish=changed
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertIsNone(report['cleanup'])
        self.assertEqual(raw['firstFailure']['reason'],producer_failure['reason'])
        self.assertEqual(raw['firstFailure']['healthCauseFailure'],producer_failure)
        self.assertIn(refs['final'].json(),raw['verifiedEvidence'])
        self.assertIn(refs['window'].json(),raw['verifiedEvidence'])
        lineage=next(f for f in raw['healthEvidenceLineage'] if f['observation']==refs['final'].json())
        self.assertFalse(lineage['bindingValidated']);self.assertEqual(lineage['raw'],refs['raw'].json())
        self.assertTrue(any(f['reference']==refs['final'].json()
            and f['reason']=='Health observation role/lease/APK/controller/schema binding differs'
            for f in raw['healthEvidenceRetentionFailures']))
        if corrupt_raw:
            self.assertIn(refs['raw'].json(),raw['unverifiedEvidence'])
            self.assertNotIn(refs['raw'].json(),report['details']['evidence'])
            self.assertTrue(any(f['reference']==refs['raw'].json()
                and f['reason']=='Evidence hash/byte identity mismatch' for f in raw['integrityFailures']))
        else:
            self.assertIn(refs['raw'].json(),raw['verifiedEvidence'])
            self.assertIn(refs['raw'].json(),report['details']['evidence'])
        self.assertFalse(self.target_calls);self.assertFalse(self.committed)

    def test_changed_final_health_controller_keeps_original_nested_raw(self):
        self.final_health_controller_change()

    def test_binding_invalid_final_and_corrupt_raw_keep_independent_original_hashes(self):
        self.final_health_controller_change(corrupt_raw=True)

    def test_bad_baseline_and_failed_bound_stream_keep_negative_cleanup_and_reason(self):
        original=self.health_finish;refs={};producer_failure={}
        stream_reason='Health stream drain did not finish'
        def failed(adapter,ticket):
            path=self.fixture.store.path(ticket.baseline.path);data=path.read_bytes()
            path.chmod(0o600);path.write_bytes(b'!'+data[1:]);path.chmod(0o400)
            reference=original(adapter,ticket);facts=self.fixture.store.json(reference)
            try:self.fixture.store.json(ticket.baseline)
            except a.Rejected as error:
                producer_failure.update(type=type(error).__name__,reason=str(error))
            self.assertEqual(producer_failure['reason'],'Evidence hash mismatch')
            # EventStream.finish returns a negative cleanup dictionary and its
            # own error string. Device sets top-level cleanupFailure only when
            # that call throws, so it stays None in this producer-shaped case.
            facts['stream'].update(cleanup={'absent':False},cleanupFailure=stream_reason)
            facts.update(failure=dict(producer_failure),cleanupFailure=None,summary=None)
            reference=self.replace_synthetic_receipt(reference,facts)
            refs.update(baseline=ticket.baseline,final=a.Evidence.parse(facts['final']),window=reference)
            return reference
        self.health_finish=failed
        _,report,raw=self.run_proposal()
        self.assertEqual(report['status'],'failed');self.assertEqual(report['cleanup'],{'absent':False})
        self.assertEqual(raw['firstFailure']['reason'],'Evidence hash mismatch')
        self.assertEqual(raw['firstFailure']['healthCauseFailure'],producer_failure)
        self.assertIn({'absent':False},raw['cleanupObservations'])
        cleanup=next(f for f in raw['cleanupFailures'] if f.get('kind')=='owned-stream-cleanup')
        self.assertEqual(cleanup['cleanup'],{'absent':False});self.assertIsNone(cleanup['failure'])
        self.assertEqual(cleanup['streamCleanupFailure'],stream_reason)
        self.assertEqual(cleanup['receipt'],refs['window'].json())
        self.assertIn(refs['baseline'].json(),raw['unverifiedEvidence'])
        self.assertIn(refs['final'].json(),raw['verifiedEvidence'])
        self.assertFalse(self.target_calls);self.assertFalse(self.committed)


    def health_event_write_failure(self, producer_failed=True, prior_failure=False):
        """FAKE returned bound window plus one-shot diagnostic Store failure."""
        original_finish=self.health_finish;original_write=self.fixture.store.write;refs={};writes=[]
        producer_failure={'type':'Rejected','reason':'FAKE original health producer observation failed'}
        stream_reason='FAKE owned health stream remains'
        event_reason='FAKE one-shot health diagnostic event write failed'
        def finish(adapter,ticket):
            reference=original_finish(adapter,ticket);facts=self.fixture.store.json(reference)
            if producer_failed:
                facts.update(failure=producer_failure,summary=None)
                facts['stream'].update(cleanup={'absent':False},cleanupFailure=stream_reason)
                # These producer bytes are finalized before their reference is
                # returned. No reference to changed bytes is supplied as proof.
                reference=self.replace_synthetic_receipt(reference,facts)
            refs.update(window=reference,baseline=ticket.baseline,final=a.Evidence.parse(facts['final']))
            return reference
        def write(relative,value,*args,**kwargs):
            if (value.get('schema')=='micro.android.fixture-recovery-event/1'
                    and value.get('step')=='source-snapshot-health-finish' and not writes):
                writes.append(relative)
                # Admission reads precede this fault. Measure whether any
                # target call occurs after the diagnostic write fails.
                self.target_mock.calls.clear()
                raise OSError(event_reason)
            return original_write(relative,value,*args,**kwargs)
        self.health_finish=finish
        if prior_failure:
            transport=self.source.backend.transport
            def failed(argv,timeout,maximum):
                if argv[7:10]==('shell','am','force-stop'):
                    raise a.Rejected('FAKE earlier operational stop failure')
                return transport(argv,timeout,maximum)
            self.source.backend=replace(self.source.backend,transport=failed)
        with patch.object(self.fixture.store,'write',side_effect=write):
            _,report,raw=self.run_proposal()
        self.assertEqual(len(writes),1);self.assertEqual(report['status'],'failed')
        self.assertEqual(report['details']['firstFailure'],raw['firstFailure'])
        if prior_failure:
            self.assertEqual(raw['firstFailure']['reason'],'FAKE earlier operational stop failure')
            self.assertTrue(any(f.get('failure')==producer_failure and f.get('receipt')==refs['window'].json()
                for f in raw['healthObservationFailures']))
        elif producer_failed:
            self.assertEqual(raw['firstFailure']['step'],'source-snapshot-health-finish')
            self.assertEqual(raw['firstFailure']['reason'],producer_failure['reason'])
            self.assertEqual(raw['firstFailure']['healthCauseFailure'],producer_failure)
            self.assertEqual(raw['firstFailure']['healthCauseReceipt'],refs['window'].json())
        else:
            self.assertEqual(raw['firstFailure']['type'],'OSError')
            self.assertEqual(raw['firstFailure']['reason'],event_reason)
            self.assertNotIn('healthCauseFailure',raw['firstFailure'])
        retained=next(f for f in raw['cleanupFailures'] if f.get('kind')=='diagnostic-retention'
            and f.get('event')=='source-snapshot-health-finish')
        self.assertEqual(retained['type'],'OSError');self.assertEqual(retained['reason'],event_reason)
        self.assertEqual(retained['receipt'],refs['window'].json())
        self.assertFalse(any(event['path']==writes[0] for event in raw['events']))
        for reference in refs.values():
            self.assertIn(reference.json(),raw['verifiedEvidence'])
            self.assertIn(reference.json(),report['details']['evidence'])
            self.fixture.store.verify(reference,20*1024**2)
        self.assertTrue(report['details']['rawObservation']['verified'])
        self.assertIsNone(report['details']['semanticRestore'])
        if producer_failed:
            self.assertEqual(report['cleanup'],{'absent':False})
            self.assertIn({'absent':False},raw['cleanupObservations'])
            cleanup=next(f for f in raw['cleanupFailures'] if f.get('kind')=='owned-stream-cleanup')
            self.assertEqual(cleanup['streamCleanupFailure'],stream_reason)
            self.assertEqual(cleanup['receipt'],refs['window'].json())
        self.assertFalse(self.target_calls);self.assertFalse(self.committed)
        self.assertEqual(self.target_mock.calls,[])

    def test_bound_health_producer_failure_precedes_later_event_write_error(self):
        self.health_event_write_failure()

    def test_earlier_operation_failure_survives_health_producer_and_event_write_errors(self):
        self.health_event_write_failure(prior_failure=True)

    def test_health_event_write_error_without_producer_failure_still_fails(self):
        self.health_event_write_failure(producer_failed=False)


if __name__ == '__main__':unittest.main()
