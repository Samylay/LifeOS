#!/usr/bin/env python3
"""Fail-closed local admission over controller-owned bytes.

Registry objects and Store roots are administrative inputs, never product JSON.
These unsigned local receipts confer no publishing or production authority.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import stat
from typing import Any

IMAGE = 'sha256:43778b0b9227ffc8d12a9092f011f09238a77c92b5fcde6a18310757ccef7305'
HEX = re.compile(r'[0-9a-f]{64}')
STORE_BYTES = 8 * 1024**3
STORE_WARNING_BYTES = 7 * 1024**3
PROJECT = re.compile(r'[a-z][a-z0-9-]{0,79}')
IDENTITIES = ('sourceArchive', 'sourceLock', 'policy', 'adapter', 'toolchain',
              'recipe', 'suite', 'recovery', 'npmSeal', 'mavenSeal', 'scannerPolicy')
NATIVE_POLICY = {'image': IMAGE, 'user': '1000:1000', 'network': 'none',
                 'readOnly': True, 'privileged': False, 'capDrop': ['ALL'],
                 'noNewPrivileges': True, 'memoryBytes': 6 * 1024**3,
                 'memorySwapBytes': 6 * 1024**3, 'nanoCpus': 2_000_000_000,
                 'pids': 384, 'credentialFree': True, 'inputsReadOnly': True,
                 'noHostHomeSocketAdb': True}


class Rejected(ValueError):
    pass


def exact(value: Any, keys: set[str], label: str) -> dict:
    if not isinstance(value, dict) or set(value) != keys:
        raise Rejected(label + ': missing or unknown fields')
    return value


def sha(value: Any) -> str:
    if not isinstance(value, str) or not HEX.fullmatch(value):
        raise Rejected('Invalid SHA256 identity')
    return value


def number(value: Any, label: str, minimum: float = 0) -> float:
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or value < minimum:
        raise Rejected('Invalid ' + label)
    return value


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def decode(data: bytes) -> dict:
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value: raise Rejected('Duplicate JSON authority field')
            value[key] = item
        return value
    try:
        value = json.loads(data, object_pairs_hook=pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(Rejected('Nonfinite JSON')))
    except (ValueError, UnicodeError) as error:
        raise Rejected('Invalid evidence JSON') from error
    if not isinstance(value, dict): raise Rejected('Evidence must be an object')
    return value


@dataclass(frozen=True)
class Evidence:
    path: str
    sha256: str
    bytes: int

    def json(self) -> dict:
        return {'path': self.path, 'sha256': self.sha256, 'bytes': self.bytes}

    @classmethod
    def parse(cls, value: dict) -> Evidence:
        exact(value, {'path', 'sha256', 'bytes'}, 'evidence reference')
        if not isinstance(value['path'], str): raise Rejected('Evidence path must be text')
        sha(value['sha256'])
        if type(value['bytes']) is not int or value['bytes'] < 0:
            raise Rejected('Evidence byte count must be nonnegative')
        return cls(**value)


class Store:
    """Bound reads to a supervisor root; reject links, special files and races."""
    def __init__(self, root: Path):
        self.root = Path(root).absolute()
        self._parents(self.root)
        if not self.root.is_dir(): raise Rejected('Supervisor store does not exist')
        if self.root.stat().st_uid != os.getuid() or self.root.stat().st_mode & 0o022:
            raise Rejected('Supervisor store must be owned and not externally writable')

    def budget(self) -> dict:
        total = 0; allocated = 0; count = 0
        for path in self.root.rglob('*'):
            info = path.lstat()
            if stat.S_ISLNK(info.st_mode) or not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
                raise Rejected('Unsupported link/special file in supervisor storage')
            if stat.S_ISREG(info.st_mode):
                if info.st_nlink != 1: raise Rejected('Hardlinked supervisor input is not an independent copy')
                total += info.st_size; allocated += info.st_blocks * 512; count += 1
                if max(total, allocated) > STORE_BYTES: raise Rejected('Supervisor integration store exceeds 8GiB')
        filesystem = os.statvfs(self.root)
        return {'regularBytes': total, 'allocatedBytes': allocated, 'fileCount': count,
                'freeDiskBytes': filesystem.f_bavail * filesystem.f_frsize,
                'maximumBytes': STORE_BYTES, 'warningBytes': STORE_WARNING_BYTES,
                'approachingLimit': max(total, allocated) >= STORE_WARNING_BYTES}

    @staticmethod
    def _parents(path: Path):
        for p in (path, *path.parents):
            if p.is_symlink(): raise Rejected('Symlink in supervisor path')

    def path(self, relative: str) -> Path:
        part = PurePosixPath(relative)
        if not relative or part.is_absolute() or '..' in part.parts or '\\' in relative or part.as_posix() != relative:
            raise Rejected('Evidence leaves supervisor storage')
        path = self.root / relative
        self._parents(path)
        return path

    def read(self, reference: Evidence, limit: int = 2 * 1024**2) -> bytes:
        path = self.path(reference.path)
        if reference.bytes > limit: raise Rejected('Evidence exceeds read budget')
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            before = os.fstat(descriptor)
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size != reference.bytes:
                raise Rejected('Evidence is not the expected regular file')
            data = bytearray()
            while chunk := os.read(descriptor, min(1024**2, limit-len(data)+1)):
                data.extend(chunk)
                if len(data) > limit: raise Rejected('Evidence grew past budget')
            after = os.fstat(descriptor)
            identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
            if identity(before) != identity(after) or identity(path.stat(follow_symlinks=False)) != identity(after):
                raise Rejected('Evidence changed during read')
            if hashlib.sha256(data).hexdigest() != reference.sha256:
                raise Rejected('Evidence hash mismatch')
            return bytes(data)
        finally:
            os.close(descriptor)

    def verify(self, reference: Evidence, limit: int = 2 * 1024**2):
        if self.describe(reference.path, limit) != reference:
            raise Rejected('Evidence hash/byte identity mismatch')

    def json(self, reference: Evidence, limit: int = 2 * 1024**2) -> dict:
        return decode(self.read(reference, limit))

    def describe(self, relative: str, limit: int = 2 * 1024**2) -> Evidence:
        path = self.path(relative)
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            before = os.fstat(descriptor)
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not 0 <= before.st_size <= limit:
                raise Rejected('Cannot reference unbounded or nonregular evidence')
            value = hashlib.sha256(); count = 0
            while chunk := os.read(descriptor, min(1024**2, limit-count+1)):
                count += len(chunk)
                if count > limit: raise Rejected('Evidence grew past budget')
                value.update(chunk)
            after = os.fstat(descriptor)
            identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
            if identity(before) != identity(after) or identity(path.stat(follow_symlinks=False)) != identity(after):
                raise Rejected('Evidence changed during hashing')
            return Evidence(relative, value.hexdigest(), count)
        finally:
            os.close(descriptor)

    def write(self, relative: str, value: dict) -> Evidence:
        path = self.path(relative)
        data = canonical(value) + b'\n'
        observed = self.budget()
        if max(observed['regularBytes'], observed['allocatedBytes']) + len(data) > STORE_BYTES:
            raise Rejected('Supervisor integration store exceeds 8GiB')
        with path.open('xb') as output:
            output.write(data)
        path.chmod(0o400)
        return self.describe(relative)


@dataclass(frozen=True)
class Binding:
    project_id: str
    adapter_id: str
    source_sha: str
    identities: dict[str, Evidence]
    certificate_sha256: str | None
    expires_at: float
    version_code: int = 1
    version_name: str = '1.0.0'
    package: str = 'app.micro.factory.fixture'
    min_sdk: int = 24
    target_sdk: int = 36
    permissions: tuple[str, ...] = ()
    admitted: bool = False
    native_mapping: Evidence | None = None

    def validate(self, store: Store, now: float):
        store.budget()
        if not PROJECT.fullmatch(self.project_id) or self.adapter_id != 'expo-android':
            raise Rejected('Unregistered project or adapter identity')
        if not re.fullmatch(r'[0-9a-f]{40}', self.source_sha): raise Rejected('Exact source commit required')
        if self.package != 'app.micro.factory.fixture' or self.min_sdk != 24 or self.target_sdk != 36:
            raise Rejected('Fixture policy parameters differ from frozen policy')
        if not self.admitted or self.certificate_sha256 is None:
            raise Rejected('Adapter pending trusted signing/input admission')
        sha(self.certificate_sha256)
        if type(self.version_code) is not int or self.version_code != 1 or self.version_name != '1.0.0':
            raise Rejected('Fixture version differs from admitted policy')
        if not isinstance(self.permissions, tuple) or any(not isinstance(v, str) for v in self.permissions) or len(set(self.permissions)) != len(self.permissions):
            raise Rejected('Permissions require an explicit reviewed unique list')
        number(self.expires_at, 'policy expiry')
        if self.expires_at <= now: raise Rejected('Policy admission expired')
        if set(self.identities) != set(IDENTITIES): raise Rejected('Missing or unknown immutable input identities')
        if self.native_mapping is not None: store.verify(self.native_mapping)
        for ref in self.identities.values():
            if not isinstance(ref, Evidence): raise Rejected('Administrative evidence reference required')
            store.verify(ref, 100 * 1024**2 if ref is self.identities['sourceArchive'] else 2 * 1024**2)

    def hashes(self) -> dict[str, str]:
        return {name: self.identities[name].sha256 for name in IDENTITIES}

    def context(self) -> dict:
        return {'projectId': self.project_id, 'adapterId': self.adapter_id,
                'sourceSha': self.source_sha, 'identities': self.hashes()}


def context(value: dict, binding: Binding):
    if value != binding.context(): raise Rejected('Wrong project/source/policy/input authority')


def freshness(value: dict, now: float, max_age: float):
    started = number(value.get('startedAt'), 'start time')
    finished = number(value.get('finishedAt'), 'finish time')
    if finished < started or finished > now or now-finished > max_age:
        raise Rejected('Evidence expired, future-dated or inconsistent')


def state_success(value: dict):
    if not isinstance(value, dict) or value.get('Running') is not False or value.get('OOMKilled') is not False or type(value.get('ExitCode')) is not int or value['ExitCode'] != 0 or value.get('Error') not in ('', None):
        raise Rejected('Container state missing or unsuccessful')


def commands_success(commands: Any, store: Store, approved: list[list[str]] | None = None):
    if not isinstance(commands, list) or not commands: raise Rejected('Actual command receipts missing')
    if approved is not None and [c.get('argv') for c in commands] != approved:
        raise Rejected('Native commands differ from admitted recipe')
    for command in commands:
        exact(command, {'argv', 'exitCode', 'seconds', 'log', 'signal', 'limitFailure'}, 'native command')
        if command['exitCode'] != 0 or type(command['exitCode']) is not int or command['signal'] is not None or command['limitFailure'] is not None:
            raise Rejected('Command failed, crashed or exceeded a budget')
        number(command['seconds'], 'command duration')
        store.read(Evidence.parse(command['log']), 20 * 1024**2)


NATIVE_TMPFS = {'/tmp': 'rw,nosuid,nodev,size=67108864,mode=1777',
                '/work': 'rw,nosuid,nodev,size=8589934592,uid=1000,gid=1000,mode=0700'}
NATIVE_SEEDS = {'/seed/fixture', '/seed/tools', '/seed/patch-preimages.json',
                '/seed/npm-cache', '/seed/gradle-caches', '/seed/verification-metadata.xml'}


def reviewed_adapter(binding: Binding, store: Store) -> dict:
    adapter = store.json(binding.identities['adapter'])
    exact(adapter, {'schema', 'sourceExporterSha256', 'sourceExport', 'nativeInputs'}, 'reviewed adapter')
    if adapter['schema'] != 'micro.android.reviewed-adapter/1': raise Rejected('Unreviewed adapter schema')
    sha(adapter['sourceExporterSha256'])
    return adapter


def validate_tree(value: dict, store: Store) -> list[dict]:
    """Hash the complete admitted tree, rejecting omissions and every link."""
    exact(value, {'path', 'kind', 'files', 'manifestSha256'}, 'sealed input tree')
    base = store.path(value['path'])
    if value['kind'] not in ('directory', 'file'): raise Rejected('Unknown sealed input kind')
    if value['kind'] == 'directory':
        if not base.is_dir(): raise Rejected('Sealed input directory missing')
        paths = []
        for child in base.rglob('*'):
            info = child.lstat()
            if stat.S_ISDIR(info.st_mode): continue
            if not stat.S_ISREG(info.st_mode): raise Rejected('Sealed tree contains link/special file')
            paths.append(child)
    else:
        if not base.is_file(): raise Rejected('Sealed input file missing')
        paths = [base]
    actual = []
    for child in sorted(paths):
        reference = store.describe(child.relative_to(store.root).as_posix(), STORE_BYTES)
        actual.append({'path': child.relative_to(base).as_posix() if value['kind'] == 'directory' else base.name,
                       'bytes': reference.bytes, 'sha256': reference.sha256})
    if not actual or actual != value['files'] or hashlib.sha256(canonical(actual)).hexdigest() != sha(value['manifestSha256']):
        raise Rejected('Complete sealed input manifest differs from actual bytes')
    for row in actual: exact(row, {'path', 'bytes', 'sha256'}, 'sealed file')
    return actual


def source_export(binding: Binding, store: Store) -> tuple[Evidence, dict]:
    adapter = reviewed_adapter(binding, store)
    reference = Evidence.parse(adapter['sourceExport'])
    exported = store.json(reference, 64*1024**2)
    exact(exported, {'schema', 'sourceSha', 'sourceArchiveSha256', 'sourceLock', 'exporterSha256', 'tree'}, 'reviewed source export')
    if exported['schema'] != 'micro.android.source-export/1' or exported['sourceSha'] != binding.source_sha or exported['sourceArchiveSha256'] != binding.identities['sourceArchive'].sha256 or exported['sourceLock'] != binding.identities['sourceLock'].json() or exported['exporterSha256'] != adapter['sourceExporterSha256']:
        raise Rejected('Reviewed source export/archive/lock identity mismatch')
    files = validate_tree(exported['tree'], store)
    lock = binding.identities['sourceLock']
    if exported['tree']['kind'] != 'directory' or {'path': 'package-lock.json', 'sha256': lock.sha256, 'bytes': lock.bytes} not in files:
        raise Rejected('Exported full source lacks exact admitted npm lock')
    return reference, exported


def native_inputs(binding: Binding, store: Store) -> dict:
    adapter = reviewed_adapter(binding, store)
    inputs = store.json(Evidence.parse(adapter['nativeInputs']), 64*1024**2)
    exact(inputs, {'schema', 'sourceExport', 'identities', 'seeds', 'outputRoot'}, 'reviewed native inputs')
    if inputs['schema'] != 'micro.android.native-inputs/1' or inputs['sourceExport'] != adapter['sourceExport']:
        raise Rejected('Native seed/source admission mismatch')
    expected = {name: binding.identities[name].json() for name in ('toolchain', 'npmSeal', 'mavenSeal', 'recipe')}
    if inputs['identities'] != expected or set(inputs['seeds']) != NATIVE_SEEDS:
        raise Rejected('Native seeds lack exact reviewed input identities')
    _, exported = source_export(binding, store)
    if inputs['seeds']['/seed/fixture'] != exported['tree']: raise Rejected('Native fixture differs from admitted source export')
    for tree in inputs['seeds'].values(): validate_tree(tree, store)
    if not store.path(inputs['outputRoot']).is_dir(): raise Rejected('Native output root missing')
    return inputs


def native_execution(binding: Binding, store: Store, inputs: dict) -> dict:
    recipe = store.json(binding.identities['recipe'])
    exact(recipe, {'schema', 'commands', 'execution'}, 'trusted build recipe')
    if recipe['schema'] != 'micro.android.native-recipe/1': raise Rejected('Unknown build recipe')
    execution = recipe['execution']
    exact(execution, {'entrypoint', 'argv', 'environment', 'worker'}, 'trusted native execution')
    if execution['entrypoint'] != ['python3'] or execution['argv'] != ['/seed/tools/native_fixture_job.py', '--offline']:
        raise Rejected('Native recipe does not run fixed offline worker')
    environment = execution['environment']
    if not isinstance(environment, list) or not environment or any(not isinstance(item, str) or '=' not in item for item in environment):
        raise Rejected('Complete native runtime environment missing')
    keys = [item.split('=', 1)[0] for item in environment]
    if len(keys) != len(set(keys)): raise Rejected('Duplicate native environment authority key')
    tools = inputs['seeds']['/seed/tools']
    worker = Evidence.parse(execution['worker'])
    if tools['kind'] != 'directory' or worker.path != tools['path']+'/native_fixture_job.py' or {'path': 'native_fixture_job.py', 'bytes': worker.bytes, 'sha256': worker.sha256} not in tools['files']:
        raise Rejected('Native executed worker differs from pinned complete tools seed')
    store.verify(worker)
    return execution


def native_runtime(value: dict, owner: str, store: Store, binding: Binding):
    """Validate actual Docker readbacks, never normalized policy flags alone."""
    host = value['HostConfig']; config = value['Config']
    expected = NATIVE_POLICY
    if value['Image'] != IMAGE or config['User'] != expected['user'] or config.get('Labels', {}).get('micro.native.owner') != owner:
        raise Rejected('Native Docker identity/owner mismatch')
    if host['NetworkMode'] != 'none' or host['ReadonlyRootfs'] is not True or host.get('Privileged') is not False:
        raise Rejected('Native Docker network/root/privilege mismatch')
    if host['Memory'] != expected['memoryBytes'] or host['MemorySwap'] != expected['memorySwapBytes'] or host['NanoCpus'] != expected['nanoCpus'] or host['PidsLimit'] != expected['pids']:
        raise Rejected('Native Docker resource policy mismatch')
    if host.get('CapDrop') != ['ALL'] or 'no-new-privileges' not in host.get('SecurityOpt', []) or host.get('Devices') or host.get('PortBindings') or host.get('ExtraHosts'):
        raise Rejected('Native Docker exposure/capabilities mismatch')
    allowed_env = {'PATH', 'NODE_VERSION', 'YARN_VERSION', 'JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'ANDROID_USER_HOME', 'EXPO_OFFLINE', 'EXPO_NO_TELEMETRY', 'HOME', 'JAVA_TOOL_OPTIONS'}
    if any(item.split('=', 1)[0] not in allowed_env for item in config.get('Env', [])):
        raise Rejected('Native Docker environment contains unadmitted authority')
    if any(item.startswith('ANDROID_USER_HOME=') and item != 'ANDROID_USER_HOME=/work/home/.android' for item in config.get('Env', [])):
        raise Rejected('Native Android preferences leave private temporary home')
    inputs = native_inputs(binding, store)
    execution = native_execution(binding, store, inputs)
    environment = config.get('Env')
    if not isinstance(environment, list) or any(not isinstance(item, str) or '=' not in item for item in environment):
        raise Rejected('Actual native environment missing')
    keys = [item.split('=', 1)[0] for item in environment]
    if len(keys) != len(set(keys)): raise Rejected('Duplicate actual native environment authority key')
    if config.get('Entrypoint') != execution['entrypoint'] or config.get('Cmd') != execution['argv'] or environment != execution['environment'] or value.get('Path') != execution['entrypoint'][0] or value.get('Args') != execution['argv']:
        raise Rejected('Actual native executable/arguments/environment differ from admitted offline worker')
    if host.get('Tmpfs') != NATIVE_TMPFS: raise Rejected('Native tmpfs budgets/options differ from fixed policy')
    expected_mounts = {dest: str(store.path(tree['path'])) for dest, tree in inputs['seeds'].items()}
    output = store.path(inputs['outputRoot']+'/'+owner+'/output')
    if not output.is_dir(): raise Rejected('Owned native output directory missing')
    expected_mounts['/out'] = str(output)
    destinations = set()
    for mount in value['Mounts']:
        destination = mount['Destination']
        if mount['Type'] == 'tmpfs':
            if destination not in NATIVE_TMPFS or destination in destinations or mount.get('RW') is not True: raise Rejected('Unexpected tmpfs mount')
            destinations.add(destination); continue
        if mount['Type'] != 'bind' or destination in destinations or destination not in expected_mounts:
            raise Rejected('Native Docker mount destination mismatch')
        destinations.add(destination)
        if mount['RW'] is not (destination == '/out') or mount['Source'] != expected_mounts[destination]:
            raise Rejected('Native Docker seed/output identity or access mismatch')
    if destinations - set(NATIVE_TMPFS) != set(expected_mounts): raise Rejected('Exact native offline mounts missing')
    if host.get('LogConfig', {}).get('Type') != 'none': raise Rejected('Unbounded Docker log driver')


def validate_build(reference: Evidence, binding: Binding, store: Store, now: float, max_age: float) -> dict:
    value = store.json(reference)
    exact(value, {'schema', 'context', 'startedAt', 'finishedAt', 'status', 'cleanBuildId',
                  'runtimePolicy', 'runtimeBefore', 'runtimeAfter', 'owner', 'state', 'cleanup', 'commands', 'job', 'unsignedApk'}, 'native supervisor receipt')
    if value['schema'] != 'micro.android.native-build/1' or value['status'] != 'built':
        raise Rejected('Actual native build unavailable or unsuccessful')
    context(value['context'], binding); freshness(value, now, max_age)
    if not re.fullmatch(r'[a-z0-9-]{1,80}', value['cleanBuildId']): raise Rejected('Clean build identity missing')
    if value['runtimePolicy'] != NATIVE_POLICY: raise Rejected('Native runtime policy mismatch')
    observed = [store.json(Evidence.parse(value[key])) for key in ('runtimeBefore', 'runtimeAfter')]
    for raw in observed: native_runtime(raw, value['owner'], store, binding)
    if observed[0]['Id'] != observed[1]['Id'] or observed[1]['State'] != value['state']:
        raise Rejected('Native Docker state/identity changed')
    if not HEX.fullmatch(observed[0].get('Id', '')): raise Rejected('Full native container identity required')
    from datetime import datetime
    def actual_time(raw):
        if not isinstance(raw, str): raise Rejected('Native actual timestamp missing')
        parsed = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        if parsed.tzinfo is None: raise Rejected('Native actual timestamp lacks timezone')
        return parsed.timestamp()
    actual_start = actual_time(observed[1]['State'].get('StartedAt'))
    actual_finish = actual_time(observed[1]['State'].get('FinishedAt'))
    if not value['startedAt'] <= actual_start < actual_finish <= value['finishedAt']:
        raise Rejected('Native actual execution outside supervisor observation')
    state_success(value['state'])
    if value['cleanup'] != {'absent': True}: raise Rejected('Build cleanup unknown')
    recipe = store.json(binding.identities['recipe'])
    exact(recipe, {'schema', 'commands', 'execution'}, 'trusted build recipe')
    if recipe['schema'] != 'micro.android.native-recipe/1': raise Rejected('Unknown build recipe')
    commands_success(value['commands'], store, recipe['commands'])
    apk = Evidence.parse(value['unsignedApk']); store.verify(apk, 512 * 1024**2)
    if apk.bytes <= 0: raise Rejected('Native APK empty')
    job = store.json(Evidence.parse(value['job']))
    if job.get('status') != 'clean-offline-fixture-unsigned-apk' or job.get('offline') is not True:
        raise Rejected('Offline native job did not finish')
    if job.get('apk') != {'bytes': apk.bytes, 'sha256': apk.sha256, 'unsigned': True,
                           'signing': 'No business key or production identity; supervisor signing still pending'}:
        raise Rejected('Native job/actual APK digest mismatch')
    exact(job, {'scope', 'offline', 'startedAt', 'finishedAt', 'commands', 'patches', 'resources', 'apk', 'status'}, 'actual native job receipt')
    freshness(job, now, max_age)
    if not actual_start <= job['startedAt'] <= job['finishedAt'] <= actual_finish:
        raise Rejected('Native job timestamps outside actual execution')
    recorded = job.get('commands')
    if not isinstance(recorded, list) or [c.get('argv') for c in recorded] != recipe['commands'] or any(c.get('exitCode') != 0 for c in recorded):
        raise Rejected('Actual native job/recipe/exit mismatch')
    return value


def validate_build_pair(references: list[Evidence], binding: Binding, store: Store, now: float, max_age: float) -> dict:
    if len(references) != 2 or references[0].path == references[1].path:
        raise Rejected('Two independently retained clean builds required')
    builds = [validate_build(ref, binding, store, now, max_age) for ref in references]
    if builds[0]['cleanBuildId'] == builds[1]['cleanBuildId']:
        raise Rejected('Repeated clean build receipt is not a second build')
    identifiers = [store.json(Evidence.parse(build['runtimeAfter']))['Id'] for build in builds]
    if identifiers[0] == identifiers[1] or builds[0]['owner'] == builds[1]['owner'] or builds[0]['job']['path'] == builds[1]['job']['path'] or builds[0]['job']['sha256'] == builds[1]['job']['sha256']:
        raise Rejected('Two distinct actual native executions/jobs/owners required')
    return {'procedureReproducible': True,
            'byteReproducible': builds[0]['unsignedApk']['sha256'] == builds[1]['unsignedApk']['sha256'],
            'unsignedApkSha256': [b['unsignedApk']['sha256'] for b in builds]}


def validate_inspector(reference: Evidence, apk: Evidence, binding: Binding, store: Store, now: float | None = None, max_age: float = 3600) -> dict:
    receipt = store.json(reference)
    exact(receipt, {'schema', 'owner', 'supervisorSha256', 'startedAt', 'finishedAt', 'status',
                    'commands', 'cleanup', 'limitations', 'inputs', 'runtimePolicy', 'state', 'inspection'}, 'artifact supervisor receipt')
    if receipt.get('schema') != 'micro.android.artifact-supervisor/1' or receipt.get('status') != 'inspected':
        raise Rejected('Bounded artifact inspector receipt missing or failed')
    if now is not None:
        from datetime import datetime
        times = {}
        for key in ('startedAt', 'finishedAt'):
            parsed = datetime.fromisoformat(receipt[key].replace('Z', '+00:00'))
            if parsed.tzinfo is None: raise Rejected('Inspector time lacks timezone')
            times[key] = parsed.timestamp()
        freshness(times, now, max_age)
    if receipt.get('cleanup') != {'absent': True}: raise Rejected('Inspector cleanup unknown')
    inputs = receipt.get('inputs', {})
    if inputs.get('apkSha256') != apk.sha256 or inputs.get('apkBytes') != apk.bytes or inputs.get('image') != IMAGE:
        raise Rejected('Inspector inputs/artifact/image mismatch')
    # Recheck the retained Docker observations using the reviewed supervisor.
    try:
        from .artifact_supervisor import runtime_policy
    except ImportError:
        from artifact_supervisor import runtime_policy
    parent = PurePosixPath(reference.path).parent
    observations = []
    for name in ('inspect-before.log', 'inspect-after.log'):
        raw = store.read(store.describe((parent / name).as_posix()))
        observed = json.loads(raw)
        if not isinstance(observed, list) or len(observed) != 1:
            raise Rejected('Inspector Docker observation missing')
        runtime_policy(observed[0], observed[0]['Id'], IMAGE, receipt['owner'])
        observations.append(observed[0])
    if observations[0]['Id'] != observations[1]['Id'] or observations[1]['State'] != receipt.get('state'):
        raise Rejected('Inspector container identity/state changed')
    # Existing inspector checks actual Docker readbacks, not candidate metadata.
    checks = {'containerId', 'owner', 'image', 'user', 'networkNone', 'readOnly', 'capDrop',
              'noPrivileges', 'memory', 'cpu', 'pids', 'logDriver', 'tmpfs', 'env', 'mounts', 'entrypoint'}
    runtime = receipt.get('runtimePolicy')
    if not isinstance(runtime, dict) or set(runtime) != checks or any(v is not True for v in runtime.values()):
        raise Rejected('Inspector runtime policy missing or invalid')
    state_success(receipt.get('state'))
    # Bind its code to the currently reviewed kit, separate from product source.
    for name, field in [('artifact_supervisor.py', 'supervisorSha256'), ('inspect_apk.py', None)]:
        trusted = hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
        observed = receipt.get(field) if field else inputs.get('inspectorSha256')
        if observed != trusted: raise Rejected('Inspector code identity mismatch')
    commands = receipt.get('commands')
    if not isinstance(commands, list) or not commands: raise Rejected('Inspector command logs missing')
    required = {'create.log', 'inspect-before.log', 'inspection.log', 'inspect-after.log',
                'cleanup-owner.log', 'cleanup-remove.log', 'cleanup-absent.log', 'cleanup-list.log'}
    parent = PurePosixPath(reference.path).parent
    for name in required:
        log = store.describe((parent / name).as_posix(), 1024**2)
        found = [c for c in commands if c.get('sha256') == log.sha256 and c.get('capturedBytes') == log.bytes]
        if not found or any(c.get('limitFailure') is not None for c in found): raise Rejected('Inspector log hashes missing or altered')
        if name == 'cleanup-absent.log':
            if found[0].get('exitCode') == 0 or b'no such object' not in store.read(log).lower(): raise Rejected('Inspector absence not proven')
        elif found[0].get('exitCode') != 0: raise Rejected('Inspector command failed')
    if store.read(store.describe((parent / 'cleanup-list.log').as_posix())).strip():
        raise Rejected('Inspector owned container remains')
    if store.describe((parent / 'app.apk').as_posix(), 512 * 1024**2).sha256 != apk.sha256:
        raise Rejected('Inspector admitted APK copy changed')
    if store.describe((parent / 'inspector.py').as_posix()).sha256 != inputs['inspectorSha256']:
        raise Rejected('Inspector admitted script changed')
    inspected = receipt.get('inspection', {})
    if inspected.get('schema') != 'micro.android.apk-inspection/1' or inspected.get('status') != 'inspected' or inspected.get('apkSha256') != apk.sha256 or inspected.get('apkBytes') != apk.bytes:
        raise Rejected('Actual inspection identity mismatch')
    output = store.read(store.describe((parent / 'inspection.log').as_posix())).decode().splitlines()
    reported = [decode(line.encode()) for line in output if line.startswith('{')]
    if reported != [inspected]: raise Rejected('Inspector output/record mismatch')
    metadata = inspected.get('metadata', {})
    expected = {'package': binding.package, 'versionCode': binding.version_code,
                'versionName': binding.version_name, 'minSdk': binding.min_sdk,
                'targetSdk': binding.target_sdk, 'debuggable': False,
                'permissions': sorted(binding.permissions)}
    if set(metadata) != set(expected) | {'abis'} or any(metadata.get(k) != v for k, v in expected.items()):
        raise Rejected('Package/version/SDK/permission policy mismatch')
    abis = metadata['abis']
    if not isinstance(abis, list) or 'x86_64' not in abis or len(set(abis)) != len(abis) or not set(abis) <= {'x86', 'x86_64', 'armeabi-v7a', 'arm64-v8a'}:
        raise Rejected('APK ABI policy mismatch')
    if inspected.get('certificateSha256') != binding.certificate_sha256:
        raise Rejected('Signing certificate differs from admitted identity')
    toolchain = store.json(binding.identities['toolchain'])
    tool_hashes = toolchain.get('artifactToolsSha256')
    if not isinstance(tool_hashes, dict) or set(tool_hashes) != {'aapt', 'apksigner'} or inspected.get('toolSha256') != tool_hashes:
        raise Rejected('APK tools differ from admitted toolchain')
    for digest in tool_hashes.values(): sha(digest)
    bundle = inspected.get('bundle', {})
    sha(bundle.get('sha256')); number(bundle.get('bytes'), 'bundled asset bytes', 1)
    return inspected


def admit_artifact(record: dict, binding: Binding, store: Store, now: float, max_age: float = 3600) -> dict:
    binding.validate(store, now)
    exact(record, {'schema', 'context', 'startedAt', 'finishedAt', 'expiresAt', 'target',
                   'apk', 'inspector', 'builds', 'signing', 'preflight'}, 'artifact record')
    if record['schema'] != 'micro.android.artifact-record/1' or record['target'] != 'local-benchmark':
        raise Rejected('Artifact record has no admitted local target')
    context(record['context'], binding); freshness(record, now, max_age)
    expires = number(record['expiresAt'], 'artifact expiry')
    if not now < expires <= min(binding.expires_at, record['finishedAt'] + max_age): raise Rejected('Artifact admission expired or overlong')
    validate_preflight(record['preflight'], binding, store, now)
    apk = Evidence.parse(record['apk']); store.verify(apk, 512 * 1024**2)
    if apk.bytes <= 0: raise Rejected('Signed APK empty')
    refs = [Evidence.parse(r) for r in record['builds']]
    comparison = validate_build_pair(refs, binding, store, now, max_age)
    signing = store.json(Evidence.parse(record['signing']))
    exact(signing, {'schema', 'context', 'status', 'startedAt', 'finishedAt', 'unsignedApkSha256',
                    'signedApkSha256', 'certificateSha256', 'exitCode', 'cleanup', 'log'}, 'supervisor signing receipt')
    context(signing['context'], binding); freshness(signing, now, max_age)
    if signing['schema'] != 'micro.android.signing/1' or signing['status'] != 'signed' or type(signing['exitCode']) is not int or signing['exitCode'] != 0 or signing['cleanup'] != {'absent': True}:
        raise Rejected('Trusted signing unavailable or unsuccessful')
    if signing['unsignedApkSha256'] != comparison['unsignedApkSha256'][0] or signing['signedApkSha256'] != apk.sha256 or signing['certificateSha256'] != binding.certificate_sha256:
        raise Rejected('Signing/source/build/artifact identity mismatch')
    store.read(Evidence.parse(signing['log']), 1024**2)
    inspection = validate_inspector(Evidence.parse(record['inspector']), apk, binding, store, now, max_age)
    return {'schema': 'micro.android.artifact-admission/1', 'status': 'admitted-for-local-device-gates',
            'target': 'local-benchmark', 'context': binding.context(), 'apkSha256': apk.sha256,
            'recordSha256': hashlib.sha256(canonical(record)).hexdigest(), 'expiresAt': expires,
            'metadata': inspection['metadata'], 'certificateSha256': binding.certificate_sha256,
            'comparison': comparison, 'publishAuthorized': False, 'productionApproved': False}


def validate_preflight(value: dict, binding: Binding, store: Store, now: float):
    # Late import avoids a module cycle. Same validators power standalone
    # artifact admission and the graph; no weaker JSON-only admission route.
    try:
        from .pipeline import Stage, JobContext, Observation, validate_observation
    except ImportError:
        from pipeline import Stage, JobContext, Observation, validate_observation
    stages = (Stage.SOURCE, Stage.SOURCE_SECURITY, Stage.CHECKS)
    exact(value, {s.value for s in stages}, 'artifact preflight')
    for stage in stages:
        reference = Evidence.parse(value[stage.value])
        report = store.json(reference)
        job = JobContext(binding, store, report.get('runId'), str(PurePosixPath(reference.path).parent), stage, (), None)
        checked = validate_observation(Observation(reference), job, now)
        if checked['status'] != 'passed': raise Rejected('Artifact mandatory preflight stage did not pass')


def native_mapping_context(reference: Evidence, binding: Binding, store: Store) -> tuple[dict, dict, list[dict]]:
    if binding.native_mapping is None or reference != binding.native_mapping:
        raise Rejected('No independently admitted operator native-component map')
    mapping = store.json(reference)
    exact(mapping, {'schema', 'context', 'status', 'apkSha256', 'sourceLockSha256', 'nativeClosure',
                    'packagedReceipt', 'packagedReport', 'libraryMappings', 'runtimeInputPurls',
                    'reviewEvidence', 'startedAt', 'finishedAt', 'expiresAt'}, 'operator native map')
    context(mapping['context'], binding)
    if mapping['schema'] != 'micro.android.native-component-map/1' or mapping['status'] != 'independently-reviewed':
        raise Rejected('Native component mapping remains pending review')
    if mapping['sourceLockSha256'] != binding.identities['sourceLock'].sha256:
        raise Rejected('Native map uses wrong npm lock')
    closure = store.json(Evidence.parse(mapping['nativeClosure']))
    exact(closure, {'schema', 'context', 'status', 'sourceLockSha256', 'mavenSealSha256',
                    'recipeSha256', 'mavenGraphs', 'componentPurls', 'nativeBuilds', 'evidence'}, 'reviewed native closure')
    context(closure['context'], binding)
    if closure['schema'] != 'micro.android.native-closure/1' or closure['status'] != 'complete-independent-review' or closure['sourceLockSha256'] != binding.identities['sourceLock'].sha256 or closure['mavenSealSha256'] != binding.identities['mavenSeal'].sha256 or closure['recipeSha256'] != binding.identities['recipe'].sha256:
        raise Rejected('Complete reviewed native input closure unavailable')
    if not isinstance(closure['mavenGraphs'], dict) or not 0 < len(closure['mavenGraphs']) <= 1000:
        raise Rejected('Resolved Maven graphs missing')
    manifests = []
    for name, value in sorted(closure['mavenGraphs'].items()):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+\.json', name): raise Rejected('Unsafe Maven graph basename')
        graph = Evidence.parse(value); store.verify(graph, 8*1024**2)
        manifests.append({'path': name, 'bytes': graph.bytes, 'sha256': graph.sha256})
    if sum(row['bytes'] for row in manifests) > 64*1024**2: raise Rejected('Resolved Maven graph aggregate exceeds 64MiB')
    if not isinstance(closure['nativeBuilds'], list) or len(closure['nativeBuilds']) != 2:
        raise Rejected('Native closure needs two retained build observations')
    if not isinstance(closure['evidence'], list) or not closure['evidence']: raise Rejected('Native closure evidence missing')
    for value in closure['evidence']: store.verify(Evidence.parse(value), 20*1024**2)
    return mapping, closure, manifests


def validate_native_mapping(reference: Evidence, binding: Binding, store: Store, artifact: str,
                            worker: dict, now: float, max_age: float = 3600) -> dict:
    """Separate conservative operator review from source-scanner input coverage.

    A filename, hash or mapper comment does not establish component versions.
    Only an administrative map pin plus exact structured retained review evidence
    can complete the local artifact gate. No actual mapping is supplied by default.
    """
    mapping, closure, manifests = native_mapping_context(reference, binding, store)
    freshness(mapping, now, max_age)
    build_refs = [Evidence.parse(v) for v in closure['nativeBuilds']]
    validate_build_pair(build_refs, binding, store, now, max_age)
    expires = number(mapping['expiresAt'], 'native mapping expiry')
    if not now < expires <= min(binding.expires_at, mapping['finishedAt']+max_age): raise Rejected('Native map expired')
    if mapping['apkSha256'] != artifact: raise Rejected('Native map identifies wrong signed APK')
    try:
        from . import security_native as scanner
    except ImportError:
        import security_native as scanner
    inventory = scanner.validate_inventory(worker['reports'], binding.identities['sourceLock'].sha256, manifests)
    raw_inventory = worker['reports']['trusted.inventory.json']
    if inventory['mavenStatus'] != 'resolved-inputs-scanned': raise Rejected('Actual resolved Maven inputs missing')
    components = worker['reports']['sbom.cdx.json']['components']
    known = {c.get('purl', '').split('?')[0] for c in components}
    declared = closure['componentPurls']
    if not isinstance(declared, list) or not declared or len(set(declared)) != len(declared) or set(declared) != known or any(not re.fullmatch(r'pkg:(?:npm|maven)/[^\s@]+@[^\s@]+', item) for item in declared):
        raise Rejected('Native closure component PURLs differ from actual scanned exact inputs')
    runtime = set()
    from urllib.parse import quote
    for item in raw_inventory['lockEntries']:
        if item['dev'] is not True:
            runtime.add('pkg:npm/'+'/'.join(quote(part, safe='') for part in item['name'].split('/'))+'@'+quote(item['version'], safe=''))
    for item in raw_inventory['maven']['entries']:
        if item.get('classification') not in ('runtime-input', 'build-only'): raise Rejected('Unclassified resolved native component')
        if item['classification'] == 'runtime-input': runtime.add(item['purl'])
    if not isinstance(mapping['runtimeInputPurls'], list) or len(set(mapping['runtimeInputPurls'])) != len(mapping['runtimeInputPurls']) or set(mapping['runtimeInputPurls']) != runtime:
        raise Rejected('Native map omits or substitutes relevant runtime input versions')
    report_ref = Evidence.parse(mapping['packagedReport']); packaged = store.json(report_ref, 64*1024**2)
    exact(packaged, {'kind', 'apkSha256', 'apkBytes', 'files', 'expandedBytes', 'limits'}, 'actual packaged APK inventory')
    if packaged['kind'] != 'packaged-APK-files' or packaged['apkSha256'] != artifact or type(packaged['apkBytes']) is not int or not 0 < packaged['apkBytes'] <= 512*1024**2:
        raise Rejected('Packaged inventory APK identity unavailable')
    raw_ref = Evidence.parse(mapping['packagedReceipt']); raw = store.json(raw_ref, 64*1024**2)
    validate_scanner_supervisor(raw, 'packaged', now, max_age)
    source = [f for f in raw.get('sourceFiles', []) if f.get('path') == 'app.apk']
    if source != [{'path': 'app.apk', 'sha256': artifact, 'bytes': packaged['apkBytes']}]: raise Rejected('Packaged sandbox did not receive exact APK')
    output = store.describe(str(PurePosixPath(raw_ref.path).parent/'stdout.json'), 64*1024**2)
    if output.sha256 != raw.get('workerSha256') or store.json(output, 64*1024**2) != packaged or raw.get('worker') != packaged:
        raise Rejected('Packaged raw output/report bytes differ')
    if not isinstance(packaged['files'], list) or not 0 < len(packaged['files']) <= 30000: raise Rejected('Packaged file inventory missing')
    libraries = {}; paths = set()
    for entry in packaged['files']:
        path = entry.get('path')
        if not isinstance(path, str) or path in paths or PurePosixPath(path).is_absolute() or '..' in PurePosixPath(path).parts or '\\' in path:
            raise Rejected('Unsafe or duplicate packaged inventory path')
        paths.add(path)
        number(entry.get('bytes'), 'packaged entry bytes')
        if entry.get('kind') == 'native-library':
            if not re.fullmatch(r'lib/(?:x86|x86_64|armeabi-v7a|arm64-v8a)/[^/]+\.so', path): raise Rejected('Unsupported native library path')
            sha(entry.get('sha256')); libraries[path] = entry
    if not libraries: raise Rejected('Native library inventory missing')
    mappings = mapping['libraryMappings']
    if not isinstance(mappings, list) or len(mappings) != len(libraries): raise Rejected('Native libraries incompletely mapped')
    mapped = set()
    for item in mappings:
        exact(item, {'path', 'sha256', 'bytes', 'componentPurls', 'evidence'}, 'reviewed library mapping')
        if item['path'] not in libraries or item['path'] in mapped: raise Rejected('Native library mapping path missing/duplicate')
        mapped.add(item['path']); entry = libraries[item['path']]
        if item['sha256'] != entry['sha256'] or item['bytes'] != entry['bytes']: raise Rejected('Native library bytes changed')
        purls = item['componentPurls']
        if not isinstance(purls, list) or not purls or len(set(purls)) != len(purls) or not set(purls) <= known:
            raise Rejected('Native library maps to unknown or unversioned input component')
        if not isinstance(item['evidence'], list) or not item['evidence']: raise Rejected('Physical native component review evidence missing')
        for value in item['evidence']:
            proof = store.json(Evidence.parse(value))
            exact(proof, {'schema', 'context', 'status', 'apkSha256', 'path', 'sha256', 'bytes',
                          'componentPurls', 'method', 'sources'}, 'native component review evidence')
            context(proof['context'], binding)
            if proof['schema'] != 'micro.android.component-evidence/1' or proof['status'] != 'reviewed' or proof['method'] != 'reviewed-input-and-build-linkage' or proof['apkSha256'] != artifact or any(proof[k] != item[k] for k in ('path', 'sha256', 'bytes', 'componentPurls')):
                raise Rejected('Native mapping lacks exact independent input/build linkage review')
            if not isinstance(proof['sources'], list) or not proof['sources']: raise Rejected('Native mapping linkage evidence is empty')
            sources = [Evidence.parse(source) for source in proof['sources']]
            for source in sources: store.verify(source, 20*1024**2)
            input_refs = [binding.identities['sourceLock'], *[Evidence.parse(v) for v in closure['mavenGraphs'].values()]]
            if not any(source in build_refs for source in sources) or not any(source in input_refs for source in sources):
                raise Rejected('Native mapping needs actual build and resolved-input evidence, not mapper comments')
    review = store.json(Evidence.parse(mapping['reviewEvidence']))
    exact(review, {'schema', 'context', 'status', 'apkSha256', 'nativeClosureSha256',
                   'packagedReportSha256', 'libraryMappingsSha256', 'runtimeInputPurlsSha256'}, 'operator native review')
    context(review['context'], binding)
    if review['schema'] != 'micro.android.native-review/1' or review['status'] != 'approved-local-benchmark' or review['apkSha256'] != artifact or review['nativeClosureSha256'] != Evidence.parse(mapping['nativeClosure']).sha256 or review['packagedReportSha256'] != report_ref.sha256 or review['libraryMappingsSha256'] != hashlib.sha256(canonical(mappings)).hexdigest() or review['runtimeInputPurlsSha256'] != hashlib.sha256(canonical(mapping['runtimeInputPurls'])).hexdigest():
        raise Rejected('Native review differs from exact packaged/input mapping')
    return {'status': 'complete-local-reviewed', 'scope': 'local-benchmark', 'nativeMapSha256': reference.sha256,
            'apkSha256': artifact, 'libraryCount': len(libraries), 'inputComponentCount': len(known),
            'rawScannerScope': inventory['finalArtifactCoverage'], 'productionApproved': False}


def validate_scanner_supervisor(raw: dict, expected_mode: str, now: float | None = None, max_age: float = 3600):
    """Recheck actual schema-2 owner and scoped cleanup observations."""
    try:
        from . import security_native as scanner
    except ImportError:
        import security_native as scanner
    if raw.get('schema') != 2 or raw.get('mode') != expected_mode or raw.get('failure') or type(raw.get('containerExitCode')) is not int or raw['containerExitCode'] != 0 or raw.get('authority') != scanner.authority():
        raise Rejected('Actual scanner receipt failed or authority changed')
    if now is not None:
        from datetime import datetime
        times = {}
        for key in ('startedAt', 'finishedAt'):
            value = raw.get(key)
            if not isinstance(value, str): raise Rejected('Actual scanner timestamp unavailable')
            parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
            if parsed.tzinfo is None: raise Rejected('Actual scanner timestamp lacks timezone')
            times[key] = parsed.timestamp()
        freshness(times, now, max_age)
    label = raw.get('ownerLabel')
    if not isinstance(label, dict) or set(label) != {scanner.OWNER_LABEL} or not isinstance(label[scanner.OWNER_LABEL], str) or not re.fullmatch(r'[0-9a-f]{32}', label[scanner.OWNER_LABEL]):
        raise Rejected('Scanner owner label unavailable')
    owner = label[scanner.OWNER_LABEL]; name = raw.get('containerName'); identifier = raw.get('containerId')
    if not isinstance(identifier, str) or not HEX.fullmatch(identifier): raise Rejected('Scanner container ID unavailable')
    if name != 'micro-native-security-'+owner: raise Rejected('Scanner owned name mismatch')
    for key in ('inspectBefore', 'inspectAfter'):
        scanner.owned_identity(raw[key], name, owner, identifier)
        scanner.validate_sandbox(raw[key])
    state_success(raw['inspectAfter']['State'])
    cleanup = raw.get('cleanup')
    required = {'absent', 'errors', 'ownershipInspect', 'containerId', 'inspectAfter',
                'beforeRemovalInspect', 'remove', 'removeExitCode', 'absenceInspect', 'scopedList'}
    if not isinstance(cleanup, dict) or not required <= set(cleanup) or not set(cleanup) <= required | {'kill'} or cleanup['absent'] is not True or cleanup['errors'] != [] or cleanup['containerId'] != identifier or cleanup['inspectAfter'] != raw['inspectAfter'] or type(cleanup['removeExitCode']) is not int or cleanup['removeExitCode'] != 0:
        raise Rejected('Scanner scoped cleanup missing or failed')
    for key in ('ownershipInspect', 'beforeRemovalInspect', 'remove', 'scopedList'):
        command = exact(cleanup[key], {'exitCode', 'stdout', 'stderr'}, 'scanner cleanup command')
        if type(command['exitCode']) is not int or command['exitCode'] != 0: raise Rejected('Scanner cleanup command failed')
    for key in ('ownershipInspect', 'beforeRemovalInspect'):
        observed = json.loads(cleanup[key]['stdout'])
        if not isinstance(observed, list) or len(observed) != 1: raise Rejected('Scanner cleanup owner readback missing')
        scanner.owned_identity(observed[0], name, owner, identifier)
    absence = exact(cleanup['absenceInspect'], {'exitCode', 'stdout', 'stderr'}, 'scanner absence command')
    if type(absence['exitCode']) is not int or absence['exitCode'] != 1 or not re.search(r'no such object:\s*'+re.escape(identifier)+r'(?:\s|$)', absence['stderr']+absence['stdout'], re.I) or cleanup['scopedList']['stdout'].strip():
        raise Rejected('Scanner absence is unknown or retained owner exists')
    if 'kill' in cleanup:
        stopped = exact(cleanup['kill'], {'exitCode', 'stdout', 'stderr'}, 'owned scanner stop')
        if type(stopped['exitCode']) is not int or stopped['exitCode'] != 0: raise Rejected('Owned scanner stop failed')
