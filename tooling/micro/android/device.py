#!/usr/bin/env python3
"""Trusted fixed-role Android operations. No generic ADB or shell interface.

Construction performs no device operation. The default backend is for future
controller use; tests inject mocked ADB/process facts. APK admission stays
independent. Capture is observation, not a product or recovery verdict.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
from io import BytesIO
import os
from pathlib import Path
import re
import selectors
import socket
import subprocess
import time
from typing import Callable
import xml.etree.ElementTree as ET
from uuid import uuid4

from PIL import Image

try:
    from . import admission
    from .pipeline import Registry, load_registry
    from . import fixture_health
except ImportError:
    import admission
    from pipeline import Registry, load_registry
    import fixture_health

ROOT = Path('/home/quorky/apps/lifeos/.scratch/software-factory-benchmark/run-20260930/controller/native-device')
EXECUTABLE = '/home/quorky/Android/sdk/emulator/qemu/linux-x86_64/qemu-system-x86_64-headless'
ADB = '/usr/bin/adb'
API = '36'
ABI = 'x86_64'
UID = 1000
MAX_FRESH_SECONDS = 5
PNG_LIMIT = 20 * 1024**2
XML_LIMIT = 8 * 1024**2
APK_LIMIT = 512 * 1024**2
BOUNDS = re.compile(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]')
LABEL = re.compile(r'[a-z0-9][a-z0-9-]{0,63}')
LEASE_KEYS = {'role', 'serial', 'pid', 'startTicks', 'uid', 'executable', 'avd',
              'port', 'name', 'expectedApi', 'expectedAbi', 'status', 'busy'}


@dataclass(frozen=True)
class Role:
    serial: str
    avd: str
    port: str
    package: str


ROLES = {
    'factory-source': Role('emulator-5584', 'Micro_Factory_Source', '5584', 'app.micro.factory.fixture'),
    'factory-target': Role('emulator-5586', 'Micro_Factory_Target', '5586', 'app.micro.factory.fixture'),
    'budget-v3': Role('emulator-5588', 'Micro_Benchmark_V3', '5588', 'app.micro.benchmark.v3'),
}
CONTROLS = {'counter-a': ('write-counter-a', 'Write counter-a'),
            'counter-b': ('write-counter-b', 'Write counter-b'),
            'sentinel': ('write-sentinel', 'Write sentinel'),
            'retry': ('fixture-retry', 'Retry opening fixture')}


def _process(pid: int) -> dict:
    path = Path('/proc') / str(pid)
    data = (path / 'stat').read_text().rsplit(')', 1)[1].split()
    return {'pid': pid, 'uid': path.stat().st_uid, 'startTicks': int(data[19]),
            'executable': os.readlink(path / 'exe'),
            'argv': [v.decode() for v in (path / 'cmdline').read_bytes().split(b'\0') if v]}


def _leases() -> dict:
    store = admission.Store(ROOT)
    return store.json(store.describe('leases.json', 64 * 1024))


def _transport(argv: tuple[str, ...], timeout: float, maximum: int) -> bytes:
    """Bound a fixed ADB client; require the existing loopback server.

    Explicit remote-host mode prevents the client starting a local server.
    No start-server, kill-server, root, emulator control or arbitrary shell is
    available. Only the owned ADB client is killed on deadline/output failure.
    """
    with socket.create_connection(('127.0.0.1', 5037), timeout=1):
        pass
    started = time.monotonic(); data = bytearray()
    process = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, env={'PATH': '/usr/bin:/bin'},
                               start_new_session=True)
    selection = selectors.DefaultSelector()
    selection.register(process.stdout, selectors.EVENT_READ, 'stdout')
    selection.register(process.stderr, selectors.EVENT_READ, 'stderr')
    errors = bytearray()
    try:
        while selection.get_map():
            if time.monotonic()-started > timeout: raise admission.Rejected('Owned ADB client deadline exceeded')
            for key, _ in selection.select(.1):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk:
                    selection.unregister(key.fileobj); continue
                target = data if key.data == 'stdout' else errors
                target.extend(chunk)
                if len(data) > maximum or len(errors) > 64*1024:
                    raise admission.Rejected('Owned ADB client output exceeded limit')
        code = process.wait(timeout=3)
        if code != 0: raise admission.Rejected('Fixed ADB operation failed: '+errors.decode(errors='replace')[:800])
        return bytes(data)
    except Exception as error:
        error.stdout_prefix = bytes(data[:1024])
        error.stderr_prefix = bytes(errors[:1024])
        error.transport_facts = {'stdoutBytes': len(data), 'stderrBytes': len(errors),
                                 'seconds': time.monotonic()-started}
        raise
    finally:
        selection.close()
        if process.poll() is None:
            process.kill(); process.wait(timeout=3)
        process.stdout.close(); process.stderr.close()


@dataclass(frozen=True)
class Backend:
    leases: Callable[[], dict] = _leases
    process: Callable[[int], dict] = _process
    boot_id: Callable[[], str] = lambda: Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    uid: Callable[[], int] = os.getuid
    transport: Callable[[tuple[str, ...], float, int], bytes] = _transport
    clock: Callable[[], float] = time.time
    health_stream: Callable[[str, int], object] | None = None


def validate_png(data: bytes) -> tuple[int, int]:
    if not isinstance(data, bytes) or not data.startswith(b'\x89PNG\r\n\x1a\n') or len(data) > PNG_LIMIT:
        raise admission.Rejected('Invalid or oversized PNG observation')
    try:
        with Image.open(BytesIO(data)) as image:
            size = image.size
            if image.format != 'PNG' or len(size) != 2 or not all(0 < v <= 4096 for v in size):
                raise admission.Rejected('Screenshot dimensions exceed policy')
            image.verify()
        with Image.open(BytesIO(data)) as image: image.load()
    except (OSError, SyntaxError, ValueError) as error:
        raise admission.Rejected('Corrupt or incomplete PNG observation') from error
    return size


def hierarchy(data: bytes, package: str, dimensions: tuple[int, int] | None = None) -> list[dict]:
    if not isinstance(data, bytes) or len(data) > XML_LIMIT or b'\x00' in data or b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise admission.Rejected('Unsafe or oversized UI hierarchy')
    try:
        tree = ET.fromstring(data.decode('utf-8'))
    except (ET.ParseError, UnicodeError) as error:
        raise admission.Rejected('Malformed UI hierarchy') from error
    if tree.tag != 'hierarchy': raise admission.Rejected('Expected Android hierarchy')
    nodes = []
    for count, element in enumerate(tree.iter('node')):
        if count > 20_000: raise admission.Rejected('UI hierarchy node limit')
        if element.get('package') != package: continue
        bounds = BOUNDS.fullmatch(element.get('bounds', ''))
        if not bounds: raise admission.Rejected('Malformed UI bounds')
        left, top, right, bottom = map(int, bounds.groups())
        if not 0 <= left <= right <= 4096 or not 0 <= top <= bottom <= 4096:
            raise admission.Rejected('Reversed or oversized UI bounds')
        if dimensions and (right > dimensions[0] or bottom > dimensions[1]):
            raise admission.Rejected('UI bounds leave observed screenshot')
        nodes.append({'resourceId': element.get('resource-id', ''), 'description': element.get('content-desc', ''),
                      'text': element.get('text', ''), 'class': element.get('class', ''),
                      'enabled': element.get('enabled') == 'true', 'clickable': element.get('clickable') == 'true',
                      'boundsPixels': [left, top, right, bottom]})
    if not nodes: raise admission.Rejected('Expected package absent from UI hierarchy')
    return nodes


@dataclass(frozen=True)
class Capture:
    token: str
    role: str
    lease_sha256: str
    artifact_sha256: str
    observed_at: float
    png: admission.Evidence
    xml: admission.Evidence
    receipt: admission.Evidence
    dimensions: tuple[int, int]


class Device:
    def __init__(self, role: str, *, backend: Backend | None = None,
                 registry: Registry | None = None, store: admission.Store | None = None,
                 artifact_security: admission.Evidence | None = None):
        if role not in ROLES: raise admission.Rejected('Unknown controlled device role')
        self.role = role
        self.backend = backend or Backend(health_stream=fixture_health.EventStream)
        self.registry = registry
        self.store = store
        self.artifact_security = artifact_security
        self._lease_pin = None
        self._installed = None
        self._captures: dict[str, Capture] = {}
        self._health_windows: dict[str, dict] = {}

    @property
    def spec(self) -> Role:
        if self.role not in ROLES: raise admission.Rejected('Unknown controlled device role')
        return ROLES[self.role]

    def verify_lease(self) -> dict:
        registry = self.backend.leases()
        admission.exact(registry, {'schema', 'ownerUid', 'hostBootId', 'devices'}, 'device lease registry')
        if registry['schema'] != 'micro.android.device-leases/1' or type(registry['ownerUid']) is not int or registry['ownerUid'] != UID or self.backend.uid() != UID:
            raise admission.Rejected('Foreign device lease owner')
        if registry['hostBootId'] != self.backend.boot_id(): raise admission.Rejected('Device lease belongs to another host boot')
        if not isinstance(registry['devices'], dict) or not set(registry['devices']) <= set(ROLES) or self.role not in registry['devices']:
            raise admission.Rejected('Missing or unknown device lease role')
        for name, value in registry['devices'].items():
            admission.exact(value, LEASE_KEYS, 'device lease')
            if value['role'] != name or value['serial'] != ROLES[name].serial:
                raise admission.Rejected('Cross-bound device lease identity')
        lease = registry['devices'][self.role]
        admission.exact(lease, LEASE_KEYS, 'device lease')
        expected = {'role': self.role, 'serial': self.spec.serial, 'uid': UID, 'executable': EXECUTABLE,
                    'avd': self.spec.avd, 'port': self.spec.port, 'name': self.spec.avd,
                    'expectedApi': API, 'expectedAbi': ABI, 'status': 'leased', 'busy': False}
        if any(lease[key] != value or type(lease[key]) is not type(value) for key,value in expected.items()):
            raise admission.Rejected('Wrong, busy or unbound controlled device lease')
        for key in ('pid', 'startTicks'):
            if type(lease[key]) is not int or lease[key] <= 0: raise admission.Rejected('Invalid device process identity')
        observed = self.backend.process(lease['pid'])
        admission.exact(observed, {'pid', 'uid', 'startTicks', 'executable', 'argv'}, 'device process facts')
        if any(observed[key] != lease[key] for key in ('pid', 'uid', 'startTicks', 'executable')):
            raise admission.Rejected('Owning device process changed')
        argv = observed['argv']
        if not isinstance(argv, list) or not argv or argv[0] != EXECUTABLE or any(not isinstance(arg, str) for arg in argv):
            raise admission.Rejected('Wrong device process executable/arguments')
        for flag, value in (('-avd', self.spec.avd), ('-port', self.spec.port)):
            if argv.count(flag) != 1 or argv.index(flag)+1 >= len(argv) or argv[argv.index(flag)+1] != value:
                raise admission.Rejected('Device process AVD/port does not match fixed role')
        pin = hashlib.sha256(admission.canonical({'hostBootId': registry['hostBootId'], 'lease': lease})).hexdigest()
        if self._lease_pin is not None and self._lease_pin != pin: raise admission.Rejected('Device lease superseded during operation')
        self._lease_pin = pin
        return lease

    def _call(self, args: tuple[str, ...], *, timeout: float = 30, maximum: int = XML_LIMIT) -> bytes:
        self.verify_lease()
        # Every call binds the exact serial. The host/server choices are fixed.
        argv = (ADB, '-H', '127.0.0.1', '-P', '5037', '-s', self.spec.serial, *args)
        result = self.backend.transport(argv, timeout, maximum)
        if not isinstance(result, bytes) or len(result) > maximum: raise admission.Rejected('Invalid or oversized ADB response')
        return result

    def facts(self) -> dict:
        lease = self.verify_lease()
        if self._call(('get-state',)).strip() != b'device': raise admission.Rejected('Device offline, missing or unauthorized')
        expected = {'ro.kernel.qemu': '1', 'ro.build.version.sdk': API, 'ro.product.cpu.abi': ABI, 'sys.boot_completed': '1'}
        facts = {key: self._call(('shell', 'getprop', key), maximum=1024).decode().strip() for key in expected}
        if facts != expected: raise admission.Rejected('Actual device API/ABI/boot/emulator facts differ')
        if self._call(('emu', 'avd', 'name'), maximum=1024).decode().splitlines() != [self.spec.avd, 'OK']:
            raise admission.Rejected('Actual ADB target AVD differs from role')
        self.verify_lease()
        return {'role': self.role, 'serial': self.spec.serial, 'package': self.spec.package,
                'facts': facts, 'leaseSha256': self._lease_pin, 'lease': lease}

    def _mutation(self, args: tuple[str, ...], *, timeout: float = 30, maximum: int = XML_LIMIT) -> bytes:
        for window in self._health_windows.values():
            stream = window['stream']
            if getattr(stream, 'failure', None) or getattr(stream, 'finished', False):
                raise admission.Rejected('Owned health observation stream ended or failed before mutation')
        if self._installed is not None: self._ensure_installed()
        else: self.facts()
        return self._call(args, timeout=timeout, maximum=maximum)

    def _paths(self, allow_absent: bool = False) -> list[str]:
        output = self._call(('shell', 'pm', 'path', self.spec.package), maximum=8192).decode().splitlines()
        if not output and allow_absent: return []
        paths = []
        for line in output:
            if not line.startswith('package:'): raise admission.Rejected('Unexpected installed package path result')
            path = line.removeprefix('package:')
            if not re.fullmatch(r'/data/app/[A-Za-z0-9_+=./~-]+/base\.apk', path) or '..' in Path(path).parts:
                raise admission.Rejected('Installed APK path is outside fixed base-APK policy')
            paths.append(path)
        if len(paths) != 1: raise admission.Rejected('One installed base APK is required')
        return paths

    def _version(self, expected: dict):
        output = self._call(('shell', 'dumpsys', 'package', self.spec.package), maximum=1024**2).decode()
        packages = re.findall(r'^\s*Package \[([^\]]+)\]', output, re.MULTILINE)
        codes = re.findall(r'^\s*versionCode=(\d+)(?:\s|$)', output, re.MULTILINE)
        names = re.findall(r'^\s*versionName=([^\r\n]+)', output, re.MULTILINE)
        if packages != [self.spec.package] or codes != [str(expected['versionCode'])] or names != [expected['versionName']]:
            raise admission.Rejected('Actual installed package/version differs from admission')

    def _admit(self, record: admission.Evidence) -> tuple[dict, admission.Evidence, dict]:
        registry = self.registry or load_registry()
        value = registry.store.json(record)
        context = value.get('context', {})
        binding = registry.select(context.get('projectId'), context.get('adapterId'))
        receipt = admission.admit_artifact(value, binding, registry.store, self.backend.clock())
        if receipt['metadata']['package'] != self.spec.package or receipt['target'] != 'local-benchmark' or receipt['publishAuthorized'] is not False:
            raise admission.Rejected('Artifact admission belongs to another role/package/target')
        if self.artifact_security is None: raise admission.Rejected('Mandatory final artifact-security receipt missing')
        try:
            from .pipeline import JobContext, Observation, Stage, validate_observation, MAX_AGE
        except ImportError:
            from pipeline import JobContext, Observation, Stage, validate_observation, MAX_AGE
        report = registry.store.json(self.artifact_security)
        job = JobContext(binding, registry.store, report.get('runId'), str(Path(self.artifact_security.path).parent),
                         Stage.ARTIFACT_SECURITY, (), receipt['apkSha256'])
        checked = validate_observation(Observation(self.artifact_security), job, self.backend.clock())
        if checked['status'] != 'passed': raise admission.Rejected('Final artifact/native security did not pass')
        native_map = registry.store.json(binding.native_mapping)
        receipt['expiresAt'] = min(receipt['expiresAt'], native_map['expiresAt'], checked['finishedAt']+MAX_AGE)
        apk = admission.Evidence.parse(value['apk'])
        registry.store.verify(apk, APK_LIMIT)
        return receipt, apk, {'registry': registry, 'metadata': receipt['metadata']}

    def _readback(self, receipt: dict, metadata: dict) -> dict:
        paths = self._paths()
        self._version(metadata)
        data = self._call(('exec-out', 'cat', paths[0]), timeout=60, maximum=APK_LIMIT)
        if hashlib.sha256(data).hexdigest() != receipt['apkSha256']:
            raise admission.Rejected('Installed APK bytes differ from independently inspected admission')
        # Exact installed bytes bind the inspector's package/version/certificate.
        return {'apkSha256': receipt['apkSha256'], 'package': self.spec.package,
                'versionCode': metadata['versionCode'], 'versionName': metadata['versionName'],
                'certificateSha256': receipt['certificateSha256'], 'path': paths[0]}

    def install(self, record: admission.Evidence) -> dict:
        admitted, apk, context = self._admit(record)
        identity = self.facts()
        if self._paths(allow_absent=True):
            if self._installed is None: raise admission.Rejected('Device package already occupied without this adapter ownership')
            self._ensure_installed()
        store = context['registry'].store
        self.facts(); store.verify(apk, APK_LIMIT)
        result = self._mutation(('install', '--no-streaming', '-r', str(store.path(apk.path))), timeout=120, maximum=64*1024)
        if result.decode().strip().splitlines()[-1:] != ['Success']: raise admission.Rejected('Fixed APK install did not succeed')
        installed = self._readback(admitted, context['metadata'])
        self._installed = {'admission': admitted, 'metadata': context['metadata'], 'record': record, **installed}
        return {'schema': 'micro.android.device-install/1', 'role': self.role, 'identity': identity,
                'installed': installed, 'artifactRecord': record.json(), 'observedAt': self.backend.clock(),
                'certificateEvidence': 'Exact installed bytes match independently inspected signed APK',
                'journey': 'not-evaluated', 'recovery': 'unknown'}

    def bind_installed(self, record: admission.Evidence) -> dict:
        admitted, _, context = self._admit(record)
        self.facts()
        installed = self._readback(admitted, context['metadata'])
        self._installed = {'admission': admitted, 'metadata': context['metadata'], 'record': record, **installed}
        return installed

    def _ensure_installed(self):
        if self._installed is None: raise admission.Rejected('No exact admitted installed artifact bound to adapter')
        registry = self.registry or load_registry()
        registry.store.verify(self.artifact_security)
        if self._installed['admission']['expiresAt'] <= self.backend.clock(): raise admission.Rejected('Device artifact admission expired')
        self.facts()
        installed = self._readback(self._installed['admission'], self._installed['metadata'])
        if any(installed[key] != self._installed[key] for key in installed):
            raise admission.Rejected('Installed APK identity changed')

    def force_stop(self) -> dict:
        self._ensure_installed()
        start_epoch = self._fixture_health_clock()['epochSeconds'] if self._health_windows else None
        self._mutation(('shell', 'am', 'force-stop', self.spec.package), maximum=8192)
        if self._health_windows:
            end_epoch = self._fixture_health_clock()['epochSeconds']
            for window in self._health_windows.values():
                window['stops'].append({'startEpochSeconds': start_epoch, 'endEpochSeconds': end_epoch})
        return {'operation': 'force-stop', 'role': self.role, 'package': self.spec.package,
                'apkSha256': self._installed['apkSha256'], 'observedAt': self.backend.clock()}

    def _fixture_health_scope(self):
        if self.role not in fixture_health.SERIALS or self.spec.package != fixture_health.PACKAGE or self.store is None:
            raise admission.Rejected('Health observations require fixed fixture role and protected Store')

    def _fixture_health_clock(self) -> dict:
        before = self.backend.clock(); monotonic_before = time.monotonic()
        raw = self._call(('shell', 'date', '+%s'), timeout=5, maximum=1024)
        timezone = self._call(('shell', 'getprop', 'persist.sys.timezone'), timeout=5, maximum=1024).decode('utf-8').strip()
        if not re.fullmatch(rb'[1-9][0-9]{8,11}\n?', raw) or not re.fullmatch(r'[A-Za-z0-9_+/-]{1,128}', timezone):
            raise admission.Rejected('Unknown health device clock/timezone')
        fixture_health.ZoneInfo(timezone)
        return {'epochSeconds': int(raw), 'timezone': timezone,
                'hostStartedAt': before, 'hostFinishedAt': self.backend.clock(),
                'hostMonotonicStartedAt': monotonic_before, 'hostMonotonicFinishedAt': time.monotonic()}

    def observe_fixture_exit_info(self) -> admission.Evidence:
        """Retain one fixed package dump, including bounded failure evidence."""
        self._fixture_health_scope()
        token = uuid4().hex; directory = 'fixture-health/'+self.role+'/'+token
        self.store.path(directory).mkdir(mode=0o700, parents=True, exist_ok=False)
        raw = None; records = None; failure = None; clock = None; uid = None
        try:
            self._ensure_installed()
            clock = self._fixture_health_clock()
            owners = self._call(('shell', 'pm', 'list', 'packages', '-U', fixture_health.PACKAGE), timeout=10, maximum=8192)
            owner = re.fullmatch(rb'package:app\.micro\.factory\.fixture uid:([0-9]+)\n?', owners)
            if not owner: raise admission.Rejected('Unknown or ambiguous actual fixture package UID')
            uid = int(owner[1])
            data = self._call(('shell', 'dumpsys', '-t', '5', 'activity', 'exit-info', fixture_health.PACKAGE), timeout=10, maximum=fixture_health.DUMP_LIMIT)
            path = self.store.path(directory+'/exit-info.txt')
            self.store.budget()
            with path.open('xb') as output: output.write(data)
            path.chmod(0o400); raw = self.store.describe(directory+'/exit-info.txt', fixture_health.DUMP_LIMIT)
            records = fixture_health.parse_exit_info(data, uid, clock['timezone'])
            self._ensure_installed()
        except Exception as error:
            failure = {'type': type(error).__name__, 'reason': str(error)[:800],
                       'transport': getattr(error, 'transport_facts', None),
                       'stdoutPrefix': getattr(error, 'stdout_prefix', b'').decode('utf-8', errors='replace'),
                       'stderrPrefix': getattr(error, 'stderr_prefix', b'').decode('utf-8', errors='replace')}
        return self.store.write(directory+'/observation.json', {
            'schema': 'micro.android.fixture-exit-info/1', 'role': self.role,
            'package': fixture_health.PACKAGE, 'leaseSha256': self._lease_pin,
            'apkSha256': self._installed['apkSha256'] if self._installed else None,
            'observedAt': self.backend.clock(), 'clock': clock, 'packageUid': uid,
            'raw': raw.json() if raw else None, 'records': records, 'failure': failure,
            'controllerSha256': hashlib.sha256(Path(fixture_health.__file__).read_bytes()).hexdigest()})

    def start_fixture_health_window(self) -> fixture_health.Ticket:
        self._fixture_health_scope()
        if self.backend.health_stream is None:
            raise admission.Rejected('Fixture health stream backend unavailable')
        if self._health_windows: raise admission.Rejected('A fixture health window is already owned')
        baseline = self.observe_fixture_exit_info()
        facts = self.store.json(baseline)
        if facts['failure']:
            error = admission.Rejected('Fixture health baseline unavailable: '+facts['failure']['reason'])
            error.health_evidence = [baseline.json()]
            raise error
        try:
            stream = self.backend.health_stream(self.role, facts['clock']['epochSeconds'])
        except Exception as error:
            failure = self.store.write('fixture-health/'+self.role+'/'+uuid4().hex+'.json', {
                'schema': 'micro.android.fixture-health-start-failure/1', 'role': self.role,
                'baseline': baseline.json(), 'error': {'type': type(error).__name__, 'reason': str(error)[:800]}})
            error.health_evidence = [baseline.json(), failure.json()]
            raise
        ticket = fixture_health.Ticket(uuid4().hex, self.role, self._lease_pin,
            self._installed['apkSha256'], facts['controllerSha256'], baseline)
        self._health_windows[ticket.token] = {'ticket': ticket, 'stream': stream, 'stops': []}
        return ticket

    def finish_fixture_health_window(self, ticket: fixture_health.Ticket) -> admission.Evidence:
        window = self._health_windows.get(ticket.token) if isinstance(ticket, fixture_health.Ticket) else None
        if window is None or window['ticket'] != ticket: raise admission.Rejected('Unknown/cross-bound health ticket')
        failure = None; cleanup_failure = None; final = None; stream = None; summary = None
        try:
            self._fixture_health_scope()
            final = self.observe_fixture_exit_info()
            facts = self.store.json(final)
            if facts['failure']: raise admission.Rejected('Final health observation failed: '+facts['failure']['reason'])
            if ticket.lease_sha256 != self._lease_pin or ticket.apk_sha256 != self._installed['apkSha256'] or ticket.controller_sha256 != hashlib.sha256(Path(fixture_health.__file__).read_bytes()).hexdigest():
                raise admission.Rejected('Health lease/artifact/controller changed')
        except Exception as error: failure = {'type': type(error).__name__, 'reason': str(error)[:800]}
        finally:
            try: stream = window['stream'].finish()
            except Exception as error:
                cleanup_failure = {'type': type(error).__name__, 'reason': str(error)[:800]}
            self._health_windows.pop(ticket.token)
        if not failure and not cleanup_failure:
            try:
                baseline_facts = self.store.json(ticket.baseline)
                before = dict(baseline_facts['clock'], records=baseline_facts['records'])
                after = dict(facts['clock'], records=facts['records'])
                summary = fixture_health.summarize(before, after, stream, window['stops'])
            except Exception as error: failure = {'type': type(error).__name__, 'reason': str(error)[:800]}
        directory = 'fixture-health/'+ticket.role+'/'+ticket.token
        self.store.path(directory).mkdir(mode=0o700, parents=True, exist_ok=False)
        return self.store.write(directory+'/window.json', {
            'schema': 'micro.android.fixture-health-window/1', 'role': ticket.role,
            'package': fixture_health.PACKAGE, 'leaseSha256': ticket.lease_sha256,
            'apkSha256': ticket.apk_sha256, 'controllerSha256': ticket.controller_sha256,
            'baseline': ticket.baseline.json(), 'final': final.json() if final else None,
            'stream': stream, 'expectedStops': window['stops'], 'failure': failure,
            'cleanupFailure': cleanup_failure,
            'summary': summary, 'imageCalibration': fixture_health.IMAGE_CALIBRATION})

    def launch_offline(self) -> dict:
        self._ensure_installed()
        if self._call(('shell', 'settings', 'get', 'global', 'airplane_mode_on'), maximum=1024).strip() != b'1' or self._call(('shell', 'settings', 'get', 'global', 'wifi_on'), maximum=1024).strip() != b'0':
            raise admission.Rejected('Offline device settings have not been independently prepared')
        routes = self._call(('shell', 'ip', 'route'), maximum=8192).decode().splitlines()
        if any(line.lstrip().startswith('default ') for line in routes): raise admission.Rejected('Device has a default network route')
        output = self._mutation(('shell', 'am', 'start', '-W', '-n', self.spec.package+'/.MainActivity'), timeout=45, maximum=64*1024).decode()
        if not re.search(r'^Status: ok$', output, re.MULTILINE) or 'Error:' in output or 'Exception' in output:
            raise admission.Rejected('Known offline activity launch failed')
        return {'operation': 'offline-launch', 'role': self.role, 'package': self.spec.package,
                'apkSha256': self._installed['apkSha256'], 'observedAt': self.backend.clock(),
                'journey': 'not-evaluated', 'crashCount': None, 'anrCount': None}

    def _dump(self) -> bytes:
        remote = '/sdcard/micro-native-controller-'+uuid4().hex+'.xml'
        failure = None
        try:
            self._mutation(('shell', 'rm', '-f', remote), maximum=1024)
            output = self._mutation(('shell', 'uiautomator', 'dump', remote), timeout=45, maximum=8192).decode().splitlines()
            if not any(line in ('UI hierchary dumped to: '+remote, 'UI hierarchy dumped to: '+remote) for line in output):
                raise admission.Rejected('No successful fresh hierarchy dump')
            data = self._call(('exec-out', 'cat', remote), maximum=XML_LIMIT)
            hierarchy(data, self.spec.package)
            return data
        except BaseException as error:
            failure = error; raise
        finally:
            try: self._mutation(('shell', 'rm', '-f', remote), maximum=1024)
            except Exception as error:
                if failure: failure.add_note('Owned hierarchy scratch cleanup failed: '+str(error)[:800])
                else: raise admission.Rejected('Owned hierarchy scratch cleanup failed') from error

    def capture(self, label: str) -> Capture:
        if not isinstance(label, str) or not LABEL.fullmatch(label): raise admission.Rejected('Unsafe observation label')
        self._ensure_installed()
        identity = self.facts(); started = self.backend.clock()
        xml = self._dump(); png = self._call(('exec-out', 'screencap', '-p'), maximum=PNG_LIMIT)
        size = validate_png(png); nodes = hierarchy(xml, self.spec.package, size)
        self._ensure_installed()
        store = self.store or admission.Store(ROOT)
        token = uuid4().hex; directory = 'observations/'+self.role+'/'+token
        store.path(directory).mkdir(parents=True, mode=0o700, exist_ok=False)
        references = {}
        for name, data in (('screen.png', png), ('hierarchy.xml', xml)):
            store.budget()
            path = store.path(directory+'/'+name)
            with path.open('xb') as output: output.write(data)
            path.chmod(0o400)
            references[name] = store.describe(directory+'/'+name, PNG_LIMIT)
        observed = self.backend.clock()
        receipt = store.write(directory+'/observation.json', {
            'schema': 'micro.android.device-observation/1', 'role': self.role, 'label': label,
            'captureStartedAt': started, 'observedAt': observed, 'identity': identity,
            'installed': {key: self._installed[key] for key in ('apkSha256','package','versionCode','versionName','certificateSha256')},
            'dimensions': list(size), 'files': {name: ref.json() for name,ref in references.items()},
            'hierarchy': nodes, 'scratchCleanup': {'absent': True}, 'acceptanceVerdict': 'not-evaluated',
            'limitations': ['Hierarchy and screenshot are sequential observations', 'No crash/ANR, accessibility or recovery verdict inferred']})
        capture = Capture(token, self.role, self._lease_pin, self._installed['apkSha256'], observed,
                          references['screen.png'], references['hierarchy.xml'], receipt, size)
        self._captures[token] = capture
        return capture

    def tap(self, capture: Capture, control: str) -> dict:
        if self.role not in ('factory-source', 'factory-target') or control not in CONTROLS:
            raise admission.Rejected('Only fixed fixture controls are admitted')
        if not isinstance(capture, Capture) or self._captures.get(capture.token) != capture or capture.role != self.role:
            raise admission.Rejected('Unknown observation ticket')
        self._ensure_installed()
        age = self.backend.clock()-capture.observed_at
        if not 0 <= age <= MAX_FRESH_SECONDS or capture.lease_sha256 != self._lease_pin or capture.artifact_sha256 != self._installed['apkSha256']:
            raise admission.Rejected('Stale hierarchy, lease or artifact observation')
        store = self.store or admission.Store(ROOT)
        store.verify(capture.receipt); store.verify(capture.png, PNG_LIMIT)
        xml = store.read(capture.xml, XML_LIMIT)
        # Re-dump immediately before deriving coordinates. Changed hierarchy
        # requires a new capture rather than blindly tapping the old location.
        if self._dump() != xml: raise admission.Rejected('Hierarchy changed since observation')
        nodes = hierarchy(xml, self.spec.package, capture.dimensions)
        resource, description = CONTROLS[control]
        matches = [node for node in nodes if node['resourceId'] in (resource,self.spec.package+':id/'+resource) and node['description'] == description and node['enabled'] and node['clickable']]
        if len(matches) != 1: raise admission.Rejected('Fixture control missing, disabled or ambiguous')
        left, top, right, bottom = matches[0]['boundsPixels']
        if left == right or top == bottom: raise admission.Rejected('Fixture control has empty bounds')
        self.verify_lease()
        if self.backend.clock()-capture.observed_at > MAX_FRESH_SECONDS: raise admission.Rejected('Hierarchy expired before tap')
        self._mutation(('shell', 'input', 'tap', str((left+right)//2), str((top+bottom)//2)), maximum=1024)
        self._captures.pop(capture.token)
        return {'operation': 'fixture-tap', 'role': self.role, 'control': control,
                'observation': capture.receipt.json(), 'observedAt': self.backend.clock(),
                'acceptanceVerdict': 'not-evaluated'}
