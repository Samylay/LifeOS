#!/usr/bin/env python3
"""Administrative, fixture-only Git export. Never imports product Python/code.

Only a trusted controller selects the repository, exact commit and expected lock.
A successful result is produced by real bounded Git reads, not parsed JSON flags.
No registry is installed and no native/security/device/CI verdict is inferred.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import importlib.util
import io
import os
from pathlib import Path, PurePosixPath
import re
import signal
import stat
import subprocess
import tarfile
import time
from uuid import uuid4

try:
    from . import admission as a
except ImportError:
    import admission as a

SUBTREE = 'tooling/micro/android/fixtures/native-smoke'
REQUIRED = {'README.md', 'package.json', 'package-lock.json', 'app.json',
            'tsconfig.json', 'app/_layout.tsx', 'app/index.tsx'}
DEFAULT_STORE = Path('/home/quorky/apps/lifeos/.scratch/software-factory-benchmark/run-20260930/controller/native-integration')
GIT = '/usr/bin/git'
SOURCE_BYTES = 100_000_000
SOURCE_ENTRIES = 20_000
LOG_BYTES = 4 * 1024**2
COMMAND_SECONDS = 30
_MICRO_PATH = Path(__file__).resolve().parents[1] / 'micro.py'


def _micro():
    # Fixed reviewed kit module, never the repository being exported/sys.path.
    spec = importlib.util.spec_from_file_location('_trusted_micro_source_extractor', _MICRO_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def code_authority() -> dict:
    return {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in
            [('source_export.py', Path(__file__)), ('micro.py', _MICRO_PATH)]}


def exporter_sha256() -> str:
    return hashlib.sha256(a.canonical(code_authority())).hexdigest()


def _reserve(store: a.Store, maximum: int):
    budget = store.budget()
    if max(budget['regularBytes'], budget['allocatedBytes']) + maximum > a.STORE_BYTES:
        raise a.Rejected('Source export exceeds protected Store 8GiB budget')


class _Git:
    def __init__(self, repository: Path, store: a.Store, directory: str):
        self.repository = Path(repository).absolute(); a.Store._parents(self.repository)
        if not self.repository.is_dir(): raise a.Rejected('Operator repository missing')
        self.store = store; self.directory = directory; self.commands = []
        self.env = {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C', 'GIT_TERMINAL_PROMPT': '0',
                    'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null',
                    'GIT_OPTIONAL_LOCKS': '0', 'GIT_NO_REPLACE_OBJECTS': '1',
                    'GIT_NO_LAZY_FETCH': '1'}

    def run(self, args: list[str], maximum: int = LOG_BYTES) -> a.Evidence:
        # No shell, hooks, external diff/textconv, fsmonitor, or remote protocol.
        argv = [GIT, '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
                '-c', 'core.hooksPath=/dev/null', '-c', 'core.attributesFile=/dev/null',
                '-c', 'protocol.allow=never', '-c', 'protocol.file.allow=never',
                '-C', str(self.repository), *args]
        _reserve(self.store, maximum+LOG_BYTES)
        prefix = self.directory+f'/command-{len(self.commands):02d}'
        out = self.store.path(prefix+'.stdout'); err = self.store.path(prefix+'.stderr')
        started = time.time(); timed_out = False; limit = None
        with out.open('xb') as stdout, err.open('xb') as stderr:
            process = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=stdout,
                                       stderr=stderr, env=self.env, start_new_session=True)
            try:
                while process.poll() is None:
                    if out.stat().st_size > maximum or err.stat().st_size > LOG_BYTES:
                        limit = 'output-bytes'; break
                    if time.time()-started > COMMAND_SECONDS:
                        timed_out = True; break
                    try: process.wait(timeout=0.02)
                    except subprocess.TimeoutExpired: pass
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
        if out.stat().st_size > maximum or err.stat().st_size > LOG_BYTES: limit = 'output-bytes'
        out.chmod(0o400); err.chmod(0o400)
        # Failure evidence may contain a last bounded write beyond the requested
        # limit; never interpret it as accepted source or a successful command.
        output = self.store.describe(prefix+'.stdout', max(maximum, out.stat().st_size))
        error = self.store.describe(prefix+'.stderr', max(LOG_BYTES, err.stat().st_size))
        self.commands.append({'argv': argv, 'startedAt': started, 'finishedAt': time.time(),
                              'exitCode': process.returncode, 'signal': -process.returncode if process.returncode < 0 else None,
                              'timeout': timed_out, 'limitFailure': limit,
                              'stdout': output.json(), 'stderr': error.json()})
        self.store.budget()
        if process.returncode != 0 or timed_out or limit:
            raise a.Rejected('Actual fixture Git command failed or exceeded its bound')
        return output

    def read(self, args: list[str]) -> bytes:
        return self.store.read(self.run(args), LOG_BYTES)


def _name(name: str):
    path = PurePosixPath(name)
    if not name or path.is_absolute() or '..' in path.parts or '\\' in name or path.as_posix() != name or any(part in ('.git', 'node_modules') for part in path.parts):
        raise a.Rejected('Unsafe committed fixture path')
    base = path.name.lower()
    if base == '.env' or base.startswith('.env.') and base != '.env.example' or path.suffix.lower() in ('.pem', '.key', '.jks', '.keystore', '.p12') or base == '.npmrc':
        raise a.Rejected('Fixture source contains forbidden credential filename')


def _tracked(raw: bytes) -> dict:
    entries = {}
    for item in raw.split(b'\0'):
        if not item: continue
        header, name = item.split(b'\t', 1)
        mode, kind, oid = header.decode('ascii').split(' ')
        name = name.decode('utf-8'); _name(name)
        if mode not in ('100644', '100755') or kind != 'blob' or not re.fullmatch(r'[0-9a-f]{40}', oid):
            raise a.Rejected('Fixture commit contains link, submodule or unsupported entry')
        if name in entries or len(entries) >= SOURCE_ENTRIES: raise a.Rejected('Duplicate or excessive committed fixture entries')
        entries[name] = {'mode': mode, 'gitBlob': oid}
    if not REQUIRED <= set(entries): raise a.Rejected('Committed fixture required source is missing')
    return entries


def _files(directory: Path) -> dict:
    a.Store._parents(directory)
    if not directory.is_dir(): raise a.Rejected('Fixture directory missing')
    files = {}; total = 0
    for path in sorted(directory.rglob('*')):
        info = path.lstat()
        if stat.S_ISDIR(info.st_mode): continue
        name = path.relative_to(directory).as_posix(); _name(name)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise a.Rejected('Fixture tree contains link or nonregular file')
        if len(files) >= SOURCE_ENTRIES or info.st_size > SOURCE_BYTES: raise a.Rejected('Fixture tree exceeds source bound')
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            before = os.fstat(descriptor)
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1: raise a.Rejected('Fixture source changed type')
            sha = hashlib.sha256(); blob = hashlib.sha1(b'blob '+str(before.st_size).encode()+b'\0'); count = 0
            while chunk := os.read(descriptor, 1024**2):
                count += len(chunk); total += len(chunk)
                if total > SOURCE_BYTES: raise a.Rejected('Expanded fixture exceeds source byte bound')
                sha.update(chunk); blob.update(chunk)
            after = os.fstat(descriptor)
            identity = lambda value: (value.st_dev, value.st_ino, value.st_mode, value.st_size, value.st_mtime_ns, value.st_ctime_ns)
            if identity(before) != identity(after) or identity(path.stat(follow_symlinks=False)) != identity(after) or count != before.st_size:
                raise a.Rejected('Fixture source changed during hashing')
            files[name] = {'bytes': count, 'sha256': sha.hexdigest(), 'gitBlob': blob.hexdigest(),
                           'mode': '100755' if after.st_mode & 0o111 else '100644'}
        finally: os.close(descriptor)
    return files


def _same_commit(files: dict, tracked: dict):
    if set(files) != set(tracked) or any(any(files[name][field] != entry[field] for field in ('gitBlob', 'mode')) for name, entry in tracked.items()):
        raise a.Rejected('Complete fixture tree differs from exact committed blobs (dirty, omitted or substituted source)')


def _guard(git: _Git, commit: str) -> tuple[dict, dict]:
    if not re.fullmatch(r'[0-9a-f]{40}', commit): raise a.Rejected('Operator must select exact 40hex source commit')
    top = git.read(['rev-parse', '--show-toplevel']).decode().strip()
    if Path(top) != git.repository: raise a.Rejected('Operator repository must be its Git root')
    if git.read(['rev-parse', '--verify', commit+'^{commit}']).decode().strip() != commit:
        raise a.Rejected('Selected source is not exact commit object')
    status = git.read(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching', '--', SUBTREE])
    if status: raise a.Rejected('Fixture subtree has dirty, untracked or ignored working files')
    git.run(['diff', '--no-ext-diff', '--no-textconv', '--exit-code', '--quiet', commit, '--', SUBTREE])
    tracked = _tracked(git.read(['ls-tree', '-rz', commit+':'+SUBTREE]))
    files = _files(git.repository / SUBTREE); _same_commit(files, tracked)
    return tracked, files


def extract_fixture_archive(archive: bytes, destination: Path) -> Path:
    """Scope check plus the existing full safe extractor; no Git verdict here."""
    if not isinstance(archive, bytes) or len(archive) > SOURCE_BYTES: raise a.Rejected('Source archive exceeds100MB')
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:') as tar:
        for member in tar:
            normalized = PurePosixPath(member.name).as_posix()
            if member.isfile():
                if not normalized.startswith(SUBTREE+'/'): raise a.Rejected('Archive file outside fixed fixture subtree')
            elif member.isdir():
                if normalized != SUBTREE and not SUBTREE.startswith(normalized+'/') and not normalized.startswith(SUBTREE+'/'):
                    raise a.Rejected('Archive directory outside fixture subtree')
            else: raise a.Rejected('Archive contains link or unsupported type')
    _micro().extract_source(archive, destination)
    return Path(destination) / SUBTREE


@dataclass(frozen=True)
class ExportedFixture:
    repository: Path
    source_sha: str
    archive: a.Evidence
    lock: a.Evidence
    manifest: a.Evidence
    raw_receipt: a.Evidence
    directory: str
    exporter_sha256: str

    def references(self) -> dict:
        return {'sourceArchive': self.archive.json(), 'sourceLock': self.lock.json(),
                'sourceExport': self.manifest.json(), 'rawReceipt': self.raw_receipt.json(),
                'sourceSha': self.source_sha, 'exporterSha256': self.exporter_sha256}

    def stage_details(self, binding: a.Binding, store: a.Store) -> dict:
        """Recheck real fixture Git/bytes before emitting fixed source-stage facts."""
        directory = self.directory+'/source-stage-'+uuid4().hex
        store.path(directory).mkdir(mode=0o700)
        git = _Git(self.repository, store, directory); started = time.time()
        status = 'failed'; failure = None; details = None
        try:
            tracked, before = _guard(git, self.source_sha)
            raw = store.json(self.raw_receipt, LOG_BYTES)
            a.exact(raw, {'schema','subtree','repository','sourceSha','expectedLock','authority','exporterSha256','startedAt','finishedAt','status','failure','commands','archive','sourceLock','sourceExport','budget'}, 'actual fixture export')
            if raw['schema'] != 'micro.android.fixture-export/1' or raw['subtree'] != SUBTREE or raw['repository'] != str(self.repository) or raw['sourceSha'] != self.source_sha or raw['archive'] != self.archive.json() or raw['sourceLock'] != self.lock.json() or raw['sourceExport'] != self.manifest.json() or raw['expectedLock'] != {'sha256': self.lock.sha256, 'bytes': self.lock.bytes}:
                raise a.Rejected('Actual Git export/artifact identities changed')
            a.freshness(raw, time.time(), 3600)
            if raw['status'] != 'exported' or raw['failure'] is not None or raw['authority'] != code_authority() or self.exporter_sha256 != exporter_sha256():
                raise a.Rejected('Export code authority changed or actual export failed')
            store.verify(self.archive, SOURCE_BYTES); store.verify(self.lock, SOURCE_BYTES)
            reference, manifest = a.source_export(binding, store)
            if reference != self.manifest or binding.source_sha != self.source_sha or binding.identities['sourceArchive'] != self.archive or binding.identities['sourceLock'] != self.lock:
                raise a.Rejected('Reviewed adapter differs from actual source export')
            exported_files = _files(store.path(manifest['tree']['path'])); _same_commit(exported_files, tracked)
            _reserve(store, SOURCE_BYTES)
            checked = store.path(directory+'/checked-archive'); checked.mkdir(mode=0o700)
            archived = _files(extract_fixture_archive(store.read(self.archive, SOURCE_BYTES), checked))
            _same_commit(archived, tracked)
            if archived != exported_files: raise a.Rejected('Actual archive bytes differ from pinned exported source')
            _, after = _guard(git, self.source_sha)
            if before != after: raise a.Rejected('Fixture changed during source-stage check')
            receipt = store.write(directory+'/receipt.json', {'schema': 'micro.android.source-admission/1',
                       'context': binding.context(), 'status': 'admitted', 'cleanCommit': True,
                       'archiveValidated': True, 'protectedInputsMatched': True,
                       'exporterSha256': self.exporter_sha256, 'sourceExport': self.manifest.json()})
            details = {'receipt': receipt.json()}; status = 'admitted'
        except Exception as error:
            failure = str(error); raise
        finally:
            store.write(directory+'/raw.json', {'schema': 'micro.android.source-stage/1', 'sourceSha': self.source_sha,
                        'sourceExport': self.manifest.json(), 'exportReceipt': self.raw_receipt.json(),
                        'authority': code_authority(), 'startedAt': started, 'finishedAt': time.time(),
                        'status': status, 'failure': failure, 'commands': git.commands})
        return details


def export_fixture(operator_repository: Path, operator_commit: str, *, expected_lock_sha256: str,
                   expected_lock_bytes: int, store: a.Store | None = None) -> ExportedFixture:
    """Export only the fixed fixture, never the vault or unrelated working files.

    Expected lock identity must come from operator-reviewed locked inputs. Failed
    attempts are retained under their fresh Store directory, never overwritten.
    """
    store = store or a.Store(DEFAULT_STORE); store.budget()
    directory = 'source-exports/'+uuid4().hex
    store.path(directory).mkdir(parents=True, mode=0o700, exist_ok=False)
    git = _Git(operator_repository, store, directory); started = time.time()
    result = None; failure = None
    try:
        a.sha(expected_lock_sha256)
        if type(expected_lock_bytes) is not int or not 0 < expected_lock_bytes <= SOURCE_BYTES:
            raise a.Rejected('Expected operator lock byte identity missing')
        tracked, before = _guard(git, operator_commit)
        archive = git.run(['archive', '--format=tar', operator_commit, SUBTREE], SOURCE_BYTES)
        _reserve(store, SOURCE_BYTES)
        extracted = store.path(directory+'/extracted'); extracted.mkdir(mode=0o700)
        fixture = extract_fixture_archive(store.read(archive, SOURCE_BYTES), extracted)
        files = _files(fixture); _same_commit(files, tracked)
        _, after = _guard(git, operator_commit)
        if before != after: raise a.Rejected('Fixture working tree changed during export')
        lock = store.describe((fixture/'package-lock.json').relative_to(store.root).as_posix(), SOURCE_BYTES)
        if (lock.sha256, lock.bytes) != (expected_lock_sha256, expected_lock_bytes):
            raise a.Rejected('Actual exported lock differs from operator-admitted locked inputs')
        rows = [{'path': name, 'bytes': value['bytes'], 'sha256': value['sha256']} for name, value in files.items()]
        tree = {'path': fixture.relative_to(store.root).as_posix(), 'kind': 'directory', 'files': rows,
                'manifestSha256': hashlib.sha256(a.canonical(rows)).hexdigest()}
        manifest = store.write(directory+'/source-export.json', {'schema': 'micro.android.source-export/1',
                              'sourceSha': operator_commit, 'sourceArchiveSha256': archive.sha256,
                              'sourceLock': lock.json(), 'exporterSha256': exporter_sha256(), 'tree': tree})
        for path in fixture.rglob('*'):
            if path.is_file(): path.chmod(0o500 if path.stat().st_mode & 0o111 else 0o400)
        a.validate_tree(tree, store)
        result = (archive, lock, manifest, tree)
    except Exception as error:
        failure = str(error); raise
    finally:
        receipt = store.write(directory+'/raw.json', {'schema': 'micro.android.fixture-export/1',
                    'subtree': SUBTREE, 'repository': str(git.repository), 'sourceSha': operator_commit,
                    'expectedLock': {'sha256': expected_lock_sha256, 'bytes': expected_lock_bytes},
                    'authority': code_authority(), 'exporterSha256': exporter_sha256(),
                    'startedAt': started, 'finishedAt': time.time(),
                    'status': 'exported' if result else 'failed', 'failure': failure, 'commands': git.commands,
                    'archive': result[0].json() if result else None,
                    'sourceLock': result[1].json() if result else None,
                    'sourceExport': result[2].json() if result else None,
                    'budget': store.budget()})
    return ExportedFixture(git.repository, operator_commit, result[0], result[1], result[2],
                           receipt, directory, exporter_sha256())
