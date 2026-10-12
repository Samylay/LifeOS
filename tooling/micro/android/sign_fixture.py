#!/usr/bin/env python3
"""Controller-only bounded signing of the exact protected synthetic fixture."""
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import shutil
import hashlib
from uuid import uuid4

from artifact_supervisor import admit_apk, bounded, cleanup_owned, digest, require_command
import signing_authority as authority

IMAGE = 'sha256:43778b0b9227ffc8d12a9092f011f09238a77c92b5fcde6a18310757ccef7305'
STATE = authority.SOURCE_ROOT
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


def sign(unsigned, expected_sha256, label, *, authorization=None):
    """Unregistered internal lifecycle primitive, never a factory admission API.

    Low-level-only receipts lack administrative authorization and cannot replay
    through signing_normalization. Factory callers use sign_administratively.
    """
    if not re.fullmatch(r'[a-z0-9-]{1,64}',label) or not re.fullmatch(r'[0-9a-f]{64}',expected_sha256):
        raise ValueError('Exact admitted unsigned identity and owned label required')
    STATE.mkdir(mode=0o700,exist_ok=True)
    if STATE.is_symlink() or STATE.stat().st_mode & 0o022: raise ValueError('Unprotected signing state')
    output=STATE/label;output.mkdir(mode=0o700,exist_ok=False)
    owner=uuid4().hex;name='micro-artifact-'+owner;identifier=None;attempted=False;error=None
    receipt={'schema':'micro.fixture-signing-supervisor/1','owner':owner,'image':IMAGE,
             'supervisorSha256':digest(Path(__file__)),'startedAt':datetime.now(timezone.utc).isoformat(),
             'commands':[],'status':'started','cleanup':None,'scope':'public fixture test signing only'}
    if authorization is not None:
        receipt['authorization']=authorization.json()
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
        try:(output/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
        except Exception as persistence:
            if error is not None:
                error.add_note('Signing receipt persistence failed: '+type(persistence).__name__)
                raise error from persistence
            raise
    if error:raise error
    return receipt


REVIEWED_SIGN_PRIMITIVE = sign


def sign_administratively(registry, binding, unsigned, builds, label, now):
    """New private factory boundary. No root/key/image/callback selector exists."""
    import admission as a
    import pipeline
    import signing_normalization as n
    import signing_tools
    if (sign is not REVIEWED_SIGN_PRIMITIVE or sign.__module__!=__name__
            or sign.__qualname__!='sign' or Path(sign.__code__.co_filename).resolve()!=Path(__file__).resolve()):
        raise a.Rejected('Signing primitive callable differs from reviewed source authority')
    if (not isinstance(registry,pipeline.Registry) or not isinstance(binding,a.Binding)
            or registry.store.root!=pipeline.CONTROLLER_ROOT
            or registry.select(binding.project_id,binding.adapter_id)!=binding
            or STATE!=authority.SOURCE_ROOT or authority.TEST_ONLY_SOURCE_ROOT is not None):
        raise a.Rejected('Exact protected operator registry/signing source required')
    store=registry.store
    binding.validate(store,now)
    if binding.source_sha!=n.FIXTURE_SOURCE or binding.package!='app.micro.factory.fixture' or binding.certificate_sha256!=n.CERTIFICATE_SHA or binding.permissions!=('app.micro.factory.fixture.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',):
        raise a.Rejected('Explicit reviewed public fixture signing admission required')
    if not isinstance(label,str) or not re.fullmatch('[a-z0-9-]{1,64}',label):
        raise a.Rejected('Fixed reviewed signing label required')
    if not isinstance(unsigned,a.Evidence) or not isinstance(builds,(list,tuple)) or len(builds)!=2:
        raise a.Rejected('First unsigned build Evidence and full pair required')
    n._require_live_code()
    pair=a.validate_build_pair(builds,binding,store,now,3600)
    store.verify(unsigned,512*1024**2)
    if unsigned.sha256!=pair['unsignedApkSha256'][0]:raise a.Rejected('First actual unsigned build differs')
    if store.json(builds[0]).get('unsignedApk')!=unsigned.json():
        raise a.Rejected('Exact first build unsigned APK Evidence required')
    for ref in builds:
        if a.number(store.json(ref).get('finishedAt'),'admitted build finish')>now:raise a.Rejected('Actual build pair not complete before authorization')
    toolchain=store.json(binding.identities['toolchain'])
    if signing_tools.validate_toolchain(toolchain,store,now)!=n.TOOLS:
        raise a.Rejected('Measured image tools differ from exact signing policy')
    authority.source_root()
    directory='signing-authorizations/'+uuid4().hex
    store.path(directory).mkdir(mode=0o700,parents=True,exist_ok=False)
    reference=store.write(directory+'/receipt.json',{'schema':'micro.fixture-signing-authorization/1',
        'context':binding.context(),'authorizedAt':now,'unsigned':unsigned.json(),
        'builds':[ref.json() for ref in builds],'toolchain':binding.identities['toolchain'].json(),
        'toolAuthoritySha256':hashlib.sha256(a.canonical(toolchain['signingTools'])).hexdigest(),
        'reviewedCode':n.PINS,'normalizerSha256':n.code_evidence(Path(n.__file__),'signing_normalization.py').sha256,
        'scope':'public fixture local signing only'})
    authority.validate_authorization(reference,store,binding,builds,now,n.PINS,
        n.code_evidence(Path(n.__file__),'signing_normalization.py').sha256)
    return sign(store.path(unsigned.path),unsigned.sha256,label,authorization=reference)
