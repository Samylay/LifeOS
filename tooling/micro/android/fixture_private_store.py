"""Fixed synthetic store collection. No host SQL parsing or arbitrary commands."""
from dataclasses import dataclass
import hashlib
from io import BytesIO
from pathlib import Path
import re
import tarfile
from uuid import uuid4

try:
    from . import admission as a, fixture_store_validation as validator
except ImportError:
    import admission as a
    import fixture_store_validation as validator

PACKAGE = 'app.micro.factory.fixture'
ROOT = '/data/user/0/'+PACKAGE
STORE = ROOT+'/files/SQLite'
NAMES = validator.NAMES
LIMIT = validator.MAX_BYTES
ARCHIVE_LIMIT = LIMIT+32*1024

def parse_inventory(data: bytes) -> dict:
    if not isinstance(data, bytes) or len(data)>16384 or b'\x00' in data:
        raise a.Rejected('Fixture inventory bound/encoding')
    try: lines=data.decode('ascii').splitlines()
    except UnicodeError as error: raise a.Rejected('Fixture inventory encoding') from error
    if not lines or not re.fullmatch(r'PACKAGE\|[0-9]+',lines[0]):
        raise a.Rejected('Fixture package UID observation missing')
    uid=int(lines[0].split('|')[1])
    if not 10000<=uid<100000: raise a.Rejected('Fixture package is not a user0 app UID')
    def metadata(line,prefix,directory=False):
        match=re.fullmatch(re.escape(prefix)+r'\|(\d+)\|(\d+)\|([0-7]{3,4})\|(\d+)\|(\d+)',line)
        if not match: raise a.Rejected('Unknown fixture metadata layout')
        owner,gid,mode,links,size=match.groups();numeric=int(mode,8)
        if int(owner)!=uid or not 10000<=int(gid)<100000 or numeric&0o7000 or numeric&0o002:
            raise a.Rejected('Unsafe fixture owner/mode')
        if not directory and (int(links)!=1 or numeric not in (0o600,0o660) or not 0<int(size)<=LIMIT):
            raise a.Rejected('Invalid fixture file link/mode/size')
        return dict(uid=int(owner),gid=int(gid),mode=mode,links=int(links),bytes=int(size))
    def label(line):
        match=re.fullmatch(r'LABEL\|(u:object_r:app_data_file:s0(?::c\d+(?:,c\d+)*)?)',line)
        if not match:raise a.Rejected('Fixture SELinux label unavailable')
        return match[1]
    if len(lines)<5:raise a.Rejected('Incomplete fixture inventory')
    package=metadata(lines[1],'DIR',True);package['label']=label(lines[2])
    if lines[3:] == ['PARENT|absent','STORE|absent']:
        return dict(packageUid=uid,packageMetadata=package,parentMetadata=None,store=None,files=[])
    if len(lines)<6:raise a.Rejected('Incomplete fixture parent inventory')
    parent=metadata(lines[3],'DIR',True);parent['label']=label(lines[4])
    if (parent['gid'],parent['label'])!=(package['gid'],package['label']):
        raise a.Rejected('Fixture parent owner/label differs')
    if lines[5]=='STORE|absent':
        if len(lines)!=6:raise a.Rejected('Empty target inventory has extras')
        return dict(packageUid=uid,packageMetadata=package,parentMetadata=parent,store=None,files=[])
    directory=metadata(lines[5],'STORE',True)
    if len(lines)<7:raise a.Rejected('Missing SQLite directory label')
    directory['label']=label(lines[6])
    if (directory['gid'],directory['label'])!=(package['gid'],package['label']):
        raise a.Rejected('SQLite owner/label differs')
    files=[];names=set();pos=7
    while pos<len(lines):
        if pos+2>=len(lines):raise a.Rejected('Incomplete fixture file')
        parts=lines[pos].split('|',2)
        if len(parts)!=3 or parts[0]!='FILE' or parts[1] not in NAMES or parts[1] in names:
            raise a.Rejected('Unexpected/duplicate fixture file')
        row=metadata('FILE|'+parts[2],'FILE');row['label']=label(lines[pos+1])
        if (row['gid'],row['label'])!=(package['gid'],package['label']):
            raise a.Rejected('Fixture file owner/label differs')
        sha=lines[pos+2]
        if not re.fullmatch(r'SHA\|[0-9a-f]{64}',sha):raise a.Rejected('Device checksum missing')
        row.update(name=parts[1],sha256=sha[4:]);files.append(row);names.add(parts[1]);pos+=3
    if 'factory-fixture.db' not in names or sum(row['bytes'] for row in files)>LIMIT:
        raise a.Rejected('Incomplete/excessive fixture store')
    return dict(packageUid=uid,packageMetadata=package,parentMetadata=parent,store=directory,files=sorted(files,key=lambda r:r['name']))

def unpack(data: bytes,inventory: dict) -> dict[str,bytes]:
    """No tar.extract, SQL opening or path selected from archive names."""
    if not isinstance(data,bytes) or len(data)>ARCHIVE_LIMIT:raise a.Rejected('Fixture archive byte bound')
    expected={row['name']:row for row in inventory['files']};values={}
    try:
        with tarfile.open(fileobj=BytesIO(data),mode='r:') as archive:
            for member in archive:
                if member.name not in expected or member.name in values or not member.isreg() or member.pax_headers:
                    raise a.Rejected('Unexpected/duplicate/link fixture archive member')
                if member.offset_data!=member.offset+512 or data[member.offset+156:member.offset+157] not in (b'0',b'\x00'):
                    raise a.Rejected('Unexpected fixture archive extension')
                row=expected[member.name]
                if (member.size,member.uid,member.gid)!=(row['bytes'],row['uid'],row['gid']):
                    raise a.Rejected('Fixture archive metadata differs')
                source=archive.extractfile(member)
                if source is None:raise a.Rejected('Missing fixture archive body')
                with source:body=source.read(LIMIT+1)
                if len(body)!=row['bytes'] or hashlib.sha256(body).hexdigest()!=row['sha256']:
                    raise a.Rejected('Collected body differs from device inventory')
                values[member.name]=body
            if any(data[archive.offset:]):raise a.Rejected('Unrecorded trailing fixture archive bytes')
    except (tarfile.TarError,OSError) as error:raise a.Rejected('Corrupt fixture transfer archive') from error
    if set(values)!=set(expected):raise a.Rejected('Incomplete fixture transfer archive')
    return values

@dataclass(frozen=True)
class Collection:
    receipt: a.Evidence
    manifest: a.Evidence
    files: tuple[tuple[str,a.Evidence],...]

def collect(adapter) -> Collection:
    owner=uuid4().hex;directory='fixture-stores/'+adapter.role+'/'+owner;store=adapter.store
    store.path(directory).mkdir(mode=0o700,parents=True,exist_ok=False)
    budget=store.budget()
    if max(budget['regularBytes'],budget['allocatedBytes'])+LIMIT+65536>a.STORE_BYTES:
        raise a.Rejected('Fixture collection exceeds supervisor storage')
    facts=dict(schema='micro.android.fixture-store-collection/1',role=adapter.role,owner=owner,
        status='started',commands=[],inventoryBefore=None,inventoryAfter=None,manifest=None,files={},
        collectorSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        deviceControllerSha256=hashlib.sha256(Path(__file__).with_name('device.py').read_bytes()).hexdigest(),
        calibration=DEVICE_CALIBRATION,scope='Stopped synthetic store; validation/restore not implied')
    refs={};manifest=None;first=None
    def call(operation):
        attempt=dict(operation=operation);facts['commands'].append(attempt)
        try:
            raw=adapter._fixture_store_call(operation)
            attempt.update(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest());return raw
        except Exception as error:attempt['failure']=failure(error);raise
    try:
        before=parse_inventory(call('inventory'));facts['inventoryBefore']=before
        if before['store'] is None:raise a.Rejected('Source fixture has no SQLite store')
        values=unpack(call('collect'),before)
        after=parse_inventory(call('inventory'));facts['inventoryAfter']=after
        if before!=after:raise a.Rejected('Fixture store/process/metadata changed during collection')
        for name,data in values.items():
            path=store.path(directory+'/'+name)
            with path.open('xb') as output:output.write(data)
            path.chmod(0o400);refs[name]=store.describe(directory+'/'+name,LIMIT)
        manifest=store.write(directory+'/manifest.json',dict(schema='micro.fixture-store/1',package=PACKAGE,version=1,
            files=[dict(name=name,bytes=ref.bytes,sha256=ref.sha256) for name,ref in sorted(refs.items())]))
        facts.update(status='collected',manifest=manifest.json(),files={name:ref.json() for name,ref in refs.items()},
            quiescence='No observed package-UID processes or fixed-store open descriptors at each transfer check')
    except Exception as error:first=error;facts['status']='failed';facts['failure']=failure(error)
    finally:
        facts.update(leaseSha256=adapter._lease_pin,apkSha256=adapter._installed['apkSha256'] if adapter._installed else None)
        receipt=store.write(directory+'/collection.json',facts)
    if first:
        error=a.Rejected('Fixture collection failed; retained '+receipt.path);error.collection_evidence=receipt
        raise error from first
    return Collection(receipt,manifest,tuple(sorted(refs.items())))

def validate_restore_input(store,collection: Collection,validation: a.Evidence) -> dict:
    if not isinstance(collection,Collection) or not isinstance(validation,a.Evidence):
        raise a.Rejected('Store-bound collection and validation required')
    source=store.json(collection.receipt);files=dict(collection.files)
    if len(files)!=len(collection.files) or source.get('schema')!='micro.android.fixture-store-collection/1' or source.get('status')!='collected' or source.get('manifest')!=collection.manifest.json() or source.get('files')!={n:r.json() for n,r in files.items()}:
        raise a.Rejected('Collection receipt subject differs')
    if source.get('collectorSha256')!=hashlib.sha256(Path(__file__).read_bytes()).hexdigest() or source.get('deviceControllerSha256')!=hashlib.sha256(Path(__file__).with_name('device.py').read_bytes()).hexdigest():
        raise a.Rejected('Collection controller authority changed')
    manifest=validator.retained_files(store,collection.manifest,files)
    if manifest['package']!=PACKAGE or type(manifest['version']) is not int or manifest['version']!=1:
        raise a.Rejected('Wrong product/incompatible fixture backup')
    actual=store.json(validation)
    if actual.get('schema')!='micro.fixture-store-supervisor/1' or actual.get('status')!='validated' or actual.get('manifest')!=collection.manifest.json() or actual.get('files')!={n:r.json() for n,r in files.items()} or actual.get('image')!=validator.IMAGE or actual.get('cleanup')!={'absent':True}:
        raise a.Rejected('Fixture validation subject/runtime/cleanup not accepted')
    worker=actual.get('worker',{})
    if worker.get('manifestSha256')!=collection.manifest.sha256 or worker.get('files')!=manifest['files'] or worker.get('rows')!=[dict(id='counter-a',value=2),dict(id='counter-b',value=1)]:
        raise a.Rejected('Restore requires validated exact2/1 without sentinel')
    for key,path in [('supervisorSha256',Path(validator.__file__)),('workerSha256',Path(validator.__file__).with_name('recovery_store.py')),('commandHelperSha256',Path(validator.__file__).with_name('artifact_supervisor.py'))]:
        if actual.get(key)!=hashlib.sha256(path.read_bytes()).hexdigest():raise a.Rejected('Validator authority changed')
    runtime=actual.get('runtime')
    expected={'identity','user','isolation','resources','exposure','logs','tmpfs','command','mounts'}
    if not isinstance(runtime,dict) or set(runtime)!=expected or any(v is not True for v in runtime.values()):
        raise a.Rejected('Validator actual complete policy readback missing')
    state=actual.get('state',{})
    if state.get('Running') is not False or state.get('OOMKilled') is not False or type(state.get('ExitCode')) is not int or state['ExitCode']!=0:
        raise a.Rejected('Validator successful stopped non-OOM state missing')
    if worker.get('status')!='validated' or worker.get('package')!=PACKAGE or worker.get('userVersion')!=1:
        raise a.Rejected('Validator worker identity/version differs')
    return dict(manifest=manifest,collection=source,validation=actual)

# Operator-owned pins remain unset until reviewed bounded Android compilation and
# actual owned-image calibration. Caller data cannot enable privileged operations.
HELPER_BINARY_SHA256 = None
HELPER_SOURCE_SHA256 = None
DEVICE_CALIBRATION = None
HELPER_NAME = 'helper'
OWNER = re.compile(r'[0-9a-f]{32}')
LABEL = re.compile(r'u:object_r:app_data_file:s0(?::c\d+(?:,c\d+)*)?')

def admitted_helper(store, binary):
    if not isinstance(DEVICE_CALIBRATION, dict) or DEVICE_CALIBRATION.get('status') != 'reviewed':
        raise a.Rejected('Actual fixture private-store capability calibration pending')
    if not isinstance(binary,a.Evidence) or not re.fullmatch(r'[0-9a-f]{64}',HELPER_BINARY_SHA256 or '') or binary.sha256!=HELPER_BINARY_SHA256:
        raise a.Rejected('Reviewed exact Android helper binary pending')
    source=Path(__file__).with_name('fixture_store_commit.c')
    if hashlib.sha256(source.read_bytes()).hexdigest()!=HELPER_SOURCE_SHA256:
        raise a.Rejected('Private-store helper source authority changed')
    return store.read(binary,1024*1024)

def fixed_script(operation, uid, *, owner=None, label=None, gid=None):
    """Internal templates only. No caller-supplied shell/path text."""
    if type(uid) is not int or not 10000<=uid<100000:
        raise a.Rejected('Observed package UID required')
    if owner is not None and (not isinstance(owner,str) or not OWNER.fullmatch(owner)):
        raise a.Rejected('Controller-generated owner required')
    if label is not None and (not isinstance(label,str) or not LABEL.fullmatch(label)):
        raise a.Rejected('Observed exact package SELinux context required')
    if gid is not None and (type(gid) is not int or not 10000<=gid<100000):
        raise a.Rejected('Observed exact package GID required')
    # Opaque stderr is bounded by the transport. No broad process metadata retained.
    common = """set -euf
umask 077
P=/data/user/0/app.micro.factory.fixture
for d in /data /data/user /data/user/0 "$P"; do
  [ -d "$d" ] && [ ! -L "$d" ] || exit 41
done
[ "$(stat -c %u "$P")" = UID ] || exit 42
absent() {
  [ ! -e "$1" ] && [ ! -L "$1" ] || return 1
  listing=$(ls -a "$2") || exit 68
  rc=0; printf '%s\\n' "$listing" | grep -Fx "$3" >/dev/null || rc=$?
  [ "$rc" = 1 ] || exit 69
}
for p in /proc/[0-9]*/status; do
  [ -e "$p" ] || continue
  [ -r "$p" ] || exit 43
  awk '$1=="Uid:" { found++; if(NF!=5) bad=1; for(i=2;i<=5;i++) if($i==UID) active=1 } END { if(found!=1||bad||active) exit 1 }' "$p" || exit 44
done
for f in /proc/[0-9]*/fd/*; do
  [ -L "$f" ] || continue
  t=$(readlink "$f") || { [ ! -L "$f" ] && continue; exit 45; }
  case "$t" in "$P/files/SQLite"|"$P/files/SQLite/"*|/data/data/app.micro.factory.fixture/files/SQLite|/data/data/app.micro.factory.fixture/files/SQLite/*) exit 46;; esac
done
""".replace('UID',str(uid))
    metadata="""meta() {
  [ ! -L "$1" ] || exit 47
  printf '%s|' "$2"; stat -c '%u|%g|%a|%h|%s' "$1"
  z=$(ls -Zd "$1" | awk '{print $1}') || exit 48
  printf 'LABEL|%s\\n' "$z"
}
printf 'PACKAGE|UID\\n'
meta "$P" DIR
""".replace('UID',str(uid))
    # ls -Zd output shape must be calibrated; no parser silently accepts a path.
    # Unknown/multi-column output is rejected by parse_inventory.
    if operation in ('inventory','stage-inventory'):
        path='"$P/files/SQLite"' if operation=='inventory' else '"$P/files/.micro-fixture-restore-'+str(owner)+'"'
        if operation=='stage-inventory' and owner is None:raise a.Rejected('Stage owner missing')
        script=common+metadata+'S='+path+'\n'
        script+='if absent "$P/files" "$P" files; then printf \'PARENT|absent\\nSTORE|absent\\n\'; exit 0; fi\n'
        script+='[ -d "$P/files" ] && [ ! -L "$P/files" ] || exit 58\nmeta "$P/files" DIR\n'
        if operation=='inventory':script+='if absent "$S" "$P/files" SQLite; then printf \'STORE|absent\\n\'; exit 0; fi\n'
        script+='[ -d "$S" ] && [ ! -L "$S" ] || exit 49\nmeta "$S" STORE\n'
        script+='''for f in "$S"/* "$S"/.[!.]* "$S"/..?*; do
  [ -e "$f" ] || { [ ! -L "$f" ] || exit 50; continue; }
  n=$(basename "$f")
  case "$n" in factory-fixture.db|factory-fixture.db-wal|factory-fixture.db-shm) ;; *) exit 51;; esac
  [ -f "$f" ] && [ ! -L "$f" ] || exit 52
  printf 'FILE|%s|' "$n"; stat -c '%u|%g|%a|%h|%s' "$f"
  z=$(ls -Zd "$f" | awk '{print $1}'); printf 'LABEL|%s\\n' "$z"
  h=$(sha256sum "$f"); printf 'SHA|%s\\n' "$(printf '%s' "$h" | cut -d ' ' -f 1)"
done
'''
        return script
    if operation=='collect':
        return common+'''cd "$P/files/SQLite"
set --
for n in factory-fixture.db factory-fixture.db-wal factory-fixture.db-shm; do
  [ -e "$n" ] || continue
  [ -f "$n" ] && [ ! -L "$n" ] || exit 53
  set -- "$@" "$n"
done
[ "$#" -ge 1 ] || exit 54
exec /system/bin/toybox tar -cf - "$@"
'''
    if operation=='bootstrap':
        if owner is None or label is None or gid is None:raise a.Rejected('Bootstrap owner/context missing')
        return common+('D="$P/files/.micro-fixture-helper-'+owner+'"\n'
            'if absent "$P/files" "$P" files; then\n'
            '  mkdir -m 700 "$P/files"\n  chown '+str(uid)+':'+str(gid)+' "$P/files"\n'
            '  chcon '+label+' "$P/files"\nfi\n'
            '[ -d "$P/files" ] && [ ! -L "$P/files" ] || exit 59\n'
            'mkdir -m 700 "$D"\nset -C\nprintf '+owner+' > "$D/owner"\n'
            'chown '+str(uid)+':'+str(gid)+' "$D" "$D/owner"\n'
            'chcon '+label+' "$D" "$D/owner"\ncat > "$D/helper"\n'
            'chown '+str(uid)+':'+str(gid)+' "$D" "$D/helper"\n'
            'chcon '+label+' "$D" "$D/helper"\n'
            'chmod 700 "$D"\nchmod 500 "$D/helper"\n'
            'sha256sum "$D/helper"\n')
    if operation=='transfer':
        if owner is None:raise a.Rejected('Transfer owner missing')
        return common+('D="$P/files/.micro-fixture-restore-'+owner+'"\n'
            '[ -d "$D" ] && [ ! -L "$D" ] || exit 55\n'
            'exec /system/bin/toybox tar -xf - -C "$D"\n')
    if operation=='helper-cleanup':
        if owner is None:raise a.Rejected('Helper owner missing')
        # Only this exact helper path, whose body must be rehashed by Device first.
        return common+('D="$P/files/.micro-fixture-helper-'+owner+'"\n'
            'if absent "$D" "$P/files" .micro-fixture-helper-'+owner+'; then exit 0; fi\n'
            '[ -d "$D" ] && [ ! -L "$D" ] && [ -f "$D/owner" ] && [ ! -L "$D/owner" ] || exit 56\n'
            '[ "$(cat "$D/owner")" = '+owner+' ] && [ "$(stat -c %h "$D/owner")" = 1 ] && [ "$(stat -c %s "$D/owner")" = 32 ] || exit 60\n'
            '[ "$(stat -c %u "$D")" = '+str(uid)+' ] || exit 61\n'
            'for f in "$D"/* "$D"/.[!.]* "$D"/..?*; do\n'
            '  [ -e "$f" ] || { [ ! -L "$f" ] || exit 64; continue; }\n'
            '  case "$(basename "$f")" in helper|owner) ;; *) exit 65;; esac\ndone\n'
            'if [ -e "$D/helper" ] || [ -L "$D/helper" ]; then\n'
            '  [ -f "$D/helper" ] && [ ! -L "$D/helper" ] && [ "$(stat -c %h "$D/helper")" = 1 ] || exit 62\n'
            '  [ "$(stat -c %s "$D/helper")" -le 1048576 ] || exit 63\n'
            '  rm "$D/helper"\nfi\nrm "$D/owner"\nrmdir "$D"\n'
            'absent "$D" "$P/files" .micro-fixture-helper-'+owner+' || exit 57\n')
    raise a.Rejected('Unknown fixed fixture script operation')

def archive_restore(store,collection,uid,gid):
    values=dict(collection.files);output=BytesIO()
    with tarfile.open(fileobj=output,mode='w',format=tarfile.USTAR_FORMAT) as archive:
        for name,ref in sorted(values.items()):
            body=store.read(ref,LIMIT)
            entry=tarfile.TarInfo(name);entry.size=len(body);entry.mode=0o600
            entry.uid=uid;entry.gid=gid;entry.mtime=0
            archive.addfile(entry,BytesIO(body))
    data=output.getvalue()
    if len(data)>ARCHIVE_LIMIT:raise a.Rejected('Restore transfer archive bound')
    return data

def restore(adapter,collection,validation,binary):
    # All subject/product/schema/content/runtime gates precede any target call.
    accepted=validate_restore_input(adapter.store,collection,validation)
    body=admitted_helper(adapter.store,binary)
    if adapter.role!='factory-target':raise a.Rejected('Restore is fixed empty-target only')
    owner=uuid4().hex;directory='fixture-restores/'+owner
    adapter.store.path(directory).mkdir(mode=0o700,parents=True,exist_ok=False)
    budget=adapter.store.budget()
    if max(budget['regularBytes'],budget['allocatedBytes'])+2*LIMIT+128*1024>a.STORE_BYTES:
        raise a.Rejected('Restore diagnostic/transfer headroom insufficient')
    facts=dict(schema='micro.android.fixture-store-restore/1',owner=owner,role=adapter.role,
        collection=collection.receipt.json(),validation=validation.json(),helper=binary.json(),
        helperSourceSha256=HELPER_SOURCE_SHA256,calibration=DEVICE_CALIBRATION,
        commands=[],status='started',failure=None,cleanupFailure=None,stageCleanup={'absent':None},
        helperCleanup={'absent':None},commitAttempted=False,scope='fixed synthetic fixture only')
    first=None;helper_attempted=False;prepared=False;committed=False;uid=None;sizes=None
    def call(operation,**kwargs):
        attempt=dict(operation=operation,arguments={k:v for k,v in kwargs.items() if k!='input_bytes'},
            inputSha256=hashlib.sha256(kwargs['input_bytes']).hexdigest() if 'input_bytes' in kwargs else None)
        facts['commands'].append(attempt)
        try:
            result=adapter._fixture_private_operation(operation,owner=owner,**kwargs)
            attempt.update(stdoutBytes=len(result),stdoutSha256=hashlib.sha256(result).hexdigest())
            return result
        except Exception as error:
            attempt['failure']=failure(error);raise
    try:
        before=parse_inventory(call('inventory'))
        if before['store'] is not None:raise a.Rejected('Target SQLite is occupied')
        facts['emptyTarget']=before
        uid=before['packageUid'];gid=before['packageMetadata']['gid'];label=before['packageMetadata']['label']
        sizes={n:r.bytes for n,r in collection.files}
        helper_attempted=True
        call('bootstrap',uid=uid,gid=gid,label=label,input_bytes=body)
        call('verify-helper',uid=uid,expected_sha256=binary.sha256)
        facts['targetPrepared']=parse_inventory(call('inventory',uid=uid))
        if facts['targetPrepared']['store'] is not None:
            raise a.Rejected('Target SQLite appeared before stage preparation')
        call('metadata',uid=uid,sizes=sizes)
        prepared=True
        call('prepare',uid=uid,sizes=sizes)
        call('transfer',uid=uid,input_bytes=archive_restore(adapter.store,collection,uid,gid))
        call('seal',uid=uid,sizes=sizes)
        staged=parse_inventory(call('stage-inventory',uid=uid))
        expected={n:dict(bytes=r.bytes,sha256=r.sha256) for n,r in collection.files}
        actual={r['name']:dict(bytes=r['bytes'],sha256=r['sha256']) for r in staged['files']}
        if actual!=expected or staged['packageUid']!=uid:raise a.Rejected('Stage complete file/hash/UID differs')
        facts['staged']=staged;facts['commitAttempted']=True
        call('commit',uid=uid,sizes=sizes)
        committed=True
        after=parse_inventory(call('inventory',uid=uid))
        actual={r['name']:dict(bytes=r['bytes'],sha256=r['sha256']) for r in after['files']}
        identity_keys=('uid','gid','mode','label')
        if actual!=expected or any(after['packageMetadata'][key]!=before['packageMetadata'][key] for key in identity_keys):
            raise a.Rejected('Committed store readback differs')
        facts['committed']=after;facts['status']='committed'
    except Exception as error:
        first=error;facts['status']='failed'
        facts['failure']=failure(error)
    finally:
        try:
            if prepared and not committed:
                call('verify-helper',uid=uid,expected_sha256=binary.sha256)
                call('cleanup',uid=uid,sizes=sizes)
            facts['stageCleanup']={'absent':True}
        except Exception as error:
            facts['stageCleanup']={'absent':None};facts['cleanupFailure']=failure(error)
            first=first or error;facts['status']='failed'
        try:
            if helper_attempted:
                call('helper-cleanup',uid=uid)
            facts['helperCleanup']={'absent':True}
        except Exception as error:
            facts['helperCleanup']={'absent':None};facts['helperCleanupFailure']=failure(error)
            first=first or error;facts['status']='failed'
        facts['leaseSha256']=adapter._lease_pin
        facts['apkSha256']=adapter._installed['apkSha256'] if adapter._installed else None
        reference=adapter.store.write(directory+'/receipt.json',facts)
    if first:
        error=a.Rejected('Fixture restore failed; retained '+reference.path)
        error.restore_evidence=reference;raise error from first
    return reference

def failure(error):
    return dict(type=type(error).__name__,reason=str(error)[:800],
        transport=getattr(error,'transport_facts',None),transportCleanupFailure=getattr(error,'transport_cleanup_failure',None),
        stdoutPrefix=getattr(error,'stdout_prefix',b'')[:1024].decode('utf-8',errors='replace'),
        stderrPrefix=getattr(error,'stderr_prefix',b'')[:1024].decode('utf-8',errors='replace'))
