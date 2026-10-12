"""Private proposal: replay originally selected image tool measurements."""
from dataclasses import dataclass
from datetime import datetime
import hashlib
import os
from pathlib import Path
import re
import stat

if __package__:
    from . import admission as a, signing_authority as authority
else:
    import admission as a
    import signing_authority as authority

KIT = Path(__file__).parent
NAMES = ('aapt', 'apksigner', 'zipalign')
TOOL_PATHS = {name: '/opt/android-sdk/build-tools/36.0.0/' + name for name in NAMES}
TOOL_LIMIT = 64 * 1024**2
EXPECTED_TOOLS = {
    'aapt': {'sha256':'c076aeeee8bd3ce58395a093747202265ab80c6c12e59358f598a30a81fde13b','bytes':1591768},
    'apksigner': {'sha256':'b47549e373b895ce6ca620d0c7887e674d9615ffa837a86ac601dcfd04adb0f0','bytes':2959},
    'zipalign': {'sha256':'c5f559e946de5a9e7d58792181db20383b228877812136bc469d97ae00a43b0a','bytes':227696},
}  # Sealed builder-input expectations, never evidence of actual image measurement.
LIMIT = 1024**2
COMMANDS = ('create', 'inspect-before', 'measurement', 'inspect-after', 'cleanup-owner',
            'cleanup-remove', 'cleanup-absent', 'cleanup-list')
FILES = {'receipt.json': 2*LIMIT, 'tools/measure_signing_tools.py': 2*LIMIT,
         **{name+'.log': LIMIT for name in COMMANDS}}
MEASUREMENT_PINS = {'signing_measurement_supervisor.py': '26b58ce302585dc095ed87cba64aa5b730191c10c214a551c828f4f1bac31529', 'measure_signing_tools.py': '55e5c15e83f0f7ff6339fdc42b2c613b08488701c34753f0e44700b08d6bc2c0', 'artifact_supervisor.py': '67ad0748e938bf939e80dfa987f317bc5ab7bb1ffd607be45d8c76144936852c'}
ENVIRONMENT = ['JAVA_TOOL_OPTIONS=-Djava.io.tmpdir=/tmp -Duser.home=/tmp', 'HOME=/tmp', 'PATH=/opt/jdk17/bin:/opt/gradle/bin:/usr/local/bin:/usr/bin:/bin', 'NODE_VERSION=24.19.0', 'YARN_VERSION=1.22.22', 'JAVA_HOME=/opt/jdk17', 'ANDROID_HOME=/opt/android-sdk', 'ANDROID_SDK_ROOT=/opt/android-sdk', 'EXPO_OFFLINE=1', 'EXPO_NO_TELEMETRY=1']
SCOPE = 'three fixed public SDK tools only'


@dataclass(frozen=True)
class AdministrativeMeasurement:
    label: str
    original_receipt: a.Evidence


def bind_measurement(label, original_receipt):
    if not isinstance(label, str) or not re.fullmatch('tools-[0-9a-f]{32}', label):
        raise a.Rejected('Fixed generated measurement label required')
    if not isinstance(original_receipt, a.Evidence) or original_receipt.path != label+'/receipt.json':
        raise a.Rejected('Original reviewed measurement receipt Evidence required')
    a.Store(authority.source_root()).read(original_receipt, 2*LIMIT)
    return AdministrativeMeasurement(label, original_receipt)


def argv(owner, worker):
    return ['docker', 'create', '--pull=never', '--name', 'micro-artifact-'+owner,
            '--label', 'micro.artifact.owner='+owner, '--network=none', '--read-only',
            '--user=1000:1000', '--cap-drop=ALL', '--security-opt=no-new-privileges',
            '--memory=1g', '--memory-swap=1g', '--cpus=1', '--pids-limit=128',
            '--log-driver=none', '--ulimit=fsize=536870912:536870912',
            '--ulimit=nofile=256:256', '--ulimit=core=0:0',
            '--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=67108864,mode=1777',
            '--env=HOME=/tmp', '--env=JAVA_TOOL_OPTIONS=-Djava.io.tmpdir=/tmp -Duser.home=/tmp',
            '--workdir=/tmp', '--entrypoint=python3',
            '--mount=type=bind,src='+str(worker)+',dst=/measurement_worker.py,readonly',
            a.IMAGE, '/measurement_worker.py']


def runtime(observed, identifier, owner, worker):
    c=observed['Config'];h=observed['HostConfig']
    checks = {
        'identity': observed['Id']==identifier and observed['Name']=='/micro-artifact-'+owner
            and observed['Image']==a.IMAGE and c.get('Labels',{}).get('micro.artifact.owner')==owner,
        'command': observed.get('Path')=='python3' and observed.get('Args')==['/measurement_worker.py']
            and c['Entrypoint']==['python3'] and c['Cmd']==['/measurement_worker.py']
            and c.get('WorkingDir')=='/tmp',
        'user': c['User']=='1000:1000',
        'environment': isinstance(c.get('Env'),list)
            and all(isinstance(value,str) for value in c['Env'])
            and sorted(c['Env'])==sorted(ENVIRONMENT),
        'isolation': h['NetworkMode']=='none' and h['ReadonlyRootfs'] is True
            and h['Privileged'] is False and h['CapDrop']==['ALL']
            and h['SecurityOpt']==['no-new-privileges']
            and all(key in h and h[key] in (None,[]) for key in ('CapAdd','Binds','VolumesFrom'))
            and all(h[key] in ('','private') for key in ('PidMode','IpcMode','UsernsMode'))
            and h['CgroupnsMode']=='private' and h['Runtime']=='runc',
        'resources': all(type(h[key]) is int and h[key]==value for key,value in
            {'Memory':1073741824,'MemorySwap':1073741824,'NanoCpus':1000000000,'PidsLimit':128}.items()),
        'exposure': h['Devices'] in (None,[]) and h['PortBindings'] in (None,{})
            and h['ExtraHosts'] in (None,[]),
        'logs': h['LogConfig']=={'Type':'none','Config':{}},
        'tmpfs': h['Tmpfs']=={'/tmp':'rw,nosuid,nodev,noexec,size=67108864,mode=1777'},
    }
    expected_limits={'fsize':536870912,'nofile':256,'core':0}
    limits=h['Ulimits']; found={}
    if not isinstance(limits,list) or len(limits)!=3:
        raise a.Rejected('Measurement actual ulimit closure differs')
    for value in limits:
        a.exact(value,{'Name','Soft','Hard'},'measurement ulimit')
        name=value['Name']
        if name not in expected_limits or name in found or any(type(value[k]) is not int or value[k]!=expected_limits[name] for k in ('Soft','Hard')):
            raise a.Rejected('Measurement actual ulimits differ')
        found[name]=value
    mounts=observed['Mounts']
    checks['mounts']=isinstance(mounts,list) and len(mounts)==1 and all(
        m.get('Source')==str(worker) and m.get('Destination')=='/measurement_worker.py'
        and m.get('Type')=='bind' and m.get('RW') is False for m in mounts)
    if not all(checks.values()):
        raise a.Rejected('Measurement actual complete isolation differs')
    return checks


def _inventory(root, expected):
    a.Store._parents(root);info=root.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode & 0o077:
        raise a.Rejected('Measurement root must be owned private700')
    found=set()
    for path in root.rglob('*'):
        info=path.lstat()
        if info.st_uid!=os.getuid() or info.st_mode & 0o077 or not(stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
            raise a.Rejected('Measurement entry not private owned regular bytes')
        if stat.S_ISREG(info.st_mode):
            if info.st_nlink!=1:raise a.Rejected('Measurement evidence hardlink')
            found.add(path.relative_to(root).as_posix())
    if found!=expected:raise a.Rejected('Measurement complete file closure differs')


def _code(name):
    if name not in MEASUREMENT_PINS:raise a.Rejected('Unknown measurement source')
    path=KIT/name;a.Store._parents(path);info=path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_nlink!=1:
        raise a.Rejected('Measurement source must be owned regular bytes')
    store=a.Store(KIT);ref=store.describe(name,2*LIMIT)
    if ref.sha256!=MEASUREMENT_PINS[name]:raise a.Rejected('Reviewed measurement source changed')
    return store,ref


def _copy(store, destination, source, ref, limit):
    data=source.read(ref,limit);target=store.path(destination)
    budget=store.budget();block=os.statvfs(store.root).f_frsize
    if max(budget['regularBytes'],budget['allocatedBytes'])+len(data)+block>a.STORE_BYTES or budget['freeDiskBytes']<len(data)+block:
        raise a.Rejected('Measurement copy exceeds protected Store budget')
    target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    with target.open('xb') as output:output.write(data)
    target.chmod(0o400);source.verify(ref,limit)
    return store.describe(destination,limit)


def copy_measurement(store, selection, destination):
    if not isinstance(selection,AdministrativeMeasurement) or bind_measurement(selection.label,selection.original_receipt)!=selection:
        raise a.Rejected('Typed reviewed measurement selection required')
    if store.root.stat().st_mode & 0o077:raise a.Rejected('Measurement copy requires private700 Store')
    root=authority.source_root()/selection.label;_inventory(root,set(FILES));original=a.Store(root)
    refs={name:original.describe(name,limit) for name,limit in FILES.items()}
    if refs['receipt.json'].sha256!=selection.original_receipt.sha256 or refs['receipt.json'].bytes!=selection.original_receipt.bytes:
        raise a.Rejected('Selected original measurement receipt changed')
    target=store.path(destination);target.mkdir(mode=0o700,exist_ok=False)
    copied={name:_copy(store,destination+'/'+name,original,ref,FILES[name]).json() for name,ref in refs.items()}
    code={name:_copy(store,destination+'/approved-code/'+name,*_code(name),2*LIMIT).json() for name in MEASUREMENT_PINS}
    _inventory(root,set(FILES))
    for name,ref in refs.items():original.verify(ref,FILES[name])
    raw=original.json(refs['receipt.json'])
    # Derivation is only a candidate manifest. Replay decides authority.
    tools=raw.get('worker',{}).get('tools')
    value={'schema':'micro.android.signing-tools/1','image':a.IMAGE,'label':selection.label,
           'originalReceipt':selection.original_receipt.json(),'measurement':copied['receipt.json'],
           'worker':copied['measurement.log'],'files':copied,'approvedCode':code,
           'tools':tools,'scope':SCOPE}
    validate(value,store)
    return value


def _timestamp(value):
    if not isinstance(value,str):raise a.Rejected('Measurement timestamp must be text')
    parsed=datetime.fromisoformat(value.replace('Z','+00:00'))
    if parsed.tzinfo is None:raise a.Rejected('Measurement timestamp timezone absent')
    return a.number(parsed.timestamp(),'measurement timestamp')


def validate(value,store):
    try:
        return _validate(value,store)
    except a.Rejected:raise
    except (KeyError,TypeError,ValueError,OSError,AttributeError,OverflowError) as error:
        raise a.Rejected('Invalid signing tool authority: '+type(error).__name__) from error


def _validate(value,store):
    a.exact(value,{'schema','image','label','originalReceipt','measurement','worker','files','approvedCode','tools','scope'},'signing tools authority')
    if value['schema']!='micro.android.signing-tools/1' or value['image']!=a.IMAGE or value['scope']!=SCOPE:
        raise a.Rejected('Signing tool image/schema/scope differs')
    if store.root.stat().st_mode & 0o077:raise a.Rejected('Tool replay requires private700 Store')
    selected=bind_measurement(value['label'],a.Evidence.parse(value['originalReceipt']))
    original=a.Store(authority.source_root()/selected.label);_inventory(original.root,set(FILES))
    refs={name:a.Evidence.parse(ref) for name,ref in value['files'].items()}
    if set(refs)!=set(FILES) or set(value['approvedCode'])!=set(MEASUREMENT_PINS) or len(MEASUREMENT_PINS)!=3:
        raise a.Rejected('Measurement source/file closure differs')
    measurement=a.Evidence.parse(value['measurement']);parent=Path(measurement.path).parent
    if value['measurement']!=value['files']['receipt.json'] or value['worker']!=value['files']['measurement.log']:
        raise a.Rejected('Measurement receipt/output reference differs')
    _inventory(store.path(parent.as_posix()),set(FILES)|{'approved-code/'+name for name in MEASUREMENT_PINS})
    for name,ref in refs.items():
        if ref.path!=(parent/name).as_posix():raise a.Rejected('Aliased measurement evidence')
        store.verify(ref,FILES[name])
        if original.describe(name,FILES[name])!=a.Evidence(name,ref.sha256,ref.bytes):
            raise a.Rejected('Original measurement lineage changed')
    if measurement.sha256!=selected.original_receipt.sha256 or measurement.bytes!=selected.original_receipt.bytes:
        raise a.Rejected('Original reviewed measurement receipt differs')
    for name,rawref in value['approvedCode'].items():
        live,current=_code(name);ref=a.Evidence.parse(rawref)
        if ref.path!=(parent/'approved-code'/name).as_posix() or (ref.sha256,ref.bytes)!=(current.sha256,current.bytes):
            raise a.Rejected('Measurement approved source differs')
        store.verify(ref,2*LIMIT)
    if refs['tools/measure_signing_tools.py'].sha256!=MEASUREMENT_PINS['measure_signing_tools.py']:
        raise a.Rejected('Actual measurement worker source differs')
    raw=store.json(measurement)
    a.exact(raw,{'schema','owner','image','supervisorSha256','workerSha256','commandHelperSha256','startedAt','finishedAt','commands','status','cleanup','scope','runtimePolicy','state','worker'},'original measurement receipt')
    if raw['schema']!='micro.fixture-signing-tool-supervisor/1' or raw['status']!='measured' or raw['image']!=a.IMAGE or raw['cleanup']!={'absent':True} or raw['scope']!=SCOPE:
        raise a.Rejected('Measurement unsuccessful/unowned')
    for key,name in [('supervisorSha256','signing_measurement_supervisor.py'),('workerSha256','measure_signing_tools.py'),('commandHelperSha256','artifact_supervisor.py')]:
        if raw[key]!=MEASUREMENT_PINS[name]:raise a.Rejected('Measurement producer source changed')
    owner=raw['owner']
    if not isinstance(owner,str) or not re.fullmatch('[0-9a-f]{32}',owner):raise a.Rejected('Full measurement owner required')
    start,finish=_timestamp(raw['startedAt']),_timestamp(raw['finishedAt'])
    if finish<=start:raise a.Rejected('Measurement interval invalid')
    identifier=store.read(refs['create.log'],LIMIT).decode().strip()
    if not re.fullmatch('[0-9a-f]{64}',identifier):raise a.Rejected('Full measurement container ID required')
    commands=raw['commands'];name='micro-artifact-'+owner
    expected=[argv(owner,original.root/'tools/measure_signing_tools.py'),['docker','inspect',identifier],['docker','start','--attach',identifier],['docker','inspect',identifier],['docker','inspect',identifier],['docker','rm','--force',identifier],['docker','inspect',identifier],['docker','ps','--all','--quiet','--no-trunc','--filter','name=^/'+name+'$','--filter','label=micro.artifact.owner='+owner]]
    if not isinstance(commands,list) or len(commands)!=8:raise a.Rejected('Measurement command closure differs')
    for label,command,recipe in zip(COMMANDS,commands,expected):
        a.exact(command,{'argv','exitCode','seconds','capturedBytes','sha256','limitFailure'},'measurement command')
        ref=refs[label+'.log']
        if command['argv']!=recipe or type(command['exitCode'])is not int or command['exitCode']!=(1 if label=='cleanup-absent' else 0) or command['limitFailure']is not None or type(command['capturedBytes'])is not int or command['capturedBytes']!=ref.bytes or command['sha256']!=ref.sha256 or a.number(command['seconds'],'measurement command duration')>35:
            raise a.Rejected('Measurement actual command/log/bounds differ')
    if sum(c['seconds'] for c in commands)>finish-start+0.01:raise a.Rejected('Measurement durations outside actual interval')
    def observed(label):
        import json
        def pairs(rows):
            result={}
            for key,v in rows:
                if key in result:raise a.Rejected('Duplicate measurement runtime field')
                result[key]=v
            return result
        values=json.loads(store.read(refs[label+'.log'],LIMIT),object_pairs_hook=pairs)
        if not isinstance(values,list) or len(values)!=1 or not isinstance(values[0],dict):raise a.Rejected('One original measurement runtime required')
        return values[0]
    before,after=observed('inspect-before'),observed('inspect-after')
    for item in (before,after):runtime(item,identifier,owner,original.root/'tools/measure_signing_tools.py')
    if raw['runtimePolicy']!=runtime(before,identifier,owner,original.root/'tools/measure_signing_tools.py') or before['State']['Status']!='created' or before['State']['Running']is not False or raw['state']!=after['State'] or after['State']['Status']!='exited':raise a.Rejected('Measurement actual state/policy differs')
    a.state_success(after['State'])
    if not start<=_timestamp(after['State']['StartedAt'])<_timestamp(after['State']['FinishedAt'])<=finish:raise a.Rejected('Measurement actual runtime interval differs')
    cleaned=observed('cleanup-owner')
    if cleaned['Id']!=identifier or cleaned['Name']!='/'+name or cleaned['Image']!=a.IMAGE or cleaned.get('Config',{}).get('Labels',{}).get('micro.artifact.owner')!=owner:raise a.Rejected('Measurement cleanup owner differs')
    absence=store.read(refs['cleanup-absent.log'],LIMIT).decode()
    if not re.search(r'no such object:\s*'+re.escape(identifier)+r'(?:\s|$)',absence,re.I) or store.read(refs['cleanup-list.log'],LIMIT).strip():raise a.Rejected('Measurement scoped absence missing')
    worker=raw['worker'];a.exact(worker,{'schema','tools','scope'},'measurement worker')
    lines=store.read(refs['measurement.log'],LIMIT).decode().splitlines()
    if [a.decode(line.encode()) for line in lines if line.startswith('{')]!=[worker] or worker['schema']!='micro.fixture-signing-tool-worker/1' or worker['scope']!=SCOPE or worker['tools']!=value['tools']:raise a.Rejected('Measurement original worker/output differs')
    a.exact(value['tools'],set(NAMES),'measured tool closure')
    for name,fact in value['tools'].items():
        a.exact(fact,{'path','sha256','bytes'},'measured public tool')
        a.sha(fact['sha256'])
        if fact['path']!=TOOL_PATHS[name] or type(fact['bytes'])is not int or not 0<fact['bytes']<=TOOL_LIMIT:raise a.Rejected('Measured tool fixed path/bytes differ')
        if {'sha256':fact['sha256'],'bytes':fact['bytes']}!=EXPECTED_TOOLS[name]:
            raise a.Rejected('Measured tool differs from reviewed sealed-input policy')
    _inventory(original.root,set(FILES))
    for name,ref in refs.items():
        if original.describe(name,FILES[name])!=a.Evidence(name,ref.sha256,ref.bytes):raise a.Rejected('Original measurement changed during replay')
    return {name:fact['sha256'] for name,fact in value['tools'].items()}


def validate_toolchain(toolchain,store,now=None):
    measured=validate(toolchain.get('signingTools'),store)
    if toolchain.get('artifactToolsSha256')!={name:measured[name] for name in ('aapt','apksigner')}:
        raise a.Rejected('Measured signing tools differ from admitted inspector tools')
    if now is not None:
        raw=store.json(a.Evidence.parse(toolchain['signingTools']['measurement']))
        if _timestamp(raw['finishedAt'])>a.number(now,'signing authority time'):
            raise a.Rejected('Signing measurement finished after authorization')
    return measured
