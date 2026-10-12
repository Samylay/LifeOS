"""Authored FAKE terminal signer bytes for real private controller replay.

No real keys, APK parsing, build execution or signing occurs. The public
certificate parser, FAKE source identity and original root use scoped seams.
Production build, source, snapshot and normalized validators remain active.
"""
import copy
from datetime import datetime, timezone
import hashlib
import json
import admission as a
import signing_normalization as n
import signing_authority as authority
from fake_signing_authority import authorization as fake_authorization

KEY = b'FAKE synthetic signer key, never a JKS or actual key'


def fake_certificate(data):
    if data != KEY:
        raise a.Rejected('FAKE signer key bytes changed')
    return n.CERTIFICATE_SHA


def build_fake_signing(f):
    """Create complete independent protected snapshots with actual FAKE hashes."""
    state = f.fake_signer_root / 'synthetic'
    state.mkdir(mode=0o700)
    owner = 'a'*32
    identifier = 'b'*64
    paths = {'/input/app.apk': state/'unsigned.apk', '/input/debug.keystore': state/'debug.keystore',
             '/tools': state/'tools', '/output': state/'artifacts'}
    contents = {'unsigned.apk': f.store.read(f.unsigned), 'debug.keystore': KEY,
                'artifacts/app.apk': f.store.read(f.signed),
                **{'tools/'+name: (n.KIT_ROOT/name).read_bytes()
                   for name in ('sign_fixture_worker.py', 'inspect_apk.py')}}
    # Both FAKE builds finish by now-1.9; eight 0.1s command observations fit.
    started, finished = f.now-1.85, f.now-1
    iso = lambda epoch: datetime.fromtimestamp(epoch, timezone.utc).isoformat()
    before = {'Id': identifier, 'Name': '/micro-artifact-'+owner, 'Image': a.IMAGE,
        'Path': 'python3', 'Args': ['/tools/sign_fixture_worker.py'],
        'Config': {'User': '1000:1000', 'Labels': {'micro.artifact.owner': owner},
            'Entrypoint': ['python3'], 'Cmd': ['/tools/sign_fixture_worker.py'],
            'Env': n.ENVIRONMENT, 'WorkingDir': '/tmp'},
        'HostConfig': {'NetworkMode': 'none', 'ReadonlyRootfs': True, 'Privileged': False,
            'Memory': 1073741824, 'MemorySwap': 1073741824, 'NanoCpus': 1000000000,
            'PidsLimit': 128, 'CapAdd': None, 'Binds': None, 'VolumesFrom': None,
            'PidMode': '', 'IpcMode': 'private', 'UsernsMode': '', 'CgroupnsMode': 'private',
            'Runtime': 'runc', 'Ulimits': [{'Name': name, 'Soft': value, 'Hard': value}
                for name, value in n.ULIMITS.items()], 'CapDrop': ['ALL'],
            'SecurityOpt': ['no-new-privileges'], 'Devices': [], 'PortBindings': {},
            'ExtraHosts': [], 'LogConfig': {'Type': 'none'},
            'Tmpfs': {'/tmp': 'rw,nosuid,nodev,noexec,size=67108864,mode=1777'}},
        'Mounts': [{'Source': str(source), 'Destination': dest, 'RW': dest=='/output',
                    'Type': 'bind'} for dest, source in paths.items()],
        'State': {'Status': 'created', 'Running': False, 'OOMKilled': False, 'ExitCode': 0, 'Error': ''}}
    after = copy.deepcopy(before)
    after['State'] = {'Status': 'exited', 'Running': False, 'OOMKilled': False,
        'ExitCode': 0, 'Error': '', 'StartedAt': iso(started+0.1), 'FinishedAt': iso(finished-0.1)}
    inspection = {'schema': 'micro.android.apk-inspection/1', 'status': 'inspected',
        'apkSha256': f.signed.sha256, 'apkBytes': f.signed.bytes,
        'certificateSha256': n.CERTIFICATE_SHA,
        'toolSha256': {name: n.TOOLS[name] for name in ('aapt', 'apksigner')},
        'bundle': {'sha256': hashlib.sha256(b'FAKE bundle bytes').hexdigest(), 'bytes': 20,
                   'entryCount': 10, 'declaredExpandedBytes': 100},
        'metadata': {'package': f.binding.package, 'versionCode': 1, 'versionName': '1.0.0',
            'minSdk': 24, 'targetSdk': 36, 'debuggable': False, 'abis': ['x86_64'],
            'permissions': list(f.binding.permissions)},
        'scope': 'artifact identity only; no source, vulnerability, installation or product verdict'}
    worker = {'schema': 'micro.fixture-signing-worker/1', 'status': 'signed',
        'unsignedApkSha256': f.unsigned.sha256, 'publicKeySha256': n.KEY_SHA,
        'inspection': inspection, 'toolSha256': n.TOOLS,
        'scope': 'public synthetic test key only; no production signing authority'}
    raw = {'schema': 'micro.fixture-signing-supervisor/1', 'owner': owner, 'image': a.IMAGE,
        'supervisorSha256': n.PINS['sign_fixture.py'], 'startedAt': iso(started),
        'finishedAt': iso(finished), 'commands': [], 'status': 'signed', 'cleanup': {'absent': True},
        'scope': 'public fixture test signing only',
        'inputs': {'unsignedApkSha256': f.unsigned.sha256, 'unsignedApkBytes': f.unsigned.bytes,
            'publicKeySha256': n.KEY_SHA, 'workerSha256': n.PINS['sign_fixture_worker.py'],
            'inspectorSha256': n.PINS['inspect_apk.py'],
            'commandHelperSha256': n.PINS['artifact_supervisor.py']},
        'runtimePolicy': n.runtime_policy(before, identifier, owner, paths),
        'state': after['State'], 'worker': worker}
    outputs = [identifier+'\n', json.dumps([before]), json.dumps(worker)+'\n',
        json.dumps([after]), json.dumps([after]), identifier+'\n',
        'Error: No such object: '+identifier+'\n', '']
    argvs = [n.create_argv(owner, paths), ['docker', 'inspect', identifier],
        ['docker', 'start', '--attach', identifier], ['docker', 'inspect', identifier],
        ['docker', 'inspect', identifier], ['docker', 'rm', '--force', identifier],
        ['docker', 'inspect', identifier], ['docker', 'ps', '--all', '--quiet', '--no-trunc',
            '--filter', 'name=^/micro-artifact-'+owner+'$', '--filter', 'label=micro.artifact.owner='+owner]]
    for index, name in enumerate(n.COMMANDS):
        data = outputs[index].encode()
        contents[name+'.log'] = data
        raw['commands'].append({'argv': argvs[index], 'exitCode': 1 if name=='cleanup-absent' else 0,
            'seconds': 0.1, 'capturedBytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            'limitFailure': None})
    raw['authorization']=fake_authorization(f.store,f.binding,f.builds,f.unsigned,started-0.01).json()
    contents['receipt.json'] = (json.dumps(raw)+'\n').encode()
    for name, data in contents.items():
        path = state/name
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        path.write_bytes(data)
        path.chmod(0o600)
    with f.checks_test_scope():
        selector=authority.bind_terminal_signer('synthetic',a.Store(f.fake_signer_root).describe('synthetic/receipt.json'))
        snapshot = n.copy_terminal(f.store, selector, 'FAKE-signing-snapshot')
        return f.put(n.replay(snapshot, f.store, f.binding, f.builds, f.now))
