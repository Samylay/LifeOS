"""FAKE authored job/runtime/results for logic only, no actual checks proof."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import admission as a
import pipeline as p
import fixture_check_supervisor as c


def fake_receipt(f,job):
    """Real trusted tool bytes, explicitly FAKE process/Node observations."""
    owner=c.uuid4().hex;identifier='a'*64;parent='fixture-check-jobs/'+owner
    component=next(r['sha256'] for r in f.source_files if r['path']=='app/index.tsx')
    results={'schema':'micro.fixture-checks/1','sourceSha256':component,
      'results':[{'group':g,'name':n,'passed':True,'seconds':.01} for g,names in c.CASES.items() for n in sorted(names)]}
    logs={n:('FAKE successful '+n).encode() for n in c.COMMANDS}
    logs['domain-storage']=a.canonical({**results,'passed':True,'mandatoryCases':{'domain':3,'storage':6}})+b'\n'
    worker={'schema':'micro.fixture-offline-check-worker/1','startedAt':f.now-3,'finishedAt':f.now-2,
      'commands':[{'check':n,'argv':argv,'exitCode':0,'seconds':1,'sha256':hashlib.sha256(logs[n]).hexdigest(),'bytes':len(logs[n])} for n,argv in c.COMMANDS.items()],
      'sourceSha256':component,'status':'protected-offline-fixture-checks-passed','mandatoryCases':{'lint':1,'types':1,'domain':3,'storage':6}}
    for name in c.TOOLS:f.put((c.KIT/name).read_bytes(),name=parent+'/tools/'+name)
    paths={'/seed/fixture':f.store.path(f.seeds['/seed/fixture']['path']),'/seed/npm-cache':f.store.path(f.seeds['/seed/npm-cache']['path']),
        '/seed/tools':f.store.path(parent+'/tools'),'/out':f.store.path(parent+'/output')}
    raw=f.native_docker('build0');raw['Name']='/micro-artifact-'+owner;raw['Id']=identifier
    raw['Args']=['/seed/tools/fixture_check_job.py'];raw['Config'].update(Cmd=raw['Args'],WorkingDir='/work',Labels={'micro.artifact.owner':owner})
    raw['HostConfig'].update(Memory=6*1024**3,MemorySwap=6*1024**3,Tmpfs=c.TMPFS,LogConfig={'Type':'none','Config':{}},Ulimits=[{'Name':n,'Soft':v,'Hard':v} for n,v in [('fsize',c.FILE_LIMIT),('nofile',256),('core',0)]])
    from datetime import datetime,timezone
    raw['State'].update(StartedAt=datetime.fromtimestamp(f.now-4,timezone.utc).isoformat(),FinishedAt=datetime.fromtimestamp(f.now-1.5,timezone.utc).isoformat())
    raw['Mounts']=[{'Destination':n,'Source':str(path),'RW':n=='/out','Type':'bind'} for n,path in paths.items()]
    before=copy.deepcopy(raw);before['State'].update(Status='created',StartedAt='0001-01-01T00:00:00Z',FinishedAt='0001-01-01T00:00:00Z')
    worker_ref=f.put(worker,name=parent+'/output/fixture-checks/worker.json')
    f.put(results,name=parent+'/output/fixture-checks/results.json')
    for n,data in logs.items():f.put(data,name=parent+'/output/fixture-checks/'+n+'.log')
    commands=[]
    args={'create':c.create_argv(owner,paths), 'inspect-before':['docker','inspect',identifier], 'execution':['docker','start','--attach',identifier],
      'inspect-after':['docker','inspect',identifier],'cleanup-owner':['docker','inspect',identifier], 'cleanup-remove':['docker','rm','--force',identifier],
      'cleanup-absent':['docker','inspect',identifier], 'cleanup-list':['docker','ps','--all','--quiet','--no-trunc','--filter','name=^/micro-artifact-'+owner+'$','--filter','label=micro.artifact.owner='+owner]}
    for label,argv in args.items():
        data=a.canonical([before if label=='inspect-before' else raw]) if label in ('inspect-before','inspect-after','cleanup-owner') else (('Error: No such object: '+identifier+'\n').encode() if label=='cleanup-absent' else identifier.encode()+b'\n' if label in ('create','cleanup-remove') else b'' if label=='cleanup-list' else b'FAKE attach log')
        ref=f.put(data,name=parent+'/'+label+'.log')
        commands.append({'label':label,'argv':argv,'exitCode':1 if label=='cleanup-absent' else 0,'seconds':.01,'capturedBytes':ref.bytes,'sha256':ref.sha256,'limitFailure':None,'error':None,'clientCleanupFailures':[]})
    receipt={'schema':'micro.android.fixture-check-supervisor/1','context':f.binding.context(),'owner':owner,'containerId':identifier,
      'startedAt':f.now-5,'finishedAt':f.now-1,'status':'checks-completed','authority':c.authority(),'suite':f.binding.identities['suite'].json(),
      'sourceExport':f.source_export.json(),'npmManifest':f.check_npm_manifest.json(),'npmCache':f.seeds['/seed/npm-cache'],'commands':commands,
      'runtimeBefore':before,'runtimeAfter':raw,'cleanup':{'absent':True},'failure':None,'worker':worker_ref.json()}
    return f.put(receipt,name=parent+'/receipt.json')


class ChecksTests(unittest.TestCase):
    def setUp(self):
        from test_android_pipeline import SyntheticFixture
        import tempfile
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.f=SyntheticFixture(self.tmp.name);self.f.store.path('runs/test').mkdir(parents=True)
        self.job=p.JobContext(self.f.binding,self.f.store,'FAKE-test','runs/test',p.Stage.CHECKS,(),None)
        self.ref=fake_receipt(self.f,self.job)
        self.fake_scope=self.f.checks_test_scope()
        self.fake_scope.__enter__()
        self.addCleanup(self.fake_scope.__exit__,None,None,None)
    def test_complete_fake_raw_proof_derives_exact_checks_without_real_execution(self):
        details=c.validate_observed_checks(self.job,self.ref,self.f.now)
        self.assertEqual(details['mandatoryCases'],{'lint':1,'types':1,'domain':3,'storage':6})
        self.assertEqual(details['rawReceipt'],self.ref.json())
    def mutate(self,change):
        raw=self.f.store.json(self.ref);change(raw)
        path=self.f.store.path(self.ref.path);path.chmod(0o600);path.write_bytes(a.canonical(raw)+b'\n')
        return self.f.store.describe(self.ref.path)
    def test_missing_tampered_worker_result_log_or_tool_refuses(self):
        for name in ('tools/fixture_checks.mjs','output/fixture-checks/lint.log','output/fixture-checks/results.json','output/fixture-checks/worker.json'):
            path=self.f.store.path(str(Path(self.ref.path).parent/name));prior=path.read_bytes();path.chmod(0o600);path.write_bytes(b'FAKE tampered')
            with self.subTest(name=name),self.assertRaises((a.Rejected,ValueError)):c.validate_observed_checks(self.job,self.ref,self.f.now)
            path.write_bytes(prior)
    def test_wrong_actual_command_id_env_mount_resource_or_cleanup_refuses(self):
        original=self.f.store.read(self.ref)
        changes=[lambda r:r['commands'][0].update(argv=['docker','create','FAKE-no-policy']),lambda r:r['commands'][2].update(argv=['true']),lambda r:r['runtimeAfter'].update(Id='b'*64),
          lambda r:r['runtimeAfter']['Config'].update(Cmd=['/bin/true']),lambda r:r['runtimeAfter']['Config']['Env'].append('EXPO_OFFLINE=0'),
          lambda r:r['runtimeAfter']['Mounts'][0].update(Source='/oldapp'),lambda r:r['runtimeAfter']['HostConfig'].update(NetworkMode='bridge'),
          lambda r:r.update(cleanup={'absent':None}),lambda r:r.update(finishedAt=self.f.now-4000)]
        for change in changes:
            with self.assertRaises((a.Rejected,ValueError)):c.validate_observed_checks(self.job,self.mutate(change),self.f.now)
            self.f.store.path(self.ref.path).write_bytes(original)
    def test_false_worker_command_or_named_case_cannot_pass_even_rehashed(self):
        original=self.f.store.read(self.ref);raw=self.f.store.json(self.ref);worker_ref=a.Evidence.parse(raw['worker']);worker=self.f.store.json(worker_ref)
        for change in (lambda w:w['commands'][0].update(argv=['true']),lambda w:w['commands'][1].update(exitCode=1),lambda w:w.update(mandatoryCases={'lint':1,'types':1,'domain':3,'storage':5}),lambda w:w.update(sourceSha256='f'*64)):
            changed=copy.deepcopy(worker);change(changed)
            target=self.f.store.path(worker_ref.path);target.chmod(0o600);target.write_bytes(a.canonical(changed)+b'\n');new=self.f.store.describe(worker_ref.path)
            # Rebind mutated actual owned output, so command/source gates must reject.
            with self.assertRaises(a.Rejected):c.validate_observed_checks(self.job,self.mutate(lambda r:r.update(worker=new.json())),self.f.now)
            self.f.store.path(self.ref.path).write_bytes(original)
    def test_real_launch_guard_rejects_fake_profile_before_Docker(self):
        raw=self.f.store.json(self.ref);policy=c.CheckPolicy(self.f.binding.identities['suite'],tuple((n,hashlib.sha256((c.KIT/n).read_bytes()).hexdigest(),(c.KIT/n).stat().st_size) for n in c.TOOLS),raw['npmCache'],a.Evidence.parse(raw['npmManifest']))
        with patch.object(c,'SOURCE_SHA',c.inputs.SOURCE_SHA),patch.object(c.subprocess,'Popen') as process:
            with self.assertRaisesRegex(a.Rejected,'Exact real'):c.FixtureCheckSupervisor(self.f.store,self.f.binding,policy)
            process.assert_not_called()

    def test_replay_fixed_source_and_store_guards_reject_unaccepted_profiles(self):
        # The same complete FAKE proof cannot pass the actual immutable source
        # policy merely because its own administrative Binding is consistent.
        with patch.object(c,'SOURCE_SHA',c.inputs.SOURCE_SHA):
            with self.assertRaisesRegex(a.Rejected,'Exact real'):
                c.validate_observed_checks(self.job,self.ref,self.f.now)
        with patch.object(c.pipeline,'CONTROLLER_ROOT',self.f.store.root/'foreign'):
            with self.assertRaisesRegex(a.Rejected,'dedicated fixed'):
                c.validate_observed_checks(self.job,self.ref,self.f.now)
    def test_wrong_stage_or_binding_and_large_raw_bounds_refuse(self):
        wrong=p.JobContext(self.f.binding,self.f.store,'FAKE-test','runs/test',p.Stage.DEVICE,(),None)
        with self.assertRaises(a.Rejected):c.validate_observed_checks(wrong,self.ref,self.f.now)
        raw=self.f.store.json(self.ref);raw['context']['sourceSha']='f'*40
        with self.assertRaises(a.Rejected):c.validate_observed_checks(self.job,self.mutate(lambda r:r.update(context=raw['context'])),self.f.now)
        huge=self.f.put(b'x'*(2*1024**2+1))
        with self.assertRaises(a.Rejected):c.validate_observed_checks(self.job,huge,self.f.now)

    def test_actual_runtime_guards_without_inspection_hash_shortcut(self):
        receipt=self.f.store.json(self.ref);raw=receipt['runtimeAfter'];owner=receipt['owner'];parent=Path(self.ref.path).parent
        paths={'/seed/fixture':self.f.store.path(self.f.seeds['/seed/fixture']['path']),'/seed/npm-cache':self.f.store.path(self.f.seeds['/seed/npm-cache']['path']),
               '/seed/tools':self.f.store.path((parent/'tools').as_posix()),'/out':self.f.store.path((parent/'output').as_posix())}
        c.runtime(raw,receipt['containerId'],owner,paths)
        for change in (lambda r:r['Config'].update(Entrypoint=['/bin/true']),lambda r:r['Config']['Env'].append('PATH=/bin'),
                       lambda r:r['HostConfig'].update(Memory=8*1024**3),lambda r:r['HostConfig']['Tmpfs'].update({'/tmp':'size=1000g'}),
                       lambda r:r['Mounts'][0].update(RW=True),lambda r:r['Config']['Labels'].update({'micro.artifact.owner':'other'})):
            altered=copy.deepcopy(raw);change(altered)
            with self.assertRaises(a.Rejected):c.runtime(altered,receipt['containerId'],owner,paths)

    def test_independent_named_cases_failed_duplicate_missing_and_false_stdout(self):
        raw=self.f.store.json(self.ref);worker=self.f.store.json(a.Evidence.parse(raw['worker']));parent=Path(self.ref.path).parent/'output/fixture-checks'
        results=self.f.store.json(self.f.store.describe((parent/'results.json').as_posix()))
        original_logs={n:self.f.store.read(self.f.store.describe((parent/(n+'.log')).as_posix())) for n in c.COMMANDS}
        for change in (lambda r:r['results'][0].update(passed=False),lambda r:r['results'].__setitem__(0,r['results'][1]),
                       lambda r:r['results'].pop(),lambda r:r['results'][0].update(name='FAKE-unrecognized-case')):
            altered=copy.deepcopy(results);change(altered);logs=copy.deepcopy(original_logs);updated_worker=copy.deepcopy(worker)
            # Corroborating stdout and its digest are rebound, so the independent
            # named-case predicate must reject the altered observations.
            logs['domain-storage']=a.canonical({**altered,'passed':True,'mandatoryCases':{'domain':3,'storage':6}})+b'\n'
            updated_worker['commands'][-1].update(sha256=hashlib.sha256(logs['domain-storage']).hexdigest(),bytes=len(logs['domain-storage']))
            with self.assertRaises(a.Rejected):c.derive_checks(updated_worker,altered,logs,component_sha256=worker['sourceSha256'])
        logs=copy.deepcopy(original_logs);logs['domain-storage']=b'{"passed":true}\n';updated_worker=copy.deepcopy(worker)
        updated_worker['commands'][-1].update(sha256=hashlib.sha256(logs['domain-storage']).hexdigest(),bytes=len(logs['domain-storage']))
        with self.assertRaises(a.Rejected):c.derive_checks(updated_worker,results,logs,component_sha256=worker['sourceSha256'])

    def test_host_launch_error_is_bounded_logged_and_never_claims_exit_zero(self):
        supervisor=c.FixtureCheckSupervisor.__new__(c.FixtureCheckSupervisor)
        supervisor.root=self.f.store.path('mock-command-failure');supervisor.root.mkdir();supervisor.started=c.time.monotonic();supervisor.receipt={'commands':[]}
        with patch.object(c.subprocess,'Popen',side_effect=OSError('FAKE refused process')) as process:
            with self.assertRaises(OSError):supervisor.command(['docker','inspect','FAKE'],'probe')
            process.assert_called_once()
        row=supervisor.receipt['commands'][0]
        self.assertIsNone(row['exitCode']);self.assertIn('FAKE refused process',row['error']);self.assertEqual(row['capturedBytes'],0)
        self.assertEqual((supervisor.root/'probe.log').read_bytes(),b'')

    def test_first_failure_is_retained_when_separate_cleanup_fails(self):
        supervisor=c.FixtureCheckSupervisor.__new__(c.FixtureCheckSupervisor)
        supervisor.store=self.f.store;supervisor.root=self.f.store.path('mock-first-failure');supervisor.root.mkdir()
        supervisor.relative='mock-first-failure';supervisor.identifier='a'*64;supervisor.owner='b'*32;supervisor.attempted=True
        supervisor.receipt={'status':'started','failure':None,'cleanup':{'absent':None}}
        actual_budget=supervisor.store.budget
        calls=0
        def budget():
            nonlocal calls
            calls+=1
            if calls==1:raise a.Rejected('FAKE first headroom failure')
            return actual_budget()
        with (patch.object(supervisor.store,'budget',side_effect=budget),
             patch.object(c,'cleanup_owned',side_effect=a.Rejected('FAKE separate cleanup failure')),
             patch.object(c.subprocess,'Popen') as process):
            ref=supervisor.run();process.assert_not_called()
        raw=self.f.store.json(ref)
        self.assertEqual(raw['failure']['reason'],'FAKE first headroom failure')
        self.assertEqual(raw['cleanupFailure']['reason'],'FAKE separate cleanup failure')
        self.assertIsNone(raw['cleanup']['absent']);self.assertEqual(raw['status'],'first-check-failure-retained')

    def test_actual_failed_signals_never_normalize_as_passed(self):
        raw=self.f.store.json(self.ref)
        policy=c.CheckPolicy(self.f.binding.identities['suite'],tuple((n,hashlib.sha256((c.KIT/n).read_bytes()).hexdigest(),(c.KIT/n).stat().st_size) for n in c.TOOLS),raw['npmCache'],a.Evidence.parse(raw['npmManifest']))
        ref=self.mutate(lambda r:(r.update(status='first-check-failure-retained',failure={'type':'FAKE','reason':'retained first failure'}),
            r['commands'][2].update(exitCode=-9,limitFailure='wall-time'),r['runtimeAfter']['State'].update(OOMKilled=True)))
        report=c.validate_run(self.job,policy,ref,self.f.now)
        self.assertEqual(report['status'],'failed');self.assertTrue(report['timeout']);self.assertTrue(report['oom']);self.assertEqual(report['signal'],9)
        self.assertEqual(self.f.store.json(ref)['failure']['reason'],'retained first failure')

if __name__=='__main__':unittest.main()
