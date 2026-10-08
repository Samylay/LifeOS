"""Proposal only. Replay exact public-fixture signer bytes, never execute tools.

The operator copies a terminal signer directory into a protected Store only
after two actual admitted offline builds. Normalization grants no production,
publishing, scanner, device, registry or key authority.
"""
from datetime import datetime
from functools import wraps
import hashlib
import os
from pathlib import Path
import re
import stat
import struct

if __package__:
    from . import admission as a
    from . import signing_authority as authority, signing_tools
else:
    import admission as a
    import signing_authority as authority
    import signing_tools

# Import only data validation. Reviewed signer sources are hashed, never imported.
KIT_ROOT = Path(a.__file__).parent

SOURCE_ROOT = authority.SOURCE_ROOT
FIXTURE_SOURCE = '8cfb316455a451d2781bfd4dc589acb91bb7ef52'
KEY_SHA = '221e0a3106aa4c3ccc154e0a418b55020b3f9ea6e84f92e8749cd9e2f39f5e58'
CERTIFICATE_SHA = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c'
PINS = {'sign_fixture.py': '9cdf007e01b8993d429959c0cdce39df214ba73186990f010c6724291120cdd5', 'sign_fixture_worker.py': 'b6150a3c20bc12f0ff59afb89d81080f4120adda7b6e46f33c560f2b2e268b2a', 'inspect_apk.py': '776ce421e96b477f7b1f2dac621f529b72e8ef8823c98cd7e5f8de9d0e9358e9', 'artifact_supervisor.py': '67ad0748e938bf939e80dfa987f317bc5ab7bb1ffd607be45d8c76144936852c', 'signing_authority.py': 'd3db2a5d6022cbe2c8d17faffac405ac502a3817a72e792bf5a0533ec7ce7024', 'signing_tools.py': 'dc72046c493bc40c24f3bf2b0fc7dd98a228669cfc4d58e6174d26e70fc7b8f3', 'signing_measurement_supervisor.py': '26b58ce302585dc095ed87cba64aa5b730191c10c214a551c828f4f1bac31529', 'measure_signing_tools.py': '55e5c15e83f0f7ff6339fdc42b2c613b08488701c34753f0e44700b08d6bc2c0', 'admission.py': '19486c1b786a05efb0432dced4d011ce88e3b54b8bf9218b7dbfeeb4a0b850a7', 'pipeline.py': '4b2439298ce26e8e943fe3757d228c15609f81efd3ab827a4c2cf1bf2817d6ff', 'fixture_integration.py': '1fff1cbc39746c64fdb0f9e719d5fd5eb7bdd8ce4523c2feeb5e0ef0d325ae3f'}
TOOLS = {'aapt': 'c076aeeee8bd3ce58395a093747202265ab80c6c12e59358f598a30a81fde13b',
         'apksigner': 'b47549e373b895ce6ca620d0c7887e674d9615ffa837a86ac601dcfd04adb0f0',
         'zipalign': 'c5f559e946de5a9e7d58792181db20383b228877812136bc469d97ae00a43b0a'}
LOG_LIMIT = 1024**2
COMMANDS = ('create', 'inspect-before', 'signing', 'inspect-after', 'cleanup-owner',
            'cleanup-remove', 'cleanup-absent', 'cleanup-list')
FILES = {'receipt.json': 2*1024**2, 'unsigned.apk': 512*1024**2,
         'debug.keystore': 2257, 'tools/sign_fixture_worker.py': 2*1024**2,
         'tools/inspect_apk.py': 2*1024**2, 'artifacts/app.apk': 512*1024**2,
         **{name+'.log': LOG_LIMIT for name in COMMANDS}}
NORMALIZED = {'schema', 'context', 'status', 'startedAt', 'finishedAt',
              'unsignedApkSha256', 'signedApkSha256', 'certificateSha256',
              'exitCode', 'cleanup', 'log', 'rawReceipt', 'snapshot'}
ENVIRONMENT = ['PATH=/opt/jdk17/bin:/opt/gradle/bin:/usr/local/bin:/usr/bin:/bin',
               'NODE_VERSION=24.19.0','YARN_VERSION=1.22.22','JAVA_HOME=/opt/jdk17',
               'ANDROID_HOME=/opt/android-sdk','ANDROID_SDK_ROOT=/opt/android-sdk',
               'EXPO_OFFLINE=1','EXPO_NO_TELEMETRY=1','HOME=/tmp',
               'JAVA_TOOL_OPTIONS=-Djava.io.tmpdir=/tmp -Duser.home=/tmp']


def create_argv(owner, paths):
    result=['docker','create','--pull=never','--name','micro-artifact-'+owner,
            '--label','micro.artifact.owner='+owner,'--network=none','--read-only',
            '--user=1000:1000','--cap-drop=ALL','--security-opt=no-new-privileges',
            '--memory=1g','--memory-swap=1g','--cpus=1','--pids-limit=128','--log-driver=none',
            '--ulimit=fsize=536870912:536870912','--ulimit=nofile=256:256','--ulimit=core=0:0',
            '--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=67108864,mode=1777',
            '--env=HOME=/tmp','--env=JAVA_TOOL_OPTIONS=-Djava.io.tmpdir=/tmp -Duser.home=/tmp',
            '--workdir=/tmp','--entrypoint=python3']
    for destination,source in paths.items():
        result+=['--mount=type=bind,src='+str(source)+',dst='+destination+(''if destination=='/output'else',readonly')]
    return result+[a.IMAGE,'/tools/sign_fixture_worker.py']


def timestamp(value):
    if not isinstance(value, str): raise a.Rejected('Signer timestamp must be text')
    try: parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as error: raise a.Rejected('Signer timestamp invalid') from error
    if parsed.tzinfo is None: raise a.Rejected('Signer timestamp lacks timezone')
    return a.number(parsed.timestamp(), 'signer timestamp')


def public_certificate(data):
    """Read the sole public certificate, skipping encrypted key bytes.

    Fixed JKS v2/one androiddebugkey/X.509 certificate only. No key decryption,
    host JDK or cryptographic APK verification occurs in this data parser.
    """
    if len(data) != 2257 or hashlib.sha256(data).hexdigest() != KEY_SHA:
        raise a.Rejected('Known public signing input differs')
    offset = 0
    def take(size):
        nonlocal offset
        if size < 0 or offset+size > len(data)-20: raise a.Rejected('Public JKS truncated')
        value=data[offset:offset+size];offset+=size;return value
    def integer(): return struct.unpack('>I', take(4))[0]
    def utf(): return take(struct.unpack('>H', take(2))[0]).decode('ascii')
    if (integer(),integer(),integer(),integer()) != (0xFEEDFEED,2,1,1):
        raise a.Rejected('Unexpected fixed JKS structure')
    if utf() != 'androiddebugkey': raise a.Rejected('Unexpected fixed key alias')
    take(8);take(integer())
    if integer()!=1 or utf()!='X.509': raise a.Rejected('Unexpected fixed public certificate chain')
    certificate=take(integer())
    if offset != len(data)-20 or not certificate.startswith(b'\x30'):
        raise a.Rejected('Unexpected public certificate encoding')
    if hashlib.sha1('android'.encode('utf-16be')+b'Mighty Aphrodite'+data[:-20]).digest()!=data[-20:]:
        raise a.Rejected('Public JKS integrity checksum differs')
    result=hashlib.sha256(certificate).hexdigest()
    if result!=CERTIFICATE_SHA:raise a.Rejected('Known public certificate fingerprint differs')
    return result


def _reject_errors(function):
    """Return the caller's admission.Rejected class for malformed evidence."""
    @wraps(function)
    def checked(*args, **kwargs):
        try:
            return function(*args, **kwargs)
        except a.Rejected:
            raise
        except (KeyError, TypeError, AttributeError, ValueError, OSError, OverflowError, struct.error) as error:
            raise a.Rejected('Invalid signing evidence: '+type(error).__name__) from error
    return checked


def _identity(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


@_reject_errors
def code_evidence(source, name, limit=2*LOG_LIMIT):
    """Bounded, nofollow hashing of reviewed code with descriptor identity checks."""
    a.Store._parents(source)
    descriptor=os.open(source, os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        before=os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink!=1 or before.st_uid!=os.getuid() or not 0<=before.st_size<=limit:
            raise a.Rejected('Signing code source is not owned bounded regular bytes')
        count=0;value=hashlib.sha256()
        while chunk:=os.read(descriptor, min(LOG_LIMIT,limit-count+1)):
            count+=len(chunk)
            if count>limit:raise a.Rejected('Signing code grew past read budget')
            value.update(chunk)
        after=os.fstat(descriptor)
        a.Store._parents(source)
        if _identity(before)!=_identity(after) or _identity(after)!=_identity(source.lstat()) or count!=after.st_size:
            raise a.Rejected('Signing code changed during read')
        return a.Evidence(name,value.hexdigest(),count)
    finally:
        os.close(descriptor)


def _require_live_code():
    for name, expected in PINS.items():
        if code_evidence(KIT_ROOT/name,name).sha256!=expected:
            raise a.Rejected('Reviewed signer code changed: '+name)


def _inventory(root):
    a.Store._parents(root)
    if root.stat().st_uid!=os.getuid() or root.stat().st_mode & 0o077:
        raise a.Rejected('Signer evidence root not protected')
    result=set()
    for item in root.rglob('*'):
        info=item.lstat()
        if item.is_symlink() or not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
            raise a.Rejected('Signer evidence link/special entry')
        # The original signer creates its per-run root700. Descendant default
        # modes cannot grant another UID traversal through that private root.
        if info.st_uid!=os.getuid():
            raise a.Rejected('Signer evidence entry not protected')
        if stat.S_ISREG(info.st_mode):
            if info.st_nlink!=1: raise a.Rejected('Signer evidence hardlink')
            result.add(item.relative_to(root).as_posix())
    if result!=set(FILES): raise a.Rejected('Signer evidence file closure differs')


def _copy_budget(store, additional):
    budget=store.budget()
    if max(budget['regularBytes'],budget['allocatedBytes'])+additional>a.STORE_BYTES:
        raise a.Rejected('Signing complete copy would exceed Store budget')
    if budget['freeDiskBytes']<additional:
        raise a.Rejected('Signing complete copy exceeds free disk budget')


def _verify_lineage(original,refs):
    """Retain original signer state; a self-consistent copied manifest is insufficient.

    Store paths differ from original paths. Compare relative original name,
    bounded SHA256 and byte count, never the copied Store's path string.
    Same-UID controller authority remains an explicit external assumption.
    """
    _inventory(original)
    source=a.Store(original)
    for name,ref in refs.items():
        actual=source.describe(name,FILES[name])
        if actual!=a.Evidence(name,ref.sha256,ref.bytes):
            raise a.Rejected('Retained signer source lineage differs: '+name)
    _inventory(original)


ULIMITS = {'fsize':536870912,'nofile':256,'core':0}
# Fail-closed proposal profile. Real terminal evidence must confirm these;
# defaults are not inferred from claimed create argv or daemon configuration.
REQUIRED_RUNTIME = 'runc'
REQUIRED_CGROUP_NAMESPACE = 'private'


def runtime_policy(observed,identifier,owner,paths):
    """Replay approved policy facts and the exact actual isolation projection."""
    h=observed['HostConfig'];c=observed['Config']
    for key in ('CapAdd','Binds','VolumesFrom'):
        if key not in h or h[key] not in (None,[]):
            raise a.Rejected('Signer actual extra capability/bind/volume: '+key)
    if h['Privileged'] is not False or h['SecurityOpt']!=['no-new-privileges']:
        raise a.Rejected('Signer actual privilege/security projection differs')
    for key in ('PidMode','IpcMode','UsernsMode'):
        if h[key] not in ('','private'):
            raise a.Rejected('Signer actual namespace differs: '+key)
    if h['CgroupnsMode']!=REQUIRED_CGROUP_NAMESPACE or h['Runtime']!=REQUIRED_RUNTIME:
        raise a.Rejected('Signer actual runtime/cgroup namespace differs')
    limits=h['Ulimits']
    if not isinstance(limits,list) or len(limits)!=len(ULIMITS):
        raise a.Rejected('Signer actual ulimit closure differs')
    found={}
    for limit in limits:
        a.exact(limit,{'Name','Soft','Hard'},'actual signer ulimit')
        name=limit['Name']
        if not isinstance(name,str) or name in found or name not in ULIMITS or any(type(limit[key])is not int or limit[key]!=ULIMITS[name] for key in ('Soft','Hard')):
            raise a.Rejected('Signer actual ulimit value differs')
        found[name]=limit
    if set(found)!=set(ULIMITS):raise a.Rejected('Signer actual ulimit names differ')
    # Preserve the exact original raw runtimePolicy boolean schema.
    checks={'identity':observed['Id']==identifier and observed['Name']=='/micro-artifact-'+owner and observed['Image']==a.IMAGE and c.get('Labels',{}).get('micro.artifact.owner')==owner,
            'user':c['User']=='1000:1000','networkNone':h['NetworkMode']=='none',
            'readOnly':h['ReadonlyRootfs'] is True and h['Privileged'] is False,
            'bounds':h['Memory']==h['MemorySwap']==1073741824 and h['NanoCpus']==1000000000 and h['PidsLimit']==128,
            'caps':h['CapDrop']==['ALL'] and h['SecurityOpt']==['no-new-privileges'],
            'noExposure':not h['Devices'] and not h['PortBindings'] and not h['ExtraHosts'],
            'logNone':h['LogConfig']['Type']=='none',
            'tmpfs':h['Tmpfs']=={'/tmp':'rw,nosuid,nodev,noexec,size=67108864,mode=1777'},
            'entrypoint':c['Entrypoint']==['python3'] and c['Cmd']==['/tools/sign_fixture_worker.py'],
            'env':c['Env']==ENVIRONMENT}
    mounts=observed['Mounts']
    checks['mounts']=len(mounts)==4 and {(m['Destination'],m['Source'],m['RW'],m['Type'])for m in mounts}=={(destination,str(source),destination=='/output','bind')for destination,source in paths.items()}
    if not all(checks.values()):raise a.Rejected('Signer actual runtime policy differs')
    return checks


@_reject_errors
def copy_terminal(store, selection, destination):
    """Operator API, fixed source root and label; complete independent copy.

    Does not normalize or promote. Only known fixed signer files/source code,
    no arbitrary directory selectors, links or previous APK/task cache reuse.
    """
    _require_live_code()
    if store.root.stat().st_mode & 0o077:raise a.Rejected('Signing copy requires private700 Store')
    source=authority.validate_selector(selection)
    if source.parent!=SOURCE_ROOT:raise a.Rejected('Signer selector differs from fixed source root')
    _inventory(source)
    original=a.Store(source)
    refs={name:original.describe(name,limit) for name,limit in FILES.items()}
    # Reserve every possible code-copy byte and snapshot byte, not slack.
    # Check allocated bytes too, with one filesystem block per future file.
    block=os.statvfs(store.root).f_frsize
    remaining=sum(r.bytes for r in refs.values())+(len(PINS)+1)*2*LOG_LIMIT+2*LOG_LIMIT
    future_files=len(FILES)+len(PINS)+2
    _copy_budget(store,remaining+future_files*block)
    root=store.path(destination);root.mkdir(mode=0o700,exist_ok=False)
    facts={}
    def copy_file(source_store, ref, relative, limit):
        nonlocal remaining, future_files
        _copy_budget(store,remaining+future_files*block)
        source_store.verify(ref,limit)
        target=store.path(destination+'/'+relative);target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        # Bounded descriptor stream avoids storing two512MiB APKs in memory.
        descriptor=os.open(source_store.path(ref.path),os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        try:
            before=os.fstat(descriptor);value=hashlib.sha256();count=0
            if not stat.S_ISREG(before.st_mode) or before.st_nlink!=1: raise a.Rejected('Copy source changed')
            with target.open('xb') as output:
                while chunk:=os.read(descriptor,min(1024**2,limit-count+1)):
                    count+=len(chunk)
                    if count>limit: raise a.Rejected('Signing copy byte limit exceeded')
                    _copy_budget(store,len(chunk)+block)
                    output.write(chunk);value.update(chunk)
            after=os.fstat(descriptor)
            identity=lambda st:(st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns,st.st_ctime_ns)
            if identity(before)!=identity(after) or identity(after)!=identity(source_store.path(ref.path).lstat()):
                raise a.Rejected('Signing evidence changed during copy')
            if count!=ref.bytes or value.hexdigest()!=ref.sha256: raise a.Rejected('Signing copy identity differs')
            target.chmod(0o400);copied=store.describe(destination+'/'+relative,limit)
            source_store.verify(ref,limit)
            remaining-=ref.bytes;future_files-=1
            _copy_budget(store,remaining+future_files*block)
            return copied
        finally:os.close(descriptor)
    for name,ref in refs.items():facts[name]=copy_file(original,ref,name,FILES[name]).json()
    class FixedCodeSource:
        # The reviewed kit is a working tree, not an evidence Store. Do not
        # chmod it or pretend it has private Store permissions. Exact pins,
        # path closure and the descriptor copy hash admit only these files.
        def __init__(self,paths,pins):self.paths,self.pins=paths,pins
        def path(self,name):
            if name not in self.pins:raise a.Rejected('Unknown signing code source')
            source=self.paths[name];a.Store._parents(source)
            info=source.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or info.st_uid!=os.getuid() or info.st_size>2*LOG_LIMIT:
                raise a.Rejected('Signing code source is not owned bounded regular bytes')
            return source
        def describe(self,name):
            ref=code_evidence(self.path(name),name)
            if ref.sha256!=self.pins[name]:raise a.Rejected('Signing code pin differs')
            return ref
        def verify(self,ref,limit):
            if self.describe(ref.path)!=ref:raise a.Rejected('Signing code source changed')
    kit=FixedCodeSource({name:KIT_ROOT/name for name in PINS},PINS)
    code={}
    for name,pin in PINS.items():
        ref=kit.describe(name)
        if ref.sha256!=pin:raise a.Rejected('Signing source changed')
        code[name]=copy_file(kit,ref,'approved-code/'+name,2*LOG_LIMIT).json()
    normalizer_sha=code_evidence(Path(__file__),'signing_normalization.py').sha256
    normalizer=FixedCodeSource({'signing_normalization.py':Path(__file__)},{'signing_normalization.py':normalizer_sha})
    normalizer_ref=copy_file(normalizer,normalizer.describe('signing_normalization.py'),'approved-code/signing_normalization.py',2*LOG_LIMIT)
    _inventory(source)
    for name,ref in refs.items():original.verify(ref,FILES[name])
    authority.validate_selector(selection)
    manifest={'schema':'micro.fixture-signing-snapshot/2','sourceRoot':str(source),
              'administrativeSigner':selection.json(),
              'files':facts,'approvedCode':code,'normalizerSha256':normalizer_sha,'normalizerSource':normalizer_ref.json()}
    _copy_budget(store,len(a.canonical(manifest))+1+block)
    ref=store.write(destination+'/snapshot.json',manifest)
    _copy_budget(store,0)
    return ref


@_reject_errors
def replay(snapshot, store, binding, builds, now, max_age=3600):
    """Replay raw receipt/log/runtime/bytes before deriving any successful fact."""
    _require_live_code();binding.validate(store,now)
    if store.root.stat().st_mode & 0o077:raise a.Rejected('Signing replay requires private700 Store')
    if binding.source_sha!=FIXTURE_SOURCE or binding.package!='app.micro.factory.fixture':
        raise a.Rejected('Only exact protected fixture source may be signed')
    comparison=a.validate_build_pair(builds,binding,store,now,max_age)
    toolchain=store.json(binding.identities['toolchain'])
    if toolchain.get('artifactToolsSha256')!={q:TOOLS[q]for q in ('aapt','apksigner')}:
        raise a.Rejected('Signer tools differ from context-bound admitted toolchain')
    if signing_tools.validate_toolchain(toolchain,store,now)!=TOOLS:
        raise a.Rejected('All three measured signer tools differ from reviewed policy')
    manifest=store.json(snapshot)
    a.exact(manifest,{'schema','sourceRoot','administrativeSigner','files','approvedCode','normalizerSha256','normalizerSource'},'signer snapshot')
    if manifest['schema']!='micro.fixture-signing-snapshot/2' or manifest['normalizerSha256']!=code_evidence(Path(__file__),'signing_normalization.py').sha256:
        raise a.Rejected('Unreviewed signing snapshot/normalizer')
    original=Path(manifest['sourceRoot'])
    if original.parent!=SOURCE_ROOT or not re.fullmatch('[a-z0-9-]{1,64}',original.name):
        raise a.Rejected('Unapproved signer state source')
    selection=authority.parse_selector(manifest['administrativeSigner'])
    if authority.validate_selector(selection)!=original:
        raise a.Rejected('Original typed signer subject differs')
    if set(manifest['files'])!=set(FILES) or set(manifest['approvedCode'])!=set(PINS):
        raise a.Rejected('Incomplete signing source closure')
    parent=Path(snapshot.path).parent
    expected_files=set(FILES)|{'approved-code/'+name for name in PINS}|{'approved-code/signing_normalization.py','snapshot.json'}
    copied_root=store.path(parent.as_posix())
    found=set()
    for path in copied_root.rglob('*'):
        info=path.lstat()
        if path.is_symlink() or info.st_uid!=os.getuid() or info.st_mode & 0o077 or not(stat.S_ISDIR(info.st_mode)or stat.S_ISREG(info.st_mode)):
            raise a.Rejected('Signing Store copy not private plain owned entries')
        if stat.S_ISREG(info.st_mode):
            if info.st_nlink!=1:raise a.Rejected('Signing Store hardlink')
            found.add(path.relative_to(copied_root).as_posix())
    if found!=expected_files or snapshot.path!=(parent/'snapshot.json').as_posix():raise a.Rejected('Signing Store complete file closure differs')
    normalizer=a.Evidence.parse(manifest['normalizerSource'])
    if normalizer.path!=(parent/'approved-code/signing_normalization.py').as_posix() or normalizer.sha256!=manifest['normalizerSha256']:
        raise a.Rejected('Protected normalizer source identity differs')
    store.verify(normalizer)
    refs={name:a.Evidence.parse(value) for name,value in manifest['files'].items()}
    for name,ref in refs.items():
        if ref.path!=(parent/name).as_posix():raise a.Rejected('Aliased signing snapshot file')
        store.verify(ref,FILES[name])
    for name,pin in PINS.items():
        ref=a.Evidence.parse(manifest['approvedCode'][name])
        if ref.path!=(parent/'approved-code'/name).as_posix() or ref.sha256!=pin:raise a.Rejected('Signing source pin differs')
        store.verify(ref)
    _verify_lineage(original,refs)
    if (refs['receipt.json'].sha256,refs['receipt.json'].bytes)!=(selection.original_receipt.sha256,selection.original_receipt.bytes):
        raise a.Rejected('Selected original terminal receipt identity differs')
    raw=store.json(refs['receipt.json'])
    a.exact(raw,{'schema','owner','image','supervisorSha256','startedAt','finishedAt','commands','status',
                 'cleanup','scope','inputs','runtimePolicy','state','worker','authorization'},'raw signer supervisor')
    if raw['schema']!='micro.fixture-signing-supervisor/1' or raw['status']!='signed' or raw['image']!=a.IMAGE or raw['supervisorSha256']!=PINS['sign_fixture.py'] or raw['scope']!='public fixture test signing only':
        raise a.Rejected('Raw signer failed/unreviewed')
    if not isinstance(raw['owner'],str) or not re.fullmatch('[0-9a-f]{32}',raw['owner']):raise a.Rejected('Full generated signer owner required')
    start,finish=timestamp(raw['startedAt']),timestamp(raw['finishedAt'])
    authorized=authority.validate_authorization(a.Evidence.parse(raw['authorization']),store,binding,builds,now,
        PINS,code_evidence(Path(__file__),'signing_normalization.py').sha256)
    if authorized['authorizedAt']>start:
        raise a.Rejected('Signing started before original administrative authorization')
    for build in builds:
        admitted=store.json(build)
        if a.number(admitted.get('finishedAt'),'admitted build finish')>start:
            raise a.Rejected('Signing started before both admitted builds finished')
    a.freshness({'startedAt':start,'finishedAt':finish},now,max_age)
    commands=raw['commands']
    if not isinstance(commands,list) or len(commands)!=len(COMMANDS):raise a.Rejected('Signer command closure differs')
    identifier=store.read(refs['create.log'],LOG_LIMIT).decode().strip()
    if not re.fullmatch('[0-9a-f]{64}',identifier):raise a.Rejected('Full signer container ID required')
    name='micro-artifact-'+raw['owner']
    expected=[None,['docker','inspect',identifier],['docker','start','--attach',identifier],
              ['docker','inspect',identifier],['docker','inspect',identifier],['docker','rm','--force',identifier],
              ['docker','inspect',identifier],['docker','ps','--all','--quiet','--no-trunc','--filter','name=^/'+name+'$',
               '--filter','label=micro.artifact.owner='+raw['owner']]]
    for index,(label,command) in enumerate(zip(COMMANDS,commands)):
        a.exact(command,{'argv','exitCode','seconds','capturedBytes','sha256','limitFailure'},'signer command')
        if type(command['exitCode'])is not int or command['exitCode']!=(1 if label=='cleanup-absent' else 0) or command['limitFailure']is not None:
            raise a.Rejected('Signer command failed/limited')
        seconds=a.number(command['seconds'],'signer command seconds')
        if seconds>(125 if label=='signing' else 35):raise a.Rejected('Signer command wall limit differs')
        ref=refs[label+'.log']
        if type(command['capturedBytes'])is not int or command['capturedBytes']!=ref.bytes or command['sha256']!=ref.sha256:
            raise a.Rejected('Signer command log identity differs')
        if index and command['argv']!=expected[index]:raise a.Rejected('Signer command argv differs')
    if sum(c['seconds'] for c in commands)>finish-start+0.01:raise a.Rejected('Signer durations outside original interval')
    paths={'/input/app.apk':original/'unsigned.apk','/input/debug.keystore':original/'debug.keystore',
           '/tools':original/'tools','/output':original/'artifacts'}
    if commands[0]['argv']!=create_argv(raw['owner'],paths):raise a.Rejected('Signer create recipe differs')
    def inspect_log(label):
        import json
        data=store.read(refs[label+'.log'],LOG_LIMIT)
        value=json.loads(data,object_pairs_hook=lambda pairs:_unique(pairs))
        if not isinstance(value,list)or len(value)!=1:raise a.Rejected('One actual signer runtime required')
        if not isinstance(value[0],dict):raise a.Rejected('Signer runtime must be an object')
        return value[0]
    before,after=inspect_log('inspect-before'),inspect_log('inspect-after')
    for observed in (before,after):
        runtime_policy(observed,identifier,raw['owner'],paths)
        host=observed['HostConfig']
        if any(type(host[key])is not int for key in ('Memory','MemorySwap','NanoCpus','PidsLimit')) or observed['Config']['Env']!=ENVIRONMENT or observed['Config'].get('WorkingDir')!='/tmp':
            raise a.Rejected('Signer typed bounds/environment differ from exact create')
        if observed.get('Path')!='python3' or observed.get('Args')!=['/tools/sign_fixture_worker.py']:
            raise a.Rejected('Signer actual execution differs')
    if raw['runtimePolicy']!=runtime_policy(before,identifier,raw['owner'],paths):raise a.Rejected('Signer policy booleans do not replay')
    if before['State'].get('Status')!='created' or before['State'].get('Running')is not False or raw['state']!=after['State']:
        raise a.Rejected('Signer runtime state differs')
    if after['State'].get('Status')!='exited':raise a.Rejected('Signer runtime has not exited')
    a.state_success(after['State'])
    actual_start,actual_finish=timestamp(after['State']['StartedAt']),timestamp(after['State']['FinishedAt'])
    if not start<=actual_start<actual_finish<=finish:raise a.Rejected('Signer runtime clock differs')
    owner=inspect_log('cleanup-owner')
    if owner['Id']!=identifier or owner['Name']!='/'+name or owner['Image']!=a.IMAGE or owner.get('Config',{}).get('Labels',{}).get('micro.artifact.owner')!=raw['owner']:
        raise a.Rejected('Signer cleanup full owner differs')
    absence=store.read(refs['cleanup-absent.log'],LOG_LIMIT).decode()
    if not re.search(r'no such object:\s*'+re.escape(identifier)+r'(?:\s|$)',absence,re.I) or store.read(refs['cleanup-list.log'],LOG_LIMIT).strip() or raw['cleanup']!={'absent':True}:
        raise a.Rejected('Signer scoped absence missing')
    inputs=raw['inputs'];a.exact(inputs,{'unsignedApkSha256','unsignedApkBytes','publicKeySha256','workerSha256','inspectorSha256','commandHelperSha256'},'signer inputs')
    expected_inputs={'unsignedApkSha256':refs['unsigned.apk'].sha256,'unsignedApkBytes':refs['unsigned.apk'].bytes,
                     'publicKeySha256':KEY_SHA,'workerSha256':PINS['sign_fixture_worker.py'],
                     'inspectorSha256':PINS['inspect_apk.py'],'commandHelperSha256':PINS['artifact_supervisor.py']}
    if inputs!=expected_inputs or refs['unsigned.apk'].sha256!=comparison['unsignedApkSha256'][0]:raise a.Rejected('Signer does not bind first actual unsigned build')
    if refs['tools/sign_fixture_worker.py'].sha256!=PINS['sign_fixture_worker.py'] or refs['tools/inspect_apk.py'].sha256!=PINS['inspect_apk.py']:
        raise a.Rejected('Actual copied signing tools differ')
    certificate=public_certificate(store.read(refs['debug.keystore'],2257))
    if certificate!=binding.certificate_sha256:raise a.Rejected('Public fixture certificate differs from admitted certificate')
    lines=store.read(refs['signing.log'],LOG_LIMIT).decode().splitlines()
    reported=[a.decode(line.encode())for line in lines if line.startswith('{')]
    if reported!=[raw['worker']]:raise a.Rejected('Actual worker/log mismatch')
    worker=raw['worker'];a.exact(worker,{'schema','status','unsignedApkSha256','publicKeySha256','inspection','toolSha256','scope'},'actual signing worker')
    if worker['schema']!='micro.fixture-signing-worker/1' or worker['status']!='signed' or worker['unsignedApkSha256']!=refs['unsigned.apk'].sha256 or worker['publicKeySha256']!=KEY_SHA or worker['toolSha256']!=TOOLS or worker['scope']!='public synthetic test key only; no production signing authority':
        raise a.Rejected('Worker signing identity/tools/scope differ')
    inspection=worker['inspection'];a.exact(inspection,{'schema','status','apkSha256','apkBytes','bundle','metadata','certificateSha256','toolSha256','scope'},'worker signed inspection')
    if inspection['schema']!='micro.android.apk-inspection/1' or inspection['status']!='inspected' or inspection['apkSha256']!=refs['artifacts/app.apk'].sha256 or type(inspection['apkBytes'])is not int or inspection['apkBytes']!=refs['artifacts/app.apk'].bytes or inspection['certificateSha256']!=certificate or inspection['toolSha256']!={q:TOOLS[q]for q in ('aapt','apksigner')}:
        raise a.Rejected('Signed bytes/certificate/tool verification differ')
    expected_metadata={'package':binding.package,'versionCode':1,'versionName':'1.0.0','minSdk':24,'targetSdk':36,
                       'debuggable':False,'abis':['x86_64'],'permissions':['app.micro.factory.fixture.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']}
    if inspection['metadata']!=expected_metadata or tuple(expected_metadata['permissions'])!=binding.permissions:
        raise a.Rejected('Signer fixture metadata differs')
    bundle=inspection['bundle'];a.exact(bundle,{'sha256','bytes','entryCount','declaredExpandedBytes'},'signed bundle');a.sha(bundle['sha256'])
    for key,minimum,maximum in [('bytes',1,64*1024**2),('entryCount',1,30000),('declaredExpandedBytes',1,1024**3)]:
        if type(bundle[key])is not int or not minimum<=bundle[key]<=maximum:raise a.Rejected('Signed bundle bound differs')
    if inspection['scope']!='artifact identity only; no source, vulnerability, installation or product verdict':raise a.Rejected('Unexpected inspection authority')
    # Detect any original source mutation during the complete replay as well.
    _verify_lineage(original,refs)
    return {'schema':'micro.android.signing/1','context':binding.context(),'status':'signed','startedAt':start,'finishedAt':finish,
            'unsignedApkSha256':refs['unsigned.apk'].sha256,'signedApkSha256':refs['artifacts/app.apk'].sha256,
            'certificateSha256':certificate,'exitCode':commands[2]['exitCode'],'cleanup':{'absent':True},
            'log':refs['signing.log'].json(),'rawReceipt':refs['receipt.json'].json(),'snapshot':snapshot.json()}


def _unique(pairs):
    result={}
    for key,value in pairs:
        if key in result:raise a.Rejected('Duplicate raw runtime field')
        result[key]=value
    return result


@_reject_errors
def validate_normalized(value, store, binding, builds, now, max_age=3600):
    a.exact(value,NORMALIZED,'normalized signer receipt')
    actual=replay(a.Evidence.parse(value['snapshot']),store,binding,builds,now,max_age)
    if value!=actual:raise a.Rejected('Normalized signing differs from raw actual evidence')
    return actual


@_reject_errors
def normalize(snapshot, store, binding, builds, now, destination, max_age=3600):
    """Operator binder. Fresh protected receipt with original observed times.

    Caller supplies administrative Binding and two actual build references,
    never product JSON or candidate source selectors. No registry mutation.
    """
    value=replay(snapshot,store,binding,builds,now,max_age)
    return store.write(destination,value)
