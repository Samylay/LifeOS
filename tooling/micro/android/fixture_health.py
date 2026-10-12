"""Fixed synthetic fixture diagnostics, not an arbitrary device command interface.

No image calibration has run. Captures expose observed signals but cannot yet
produce a passed health authority. Event messages are discarded before storage.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import os
from pathlib import Path
import re
import selectors
import socket
import subprocess
import threading
import time
from zoneinfo import ZoneInfo

try:
    from . import admission
except ImportError:
    import admission

PACKAGE = 'app.micro.factory.fixture'
SERIALS = {'factory-source': 'emulator-5584', 'factory-target': 'emulator-5586'}
DUMP_LIMIT = 256 * 1024
STREAM_LIMIT = 1024 * 1024
STDERR_LIMIT = 64 * 1024
LINE_LIMIT = 16 * 1024
RECORD_LIMIT = 1024
WINDOW_SECONDS = 180
HEADER = 'ACTIVITY MANAGER PROCESS EXIT INFO (dumpsys activity exit-info)'
CONTROLLER = Path(__file__)
# Protected authority must be readmitted after actual API36 image calibration.
# This is not a caller-selectable success flag.
IMAGE_CALIBRATION = None


def stream_argv(role: str, epoch_seconds: int) -> tuple[str, ...]:
    if role not in SERIALS or type(epoch_seconds) is not int or epoch_seconds <= 0:
        raise admission.Rejected('Fixed fixture health role/clock required')
    return ('/usr/bin/adb', '-H', '127.0.0.1', '-P', '5037', '-s', SERIALS[role],
            'shell', 'logcat', '-b', 'events', '-v', 'threadtime', '-v', 'epoch',
            '-v', 'usec', '-v', 'printable', '-T', str(epoch_seconds)+'.000',
            '-s', 'am_anr:I', 'am_crash:I')


def wall_timestamp(value: str, timezone: str) -> float:
    """Reject nonexistent or ambiguous local times, rather than assume UTC."""
    try:
        plain = datetime.strptime(value, '%Y-%m-%d %H:%M:%S.%f')
        zone = ZoneInfo(timezone)
        candidates = {plain.replace(tzinfo=zone, fold=fold).timestamp() for fold in (0, 1)
                      if datetime.fromtimestamp(plain.replace(tzinfo=zone, fold=fold).timestamp(), zone).replace(tzinfo=None) == plain}
        if len(candidates) != 1: raise ValueError('Ambiguous/nonexistent local time')
        return candidates.pop()
    except (ValueError, KeyError) as error:
        raise admission.Rejected('Unknown exit timestamp/timezone') from error


REASONS = {0: 'UNKNOWN', 1: 'EXIT_SELF', 2: 'SIGNALED', 3: 'LOW_MEMORY',
           4: 'APP CRASH(EXCEPTION)', 5: 'APP CRASH(NATIVE)', 6: 'ANR',
           7: 'INITIALIZATION FAILURE', 8: 'PERMISSION CHANGE',
           9: 'EXCESSIVE RESOURCE USAGE', 10: 'USER REQUESTED', 11: 'USER STOPPED',
           12: 'DEPENDENCY DIED', 13: 'OTHER KILLS BY SYSTEM', 14: 'FREEZER',
           15: 'STATE CHANGE', 16: 'PACKAGE UPDATED'}


def parse_exit_info(data: bytes, package_uid: int, timezone: str) -> list[dict]:
    if type(package_uid) is not int or not 10000 <= package_uid < 100000:
        raise admission.Rejected('Observed user0 package UID required')
    if not isinstance(data, bytes) or len(data) > DUMP_LIMIT or b'\x00' in data:
        raise admission.Rejected('Exit-info byte bound or encoding')
    try: lines = data.decode('utf-8').splitlines()
    except UnicodeError as error: raise admission.Rejected('Exit-info encoding') from error
    if not lines or lines[0].strip() != HEADER or any(len(line.encode()) > LINE_LIMIT for line in lines):
        raise admission.Rejected('Exit-info header/line bound')
    if len(lines) < 2 or not re.fullmatch(r'Last Timestamp of Persistence Into Persistent Storage: \d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}', lines[1].strip()):
        raise admission.Rejected('Exit-info persistence header')
    # Empty calibrated grammar is a readable empty inventory, not health pass.
    if len(lines) == 2: return []
    if lines[2].strip() != 'package: '+PACKAGE:
        raise admission.Rejected('Exit-info package differs')
    records = []; pos = 3; seen = set()
    while pos < len(lines):
        match = re.fullmatch(r'Historical Process Exit for uid=(\d+)', lines[pos].strip())
        if match:
            if int(match[1]) != package_uid: raise admission.Rejected('Exit-info package UID differs')
            pos += 1
            if pos == len(lines): raise admission.Rejected('Incomplete exit-info UID section')
        if pos+3 >= len(lines) or not re.fullmatch(r'ApplicationExitInfo #\d+:', lines[pos].strip()):
            raise admission.Rejected('Incomplete/unrecognized exit-info record')
        identity = re.fullmatch(r'timestamp=(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}) pid=(\d+) realUid=(\d+) packageUid=(\d+) definingUid=(\d+) user=(\d+)', lines[pos+1].strip())
        cause = re.fullmatch(r'process=(\S+) reason=(\d+) \((.*)\) subreason=(\d+) \(([^\r\n]*)\) status=(-?\d+)', lines[pos+2].strip())
        tail = lines[pos+3].strip()
        if not identity or not cause or not re.fullmatch(r'importance=\d+ pss=\S+ rss=\S+ description=.* state=(?:empty|\d+ bytes) trace=\S+', tail):
            raise admission.Rejected('Malformed grouped exit-info fields')
        # There are four lines per record; the next record/section is parsed below.
        stamp, pid, real, uid, defining, user = identity.groups()
        process, reason, text, subreason, subtext, status = cause.groups()
        if int(uid) != package_uid or int(user) != 0 or int(real) != package_uid or int(defining) != package_uid or int(pid) <= 0:
            raise admission.Rejected('Foreign/isolated exit-info identity')
        if process != PACKAGE and not re.fullmatch(re.escape(PACKAGE)+r':[A-Za-z0-9_.-]+', process):
            raise admission.Rejected('Foreign exit-info process')
        if REASONS.get(int(reason)) != text:
            raise admission.Rejected('Unknown/inconsistent exit reason')
        record = {'timestamp': wall_timestamp(stamp, timezone), 'pid': int(pid),
                  'packageUid': int(uid), 'process': process, 'reason': int(reason),
                  'subreason': int(subreason), 'subreasonText': subtext, 'status': int(status)}
        key = (record['timestamp'], record['pid'], process)
        if key in seen: raise admission.Rejected('Duplicate exit-info record')
        seen.add(key); records.append(record); pos += 4
        if len(records) > RECORD_LIMIT: raise admission.Rejected('Exit-info record bound')
    return records


EVENT = re.compile(r'^(\d+\.\d{3,6})\s+\d+\s+\d+\s+I\s+(am_anr|am_crash)\s*:\s*\[(\d+),(\d+),([^,]+),(\d+),(.*)\]$')


def parse_event(line: bytes) -> dict | None:
    """Only the trusted producer prefix is stored; diagnostic tails are opaque."""
    if not isinstance(line, bytes) or len(line) > LINE_LIMIT or b'\x00' in line:
        raise admission.Rejected('Event line byte bound/encoding')
    try: value = line.decode('utf-8')
    except UnicodeError as error: raise admission.Rejected('Event line encoding') from error
    if value == '--------- beginning of events': return None
    match = EVENT.fullmatch(value)
    if not match: raise admission.Rejected('Unknown event/drop/truncation line')
    stamp, tag, user, pid, process, flags, _discarded = match.groups()
    if int(pid) <= 0: raise admission.Rejected('Invalid event app PID')
    if int(user) != 0: raise admission.Rejected('Unexpected event user')
    if process != PACKAGE and not re.fullmatch(re.escape(PACKAGE)+r':[A-Za-z0-9_.-]+', process):
        return None
    return {'timestamp': float(stamp), 'tag': tag, 'user': 0, 'pid': int(pid),
            'process': process, 'flags': int(flags)}


class EventStream:
    """Own one exact ADB child and continuously drain bounded diagnostic pipes."""
    def __init__(self, role: str, epoch_seconds: int):
        self.argv = stream_argv(role, epoch_seconds)
        self.started = time.monotonic(); self.events = []; self.failure = None
        self.stdout_bytes = 0; self.stderr_bytes = 0; self.lines = 0
        self.stop = threading.Event(); self.process = None
        self.cleanup_failure = None; self.finished = False
        try:
            # Reuse only the existing server, never allow ADB auto-start.
            with socket.create_connection(('127.0.0.1', 5037), timeout=1): pass
            self.process = subprocess.Popen(self.argv, stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                env={'PATH': '/usr/bin:/bin'}, start_new_session=True)
            self.pid = self.process.pid
            stat = Path('/proc')/str(self.pid)/'stat'
            self.start_ticks = int(stat.read_text().rsplit(')', 1)[1].split()[19])
            self.thread = threading.Thread(target=self._drain, daemon=True)
            self.thread.start()
        except BaseException:
            if self.process is not None:
                self.process.kill(); self.process.wait(timeout=3)
                self.process.stdout.close(); self.process.stderr.close()
            raise

    def _drain(self):
        pending = bytearray()
        try:
            with selectors.DefaultSelector() as selector:
                for stream, name in ((self.process.stdout, 'stdout'), (self.process.stderr, 'stderr')):
                    os.set_blocking(stream.fileno(), False); selector.register(stream, selectors.EVENT_READ, name)
                while selector.get_map():
                    if time.monotonic()-self.started > WINDOW_SECONDS:
                        raise admission.Rejected('Health stream wall bound')
                    for key, _ in selector.select(.05):
                        chunk = os.read(key.fileobj.fileno(), 65536)
                        if not chunk:
                            selector.unregister(key.fileobj)
                            if not self.stop.is_set(): raise admission.Rejected('Health stream unexpected EOF')
                            continue
                        if key.data == 'stderr':
                            self.stderr_bytes += len(chunk)
                            if self.stderr_bytes > STDERR_LIMIT: raise admission.Rejected('Health stream stderr bound')
                            # Do not retain arbitrary device diagnostic text.
                            raise admission.Rejected('Health stream stderr diagnostic')
                        self.stdout_bytes += len(chunk)
                        if self.stdout_bytes > STREAM_LIMIT: raise admission.Rejected('Health stream byte bound')
                        pending.extend(chunk)
                        while b'\n' in pending:
                            line, _, rest = pending.partition(b'\n'); pending = bytearray(rest)
                            self.lines += 1; event = parse_event(bytes(line))
                            if event is not None:
                                if len(self.events) >= RECORD_LIMIT: raise admission.Rejected('Health event count bound')
                                self.events.append(event)
                        if len(pending) > LINE_LIMIT: raise admission.Rejected('Health stream partial line bound')
                if pending: raise admission.Rejected('Health stream truncated final line')
        except Exception as error:
            self.failure = str(error)[:300]
        finally:
            if self.process.poll() is None:
                try: self.process.kill(); self.process.wait(timeout=3)
                except Exception as error: self.cleanup_failure = type(error).__name__
            self.finished = True

    def finish(self) -> dict:
        if not self.stop.is_set():
            # A dead stream cannot be relabeled as an intentional stop.
            if self.process.poll() is not None and not self.failure:
                self.failure = 'Health stream exited before observation end'
            self.stop.set()
            if self.process.poll() is None:
                try: self.process.kill()
                except Exception as error: self.cleanup_failure = type(error).__name__
        self.thread.join(timeout=4)
        if self.thread.is_alive(): self.cleanup_failure = 'Health stream drain did not finish'
        if self.process.poll() is None: self.cleanup_failure = 'Owned ADB child still alive'
        if not self.thread.is_alive():
            self.process.stdout.close(); self.process.stderr.close()
        return {'argv': list(self.argv), 'pid': self.pid, 'startTicks': self.start_ticks,
                'seconds': time.monotonic()-self.started, 'stdoutBytes': self.stdout_bytes,
                'stderrBytes': self.stderr_bytes, 'lines': self.lines,
                'events': list(self.events), 'failure': self.failure,
                'cleanupFailure': self.cleanup_failure,
                'cleanup': {'absent': self.process.poll() is not None and not self.thread.is_alive()},
                'exitCode': self.process.poll(), 'readiness': 'image-calibration-pending'}


@dataclass(frozen=True)
class Ticket:
    token: str
    role: str
    lease_sha256: str
    apk_sha256: str
    controller_sha256: str
    baseline: admission.Evidence


def summarize(baseline: dict, final: dict, stream: dict, stops: list[dict]) -> dict:
    """Counts describe this bounded observed window, never Android losslessness."""
    if baseline['timezone'] != final['timezone'] or final['epochSeconds'] < baseline['epochSeconds']:
        raise admission.Rejected('Health window clock/timezone changed')
    if final['epochSeconds']-baseline['epochSeconds'] > WINDOW_SECONDS:
        raise admission.Rejected('Health window duration exceeded')
    if 'hostMonotonicStartedAt' in baseline and 'hostMonotonicStartedAt' in final:
        elapsed = final['hostMonotonicStartedAt']-baseline['hostMonotonicStartedAt']
        if elapsed < 0 or abs(final['epochSeconds']-baseline['epochSeconds']-elapsed) > 3:
            raise admission.Rejected('Device wall clock changed relative to controller monotonic time')
    before = {(r['timestamp'], r['pid'], r['process']): r for r in baseline['records']}
    current = {(r['timestamp'], r['pid'], r['process']): r for r in final['records']}
    if not set(before) <= set(current): raise admission.Rejected('Exit history lost baseline records')
    records = []
    for key, record in current.items():
        if key in before and record != before[key]:
            raise admission.Rejected('Historical exit reason changed')
        if key not in before and record['timestamp'] >= baseline['epochSeconds']:
            if record['timestamp'] >= final['epochSeconds']+1:
                raise admission.Rejected('Exit timestamp outside observed end')
            records.append(record)
    events = stream['events']
    if any(event['timestamp'] < baseline['epochSeconds'] or event['timestamp'] >= final['epochSeconds']+1 for event in events):
        raise admission.Rejected('Event outside observed health window')
    unknown = []
    for record in records:
        expected_stop = record['reason'] == 10 and record['subreasonText'] == 'FORCE STOP' and any(
            stop['startEpochSeconds'] <= record['timestamp'] < stop['endEpochSeconds']+1 for stop in stops)
        if record['reason'] not in (4, 5, 6) and not expected_stop: unknown.append(record)
    crash_events = sum(event['tag'] == 'am_crash' for event in events)
    anr_events = sum(event['tag'] == 'am_anr' for event in events)
    crashes = sum(record['reason'] in (4, 5) for record in records)
    anrs = sum(record['reason'] == 6 for record in records)
    adverse = crash_events or anr_events or crashes or anrs
    coverage = not stream['failure'] and not stream['cleanupFailure'] and stream['cleanup']['absent'] and not unknown
    if not any(stop['endEpochSeconds'] >= stop['startEpochSeconds'] and any(
            record['reason'] == 10 and record['subreasonText'] == 'FORCE STOP' and
            stop['startEpochSeconds'] <= record['timestamp'] < stop['endEpochSeconds']+1
            for record in records) for stop in stops):
        coverage = False
    return {'status': 'failed' if adverse else 'unknown',
            'crashCount': None, 'anrCount': None,
            'observedMatchingCrashEvents': crash_events, 'observedMatchingAnrEvents': anr_events,
            'observedCrashExitCount': crashes, 'observedAnrExitCount': anrs,
            'unknownExits': unknown, 'newExitRecords': records,
            'transportCoverage': 'complete' if coverage else 'unknown',
            'imageCalibration': IMAGE_CALIBRATION,
            'scope': 'Observed matching signals during the bounded synthetic fixture journey',
            'limitations': ['API36 image/parser/subscription calibration pending',
                            'No global event-losslessness or customer SLO claim']}
