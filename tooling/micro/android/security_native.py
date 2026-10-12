#!/usr/bin/env python3
"""Supervisor-owned Android security policy and bounded scanner receipts."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import subprocess
import time
import uuid
from urllib.parse import quote

HERE = Path(__file__).resolve().parent
POLICY = json.loads((HERE / 'security_policy.json').read_text())
DEFAULT_STATE = Path('/home/quorky/apps/lifeos/.scratch/software-factory-benchmark/run-20260930/controller/native-security')
MAVEN_LIMITS = {'graphCount': 2048, 'graphBytes': 8 * 1024**2,
                'totalBytes': 64 * 1024**2, 'componentCount': 100000, 'projectBytes': 1024}


def validate_maven_files(files):
    """Keep one exact hash identity for every bounded raw graph, without deduplication."""
    if not files or len(files) > MAVEN_LIMITS['graphCount']: raise ValueError('Maven graph file budget')
    names = set(); total = 0
    for item in files:
        name = item.get('path')
        if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9_.-]+\.json', name): raise ValueError('Maven graph file invalid')
        if name in names: raise ValueError('duplicate Maven graph name')
        names.add(name)
        if type(item.get('bytes')) is not int or not 0 <= item['bytes'] <= MAVEN_LIMITS['graphBytes']:
            raise ValueError('Maven graph file invalid')
        if not isinstance(item.get('sha256'), str) or not re.fullmatch(r'[0-9a-f]{64}', item['sha256']): raise ValueError('Maven graph hash invalid')
        total += item['bytes']
    if total > MAVEN_LIMITS['totalBytes']: raise ValueError('Maven graph total byte budget')


def maven_project(value):
    # Earlier retained graphs did not capture project.path. Never reconstruct it.
    project = value.get('project', 'unknown')
    if not isinstance(project, str) or not project.strip(): raise ValueError('Maven project identity invalid')
    try: size = len(project.encode('utf-8'))
    except UnicodeEncodeError as error: raise ValueError('Maven project identity invalid') from error
    if size > MAVEN_LIMITS['projectBytes']: raise ValueError('Maven project identity invalid')
    return project


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        while chunk := stream.read(1024 * 1024): h.update(chunk)
    return h.hexdigest()


def tree_manifest(root):
    entries = []
    for p in sorted(Path(root).rglob('*')):
        if p.is_symlink(): raise ValueError('symlink in accepted input')
        if p.is_file(): entries.append({'path': str(p.relative_to(root)), 'bytes': p.stat().st_size, 'sha256': digest(p)})
        elif not p.is_dir(): raise ValueError('special file in accepted input')
    return entries


def tree_size(root):
    return sum(p.stat().st_size for p in Path(root).rglob('*') if p.is_file() and not p.is_symlink())


def authority():
    paths = [HERE / 'security_policy.json', HERE / 'security_worker.mjs', HERE / 'security_inventory.mjs', HERE / 'security_packaged.mjs', Path(__file__),
             HERE.parent / 'tools-lock.json', *sorted((HERE.parent / 'scanner-config').glob('*'))]
    return {str(p): digest(p) for p in paths}


def available_memory():
    for line in Path('/proc/meminfo').read_text().splitlines():
        if line.startswith('MemAvailable:'): return int(line.split()[1]) * 1024
    raise ValueError('missing MemAvailable')


def validate_sandbox(inspected, acquire=False, writable_db=False):
    host = inspected['HostConfig']; config = inspected['Config']
    if config['Image'] != POLICY['image'] or config['User'] != '65534:65534': raise ValueError('sandbox identity mismatch')
    if host['NetworkMode'] != ('bridge' if acquire else 'none') or not host['ReadonlyRootfs']: raise ValueError('sandbox network/rootfs mismatch')
    if host['Memory'] != POLICY['memoryBytes'] or host['MemorySwap'] != POLICY['memoryBytes']: raise ValueError('sandbox memory mismatch')
    if host['NanoCpus'] != 10**9 or host['PidsLimit'] != 128: raise ValueError('sandbox CPU/process mismatch')
    if host['CapDrop'] != ['ALL'] or host['Privileged'] or 'no-new-privileges' not in host['SecurityOpt']: raise ValueError('sandbox capabilities mismatch')
    if host['LogConfig']['Type'] != 'none' or host['PortBindings'] or host['Devices']: raise ValueError('sandbox exposure mismatch')
    if any('PROXY=' in value.upper() or value.upper().startswith(('AWS_', 'GH_TOKEN=', 'GITHUB_TOKEN=')) for value in config['Env']): raise ValueError('credential/proxy environment')
    allowed = {'/worker.mjs', '/security_inventory.mjs', '/config', '/source', '/maven', '/db', '/public-ca.crt'}
    for mount in inspected['Mounts']:
        if mount['Type'] == 'tmpfs' and mount['Destination'] == '/tmp': continue
        if mount['Destination'] not in allowed or mount['Type'] != 'bind': raise ValueError('unexpected scanner mount')
        if mount['RW'] and not (writable_db and mount['Destination'] == '/db'): raise ValueError('writable scanner input')
    if '/tmp' not in host['Tmpfs'] or 'size=384m' not in host['Tmpfs']['/tmp']: raise ValueError('temporary budget mismatch')


def validate_tools(tools):
    for name, accepted in POLICY['tools'].items():
        observed = tools.get(name, {})
        if observed.get('exitCode') != 0 or observed.get('binarySha256') != accepted['binarySha256']:
            raise ValueError('scanner binary/version authority mismatch: ' + name)
        found = re.search(r'(?:Version:\s*|^)([0-9]+\.[0-9]+\.[0-9]+)', observed.get('versionOutput', ''))
        if not found or found[1] != accepted['version']: raise ValueError('scanner version mismatch: ' + name)


def validate_database(status, files, now=None, imported=None):
    """Status must be actual pinned Grype readback, not an update success flag."""
    if status.get('error') or status.get('valid') is not True: raise ValueError('missing/corrupt advisory database')
    built = status.get('built') or status.get('builtAt')
    if not isinstance(built, str): raise ValueError('database creation time missing')
    created = datetime.fromisoformat(built.replace('Z', '+00:00'))
    if created.tzinfo is None: raise ValueError('database creation time lacks timezone')
    age = ((now or datetime.now(timezone.utc)) - created).total_seconds()
    if age < -300 or age > POLICY['databaseMaxAgeSeconds']: raise ValueError('stale/future advisory database')
    db = [p for p in files if p['path'].endswith('/vulnerability.db') or p['path'] == 'vulnerability.db']
    if len(db) != 1 or not db[0]['bytes']: raise ValueError('database file missing')
    checksum = status.get('checksum')
    if checksum:
        if checksum.removeprefix('sha256:') != db[0]['sha256']: raise ValueError('database checksum mismatch')
    else:
        # Grype 0.119 validates the xxh64 digest in import.json; its status JSON
        # does not expose a checksum. SHA256 is independently measured above.
        if not imported or not re.fullmatch(r'xxh64:[0-9a-f]{16}', imported.get('digest', '')):
            raise ValueError('database import checksum missing')
        if imported.get('source') != status.get('from'): raise ValueError('database import source mismatch')
        if not any(p['path'] == '6/import.json' for p in files): raise ValueError('database import metadata missing')
    return {'createdAt': built, 'ageSeconds': age, 'sha256': db[0]['sha256'], 'metadata': status,
            'files': files, 'importMetadata': imported, 'scannerChecksumValidation': 'required at each offline invocation'}


def validate_inventory(reports, expected_lock_sha256=None, expected_maven_files=None):
    inventory = reports['trusted.inventory.json']
    if inventory.get('schema') != 'micro.native-build-input-inventory/1': raise ValueError('trusted inventory schema invalid')
    lock_hash = inventory.get('lockSha256')
    if not isinstance(lock_hash, str) or not re.fullmatch('[0-9a-f]{64}', lock_hash): raise ValueError('trusted lock hash missing')
    if expected_lock_sha256 is not None and lock_hash != expected_lock_sha256: raise ValueError('scanned lock hash mismatch')
    entries = inventory.get('lockEntries')
    if not isinstance(entries, list) or len(entries) != inventory.get('lockedEntryCount'): raise ValueError('locked inventory entry accounting mismatch')
    identities = set(); paths = set()
    for item in entries:
        if not isinstance(item.get('name'), str) or not isinstance(item.get('version'), str): raise ValueError('locked inventory identity missing')
        if item.get('lockPath') in paths: raise ValueError('duplicate locked inventory path')
        paths.add(item.get('lockPath')); identities.add((item['name'], item['version']))
        if any(type(item.get(flag)) is not bool for flag in ('dev', 'optional', 'devOptional')): raise ValueError('locked inventory flags missing')
        if item.get('classification') != ('build-only' if item['dev'] else 'runtime-input') or item.get('packagedPresence') != 'unknown':
            raise ValueError('locked inventory classification mismatch')
    components = reports['sbom.cdx.json'].get('components')
    if reports['sbom.cdx.json'].get('bomFormat') != 'CycloneDX' or not isinstance(components, list): raise ValueError('augmented BOM malformed')
    def npm_purl(name, version):
        return 'pkg:npm/' + '/'.join(quote(part, safe='') for part in name.split('/')) + '@' + quote(version, safe='')
    covered = {(c.get('name'), c.get('version')) for c in components
               if isinstance(c.get('name'), str) and isinstance(c.get('version'), str)
               and c.get('purl', '').split('?')[0] == npm_purl(c['name'], c['version'])}
    if identities - covered or inventory.get('missingAfter') != [] or len(identities) != inventory.get('lockedUniqueComponentCount'):
        raise ValueError('locked npm inventory omission')
    for component in components:
        properties = {p.get('name'): p.get('value') for p in component.get('properties', [])}
        if not properties.get('micro:inventory-provenance') or properties.get('micro:packaged-presence') != 'unknown':
            raise ValueError('component inventory provenance missing')
    maven = inventory.get('maven', {})
    if expected_maven_files is not None and maven.get('files') != expected_maven_files: raise ValueError('scanned Maven graph hashes mismatch')
    maven_entries = maven.get('entries')
    if not isinstance(maven_entries, list) or maven.get('status') not in ('pending', 'resolved-inputs-scanned'): raise ValueError('Maven coverage unknown')
    purls = {c.get('purl', '').split('?')[0] for c in components}
    if any(item.get('purl') not in purls for item in maven_entries): raise ValueError('resolved Maven inventory omission')
    return {'lockedEntryCount': len(entries), 'lockedUniqueComponentCount': len(identities),
            'addedLockedComponentCount': len(inventory.get('missingBefore', [])),
            'lockSha256': lock_hash, 'mavenStatus': maven['status'],
            'mavenEntryCount': len(maven_entries), 'mavenUniqueComponentCount': len({x['purl'] for x in maven_entries}),
            'finalArtifactCoverage': 'pending-closure-and-consequential-native-component-mapping'}


def validate_scan(worker, database, expected_lock_sha256=None, expected_maven_files=None):
    if any(c.get('error') or c.get('signal') or c.get('exitCode') is None for c in worker.get('commands', [])):
        raise ValueError('scanner crash')
    validate_tools(worker.get('tools', {}))
    before = worker.get('databaseBefore', {})
    after = worker.get('databaseAfter', {})
    for status in (before, after):
        if status != database['metadata']: raise ValueError('scan used wrong/missing database')
    reports = worker.get('reports', {})
    required = {'secrets.json', 'syft.sbom.cdx.json', 'trusted.inventory.json', 'sbom.cdx.json', 'vulnerabilities.json'}
    if not required <= reports.keys(): raise ValueError('scanner crash/incomplete reports')
    commands = worker['commands']
    scans = [c for c in commands if c['binary'] in ('gitleaks', 'syft', 'grype') and c['args'][0] != 'db']
    by_tool = {c['binary']: c for c in scans}
    if set(by_tool) != {'gitleaks', 'syft', 'grype'}: raise ValueError('mandatory scanner missing')
    if by_tool['grype']['args'][0] != 'sbom:/tmp/sbom.cdx.json': raise ValueError('wrong vulnerability inventory input')
    if any(c.get('signal') or c.get('error') or c['exitCode'] is None for c in scans): raise ValueError('scanner crash')
    secret = reports['secrets.json']
    matches = reports['vulnerabilities.json'].get('matches')
    if not isinstance(secret, list) or not isinstance(matches, list): raise ValueError('malformed scanner report')
    # Retain every finding, including lower severities and unsupported coverage.
    high = [m for m in matches if m.get('vulnerability', {}).get('severity', '').lower() in ('high', 'critical')]
    if by_tool['syft']['exitCode'] != 0: raise ValueError('inventory scanner error')
    if by_tool['gitleaks']['exitCode'] not in (0, 1) or by_tool['grype']['exitCode'] not in (0, 2): raise ValueError('scanner error')
    if bool(secret) != (by_tool['gitleaks']['exitCode'] == 1): raise ValueError('secret exit/report disagreement')
    if bool(high) != (by_tool['grype']['exitCode'] == 2): raise ValueError('vulnerability exit/report disagreement')
    descriptor = reports['vulnerabilities.json'].get('descriptor', {}).get('db', {}).get('status', {})
    for field in ('built', 'schemaVersion', 'from', 'checksum'):
        if field not in database['metadata']: continue
        if descriptor.get(field) != database['metadata'].get(field): raise ValueError('report database identity mismatch')
    inventory = validate_inventory(reports, expected_lock_sha256, expected_maven_files)
    return {'verdict': 'blocked' if secret or high else 'pass', 'secretCount': len(secret),
            'highCriticalCount': len(high), 'totalVulnerabilityCount': len(matches),
            'componentCount': len(reports['sbom.cdx.json'].get('components', [])), 'inventory': inventory}


OWNER_LABEL = 'io.micro.native-security.owner'


def command_receipt(result):
    return {'exitCode': result.returncode, 'stdout': (result.stdout or '')[:16384],
            'stderr': (result.stderr or '')[:16384]}


def owned_identity(inspected, name, owner, expected_id=None):
    observed_id = inspected.get('Id', '')
    if not re.fullmatch(r'[0-9a-f]{64}', observed_id): raise ValueError('invalid owned container ID')
    if expected_id and observed_id != expected_id: raise ValueError('owned container ID mismatch')
    if inspected.get('Name') != '/' + name: raise ValueError('owned container name mismatch')
    if inspected.get('Config', {}).get('Labels', {}).get(OWNER_LABEL) != owner:
        raise ValueError('owned container label mismatch')
    return observed_id


def prove_absence(target, name, owner):
    """A daemon outage is unknown cleanup, never proof of absence."""
    inspected = subprocess.run(['docker', 'inspect', target], capture_output=True, text=True, timeout=10)
    listed = subprocess.run(['docker', 'ps', '-a', '--no-trunc', '--filter', 'name=^/' + name + '$',
                             '--filter', 'label=' + OWNER_LABEL + '=' + owner, '--format', '{{.ID}}'],
                            capture_output=True, text=True, timeout=10)
    message = (inspected.stderr or '') + (inspected.stdout or '')
    no_object = inspected.returncode == 1 and re.search(r'no such object:\s*' + re.escape(target) + r'(?:\s|$)', message, re.IGNORECASE) is not None
    return {'absent': bool(no_object and listed.returncode == 0 and not listed.stdout.strip()),
            'absenceInspect': command_receipt(inspected), 'scopedList': command_receipt(listed)}


def capture_prefix(output, stream, chunk, maximum):
    remaining = maximum - sum(map(len, output.values()))
    output[stream].extend(chunk[:max(0, remaining)])
    if len(chunk) > remaining: raise ValueError('scanner output budget')


def cleanup_owned(container, name, owner, proc=None):
    """Reinspect exact identity before each destructive Docker operation."""
    result = {'absent': False, 'errors': []}
    target = container or name
    try:
        checked = subprocess.run(['docker', 'inspect', target], capture_output=True, text=True, timeout=10)
        result['ownershipInspect'] = command_receipt(checked)
        if checked.returncode != 0:
            result.update(prove_absence(target, name, owner))
            if container or not result['absent']: raise ValueError('owned container inspection failed')
            return result
        inspected = json.loads(checked.stdout)[0]
        exact_id = owned_identity(inspected, name, owner, container)
        result['containerId'] = exact_id
        result['inspectAfter'] = inspected
        if inspected.get('State', {}).get('Running'):
            killed = subprocess.run(['docker', 'kill', exact_id], capture_output=True, text=True, timeout=15)
            result['kill'] = command_receipt(killed)
            if killed.returncode != 0: raise ValueError('owned container kill failed')
        checked = subprocess.run(['docker', 'inspect', exact_id], capture_output=True, text=True, timeout=10)
        result['beforeRemovalInspect'] = command_receipt(checked)
        if checked.returncode != 0: raise ValueError('owned container pre-removal inspection failed')
        owned_identity(json.loads(checked.stdout)[0], name, owner, exact_id)
        deleted = subprocess.run(['docker', 'rm', '-f', exact_id], capture_output=True, text=True, timeout=15)
        result['remove'] = command_receipt(deleted); result['removeExitCode'] = deleted.returncode
        absence = prove_absence(exact_id, name, owner); result.update(absence)
        if deleted.returncode != 0 or not absence['absent']: raise ValueError('owned container absence unproven')
    except Exception as error:
        result['absent'] = False
        result['errors'].append({'type': type(error).__name__, 'message': str(error)})
    finally:
        # Detach only the owned CLI process. This does not replace container cleanup.
        if proc and proc.poll() is None:
            try:
                proc.terminate(); proc.wait(timeout=5)
            except Exception as error:
                result['errors'].append({'type': type(error).__name__, 'message': 'attach process cleanup: ' + str(error)})
                result['absent'] = False
    return result


class Supervisor:
    def __init__(self, state=DEFAULT_STATE):
        self.state = Path(state).resolve()
        if self.state != DEFAULT_STATE: raise ValueError('state must be fixed controller-owned directory')
        self.state.mkdir(parents=True, exist_ok=True)
        if tree_size(self.state) > POLICY['stateBytes']: raise ValueError('controller state budget')

    def write(self, path, value):
        Path(path).write_text(json.dumps(value, indent=2) + '\n')

    def run(self, label, mode, source=None, cache=None, acquire=False, maven_graphs=None):
        if not re.fullmatch(r'[a-z0-9-]{1,64}', label): raise ValueError('unsafe receipt label')
        report = self.state / label
        report.mkdir(exist_ok=False)
        owner = uuid.uuid4().hex
        name = 'micro-native-security-' + owner
        receipt = {'schema': 2, 'label': label, 'mode': mode, 'containerName': name,
                   'ownerLabel': {OWNER_LABEL: owner}, 'startedAt': datetime.now(timezone.utc).isoformat(),
                   'stateLimitBytes': POLICY['stateBytes'], 'acquisitionLimitBytes': POLICY['acquisitionBytes']}
        started = time.monotonic(); container = None; proc = None; selected = None
        output = {}; command_output = {'stdout': bytearray(), 'stderr': bytearray()}; create_attempted = False
        try:
            receipt['authority'] = authority()
            if acquire and (source or maven_graphs): raise ValueError('public acquisition cannot mount source')
            if cache and not Path(cache).resolve().is_relative_to(self.state): raise ValueError('database cache outside owned state')
            mem = available_memory(); receipt['memAvailableBytes'] = mem
            if mem < POLICY['minimumAvailableBytes']: raise ValueError('scanner resource headroom below 2GiB')
            ids = subprocess.check_output(['docker', 'ps', '-q'], text=True, timeout=10).split()
            active = json.loads(subprocess.check_output(['docker', 'inspect', *ids], text=True, timeout=10)) if ids else []
            native = any(c['HostConfig']['Memory'] >= 6 * 1024**3 for c in active)
            receipt['nativeCompileActive'] = native
            if native and mem < POLICY['nativeOverlapAvailableBytes']: raise ValueError('native compile overlap headroom below 9GiB')
            writable_db = acquire or mode == 'normalize-db'
            args = ['docker', 'create', '--name', name, '--label', OWNER_LABEL + '=' + owner,
                    '--user', '65534:65534', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                    '--read-only', '--network', 'bridge' if acquire else 'none', '--log-driver', 'none',
                    '--memory', '1g', '--memory-swap', '1g', '--cpus', '1', '--pids-limit', '128',
                    '--ulimit', 'fsize=4294967296:4294967296',
                    '--tmpfs', '/tmp:rw,nosuid,nodev,size=384m,mode=1777', '--entrypoint', 'node',
                    '--mount', f'type=bind,src={HERE / ("security_packaged.mjs" if mode == "packaged" else "security_worker.mjs")},dst=/worker.mjs,readonly',
                    '--mount', f'type=bind,src={HERE / "security_inventory.mjs"},dst=/security_inventory.mjs,readonly',
                    '--mount', f'type=bind,src={HERE.parent / "scanner-config"},dst=/config,readonly']
            if source:
                if tree_size(source) > POLICY['inputBytes']: raise ValueError('scanner input exceeds 1GiB')
                receipt['sourceFiles'] = tree_manifest(source)
                args += ['--mount', f'type=bind,src={Path(source).resolve()},dst=/source,readonly']
            else: receipt['sourceFiles'] = []
            receipt['mavenFiles'] = []
            if maven_graphs is not None:
                graphs = Path(maven_graphs).resolve()
                owned_native = DEFAULT_STATE.parent / 'native-acquisition'
                if mode != 'scan' or not graphs.is_relative_to(owned_native): raise ValueError('Maven graph outside controller authority')
                receipt['mavenFiles'] = tree_manifest(graphs)
                validate_maven_files(receipt['mavenFiles'])
                args += ['--mount', f'type=bind,src={graphs},dst=/maven,readonly']
            if cache:
                args += ['--mount', f'type=bind,src={Path(cache).resolve()},dst=/db' + ('' if writable_db else ',readonly')]
            if acquire:
                ca = self.state / 'public-ca.crt'
                if ca.is_symlink() or digest(ca) != POLICY['publicCaSha256']: raise ValueError('public CA authority mismatch')
                args += ['--mount', f'type=bind,src={ca},dst=/public-ca.crt,readonly']
                receipt['publicCaSha256'] = digest(ca)
            args += [POLICY['image'], '/worker.mjs', mode]; receipt['argv'] = args
            create_attempted = True
            container = subprocess.check_output(args, stderr=subprocess.PIPE, text=True, timeout=30).strip()
            if not re.fullmatch(r'[0-9a-f]{64}', container):
                container = None
                raise ValueError('docker create did not return an exact container ID')
            receipt['containerId'] = container
            receipt['inspectBefore'] = json.loads(subprocess.check_output(['docker', 'inspect', container], text=True, timeout=10))[0]
            owned_identity(receipt['inspectBefore'], name, owner, container)
            validate_sandbox(receipt['inspectBefore'], acquire, writable_db)
            proc = subprocess.Popen(['docker', 'start', '-a', container], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            selected = selectors.DefaultSelector()
            for stream in (proc.stdout, proc.stderr): selected.register(stream, selectors.EVENT_READ)
            output = {proc.stdout: bytearray(), proc.stderr: bytearray()}
            while selected.get_map():
                if time.monotonic() - started > POLICY['timeoutSeconds']: raise TimeoutError('scanner deadline')
                if tree_size(self.state) > POLICY['stateBytes']: raise ValueError('controller state budget')
                if acquire and tree_size(cache) > POLICY['acquisitionBytes']: raise ValueError('database acquisition budget')
                for key, _ in selected.select(.25):
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk: selected.unregister(key.fileobj)
                    else: capture_prefix(output, key.fileobj, chunk, POLICY['outputBytes'])
            receipt['containerExitCode'] = proc.wait(timeout=5)
            if receipt['containerExitCode'] != 0: raise ValueError('scanner container failed')
            worker = json.loads(bytes(output[proc.stdout])); receipt['worker'] = worker
        except Exception as error:
            receipt['failure'] = {'type': type(error).__name__, 'message': str(error)}
            if proc is None:
                for key, value in (('stdout', getattr(error, 'output', None)), ('stderr', getattr(error, 'stderr', None))):
                    if value:
                        data = value.encode() if isinstance(value, str) else value
                        try: capture_prefix(command_output, key, data, POLICY['outputBytes'])
                        except ValueError: receipt['commandDiagnosticsTruncated'] = True
        finally:
            if selected:
                try: selected.close()
                except Exception as error:
                    receipt.setdefault('diagnosticErrors', []).append({'type': type(error).__name__, 'message': 'selector cleanup: ' + str(error)})
            # Cleanup has its own error record and cannot replace the first cause.
            try:
                receipt['cleanup'] = cleanup_owned(container, name, owner, proc) if create_attempted else {'absent': True, 'notCreated': True, 'errors': []}
                if 'inspectAfter' in receipt['cleanup']: receipt['inspectAfter'] = receipt['cleanup']['inspectAfter']
                if not container and receipt['cleanup'].get('containerId'):
                    receipt['recoveredContainerId'] = receipt['cleanup']['containerId']
            except Exception as error:
                receipt['cleanup'] = {'absent': False, 'errors': [{'type': type(error).__name__, 'message': str(error)}]}
            stdout = bytes(output.get(proc.stdout, b'')) if proc else bytes(command_output['stdout'])
            stderr = bytes(output.get(proc.stderr, b'')) if proc else bytes(command_output['stderr'])
            try:
                (report / 'stdout.json').write_bytes(stdout); (report / 'stderr.log').write_bytes(stderr)
                receipt['capturedOutput'] = {'stdoutBytes': len(stdout), 'stderrBytes': len(stderr),
                                             'maximumBytes': POLICY['outputBytes'], 'partial': 'failure' in receipt}
                receipt['workerSha256'] = digest(report / 'stdout.json')
            except Exception as error:
                receipt.setdefault('diagnosticErrors', []).append({'type': type(error).__name__, 'message': str(error)})
            receipt['seconds'] = time.monotonic() - started
            receipt['finishedAt'] = datetime.now(timezone.utc).isoformat()
            self.write(report / 'receipt.json', receipt)
        if receipt.get('failure') or receipt.get('diagnosticErrors') or not receipt['cleanup']['absent'] or receipt['cleanup']['errors']:
            raise ValueError('job failed, see ' + str(report / 'receipt.json'))
        return receipt

    def acquire(self, label='database-acquisition-attempt2', cache_name='database-attempt2'):
        if not re.fullmatch(r'database(?:-attempt[1-9][0-9]*)?', cache_name): raise ValueError('unsafe owned database path')
        cache = self.state / cache_name
        cache.mkdir(exist_ok=False); cache.chmod(0o777)
        receipt = self.run(label, 'update', cache=cache, acquire=True)
        worker = receipt['worker']
        if worker.get('acquisition', {}).get('budgetFailed'): raise ValueError('database acquisition budget failed')
        if any(c['exitCode'] != 0 for c in worker['commands']): raise ValueError('database acquisition failed')
        for p in cache.rglob('*'):
            if not p.stat().st_mode & 0o004: raise ValueError('database not publicly readable')
        cache.chmod(0o755)
        readback = self.run(label + '-offline', 'dbstatus', cache=cache)
        value = validate_database(readback['worker']['database'], tree_manifest(cache), imported=json.loads((cache / '6/import.json').read_text()))
        value['publicOnlyTrustedAcquisition'] = True
        value['cachePath'] = str(cache)
        self.write(self.state / 'database-receipt.json', value)
        return value

    def scan(self, label, source, maven_graphs=None):
        accepted = json.loads((self.state / 'database-receipt.json').read_text())
        cache = Path(accepted['cachePath'])
        if cache.parent != self.state: raise ValueError('database path not controller owned')
        current = validate_database(accepted['metadata'], tree_manifest(cache), imported=json.loads((cache / '6/import.json').read_text()))
        if current['files'] != accepted['files']: raise ValueError('accepted database bytes changed')
        receipt = self.run(label, 'scan', source=source, cache=cache, maven_graphs=maven_graphs)
        try:
            locks = [item for item in receipt['sourceFiles'] if item['path'] == 'package-lock.json']
            if len(locks) != 1: raise ValueError('supervisor source lock missing')
            if tree_manifest(source) != receipt['sourceFiles']: raise ValueError('source bytes changed during scan')
            if maven_graphs is not None and tree_manifest(maven_graphs) != receipt['mavenFiles']: raise ValueError('Maven graph bytes changed during scan')
            verdict = validate_scan(receipt['worker'], accepted, locks[0]['sha256'], receipt['mavenFiles'])
        except ValueError as error:
            verdict = {'verdict': 'blocked', 'reason': str(error)}
        verdict.update({'database': accepted, 'authority': authority(), 'receiptSha256': digest(self.state / label / 'receipt.json'),
                        'scope': 'source inventory only; final APK/native coverage requires separate inputs'})
        self.write(self.state / label / 'verdict.json', verdict)
        return verdict

    def readmit_database(self, cache, label):
        """Reinspect retained completed public bytes under the newly authorized cap."""
        cache = Path(cache).resolve()
        if cache.parent != self.state: raise ValueError('database path not controller owned')
        files = tree_manifest(cache)
        if sum(p['bytes'] for p in files) > POLICY['acquisitionBytes']: raise ValueError('database acquisition byte budget')
        readback = self.run(label, 'dbstatus', cache=cache)
        if readback['worker']['databaseBytes'] != sum(p['bytes'] for p in files): raise ValueError('database byte accounting mismatch')
        value = validate_database(readback['worker']['database'], files, imported=json.loads((cache / '6/import.json').read_text()))
        value.update({'publicOnlyTrustedAcquisition': True, 'cachePath': str(cache),
                      'admission': 'new 4GiB admission of retained public bytes; prior 2GiB oversize remains failed',
                      'acquisitionReceiptSha256': digest(self.state / 'database-acquisition-attempt2/receipt.json'),
                      'readbackReceiptSha256': digest(self.state / label / 'receipt.json'), 'authority': authority()})
        self.write(self.state / 'database-receipt.json', value)
        return value


def source_coverage(source):
    """A source lock is build input evidence, never a complete APK inventory."""
    lock = Path(source) / 'package-lock.json'
    value = json.loads(lock.read_text()); packages = value.get('packages', {})
    components = []
    for key, item in sorted(packages.items()):
        if not key: continue
        name = item.get('name') or key.rsplit('node_modules/', 1)[-1]
        components.append({'name': name, 'version': item.get('version'), 'lockPath': key,
                           'integrity': item.get('integrity'),
                           'classification': 'build-only' if item.get('dev') is True else 'runtime-input',
                           'packagedPresence': 'unknown'})
    return {'kind': 'locked-npm-inputs', 'sha256': digest(lock), 'components': components,
            'limits': ['Hermes bytecode cannot recover complete npm inventory',
                       'runtime-input is not proof a package is bundled',
                       'final APK and native library components remain pending',
                       'resolved Maven graph required separately']}


def maven_coverage(graph_directory):
    """Inventory actual controller-retained resolved configurations, if present."""
    paths = sorted(Path(graph_directory).glob('*'))
    if not paths: raise ValueError('resolved Maven graph missing')
    if len(paths) > MAVEN_LIMITS['graphCount']: raise ValueError('Maven graph file budget')
    components = []; files = []; total = 0
    for path in paths:
        if path.is_symlink() or not path.is_file() or not re.fullmatch(r'[A-Za-z0-9_.-]+\.json', path.name): raise ValueError('Maven graph file invalid')
        with path.open('rb') as stream: raw = stream.read(MAVEN_LIMITS['graphBytes'] + 1)
        if len(raw) > MAVEN_LIMITS['graphBytes']: raise ValueError('Maven graph file invalid')
        total += len(raw)
        if total > MAVEN_LIMITS['totalBytes']: raise ValueError('Maven graph total byte budget')
        graph_hash = hashlib.sha256(raw).hexdigest()
        files.append({'path': path.name, 'bytes': len(raw), 'sha256': graph_hash})
        value = json.loads(raw)
        if not isinstance(value, dict) or not isinstance(value.get('components'), list) or not all(isinstance(value.get(k), str) for k in ('build', 'scope', 'configuration')):
            raise ValueError('Maven graph schema invalid')
        project = maven_project(value)
        for item in value['components']:
            if len(components) >= MAVEN_LIMITS['componentCount']: raise ValueError('Maven component count budget')
            if not isinstance(item, dict) or not all(isinstance(item.get(k), str) and re.fullmatch(r'[A-Za-z0-9_.+:-]{1,256}', item[k]) for k in ('group', 'module', 'version')) or re.fullmatch(r'(?:unspecified|latest(?:\..*)?)', item['version']) or item['version'].endswith('+'):
                raise ValueError('Maven component identity invalid')
            config = value['configuration']
            classification = 'build-only' if 'buildscript' in value['scope'] else 'runtime-input' if config.lower().endswith('runtimeclasspath') else 'unknown'
            components.append({**{k: item[k] for k in ('group', 'module', 'version')},
                               'build': value['build'], 'project': project, 'scope': value['scope'],
                               'configuration': config, 'classification': classification,
                               'packagedPresence': 'unknown', 'graphPath': path.name, 'graphSha256': graph_hash,
                               'receiptSha256': graph_hash})
    validate_maven_files(files)
    return {'kind': 'resolved-Maven-inputs', 'components': components,
            'graphFiles': files,
            'limits': ['Only resolved configurations reported by the trusted build are covered',
                       'A resolved coordinate is not proof of packaged presence',
                       'Native library component/version mapping requires separate review']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['probe', 'acquire', 'scan'])
    parser.add_argument('--source', type=Path)
    parser.add_argument('--label', default='source-scan')
    args = parser.parse_args(); supervisor = Supervisor()
    if args.mode == 'probe':
        receipt = supervisor.run('scanner-authority-probe', 'probe'); validate_tools(receipt['worker']['tools'])
        print(json.dumps(receipt['worker']['tools']))
    elif args.mode == 'acquire': print(json.dumps(supervisor.acquire()))
    elif not args.source: parser.error('--source required')
    else: print(json.dumps(supervisor.scan(args.label, args.source)))


if __name__ == '__main__': main()
