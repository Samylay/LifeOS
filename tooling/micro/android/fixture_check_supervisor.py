#!/usr/bin/env python3
"""Fixed fixture checks and real-log Stage.CHECKS adapter, no command CLI.

Administrative CheckPolicy is constructed outside products. Import is inert.
Actual execution requires independently reviewed source and protected inputs.
"""
from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import re
import selectors
import subprocess
import time
from uuid import uuid4
try:
    from . import admission as a, pipeline, fixture_integration as inputs
    from .artifact_supervisor import cleanup_owned
except ImportError:
    import admission as a
    import pipeline
    import fixture_integration as inputs
    from artifact_supervisor import cleanup_owned

KIT=Path(__file__).resolve().parent
TOOLS=('fixture_check_job.py','fixture_checks.mjs','fixture-eslint.config.mjs')
SOURCE_SHA=inputs.SOURCE_SHA
COMPONENT_SHA='c204a2fb3737a5d7d84c8296c68a96fa51f8267cd283f129f7f03d4d676b25ff'
TREE_SHA='4816f6e098bf9bc5a30ea3fc6f4ba8cc2e747a70d0736a308f78eb05be7b9841'
COMMANDS={
 'setup':['npm','ci','--offline','--ignore-scripts','--no-audit','--no-fund'],
 'lint':['node','./node_modules/eslint/bin/eslint.js','--no-config-lookup','--config','/seed/tools/fixture-eslint.config.mjs','--no-cache','app'],
 'types':['node','./node_modules/typescript/bin/tsc','--noEmit','-p','.'],
 'domain-storage':['node','/seed/tools/fixture_checks.mjs']}
CASES={'storage':{'empty-store-initializes-identities','durable-reopen-preserves-values',
 'failed-write-rolls-back-and-remains-retryable','incompatible-store-preserved',
 'invalid-record-identities-preserved','initialization-failure-explicit-retry'},
 'domain':{'independent-counters-and-sentinel','unsafe-counter-rejected-without-write','pending-write-suppresses-duplicate-action'}}
TMPFS={'/tmp':'rw,nosuid,nodev,noexec,size=67108864,mode=1777',
       '/work':'rw,nosuid,nodev,exec,size=8589934592,uid=1000,gid=1000,mode=0700'}
LOG_LIMIT=1024**2
FILE_LIMIT=256*1024**2
TOTAL_DIAGNOSTICS=20*1024**2


def create_argv(owner,paths):
    """One fixed administrative create recipe, shared by execution and replay."""
    argv=['docker','create','--pull=never','--name=micro-artifact-'+owner,'--label=micro.artifact.owner='+owner,
        '--network=none','--read-only','--user=1000:1000','--cap-drop=ALL','--security-opt=no-new-privileges',
        '--memory=6g','--memory-swap=6g','--cpus=2','--pids-limit=384','--log-driver=none','--workdir=/work',
        '--ulimit=fsize=268435456:268435456','--ulimit=nofile=256:256','--ulimit=core=0:0']
    argv+=['--tmpfs='+path+':'+options for path,options in TMPFS.items()]
    for destination,source in paths.items():
        argv+=['--mount=type=bind,src='+str(source)+',dst='+destination+('' if destination=='/out' else ',readonly')]
    return argv+['--entrypoint=python3',a.IMAGE,'/seed/tools/fixture_check_job.py']

@dataclass(frozen=True)
class CheckPolicy:
    """Operator authority only, never deserialized from product JSON."""
    suite: a.Evidence
    tools: tuple[tuple[str,str,int],...]
    npm_cache: dict
    npm_manifest: a.Evidence


def authority():
    return {name:hashlib.sha256((KIT/name).read_bytes()).hexdigest() for name in
      (*TOOLS,'fixture_check_supervisor.py','artifact_supervisor.py','fixture_integration.py','admission.py','pipeline.py')}


def validate_subject(store,binding,policy):
    """Replay authority is the independently admitted binding, not candidate JSON."""
    if not isinstance(policy,CheckPolicy) or policy.suite!=binding.identities['suite']:
        raise a.Rejected('Exact administrative check suite policy required')
    store.verify(policy.suite)
    if binding.package!='app.micro.factory.fixture':raise a.Rejected('Fixed fixture package only')
    export_ref,export=a.source_export(binding,store)
    store.verify(binding.identities['sourceArchive'],100*1024**2)
    components=[r for r in export['tree']['files'] if r['path']=='app/index.tsx']
    if len(components)!=1:raise a.Rejected('Admitted fixture component missing')
    npm_ref=binding.identities['npmSeal'];store.verify(npm_ref);npm=store.json(npm_ref)
    if (npm.get('sourceLockSha256')!=binding.identities['sourceLock'].sha256 or npm.get('image')!=a.IMAGE
        or npm.get('status')!='sealed-npm-and-native-template-only'):
        raise a.Rejected('Binding source lock/sealed npm identity differs')
    a.validate_tree(policy.npm_cache,store)
    if sum(r['bytes'] for r in policy.npm_cache['files'])>1024**3:raise a.Rejected('npm cache exceeds fixed1GiB input bound')
    inputs.bind_sealed_cache(policy.npm_cache,store.json(policy.npm_manifest,64*1024**2),npm['components']['npm-cache'])
    expected=tuple((n,hashlib.sha256((KIT/n).read_bytes()).hexdigest(),(KIT/n).stat().st_size) for n in TOOLS)
    if policy.tools!=expected:raise a.Rejected('Protected checker tool identities differ from reviewed controller')
    return export_ref,export


def validate_inputs(store,binding,policy):
    """Launching additionally requires the exact real calibration fixture pins."""
    if store.root!=pipeline.CONTROLLER_ROOT or store.root.stat().st_mode & 0o077:
        raise a.Rejected('Checks require dedicated fixed owned700 Store')
    export_ref,export=validate_subject(store,binding,policy)
    if (binding.source_sha!=SOURCE_SHA or export['tree']['manifestSha256']!=TREE_SHA
        or binding.identities['sourceLock'].sha256!=inputs.LOCK_SHA or binding.identities['sourceLock'].bytes!=inputs.LOCK_BYTES
        or binding.identities['npmSeal'].sha256!=inputs.NPM_SEAL_SHA
        or not any(r['path']=='app/index.tsx' and r['sha256']==COMPONENT_SHA for r in export['tree']['files'])):
        raise a.Rejected('Exact real source8cf/component/full tree/lock/npmb636 required before launch')
    return export_ref,export


def identity(raw,identifier,owner):
    if (not re.fullmatch('[0-9a-f]{64}',identifier or '') or raw.get('Id')!=identifier
        or raw.get('Name')!='/micro-artifact-'+owner or raw.get('Image')!=a.IMAGE
        or raw.get('Config',{}).get('Labels',{}).get('micro.artifact.owner')!=owner):
        raise a.Rejected('Exact checks container ID/name/image/owner changed')


def runtime(raw,identifier,owner,paths):
    identity(raw,identifier,owner);h=raw['HostConfig'];c=raw['Config']
    expected={(dest,str(path),dest=='/out','bind') for dest,path in paths.items()}
    if (c['User']!='1000:1000' or c['Entrypoint']!=['python3'] or c['Cmd']!=['/seed/tools/fixture_check_job.py']
        or raw['Path']!='python3' or raw['Args']!=['/seed/tools/fixture_check_job.py']
        or c['Env']!=inputs.ENVIRONMENT or c['WorkingDir']!='/work'
        or h['NetworkMode']!='none' or h['ReadonlyRootfs'] is not True or h['Privileged'] is not False
        or h['CapDrop']!=['ALL'] or h['SecurityOpt']!=['no-new-privileges']
        or h['Memory']!=6*1024**3 or h['MemorySwap']!=6*1024**3 or h['NanoCpus']!=2_000_000_000 or h['PidsLimit']!=384
        or h['LogConfig']!={'Type':'none','Config':{}} or h['Tmpfs']!=TMPFS
        or h['Devices'] or h['PortBindings'] or h['ExtraHosts'] or h.get('CapAdd') or h.get('GroupAdd')
        or h.get('PidMode') not in (None,'') or h.get('IpcMode') not in (None,'private')
        or len(h['Ulimits'])!=3 or {(u['Name'],u['Soft'],u['Hard']) for u in h['Ulimits']}!={('fsize',FILE_LIMIT,FILE_LIMIT),('nofile',256,256),('core',0,0)}
        or len(raw['Mounts'])!=4 or {(m['Destination'],m['Source'],m['RW'],m['Type']) for m in raw['Mounts']}!=expected):
        raise a.Rejected('Actual checks runtime/command/environment/mounts differs from fixed policy')


def derive_checks(worker,results,logs, *, component_sha256=COMPONENT_SHA):
    """Raw command/log/case observations, no normalized passed flag input."""
    a.exact(worker,{'schema','startedAt','finishedAt','commands','mandatoryCases','sourceSha256','status'},'checks worker')
    if worker['schema']!='micro.fixture-offline-check-worker/1' or worker['status']!='protected-offline-fixture-checks-passed' or worker['sourceSha256']!=component_sha256:
        raise a.Rejected('Actual fixture checks worker/source unavailable')
    a.number(worker['startedAt'],'worker start');a.number(worker['finishedAt'],'worker finish')
    if not 0<=worker['finishedAt']-worker['startedAt']<=550:raise a.Rejected('Checks worker time bound')
    if not isinstance(worker['commands'],list) or len(worker['commands'])!=4 or set(logs)!=set(COMMANDS):
        raise a.Rejected('Four complete worker commands/logs required')
    for row,(name,argv) in zip(worker['commands'],COMMANDS.items()):
        a.exact(row,{'check','argv','exitCode','seconds','sha256','bytes'},'actual check command')
        data=logs[name]
        if (row['check']!=name or row['argv']!=argv or type(row['exitCode']) is not int or row['exitCode']!=0
            or not isinstance(data,bytes) or len(data)>LOG_LIMIT or type(row['bytes']) is not int
            or row['bytes']!=len(data) or row['sha256']!=hashlib.sha256(data).hexdigest()):
            raise a.Rejected('Actual check argv/exit/log identity differs')
        if not 0<=a.number(row['seconds'],'check seconds')<=45:raise a.Rejected('Check command time bound')
    a.exact(results,{'schema','sourceSha256','results'},'domain/storage actual results')
    if results['schema']!='micro.fixture-checks/1' or results['sourceSha256']!=component_sha256:
        raise a.Rejected('Checks results source differs')
    seen={group:set() for group in CASES}
    if not isinstance(results['results'],list) or len(results['results'])!=9:raise a.Rejected('Nine named cases required')
    for row in results['results']:
        a.exact(row,{'group','name','passed','seconds'},'actual domain/storage case')
        group=row['group'];name=row['name']
        if group not in CASES or name not in CASES[group] or name in seen[group] or row['passed'] is not True:
            raise a.Rejected('Missing/duplicate/failed named domain/storage case')
        a.number(row['seconds'],'case seconds');seen[group].add(name)
    if seen!=CASES or worker['mandatoryCases']!={'lint':1,'types':1,'domain':3,'storage':6}:
        raise a.Rejected('Actual mandatory cases incomplete')
    summaries=[a.decode(line) for line in logs['domain-storage'].splitlines() if line.startswith(b'{')]
    if summaries!=[{**results,'passed':True,'mandatoryCases':{'domain':3,'storage':6}}]:
        raise a.Rejected('Domain/storage stdout does not corroborate retained results')
    return {'lint':1,'types':1,'domain':3,'storage':6}


class FixtureCheckSupervisor:
    def __init__(self,store,binding,policy):
        self.store,self.binding,self.policy=store,binding,policy
        self.export_ref,self.export=validate_inputs(store,binding,policy)
        self.owner=uuid4().hex;self.identifier=None;self.attempted=False
        self.relative='fixture-check-jobs/'+self.owner
        self.root=store.path(self.relative);self.root.mkdir(mode=0o700,parents=True,exist_ok=False)
        self.output=self.root/'output';self.output.mkdir(mode=0o700)
        self.tools=self.root/'tools';self.tools.mkdir(mode=0o700)
        self.paths={'/seed/fixture':store.path(self.export['tree']['path']),
                    '/seed/npm-cache':store.path(policy.npm_cache['path']),'/seed/tools':self.tools,'/out':self.output}
        self.pins=authority();self.started=time.monotonic()
        self.receipt={'schema':'micro.android.fixture-check-supervisor/1','context':binding.context(),
          'owner':self.owner,'containerId':None,'startedAt':time.time(),'finishedAt':None,'status':'started',
          'authority':self.pins,'suite':policy.suite.json(),'sourceExport':self.export_ref.json(),
          'npmManifest':policy.npm_manifest.json(),'npmCache':policy.npm_cache,'commands':[],
          'runtimeBefore':None,'runtimeAfter':None,'cleanup':{'absent':None},'failure':None,'worker':None}

    def command(self,argv,label,seconds=30):
        """Only this controller supplies argv. Bound/log every returned command."""
        path=self.root/(label+'.log');begin=time.monotonic();process=None;selector=None;error=None;data=bytearray();limit=None
        cleanup=[]
        try:
            remaining=600-(begin-self.started)
            if not label.startswith('cleanup'):remaining=min(remaining,450-(begin-self.started))
            if remaining<=0:raise a.Rejected('Checks supervisor outer deadline')
            seconds=min(seconds,remaining)
            process=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
                      env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'},start_new_session=True)
            os.set_blocking(process.stdout.fileno(),False)
            selector=selectors.DefaultSelector();selector.register(process.stdout,selectors.EVENT_READ)
            while selector.get_map() or process.poll() is None:
                if time.monotonic()-begin>seconds:limit='wall-time';raise a.Rejected('Checks command deadline')
                for key,_ in selector.select(.1):
                    chunk=os.read(key.fileobj.fileno(),65536)
                    if not chunk:selector.unregister(key.fileobj);continue
                    admitted=chunk[:max(0,LOG_LIMIT-len(data))];data.extend(admitted)
                    if len(chunk)>len(admitted):limit='log-bytes';raise a.Rejected('Checks command log bound')
            if process.returncode is None:process.wait(timeout=3)
        except Exception as caught:error=caught
        finally:
            for callback in ([selector.close] if selector else [])+([lambda:process.kill(),lambda:process.wait(timeout=3)] if process and process.poll() is None else [])+([process.stdout.close] if process and process.stdout else []):
                try:callback()
                except Exception as caught:cleanup.append(str(caught)[:800])
            with path.open('xb') as file:file.write(data)
            result={'argv':argv,'exitCode':process.returncode if process else None,'seconds':time.monotonic()-begin,
               'capturedBytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'limitFailure':limit,
               'error':str(error)[:800] if error else None,'clientCleanupFailures':cleanup}
            self.receipt['commands'].append(dict(label=label,**result))
        if error:raise error
        if cleanup:raise a.Rejected('Checks owned client cleanup unknown')
        return result

    def run(self):
        failure=None
        try:
            budget=self.store.budget()
            if max(budget['allocatedBytes'],budget['regularBytes'])+2*TOTAL_DIAGNOSTICS>a.STORE_BYTES or budget['freeDiskBytes']<4*1024**3:
                raise a.Rejected('Checks Store/disk headroom unavailable')
            memory=next(line for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))
            if int(memory.split()[1])*1024<9*1024**3:raise a.Rejected('Checks host memory headroom below9GiB')
            for name,sha,size in self.policy.tools:
                source=KIT/name;target=self.tools/name
                inputs._copy_file(source,target,{'sha256':sha,'bytes':size})
            self.tools.chmod(0o555)
            self.attempted=True;created=self.command(create_argv(self.owner,self.paths),'create')
            if created['exitCode']!=0:raise a.Rejected('Checks Docker create failed')
            identifier=(self.root/'create.log').read_text().strip()
            if not re.fullmatch('[0-9a-f]{64}',identifier):raise a.Rejected('Checks full container identity missing')
            self.identifier=identifier;self.receipt['containerId']=identifier
            before=self.inspect('inspect-before')
            if before['State'].get('Status')!='created' or before['State'].get('Running') is not False:
                raise a.Rejected('Checks container was not freshly created before execution')
            executed=self.command(['docker','start','--attach',identifier],'execution',500)
            after=self.inspect('inspect-after');a.state_success(after['State'])
            if executed['exitCode']!=0:raise a.Rejected('Actual checks worker command failed')
            validate_inputs(self.store,self.binding,self.policy)
            if authority()!=self.pins:raise a.Rejected('Protected checks/controller authority changed')
            if inputs.inventory(self.output,TOTAL_DIAGNOSTICS)['kind']!='directory':raise a.Rejected('Checks output unavailable')
            self.store.budget()
            worker=self.store.describe(self.relative+'/output/fixture-checks/worker.json',LOG_LIMIT)
            self.receipt['worker']=worker.json();self.receipt['status']='checks-completed'
        except Exception as error:
            failure=error;self.receipt['status']='first-check-failure-retained';self.receipt['failure']={'type':type(error).__name__,'reason':str(error)[:800]}
        finally:
            try:
                self.receipt['cleanup']=cleanup_owned(self.command,self.root,self.identifier,a.IMAGE,self.owner) if self.attempted else {'absent':True}
            except Exception as error:
                self.receipt['cleanup']={'absent':None};self.receipt['cleanupFailure']={'type':type(error).__name__,'reason':str(error)[:800]}
                if failure is None:self.receipt['failure']=self.receipt['cleanupFailure'];self.receipt['status']='first-check-failure-retained'
            self.receipt['finishedAt']=time.time()
        return self.store.write(self.relative+'/receipt.json',self.receipt)

    def inspect(self,label):
        command=self.command(['docker','inspect',self.identifier],label)
        if command['exitCode']!=0:raise a.Rejected('Checks Docker inspection failed')
        values=a.decode(b'{"observations":'+(self.root/(label+'.log')).read_bytes()+b'}')['observations']
        if not isinstance(values,list) or len(values)!=1:raise a.Rejected('One actual checks container inspection required')
        runtime(values[0],self.identifier,self.owner,self.paths)
        self.receipt['runtimeBefore' if label=='inspect-before' else 'runtimeAfter']=values[0]
        return values[0]


def validate_run(job,policy,reference,now):
    """Replay complete raw proof before deriving the four stage fields."""
    if job.stage!=pipeline.Stage.CHECKS:raise a.Rejected('Fixed Stage.CHECKS only')
    store=job.store;raw=store.json(reference);a.context(raw['context'],job.binding)
    a.exact(raw,{'schema','context','owner','containerId','startedAt','finishedAt','status','authority','suite','sourceExport','npmManifest','npmCache','commands','runtimeBefore','runtimeAfter','cleanup','failure','worker'} | ({'cleanupFailure'} if 'cleanupFailure' in raw else set()),'checks supervisor receipt')
    if raw['schema']!='micro.android.fixture-check-supervisor/1':raise a.Rejected('Unknown checks supervisor receipt')
    if raw['authority']!=authority() or raw['suite']!=policy.suite.json():raise a.Rejected('Checks authority/suite changed')
    a.freshness(raw,now,3600)
    report={'schema':'micro.android.stage-observation/1','runId':job.run_id,'stage':job.stage.value,
       'status':'failed','context':job.binding.context(),'startedAt':raw['startedAt'],'finishedAt':raw['finishedAt'],
       'exitCode':1,'signal':None,'timeout':False,'oom':False,'resourceError':None,'cleanup':raw['cleanup'],
       'artifactSha256':job.artifact_sha256,'details':{},'reason':None}
    # Stage schema has no reason field; failure diagnostics remain in raw receipt.
    report.pop('reason')
    observed_commands=raw['commands'] if isinstance(raw['commands'],list) else []
    report['timeout']=any(isinstance(row,dict) and row.get('limitFailure')=='wall-time' for row in observed_commands)
    report['oom']=isinstance(raw['runtimeAfter'],dict) and raw['runtimeAfter'].get('State',{}).get('OOMKilled') is True
    execution=next((row for row in observed_commands if isinstance(row,dict) and row.get('label')=='execution'),{})
    if type(execution.get('exitCode')) is int and execution['exitCode']<0:report['signal']=-execution['exitCode']
    try:
        export_ref,export=validate_inputs(store,job.binding,policy)
        if (raw['status']!='checks-completed' or raw['failure'] is not None or raw['cleanup']!={'absent':True}
           or raw['sourceExport']!=export_ref.json() or raw['npmManifest']!=policy.npm_manifest.json() or raw['npmCache']!=policy.npm_cache):
            raise a.Rejected('Actual checks failed/input changed/cleanup unknown')
        parent=Path(reference.path).parent
        if not re.fullmatch('[0-9a-f]{32}',raw['owner']):raise a.Rejected('Unknown checks owner')
        if parent.as_posix()!='fixture-check-jobs/'+raw['owner']:raise a.Rejected('Checks receipt path/owner differs')
        paths={'/seed/fixture':store.path(export['tree']['path']),'/seed/npm-cache':store.path(policy.npm_cache['path']),
               '/seed/tools':store.path((parent/'tools').as_posix()),'/out':store.path((parent/'output').as_posix())}
        for name,sha,size in policy.tools:
            ref=store.describe((parent/'tools'/name).as_posix());
            if (ref.sha256,ref.bytes)!=(sha,size):raise a.Rejected('Copied protected checker changed')
        if {p.name for p in paths['/seed/tools'].iterdir()}!=set(TOOLS):raise a.Rejected('Extra protected check tool')
        commands={}
        if not isinstance(raw['commands'],list):raise a.Rejected('Checks supervisor commands missing')
        for command in raw['commands']:
            a.exact(command,{'label','argv','exitCode','seconds','capturedBytes','sha256','limitFailure','error','clientCleanupFailures'},'checks supervisor command')
            if command['label'] in commands:raise a.Rejected('Duplicate checks supervisor command')
            if type(command['exitCode']) is not int or type(command['capturedBytes']) is not int or a.number(command['seconds'],'supervisor command seconds')>600:
                raise a.Rejected('Invalid checks supervisor command measurements')
            commands[command['label']]=command
            log=store.describe((parent/(command['label']+'.log')).as_posix(),LOG_LIMIT)
            if (log.sha256,log.bytes)!=(command['sha256'],command['capturedBytes']) or command['limitFailure'] is not None or command['error'] is not None or command['clientCleanupFailures']!=[]:
                raise a.Rejected('Checks supervisor log/limit failure')
        if set(commands)!={'create','inspect-before','execution','inspect-after','cleanup-owner','cleanup-remove','cleanup-absent','cleanup-list'}:
            raise a.Rejected('Complete checks runtime/execution/cleanup logs required')
        if sum(row['seconds'] for row in commands.values())>raw['finishedAt']-raw['startedAt']+1:
            raise a.Rejected('Checks command durations contradict supervisor interval')
        expected_argv={'create':create_argv(raw['owner'],paths),'inspect-before':['docker','inspect',raw['containerId']],'inspect-after':['docker','inspect',raw['containerId']],
          'execution':['docker','start','--attach',raw['containerId']], 'cleanup-owner':['docker','inspect',raw['containerId']],
          'cleanup-remove':['docker','rm','--force',raw['containerId']], 'cleanup-absent':['docker','inspect',raw['containerId']],
          'cleanup-list':['docker','ps','--all','--quiet','--no-trunc','--filter','name=^/micro-artifact-'+raw['owner']+'$',
                          '--filter','label=micro.artifact.owner='+raw['owner']]}
        if any(commands[label]['argv']!=argv for label,argv in expected_argv.items()):raise a.Rejected('Actual checks supervisor command differs')
        if store.read(store.describe((parent/'create.log').as_posix())).strip()!=raw['containerId'].encode():raise a.Rejected('Checks create ID differs')
        for label,key in [('inspect-before','runtimeBefore'),('inspect-after','runtimeAfter')]:
            values=a.decode(b'{"observations":'+store.read(store.describe((parent/(label+'.log')).as_posix(),LOG_LIMIT),LOG_LIMIT)+b'}')['observations']
            if values!=[raw[key]]:raise a.Rejected('Actual checks inspection differs')
            runtime(values[0],raw['containerId'],raw['owner'],paths)
        if raw['runtimeBefore']['State'].get('Status')!='created' or raw['runtimeBefore']['State'].get('Running') is not False:
            raise a.Rejected('Checks container was not freshly created before execution')
        a.state_success(raw['runtimeAfter']['State'])
        from datetime import datetime
        actual_start=datetime.fromisoformat(raw['runtimeAfter']['State']['StartedAt'].replace('Z','+00:00')).timestamp()
        actual_finish=datetime.fromisoformat(raw['runtimeAfter']['State']['FinishedAt'].replace('Z','+00:00')).timestamp()
        if not raw['startedAt']<=actual_start<actual_finish<=raw['finishedAt'] or raw['finishedAt']-raw['startedAt']>600:raise a.Rejected('Actual checks execution timestamps contradict supervisor')
        for label in ('create','inspect-before','execution','inspect-after','cleanup-owner','cleanup-remove','cleanup-list'):
            if commands[label]['exitCode']!=0:raise a.Rejected('Checks supervisor command failed')
        current=a.decode(b'{"observations":'+store.read(store.describe((parent/'cleanup-owner.log').as_posix()))+b'}')['observations']
        if not isinstance(current,list) or len(current)!=1:raise a.Rejected('Checks cleanup owner unavailable')
        identity(current[0],raw['containerId'],raw['owner'])
        absence=store.read(store.describe((parent/'cleanup-absent.log').as_posix()))
        if commands['cleanup-absent']['exitCode']!=1 or not re.search(rb'no such object:\s*'+raw['containerId'].encode()+rb'(?:\s|$)',absence,re.I) or store.read(store.describe((parent/'cleanup-list.log').as_posix())).strip():
            raise a.Rejected('Checks exact cleanup absence unproven')
        worker=store.json(a.Evidence.parse(raw['worker']))
        if raw['worker']['path']!=(parent/'output/fixture-checks/worker.json').as_posix():raise a.Rejected('Checks worker not actual owned output')
        results=store.json(store.describe((parent/'output/fixture-checks/results.json').as_posix(),LOG_LIMIT))
        logrefs={name:store.describe((parent/'output/fixture-checks'/(name+'.log')).as_posix(),LOG_LIMIT) for name in COMMANDS}
        component=next(r['sha256'] for r in export['tree']['files'] if r['path']=='app/index.tsx')
        counts=derive_checks(worker,results,{name:store.read(ref,LOG_LIMIT) for name,ref in logrefs.items()},component_sha256=component)
        if not actual_start<=worker['startedAt']<=worker['finishedAt']<=actual_finish:raise a.Rejected('Checks worker timestamp interval differs')
        report.update(status='passed',exitCode=0,details={'checks':{name:{'exitCode':0,'skipped':False,
           'log':logrefs[name if name in ('lint','types') else 'domain-storage'].json()} for name in counts},
           'mandatoryCases':counts,'offline':True,'recipeSha256':job.binding.identities['recipe'].sha256,'rawReceipt':reference.json()})
    except (a.Rejected,OSError,ValueError,KeyError,TypeError) as error:
        # Non-passed details carry the first replay failure and original proof.
        report['details']={'rawReceipt':reference.json(),'validationFailure':{'type':type(error).__name__,'reason':str(error)[:800]}}
    return report


def normalize(job,policy,reference):
    report=validate_run(job,policy,reference,time.time())
    result=job.store.write(job.run_directory+'/fixture-check-observation.json',report)
    return pipeline.Observation(result)


def validate_observed_checks(job,reference,now):
    # Retained raw references are data. Authority is binding plus current code.
    raw=job.store.json(reference)
    policy=CheckPolicy(job.binding.identities['suite'],tuple((n,hashlib.sha256((KIT/n).read_bytes()).hexdigest(),(KIT/n).stat().st_size) for n in TOOLS),raw['npmCache'],a.Evidence.parse(raw['npmManifest']))
    report=validate_run(job,policy,reference,now)
    if report['status']!='passed':raise a.Rejected('Checks raw replay failed: '+report['details']['validationFailure']['reason'])
    return report['details']


def run_checks(job,policy):
    """Trusted real hook, not a receipt-only caller success interface."""
    if job.stage!=pipeline.Stage.CHECKS:raise a.Rejected('Fixed Stage.CHECKS only')
    raw=FixtureCheckSupervisor(job.store,job.binding,policy).run()
    return normalize(job,policy,raw)
