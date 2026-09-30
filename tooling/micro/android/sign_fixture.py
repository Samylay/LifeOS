#!/usr/bin/env python3
"""Controller-only bounded signing of the exact protected synthetic fixture."""
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import shutil
from uuid import uuid4

from artifact_supervisor import admit_apk, bounded, cleanup_owned, digest, require_command

IMAGE = 'sha256:43778b0b9227ffc8d12a9092f011f09238a77c92b5fcde6a18310757ccef7305'
STATE = Path('/home/quorky/apps/lifeos/.scratch/software-factory-benchmark/run-20260930/controller/native-signing')
PUBLIC_KEY = Path('/home/quorky/apps/lifeos/.scratch/software-factory-benchmark/run-20260930/controller/native-acquisition/public-benchmark-signing-input/debug.keystore')
KEY_SHA256 = '221e0a3106aa4c3ccc154e0a418b55020b3f9ea6e84f92e8749cd9e2f39f5e58'


def policy(observed, identifier, owner, paths):
    h=observed['HostConfig']; c=observed['Config']
    checks={'identity':observed['Id']==identifier and observed['Name']=='/micro-artifact-'+owner and observed['Image']==IMAGE
                       and c.get('Labels',{}).get('micro.artifact.owner')==owner,
            'user':c['User']=='1000:1000', 'networkNone':h['NetworkMode']=='none',
            'readOnly':h['ReadonlyRootfs'] is True and not h['Privileged'],
            'bounds':h['Memory']==h['MemorySwap']==1073741824 and h['NanoCpus']==1000000000 and h['PidsLimit']==128,
            'caps':h['CapDrop']==['ALL'] and 'no-new-privileges' in h['SecurityOpt'],
            'noExposure':not h['Devices'] and not h['PortBindings'] and not h['ExtraHosts'],
            'logNone':h['LogConfig']['Type']=='none',
            'tmpfs':h['Tmpfs']=={'/tmp':'rw,nosuid,nodev,noexec,size=67108864,mode=1777'},
            'entrypoint':c['Entrypoint']==['python3'] and c['Cmd']==['/tools/sign_fixture_worker.py'],
            'env':all(v.split('=',1)[0] in {'PATH','NODE_VERSION','YARN_VERSION','JAVA_HOME','ANDROID_HOME','ANDROID_SDK_ROOT','EXPO_OFFLINE','EXPO_NO_TELEMETRY','HOME','JAVA_TOOL_OPTIONS'} for v in c['Env'])}
    mounts=observed['Mounts']
    checks['mounts']=len(mounts)==4 and {(m['Destination'],m['Source'],m['RW'],m['Type']) for m in mounts}=={
        (destination,str(source),destination=='/output','bind') for destination,source in paths.items()}
    if not all(checks.values()): raise ValueError('Fixture signer runtime differs from policy: '+str(checks))
    return checks


def sign(unsigned, expected_sha256, label):
    if not re.fullmatch(r'[a-z0-9-]{1,64}',label) or not re.fullmatch(r'[0-9a-f]{64}',expected_sha256):
        raise ValueError('Exact admitted unsigned identity and owned label required')
    STATE.mkdir(mode=0o700,exist_ok=True)
    if STATE.is_symlink() or STATE.stat().st_mode & 0o022: raise ValueError('Unprotected signing state')
    output=STATE/label;output.mkdir(mode=0o700,exist_ok=False)
    owner=uuid4().hex;name='micro-artifact-'+owner;identifier=None;attempted=False;error=None
    receipt={'schema':'micro.fixture-signing-supervisor/1','owner':owner,'image':IMAGE,
             'supervisorSha256':digest(Path(__file__)),'startedAt':datetime.now(timezone.utc).isoformat(),
             'commands':[],'status':'started','cleanup':None,'scope':'public fixture test signing only'}
    def command(argv,label,seconds=30):
        result=bounded(argv,output/(label+'.log'),seconds);receipt['commands'].append(result);return result
    try:
        copied=output/'unsigned.apk';sha,size=admit_apk(Path(unsigned),copied)
        if sha!=expected_sha256: raise ValueError('Unsigned APK identity changed')
        key=output/'debug.keystore'
        if PUBLIC_KEY.is_symlink() or PUBLIC_KEY.stat().st_size!=2257 or digest(PUBLIC_KEY)!=KEY_SHA256:
            raise ValueError('Public signing input identity changed')
        shutil.copyfile(PUBLIC_KEY,key);key.chmod(0o444)
        tools=output/'tools';tools.mkdir();here=Path(__file__).parent
        for file in ('sign_fixture_worker.py','inspect_apk.py'):
            shutil.copyfile(here/file,tools/file);(tools/file).chmod(0o444)
        artifacts=output/'artifacts';artifacts.mkdir()
        receipt['inputs']={'unsignedApkSha256':sha,'unsignedApkBytes':size,'publicKeySha256':digest(key),
                           'workerSha256':digest(tools/'sign_fixture_worker.py'),'inspectorSha256':digest(tools/'inspect_apk.py'),
                           'commandHelperSha256':digest(here/'artifact_supervisor.py')}
        paths={'/input/app.apk':copied,'/input/debug.keystore':key,'/tools':tools,'/output':artifacts}
        argv=['docker','create','--pull=never','--name',name,'--label','micro.artifact.owner='+owner,
              '--network=none','--read-only','--user=1000:1000','--cap-drop=ALL','--security-opt=no-new-privileges',
              '--memory=1g','--memory-swap=1g','--cpus=1','--pids-limit=128','--log-driver=none',
              '--ulimit=fsize=536870912:536870912','--ulimit=nofile=256:256','--ulimit=core=0:0',
              '--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=67108864,mode=1777','--env=HOME=/tmp',
              '--env=JAVA_TOOL_OPTIONS=-Djava.io.tmpdir=/tmp -Duser.home=/tmp',
              '--workdir=/tmp','--entrypoint=python3']
        for destination,source in paths.items():
            argv+=['--mount=type=bind,src='+str(source)+',dst='+destination+('' if destination=='/output' else ',readonly')]
        attempted=True;created=command(argv+[IMAGE,'/tools/sign_fixture_worker.py'],'create');require_command(created)
        created_id=(output/'create.log').read_text().strip()
        if not re.fullmatch(r'[0-9a-f]{64}',created_id): raise ValueError('Invalid signer container identity')
        identifier=created_id
        before=command(['docker','inspect',identifier],'inspect-before');require_command(before)
        receipt['runtimePolicy']=policy(json.loads((output/'inspect-before.log').read_text())[0],identifier,owner,paths)
        execution=command(['docker','start','--attach',identifier],'signing',120)
        after=command(['docker','inspect',identifier],'inspect-after');require_command(after)
        observed=json.loads((output/'inspect-after.log').read_text())[0];policy(observed,identifier,owner,paths)
        receipt['state']=observed['State'];require_command(execution)
        if observed['State']['Running'] or observed['State']['OOMKilled'] or observed['State']['ExitCode']:
            raise ValueError('Fixture signer runtime failed')
        values=[json.loads(line) for line in (output/'signing.log').read_text().splitlines() if line.startswith('{')]
        if len(values)!=1 or values[0].get('status')!='signed' or values[0].get('unsignedApkSha256')!=sha:
            raise ValueError('Fixture signing result unavailable')
        signed=artifacts/'app.apk';inspection=values[0]['inspection']
        if digest(signed)!=inspection['apkSha256'] or signed.stat().st_size!=inspection['apkBytes'] or digest(copied)!=sha:
            raise ValueError('Signed or unsigned fixture bytes changed')
        receipt['worker']=values[0];receipt['status']='signed'
    except Exception as problem:
        error=problem;receipt['status']='failed';receipt['failure']={'type':type(problem).__name__,'message':str(problem)[:1200]}
    finally:
        try:receipt['cleanup']=cleanup_owned(command,output,identifier,IMAGE,owner) if attempted else {'absent':True}
        except Exception as problem:
            receipt['cleanup']={'absent':False,'error':str(problem)[:1200]}
            if error is None:error=problem;receipt['status']='failed'
        receipt['finishedAt']=datetime.now(timezone.utc).isoformat()
        (output/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    if error:raise error
    return receipt
