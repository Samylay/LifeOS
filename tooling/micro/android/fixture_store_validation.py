#!/usr/bin/env python3
"""Administrative validation of a collected fixture store, before device writes.

SQL is opened only by the fixed worker in the bounded offline container. A
successful receipt does not imply collection consistency or a device restore.
"""
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import shutil
from uuid import uuid4

try:
    from . import admission as a
    from .artifact_supervisor import bounded, cleanup_owned, digest, require_command
except ImportError:
    import admission as a
    from artifact_supervisor import bounded, cleanup_owned, digest, require_command

IMAGE = 'sha256:43778b0b9227ffc8d12a9092f011f09238a77c92b5fcde6a18310757ccef7305'
PACKAGE = 'app.micro.factory.fixture'
NAMES = {'factory-fixture.db', 'factory-fixture.db-wal', 'factory-fixture.db-shm'}
MAX_BYTES = 8 * 1024**2


def retained_files(store, manifest_ref, files):
    """Plain host hashing only, no SQL parsing or candidate imports."""
    manifest = store.json(manifest_ref, 16384)
    a.exact(manifest, {'schema', 'package', 'version', 'files'}, 'fixture store manifest')
    if manifest['schema'] != 'micro.fixture-store/1':
        raise a.Rejected('Unknown fixture store schema')
    # Wrong product/version are retained for the independent worker to reject.
    rows = manifest['files']
    if not isinstance(rows, list) or not 1 <= len(rows) <= 3:
        raise a.Rejected('Complete fixture store file list required')
    names = set(); total = 0
    for row in rows:
        a.exact(row, {'name', 'bytes', 'sha256'}, 'fixture store file')
        name = row['name']
        if not isinstance(name, str) or name not in NAMES or name in names:
            raise a.Rejected('Unknown or duplicate fixture store file')
        if type(row['bytes']) is not int or not 0 < row['bytes'] <= MAX_BYTES:
            raise a.Rejected('Fixture store file exceeds bound')
        a.sha(row['sha256']); names.add(name); total += row['bytes']
    if total > MAX_BYTES or 'factory-fixture.db' not in names or set(files) != names:
        raise a.Rejected('Missing or excessive complete fixture store')
    for row in rows:
        ref = files[row['name']]
        if not isinstance(ref, a.Evidence) or (ref.sha256, ref.bytes) != (row['sha256'], row['bytes']):
            raise a.Rejected('Collected fixture file identity differs from manifest')
        store.verify(ref, MAX_BYTES)
    return manifest


def runtime(observed, identifier, owner, paths):
    h = observed['HostConfig']; c = observed['Config']
    checks = {
        'identity': observed['Id'] == identifier and observed['Name'] == '/micro-artifact-'+owner
            and observed['Image'] == IMAGE and c.get('Labels', {}).get('micro.artifact.owner') == owner,
        'user': c['User'] == '1000:1000',
        'isolation': h['NetworkMode'] == 'none' and h['ReadonlyRootfs'] is True
            and not h['Privileged'] and h['CapDrop'] == ['ALL'] and 'no-new-privileges' in h['SecurityOpt'],
        'resources': h['Memory'] == h['MemorySwap'] == 1024**3
            and h['NanoCpus'] == 1_000_000_000 and h['PidsLimit'] == 128,
        'exposure': not h['Devices'] and not h['PortBindings'] and not h['ExtraHosts'],
        'logs': h['LogConfig'] == {'Type': 'none', 'Config': {}},
        'tmpfs': h['Tmpfs'] == {'/tmp': 'rw,nosuid,nodev,noexec,size=67108864,mode=1777'},
        'command': c['Entrypoint'] == ['python3'] and c['Cmd'] == ['/worker.py']
            and observed['Path'] == 'python3' and observed['Args'] == ['/worker.py'],
        'mounts': len(observed['Mounts']) == 2 and
            {(m['Destination'], m['Source'], m['RW'], m['Type']) for m in observed['Mounts']} ==
            {(destination, str(source), False, 'bind') for destination, source in paths.items()},
    }
    if not all(checks.values()): raise a.Rejected('Fixture validator runtime differs from fixed policy: '+str(checks))
    return checks


def validate_collected_store(store, manifest_ref, files):
    """Retain a fresh worker result for exactly these Store-bound collected bytes.

    Both accepted and rejected worker outcomes return a receipt. Infrastructure,
    integrity or cleanup failures raise after retaining their first cause.
    """
    manifest = retained_files(store, manifest_ref, files)
    budget = store.budget()
    if max(budget['regularBytes'], budget['allocatedBytes'])+MAX_BYTES+2*1024**2 > a.STORE_BYTES:
        raise a.Rejected('Fixture validation would exceed Store budget')
    owner = uuid4().hex; directory = 'store-validation/'+owner
    output = store.path(directory); output.mkdir(parents=True, mode=0o700, exist_ok=False)
    name = 'micro-artifact-'+owner; identifier = None; attempted = False; failure = None
    receipt = {'schema': 'micro.fixture-store-supervisor/1', 'owner': owner, 'image': IMAGE,
               'startedAt': datetime.now(timezone.utc).isoformat(), 'status': 'started',
               'manifest': manifest_ref.json(), 'files': {k:v.json() for k,v in files.items()},
               'commands': [], 'cleanup': None, 'scope': 'collected synthetic store validation only'}
    def command(argv, label, seconds=30):
        result = bounded(argv, output/(label+'.log'), seconds)
        receipt['commands'].append(result); return result
    try:
        inputs = output/'input'; inputs.mkdir(); copied = inputs/'store'; copied.mkdir()
        shutil.copyfile(store.path(manifest_ref.path), inputs/'manifest.json')
        for filename, reference in files.items():
            shutil.copyfile(store.path(reference.path), copied/filename); (copied/filename).chmod(0o444)
            if digest(copied/filename) != reference.sha256: raise a.Rejected('Fixture store changed during private copy')
        (inputs/'manifest.json').chmod(0o444)
        if digest(inputs/'manifest.json') != manifest_ref.sha256: raise a.Rejected('Fixture manifest changed during copy')
        worker = output/'worker.py'; source = Path(__file__).with_name('recovery_store.py')
        shutil.copyfile(source, worker); worker.chmod(0o444)
        receipt.update(supervisorSha256=digest(Path(__file__)), workerSha256=digest(worker),
                       commandHelperSha256=digest(Path(__file__).with_name('artifact_supervisor.py')))
        paths = {'/input': inputs, '/worker.py': worker}
        argv = ['docker', 'create', '--pull=never', '--name', name, '--label', 'micro.artifact.owner='+owner,
                '--network=none', '--read-only', '--user=1000:1000', '--cap-drop=ALL', '--security-opt=no-new-privileges',
                '--memory=1g', '--memory-swap=1g', '--cpus=1', '--pids-limit=128', '--log-driver=none',
                '--ulimit=fsize=8388608:8388608', '--ulimit=nofile=256:256', '--ulimit=core=0:0',
                '--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=67108864,mode=1777', '--env=HOME=/tmp',
                '--workdir=/tmp', '--entrypoint=python3']
        for destination, source_path in paths.items():
            argv += ['--mount=type=bind,src='+str(source_path)+',dst='+destination+',readonly']
        attempted = True; require_command(command(argv+[IMAGE, '/worker.py'], 'create'))
        created = (output/'create.log').read_text().strip()
        if not re.fullmatch('[0-9a-f]{64}', created): raise a.Rejected('Exact fixture validator container ID missing')
        identifier = created; receipt['containerId'] = identifier
        require_command(command(['docker', 'inspect', identifier], 'inspect-before'))
        receipt['runtime'] = runtime(json.loads((output/'inspect-before.log').read_text())[0], identifier, owner, paths)
        execution = command(['docker', 'start', '--attach', identifier], 'worker', 30)
        require_command(command(['docker', 'inspect', identifier], 'inspect-after'))
        actual = json.loads((output/'inspect-after.log').read_text())[0]; runtime(actual, identifier, owner, paths)
        receipt['state'] = actual['State']
        if actual['State']['Running'] or actual['State']['OOMKilled'] or execution['limitFailure']:
            raise a.Rejected('Fixture validator runtime failed')
        result = json.loads((output/'worker.log').read_bytes()); receipt['worker'] = result
        if execution['exitCode'] == 0 and actual['State']['ExitCode'] == 0 and result.get('status') == 'validated':
            if result.get('manifestSha256') != manifest_ref.sha256 or result.get('files') != manifest['files']:
                raise a.Rejected('Fixture worker subject differs from collected store')
            receipt['status'] = 'validated'
        elif execution['exitCode'] == actual['State']['ExitCode'] == 1 and result.get('status') == 'failed':
            receipt['status'] = 'rejected'
        else: raise a.Rejected('Fixture validation outcome unavailable')
        retained_files(store, manifest_ref, files)
        if digest(worker) != receipt['workerSha256']: raise a.Rejected('Fixture worker changed')
    except Exception as error:
        failure = error; receipt['status'] = 'failed'
        receipt['failure'] = {'type': type(error).__name__, 'message': str(error)[:1000]}
    finally:
        try:
            receipt['cleanup'] = cleanup_owned(command, output, identifier, IMAGE, owner) if attempted else {'absent': True}
            if not receipt['cleanup']['absent']: raise a.Rejected('Fixture validator cleanup unknown')
        except Exception as error:
            failure = failure or error; receipt['status'] = 'failed'
            receipt['cleanupFailure'] = {'type': type(error).__name__, 'message': str(error)[:1000]}
        receipt['finishedAt'] = datetime.now(timezone.utc).isoformat()
        reference = store.write(directory+'/receipt.json', receipt)
    if failure: raise a.Rejected('Fixture validation failed; retained '+reference.path) from failure
    return reference
