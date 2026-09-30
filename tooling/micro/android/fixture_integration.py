#!/usr/bin/env python3
"""Administrative preparation of the fixed fixture's unsigned offline jobs.

No CLI accepts product paths or grants admission. Root reviews the immutable
assembly manifest before calling run_two_unsigned_builds. A draft registry never
confers signing, scanner, device, recovery, CI or production approval.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import re
import stat
import time
from uuid import uuid4

import admission as a
from pipeline import CONTROLLER_ROOT, Registry
from source_export import ExportedFixture

CONTROLLER = CONTROLLER_ROOT.parent
KIT = Path(__file__).absolute().parent
SOURCE_SHA = '8cfb316455a451d2781bfd4dc589acb91bb7ef52'
LOCK_SHA = 'ae8bbc085fd039716dde9ba98c1039069b93455972f42659c8dccc5cb66fb282'
LOCK_BYTES = 467565
ORIGINAL_EXPORT_SHA = 'db2ee3aa090d337b433ca0a3ac6dc6eed9db1faf9adaf30bc75a136626c2bdf5'
NPM_SEAL_SHA = 'b6366b6c29b8bc83eb38661ee9b0361fc47934460e3c807a88634f6d1cea5fd3'
SOURCE_SCAN_SHA = 'c1ab44d150118d2b0abbe0f4f5219a0646f88f2040386a3cc9864998c3f45f16'
PUBLIC_KEY_SHA = '221e0a3106aa4c3ccc154e0a418b55020b3f9ea6e84f92e8749cd9e2f39f5e58'
DIAGNOSTICS_SHA = '0325c23e906b7d6b150faac27eaa7a30dacb3bf695ab46ea70266c3cdcf8a56e'
PROVENANCE_SOURCES = {
    'sourceScan':'native-security/current-admitted-export-source-scan/receipt.json',
    'sourceWorker':'native-security/current-admitted-export-source-scan/stdout.json',
    'databaseReceipt':'native-security/database-receipt.json',
    'sourceCopyLineage':'native-security/admitted-current-export-source-copy.json',
    'toolchainVerification':'android-builder/receipts/final-verification-summary.json',
    'toolchainReport':'android-builder/FINALREPORT.md',
    'signerPublicInput':'native-acquisition/public-benchmark-signing-input/debug.keystore',
    'signerProvenance':'native-acquisition/public-benchmark-signing-input/provenance.json',
    'nativeAcquisition':'native-acquisition/maven-attempt11/receipts/maven-acquisition.json',
    'nativeJob':'native-acquisition/maven-attempt11/output/native-job.json',
}
CONTROLLER_CODE = ('fixture_integration.py','offline_native_supervisor.py','native_acquire.py',
                   'admission.py','pipeline.py','source_export.py')
TOOLS = ('native_fixture_job.py', 'native_failure_diagnostics.py', 'npm_fixture_job.py', 'trusted_repositories.init.gradle',
         'locked_local_maven.py', 'locked-local-maven-manifest.json',
         'trusted_vendor_adapter.py', 'trusted-vendor-gradle-adapter.json')
ENVIRONMENT = ['PATH=/opt/jdk17/bin:/opt/gradle/bin:/usr/local/bin:/usr/bin:/bin',
               'NODE_VERSION=24.19.0', 'YARN_VERSION=1.22.22', 'JAVA_HOME=/opt/jdk17',
               'ANDROID_HOME=/opt/android-sdk', 'ANDROID_SDK_ROOT=/opt/android-sdk',
               'EXPO_OFFLINE=1', 'EXPO_NO_TELEMETRY=1']
COMMANDS = [['npm', 'ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'],
            ['node', './node_modules/expo/bin/cli', 'prebuild', '--platform', 'android', '--no-install'],
            ['/opt/gradle/bin/gradle', '-p', 'android', '--no-daemon', '--max-workers=1',
             '--no-build-cache', '--no-configuration-cache', '--console=plain', '--stacktrace',
             '--info', '--init-script=/seed/tools/trusted_repositories.init.gradle', '--offline',
             '--dependency-verification=strict', 'app:assembleRelease']]
CAPS = {'npm-cache': 1024**3, 'gradle-caches': 4*1024**3,
        'verification-metadata.xml': 8*1024**2, 'patch-preimages.json': 2*1024**2}


def _identity(info):
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns


def _hash_file(path: Path, limit: int) -> dict:
    a.Store._parents(path)
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_uid != os.getuid() or not 0 <= before.st_size <= limit:
            raise a.Rejected('Source must be an owned bounded independent regular file')
        value = hashlib.sha256(); count = 0
        while chunk := os.read(descriptor, min(1024**2, limit-count+1)):
            count += len(chunk)
            if count > limit: raise a.Rejected('Copy source exceeds byte budget')
            value.update(chunk)
        after = os.fstat(descriptor)
        if _identity(before) != _identity(after) or _identity(path.lstat()) != _identity(after):
            raise a.Rejected('Copy source changed while hashing')
        return {'bytes': count, 'sha256': value.hexdigest()}
    finally:
        os.close(descriptor)


def inventory(path: Path, limit: int) -> dict:
    """Observe every regular file before any copy; never execute input code."""
    path = Path(path).absolute(); a.Store._parents(path)
    if path.is_dir():
        kind = 'directory'; paths = []
        for child in path.rglob('*'):
            info = child.lstat()
            if stat.S_ISDIR(info.st_mode): continue
            if not stat.S_ISREG(info.st_mode): raise a.Rejected('Seed link/special file forbidden')
            paths.append(child)
    else:
        kind = 'file'; paths = [path]
    rows = []; total = 0
    for child in sorted(paths):
        fact = _hash_file(child, min(limit, 256*1024**2))
        total += fact['bytes']
        if total > limit or len(rows) >= 100000: raise a.Rejected('Complete seed inventory exceeds budget')
        rows.append({'path': child.relative_to(path).as_posix() if kind == 'directory' else path.name, **fact})
    if not rows: raise a.Rejected('Empty seed inventory')
    return {'kind': kind, 'files': rows, 'manifestSha256': hashlib.sha256(a.canonical(rows)).hexdigest()}


def controller_authority() -> dict:
    return {name:_hash_file(KIT/name,2*1024**2) for name in CONTROLLER_CODE}


@dataclass(frozen=True)
class AdministrativeAcquisition:
    """An existing supervisor receipt pair selected outside product inputs."""
    attempt: str
    supervisor: a.Evidence
    job: a.Evidence
    fixture: dict

    def sources(self) -> dict[str,str]:
        return {'nativeAcquisition':self.supervisor.path,'nativeJob':self.job.path}


def bind_acquisition(attempt: str, supervisor: a.Evidence, job: a.Evidence) -> AdministrativeAcquisition:
    """No future attempt or failed calibration can acquire a success binding."""
    if not isinstance(attempt,str) or not re.fullmatch(r'maven-attempt[1-9][0-9]{0,3}',attempt):
        raise a.Rejected('Existing fixed administrative acquisition attempt required')
    paths = ('native-acquisition/'+attempt+'/receipts/maven-acquisition.json',
             'native-acquisition/'+attempt+'/output/native-job.json')
    documents = []
    for reference, relative in zip((supervisor,job),paths):
        if not isinstance(reference,a.Evidence) or reference.path != relative:
            raise a.Rejected('Exact administrative acquisition receipt path required')
        source = CONTROLLER/relative
        fact = _hash_file(source,2*1024**2)
        if fact != {'sha256':reference.sha256,'bytes':reference.bytes}:
            raise a.Rejected('Actual selected acquisition bytes differ from review')
        descriptor = os.open(source,os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            before = os.fstat(descriptor); data = bytearray()
            if not stat.S_ISREG(before.st_mode) or before.st_size != reference.bytes:
                raise a.Rejected('Selected acquisition read identity changed')
            while chunk := os.read(descriptor,min(1024**2,reference.bytes-len(data)+1)):
                data.extend(chunk)
                if len(data) > reference.bytes: raise a.Rejected('Selected acquisition grew beyond reviewed bytes')
            if _identity(before) != _identity(os.fstat(descriptor)) or _identity(before) != _identity(source.lstat()) or hashlib.sha256(data).hexdigest() != reference.sha256:
                raise a.Rejected('Selected acquisition changed while reading')
            document = a.decode(data)
        finally: os.close(descriptor)
        if _hash_file(source,2*1024**2) != fact: raise a.Rejected('Acquisition changed during selection')
        documents.append(document)
    observed, worker = documents
    if (observed.get('status') != 'native-acquisition-task-closure-complete-offline-proof-pending'
            or observed.get('cleanupFailures') != [] or observed.get('image') != a.IMAGE
            or worker.get('status') != 'trusted-fixture-native-task-closure-acquired'
            or worker.get('offline') is not False):
        raise a.Rejected('Selected acquisition has no successful scoped-clean task closure')
    a.state_success(observed.get('clientState'))
    fixture = inventory(CONTROLLER/'native-acquisition'/attempt/'protected/fixture',100*1024**2)
    return AdministrativeAcquisition(attempt,supervisor,job,fixture)


def reserve(store: a.Store, trees: list[dict]) -> dict:
    before = store.budget()
    logical = sum(row['bytes'] for tree in trees for row in tree['files'])
    allocated = sum(((row['bytes']+4095)//4096)*4096 for tree in trees for row in tree['files'])
    # Directory and retained evidence overhead are reserved before first write.
    overhead = 64*1024**2 + sum(len(tree['files'])*4096 for tree in trees)
    increment = max(logical, allocated)+overhead
    if max(before['regularBytes'], before['allocatedBytes'])+increment > a.STORE_BYTES:
        raise a.Rejected('Copies would exceed unchanged8GiB integration Store')
    if before['freeDiskBytes'] < 30*1024**3+increment:
        raise a.Rejected('Copies must preserve30GiB filesystem headroom')
    return {'before': before, 'logicalCopyBytes': logical, 'allocatedCopyBytes': allocated,
            'reservedOverheadBytes': overhead, 'reservedBytes': increment}


def _copy_file(source: Path, destination: Path, expected: dict):
    descriptor = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_uid != os.getuid() or before.st_size != expected['bytes']:
            raise a.Rejected('Copy input type/size/owner changed')
        value = hashlib.sha256(); count = 0
        with destination.open('xb') as output:
            while chunk := os.read(descriptor, min(1024**2, expected['bytes']-count+1)):
                count += len(chunk)
                if count > expected['bytes']: raise a.Rejected('Copy source grew')
                output.write(chunk); value.update(chunk)
        after = os.fstat(descriptor)
        if (_identity(before) != _identity(after) or _identity(source.lstat()) != _identity(after)
                or count != expected['bytes'] or value.hexdigest() != expected['sha256']):
            raise a.Rejected('Copied bytes differ from independently reviewed input')
        destination.chmod(0o444)
    finally:
        os.close(descriptor)


def _copy_tree(store: a.Store, source: Path, relative: str, expected: dict, limit: int) -> dict:
    """Internal copy primitive, callers must bind fixed administrative source roles."""
    a.exact(expected, {'kind', 'files', 'manifestSha256'}, 'operator-reviewed seed inventory')
    if inventory(source, limit) != expected: raise a.Rejected('Seed differs from reviewed complete inventory')
    reserve(store, [expected])
    destination = store.path(relative)
    if destination.exists(): raise a.Rejected('Fresh independent seed copy required')
    if expected['kind'] == 'directory': destination.mkdir(mode=0o700)
    for row in expected['files']:
        if expected['kind'] == 'directory':
            target = store.path(relative+'/'+row['path']); target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            original = source/row['path']
        else:
            target = destination; original = source
        _copy_file(original, target, row)
    if inventory(source, limit) != expected: raise a.Rejected('Seed changed across complete copy')
    sealed = expected
    if expected['kind'] == 'file':
        files = [{**expected['files'][0],'path':destination.name}]
        sealed = {**expected,'files':files,'manifestSha256':hashlib.sha256(a.canonical(files)).hexdigest()}
    result = {'path': relative, **sealed}
    a.validate_tree(result, store)
    if expected['kind'] == 'directory':
        for child in destination.rglob('*'):
            if child.is_dir(): child.chmod(0o555)
        destination.chmod(0o555)
    return result


def copy_seed(store: a.Store, slot: str, seal_owner: str | None, reviewed: dict, assembly_owner: str) -> dict:
    if store.root != CONTROLLER_ROOT or store.root.stat().st_mode & 0o077:
        raise a.Rejected('Fixed dedicated owned700 Store required')
    if slot not in CAPS or not re.fullmatch('[0-9a-f]{32}', assembly_owner):
        raise a.Rejected('Unknown fixed seed role/assembly owner')
    if slot == 'npm-cache':
        if seal_owner is not None: raise a.Rejected('npm source is fixed sealed-npm')
        source = CONTROLLER/'native-acquisition/sealed-npm/npm-cache'
        return _copy_tree(store, source, 'assemblies/'+assembly_owner+'/inputs/'+slot, reviewed, CAPS[slot])
    if not isinstance(seal_owner, str) or not re.fullmatch('[0-9a-f]{32}', seal_owner):
        raise a.Rejected('Fixed native seal generated owner required')
    # The verified sealer already writes an independent protected Store tree.
    # Reuse its exact bytes rather than duplicating a potentially4GiB closure.
    relative = 'sealed-native/'+seal_owner+'/'+slot
    source = store.path(relative)
    if inventory(source, CAPS[slot]) != reviewed: raise a.Rejected('Native seal bytes differ from review')
    tree = {'path': relative, **reviewed}; a.validate_tree(tree, store)
    return tree


def copy_tools(store: a.Store, assembly_owner: str, reviewed: dict[str, a.Evidence]) -> dict:
    if store.root != CONTROLLER_ROOT or store.root.stat().st_mode & 0o077 or not re.fullmatch('[0-9a-f]{32}',assembly_owner):
        raise a.Rejected('Fixed owned Store/generated assembly owner required')
    if set(reviewed) != set(TOOLS): raise a.Rejected('Exactly eight approved offline tool files required')
    rows = []
    for name in sorted(TOOLS):
        ref = reviewed[name]
        if name == 'native_failure_diagnostics.py' and (not isinstance(ref,a.Evidence) or ref.sha256 != DIAGNOSTICS_SHA):
            raise a.Rejected('Exact reviewed diagnostic helper required by offline worker')
        if not isinstance(ref, a.Evidence) or ref.path != name or _hash_file(KIT/name, 2*1024**2) != {'bytes': ref.bytes, 'sha256': ref.sha256}:
            raise a.Rejected('Reviewed protected tool source changed')
        rows.append({'path': name, 'bytes': ref.bytes, 'sha256': ref.sha256})
    expected = {'kind': 'directory', 'files': rows, 'manifestSha256': hashlib.sha256(a.canonical(rows)).hexdigest()}
    reserve(store, [expected])
    directory = 'assemblies/'+assembly_owner+'/inputs/tools'; root = store.path(directory)
    root.mkdir(mode=0o700)
    for row in rows: _copy_file(KIT/row['path'], root/row['path'], row)
    for row in rows:
        if _hash_file(KIT/row['path'], 2*1024**2) != {'bytes': row['bytes'], 'sha256': row['sha256']}:
            raise a.Rejected('Protected tool source changed across copying')
    tree = {'path': directory, **expected}; a.validate_tree(tree, store); root.chmod(0o555)
    return tree


def require_toolset(tree: dict):
    if tree.get('kind') != 'directory' or {row.get('path') for row in tree.get('files',[])} != set(TOOLS) or len(tree['files']) != len(TOOLS):
        raise a.Rejected('Complete exact eight-file offline toolset required')
    if next(row for row in tree['files'] if row['path']=='native_failure_diagnostics.py')['sha256'] != DIAGNOSTICS_SHA:
        raise a.Rejected('Offline diagnostic helper differs from reviewed code')


def copy_provenance(store: a.Store, assembly_owner: str, role: str, reviewed: a.Evidence,
                    acquisition: AdministrativeAcquisition | None = None) -> a.Evidence:
    """Copy one operator-reviewed receipt from its fixed authority path."""
    if (store.root != CONTROLLER_ROOT or store.root.stat().st_mode & 0o077
            or not re.fullmatch('[0-9a-f]{32}',assembly_owner) or role not in PROVENANCE_SOURCES):
        raise a.Rejected('Unknown administrative provenance role/Store')
    sources = dict(PROVENANCE_SOURCES)
    if acquisition is not None:
        if not isinstance(acquisition,AdministrativeAcquisition): raise a.Rejected('Typed administrative acquisition required')
        checked = bind_acquisition(acquisition.attempt,acquisition.supervisor,acquisition.job)
        if checked != acquisition: raise a.Rejected('Administrative acquisition source changed')
        sources.update(acquisition.sources())
    if reviewed.path != sources[role]: raise a.Rejected('Provenance path differs from fixed role')
    source = CONTROLLER/reviewed.path
    limit = 64*1024**2 if role in {'sourceScan','sourceWorker'} else 2*1024**2
    observed = inventory(source,limit)
    if observed['files'] != [{'path':source.name,'bytes':reviewed.bytes,'sha256':reviewed.sha256}]:
        raise a.Rejected('Actual authority bytes differ from reviewed reference')
    relative = 'assemblies/'+assembly_owner+'/provenance/'+role+source.suffix
    tree = _copy_tree(store,source,relative,observed,limit)
    return store.describe(tree['path'],limit)


def bind_sealed_cache(tree: dict, archive_manifest: dict, component: dict):
    """Bind actual cache bytes to the verified sealer's complete archive tree."""
    a.exact(archive_manifest,{'schema','entries','entryCount','fileBytes'},'sealed archive tree')
    if archive_manifest['schema'] != 1 or archive_manifest['entryCount'] != len(archive_manifest['entries']):
        raise a.Rejected('Sealed archive inventory count differs')
    if hashlib.sha256(a.canonical(archive_manifest)).hexdigest() != component.get('canonicalTreeSha256'):
        raise a.Rejected('Archive tree differs from actual seal identity')
    files = []; names = set()
    for row in archive_manifest['entries']:
        if row.get('type') == 'directory':
            a.exact(row,{'mode','path','type'},'sealed directory')
        elif row.get('type') == 'file':
            a.exact(row,{'mode','path','type','size','sha256'},'sealed archive file')
            a.sha(row['sha256'])
            if type(row['size']) is not int or not 0 <= row['size'] <= 256*1024**2:
                raise a.Rejected('Invalid sealed archive file size')
            files.append({'path':row['path'],'bytes':row['size'],'sha256':row['sha256']})
        else: raise a.Rejected('Link/special entry in archive manifest')
        if not isinstance(row['path'],str) or row['path'] in names:
            raise a.Rejected('Duplicate or invalid sealed path')
        names.add(row['path'])
    if tree['kind'] != 'directory' or sorted(files,key=lambda row:row['path']) != tree['files'] or sum(row['bytes'] for row in files) != archive_manifest['fileBytes']:
        raise a.Rejected('Copied cache differs from sealed complete archive file identities')


def assemble_draft(store: a.Store, exported: ExportedFixture, original_export: a.Evidence,
                   seeds: dict, operator_identities: dict[str, a.Evidence], provenance: dict[str, a.Evidence],
                   assembly_owner: str, expires_at: float, seal_manifests: dict[str,a.Evidence],
                   acquisition: AdministrativeAcquisition) -> tuple[Registry, a.Evidence]:
    """Pin already reviewed administrative inputs, keeping adapter unadmitted."""
    if store.root != CONTROLLER_ROOT or store.root.stat().st_mode & 0o077:
        raise a.Rejected('Fixed dedicated owned700 Store required')
    if not re.fullmatch('[0-9a-f]{32}', assembly_owner): raise a.Rejected('Generated administrative assembly owner required')
    if not isinstance(acquisition,AdministrativeAcquisition): raise a.Rejected('Actual typed successful acquisition required')
    if bind_acquisition(acquisition.attempt,acquisition.supervisor,acquisition.job) != acquisition:
        raise a.Rejected('Selected actual acquisition source changed')
    if exported.source_sha != SOURCE_SHA or exported.lock.sha256 != LOCK_SHA or exported.lock.bytes != LOCK_BYTES:
        raise a.Rejected('Wrong frozen fixture source/lock')
    store.verify(original_export)
    if original_export.sha256 != ORIGINAL_EXPORT_SHA: raise a.Rejected('Original source export lineage differs')
    raw = store.json(exported.raw_receipt, 2*1024**2)
    a.freshness(raw, time.time(), 3600)
    if raw['status'] != 'exported' or raw['failure'] is not None: raise a.Rejected('Actual clean Git export missing')
    manifest = store.json(exported.manifest)
    if acquisition.fixture != {key:manifest['tree'][key] for key in ('kind','files','manifestSha256')}:
        raise a.Rejected('Acquisition fixture differs from exact admitted source')
    if set(seeds) != a.NATIVE_SEEDS or seeds['/seed/fixture'] != manifest['tree']:
        raise a.Rejected('Six exact seeds must use actual exported source')
    for tree in seeds.values(): a.validate_tree(tree, store)
    require_toolset(seeds['/seed/tools'])
    required = set(a.IDENTITIES)-{'sourceArchive','sourceLock','adapter','recipe'}
    if set(operator_identities) != required: raise a.Rejected('Missing reviewed administrative policy identities')
    for ref in operator_identities.values(): store.verify(ref)
    if set(provenance) != set(PROVENANCE_SOURCES): raise a.Rejected('Complete actual provenance required')
    for ref in provenance.values(): store.verify(ref, 64*1024**2)
    if provenance['sourceScan'].sha256 != SOURCE_SCAN_SHA: raise a.Rejected('Wrong retained current-source scan')
    scanner_raw = store.json(provenance['sourceScan'],64*1024**2)
    # Preserve historical scanner timestamps. Freshness is separately exposed
    # below; this bootstrap record cannot turn an old scan into a stage pass.
    a.validate_scanner_supervisor(scanner_raw,'scan')
    if scanner_raw['sourceFiles'] != manifest['tree']['files'] or scanner_raw.get('mavenFiles') != []:
        raise a.Rejected('Actual source scan differs from exported complete source')
    if (scanner_raw['workerSha256'] != provenance['sourceWorker'].sha256
            or store.json(provenance['sourceWorker'],64*1024**2) != scanner_raw['worker']):
        raise a.Rejected('Source scanner worker bytes differ')
    import security_native as scanner
    verdict = scanner.validate_scan(scanner_raw['worker'],store.json(provenance['databaseReceipt']),
                expected_lock_sha256=LOCK_SHA,expected_maven_files=[])
    if verdict['verdict'] != 'pass': raise a.Rejected('Actual source findings block bootstrap')
    if provenance['signerPublicInput'].sha256 != PUBLIC_KEY_SHA or provenance['signerPublicInput'].bytes != 2257:
        raise a.Rejected('Wrong known-public benchmark signing input')
    npm = store.json(operator_identities['npmSeal']); maven = store.json(operator_identities['mavenSeal'])
    if operator_identities['npmSeal'].sha256 != NPM_SEAL_SHA or npm.get('status') != 'sealed-npm-and-native-template-only' or npm.get('sourceLockSha256') != LOCK_SHA or npm.get('image') != a.IMAGE:
        raise a.Rejected('Wrong actual npm seal')
    if (maven.get('status') != 'sealed-native-task-closure-offline-proof-pending' or maven.get('image') != a.IMAGE
            or maven.get('npmSealSha256') != NPM_SEAL_SHA or maven.get('taskOutputsSeeded') is not False
            or maven.get('offlineProof') != 'pending'):
        raise a.Rejected('Successful actual Maven closure seal missing')
    if set(seal_manifests) != {'npm-cache','gradle-caches'}: raise a.Rejected('Both full sealed archive inventories required')
    for name, seal in (('npm-cache',npm),('gradle-caches',maven)):
        ref = seal_manifests[name]; store.verify(ref,64*1024**2)
        bind_sealed_cache(seeds['/seed/'+name],store.json(ref,64*1024**2),seal['components'][name])
    xml = seeds['/seed/verification-metadata.xml']
    if xml['kind'] != 'file' or len(xml['files']) != 1 or xml['files'][0]['sha256'] != maven.get('verificationMetadataSha256'):
        raise a.Rejected('Offline verification XML differs from actual Maven seal')
    if any(maven.get('protectedToolSha256',{}).get(row['path']) != row['sha256'] for row in seeds['/seed/tools']['files']):
        raise a.Rejected('Offline tools differ from actual sealed acquisition authority')
    acquired = store.json(provenance['nativeAcquisition']); job = store.json(provenance['nativeJob'])
    if ((provenance['nativeAcquisition'].sha256,provenance['nativeAcquisition'].bytes) != (acquisition.supervisor.sha256,acquisition.supervisor.bytes)
            or (provenance['nativeJob'].sha256,provenance['nativeJob'].bytes) != (acquisition.job.sha256,acquisition.job.bytes)):
        raise a.Rejected('Copied native provenance differs from selected actual acquisition')
    if (maven.get('sourceReceiptSha256') != provenance['nativeAcquisition'].sha256
            or maven.get('sourceJobSha256') != provenance['nativeJob'].sha256
            or acquired.get('status') != 'native-acquisition-task-closure-complete-offline-proof-pending'
            or acquired.get('cleanupFailures') != [] or acquired.get('image') != a.IMAGE
            or job.get('status') != 'trusted-fixture-native-task-closure-acquired' or job.get('offline') is not False):
        raise a.Rejected('Seal not bound to successful actual clean acquisition')
    directory = 'assemblies/'+assembly_owner
    if not store.path(directory).is_dir(): raise a.Rejected('Fresh assembly directory must exist')
    store.path('native-jobs').mkdir(mode=0o700, exist_ok=True)
    worker = store.describe(seeds['/seed/tools']['path']+'/native_fixture_job.py')
    recipe = store.write(directory+'/recipe.json', {'schema': 'micro.android.native-recipe/1', 'commands': COMMANDS,
               'execution': {'entrypoint': ['python3'], 'argv': ['/seed/tools/native_fixture_job.py','--offline'],
                             'environment': ENVIRONMENT, 'worker': worker.json()}})
    identities = {**operator_identities, 'sourceArchive': exported.archive, 'sourceLock': exported.lock, 'recipe': recipe}
    inputs = store.write(directory+'/native-inputs.json', {'schema': 'micro.android.native-inputs/1',
             'sourceExport': exported.manifest.json(),
             'identities': {name: identities[name].json() for name in ('toolchain','npmSeal','mavenSeal','recipe')},
             'seeds': seeds, 'outputRoot': 'native-jobs'})
    identities['adapter'] = store.write(directory+'/adapter.json', {'schema': 'micro.android.reviewed-adapter/1',
                            'sourceExporterSha256': exported.exporter_sha256,
                            'sourceExport': exported.manifest.json(), 'nativeInputs': inputs.json()})
    a.number(expires_at, 'draft expiry')
    if not time.time() < expires_at <= time.time()+86400: raise a.Rejected('Draft requires bounded future expiry')
    binding = a.Binding('fixture-'+assembly_owner, 'expo-android', SOURCE_SHA, identities, None, expires_at)
    a.native_inputs(binding, store); a.native_execution(binding, store, store.json(inputs))
    details = exported.stage_details(binding, store)
    entry = {'schema':'micro.android.adapter/1','projectKind':'fixture','projectId':binding.project_id,
             'adapterId':binding.adapter_id,'sourceSha':binding.source_sha,
             'identities':{name:ref.json() for name,ref in identities.items()}, 'certificateSha256':None,
             'expiresAt':expires_at,'versionCode':1,'versionName':'1.0.0','package':binding.package,
             'minSdk':24,'targetSdk':36,'permissions':[],'admitted':False,'image':a.IMAGE,'nativeMapping':None,
             'runtimePolicy':{key:a.NATIVE_POLICY[key] for key in ('user','network','memoryBytes','memorySwapBytes','nanoCpus','pids')}}
    registry_ref = store.write(directory+'/draft-registry.json', {'schema':'micro.android.registry/1','entries':[entry]})
    result = store.write(directory+'/assembly.json', {'schema':'micro.android.fixture-assembly/1',
             'status':'unsigned-offline-inputs-prepared-review-required','context':binding.context(),
             'createdAt':time.time(),'expiresAt':expires_at,'originalSourceExport':original_export.json(),
             'currentSourceExport':exported.manifest.json(),'sourceAdmission':details,
             'draftRegistry':registry_ref.json(),'nativeInputs':inputs.json(),
             'provenance':{name:ref.json() for name,ref in provenance.items()},
             'acquisitionAttempt':acquisition.attempt,
             'sealManifests':{name:ref.json() for name,ref in seal_manifests.items()},
             'authoritySha256':_hash_file(Path(__file__),2*1024**2)['sha256'],
             'controllerAuthority':controller_authority(),
             'sourceSecurityStatus':'retained-pass-current-stage-freshness-unclaimed',
             'permissionsStatus':'unobserved','signingStatus':'pending','suiteStatus':'not-final',
             'recoveryStatus':'not-final','nativeProof':'pending','budget':store.budget()})
    return Registry(store, {(binding.project_id,binding.adapter_id):binding}), result


def run_two_unsigned_builds(registry: Registry, project_id: str, reviewed_assembly: a.Evidence) -> a.Evidence:
    """Called only after root's explicit review, never retries a failed job."""
    store = registry.store; binding = registry.select(project_id, 'expo-android')
    manifest = store.json(reviewed_assembly)
    a.exact(manifest, {'schema','status','context','createdAt','expiresAt','originalSourceExport',
                      'currentSourceExport','sourceAdmission','draftRegistry','nativeInputs',
                      'provenance','acquisitionAttempt','sealManifests','authoritySha256','permissionsStatus','signingStatus',
                      'controllerAuthority','sourceSecurityStatus','suiteStatus','recoveryStatus','nativeProof','budget'}, 'reviewed assembly')
    if (store.root != CONTROLLER_ROOT or manifest.get('context') != binding.context()
            or manifest['schema'] != 'micro.android.fixture-assembly/1'
            or not re.fullmatch('fixture-[0-9a-f]{32}',project_id)
            or binding.source_sha != SOURCE_SHA or binding.identities['sourceLock'].sha256 != LOCK_SHA
            or binding.identities['sourceLock'].bytes != LOCK_BYTES
            or manifest['controllerAuthority'] != controller_authority()
            or manifest.get('authoritySha256') != _hash_file(Path(__file__),2*1024**2)['sha256']
            or manifest.get('status') != 'unsigned-offline-inputs-prepared-review-required'
            or binding.admitted or binding.certificate_sha256 is not None or time.time() >= binding.expires_at):
        raise a.Rejected('Exact reviewed pending assembly required for unsigned bootstrap')
    a.freshness({'startedAt':manifest['createdAt'],'finishedAt':manifest['createdAt']}, time.time(),3600)
    a.native_inputs(binding,store); a.native_execution(binding,store,a.native_inputs(binding,store))
    # This exclusive marker survives failures. A fresh review/assembly is needed
    # for another invocation; this helper never retries the same assembly.
    store.write('assemblies/'+project_id.removeprefix('fixture-')+'/execution-request.json',
                {'assembly':reviewed_assembly.json(),'requestedAt':time.time()})
    directory = 'assemblies/'+project_id.removeprefix('fixture-')+'/offline-pair-'+uuid4().hex
    store.path(directory).mkdir(mode=0o700)
    references = []; attempts = []; failure = None; comparison = None
    try:
        from offline_native_supervisor import OfflineSupervisor
        for _ in range(2):
            if manifest['controllerAuthority'] != controller_authority(): raise a.Rejected('Reviewed controller source changed')
            a.native_inputs(binding, store)
            owner = uuid4().hex
            attempts.append({'owner':owner,'rawReceipt':'native-jobs/'+owner+'/receipts/offline-native-smoke.json'})
            store.write(directory+'/attempt-'+str(len(attempts))+'.json',attempts[-1])
            reference = OfflineSupervisor(store,binding,owner).run()
            references.append(reference)
            a.validate_build(reference,binding,store,time.time(),3600)
            store.write(directory+'/build-'+str(len(references))+'.json', {'reference':reference.json()})
        comparison = a.validate_build_pair(references,binding,store,time.time(),3600)
    except Exception as error:
        failure = {'type':type(error).__name__,'message':str(error)[:2048]}
    receipt = store.write(directory+'/receipt.json', {'schema':'micro.android.unsigned-offline-pair/1',
               'assembly':reviewed_assembly.json(),'context':binding.context(),
               'builds':[ref.json() for ref in references], 'attempts':attempts,
               'comparison':comparison,'firstFailure':failure,
               'status':'two-actual-unsigned-offline-jobs' if comparison else 'first-failure-pending',
               'admission':'pending-signing-inspection-security-device-recovery','budget':store.budget()})
    return receipt
