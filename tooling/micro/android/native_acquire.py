#!/usr/bin/env python3
"""Controller supervisor, never placed inside product jobs or given source from candidates."""
import argparse
import hashlib
import json
import os
import stat
from pathlib import Path
import shutil
import subprocess
import time
import re
import importlib.util
import selectors

TOOLS = Path(__file__).resolve().parent
DEFAULT_STATE = Path('/home/quorky/apps/lifeos/.scratch/software-factory-benchmark/run-20260930/controller/native-acquisition')
IMAGE = 'sha256:43778b0b9227ffc8d12a9092f011f09238a77c92b5fcde6a18310757ccef7305'
NAMES = {'internal': 'lifeos-native-acquire-internal-run20260930', 'egress': 'lifeos-native-acquire-egress-run20260930', 'proxy': 'lifeos-native-acquire-proxy-run20260930', 'client': 'lifeos-native-acquire-client-run20260930'}
SUBNET = '172.29.240.0/24'
PROXY_IP = '172.29.240.2'

"""Review artifact only. The generator embeds this block into existing tools."""
ROOT_POLICY_MANIFEST_JSON = '{"schema":1,"status":"uninstalled-compatibility-unverified","gradleVersion":"9.3.1","build":"/work/fixture/android","project":":","scope":"project-buildscript","configuration":"classpath","semantics":"require-floor-plus-exact-selected-version-guard","modules":[{"group":"io.netty","module":"netty-buffer","candidate":"4.1.138.Final"},{"group":"io.netty","module":"netty-codec","candidate":"4.1.138.Final"},{"group":"io.netty","module":"netty-codec-http","candidate":"4.1.138.Final"},{"group":"io.netty","module":"netty-codec-http2","candidate":"4.1.138.Final"},{"group":"io.netty","module":"netty-codec-socks","candidate":"4.1.138.Final"},{"group":"io.netty","module":"netty-common","candidate":"4.1.138.Final"},{"group":"io.netty","module":"netty-handler","candidate":"4.1.138.Final"},{"group":"io.netty","module":"netty-handler-proxy","candidate":"4.1.138.Final"},{"group":"io.netty","module":"netty-resolver","candidate":"4.1.138.Final"},{"group":"io.netty","module":"netty-transport","candidate":"4.1.138.Final"},{"group":"io.netty","module":"netty-transport-native-unix-common","candidate":"4.1.138.Final"},{"group":"org.bitbucket.b_c","module":"jose4j","candidate":"0.9.6"},{"group":"org.bouncycastle","module":"bcprov-jdk18on","candidate":"1.85"},{"group":"org.bouncycastle","module":"bcpkix-jdk18on","candidate":"1.85"},{"group":"org.bouncycastle","module":"bcutil-jdk18on","candidate":"1.85"},{"group":"org.jdom","module":"jdom2","candidate":"2.0.6.1"}]}\n'
ROOT_POLICY_MANIFEST_SHA256 = '9e6bfc29b7bb913d1c5df110ba2fdc6e9674d37f5b25296d265b3727d38b078f'
ROOT_POLICY_SCOPE = ('/work/fixture/android', ':', 'project-buildscript', 'classpath')
ROOT_POLICY_TOOL_NAMES = ('native_fixture_job.py', 'trusted_repositories.init.gradle')

GSON_POLICY_MANIFEST_JSON = '{"schema":1,"status":"private-proposal-uninstalled-compatibility-unverified","gradleVersion":"9.3.1","build":"/work/fixture/android","ownerProject":":expo-log-box","ownerDirectory":"/work/fixture/node_modules/@expo/log-box/android","ownerConfiguration":"implementation","group":"com.google.code.gson","module":"gson","floor":"2.8.9","semantics":"owner-implementation-require-floor-preserve-newer-release-winners","source":{"path":"/work/fixture/node_modules/@expo/log-box/android/build.gradle","bytes":2516,"sha256":"a0e049db9ff502a3cc786e249f575b8c399d9c4d5ebd1f433d41ca9710c33d37"},"npmPackage":"@expo/log-box","npmVersion":"57.0.4","sourceLockSha256":"ae8bbc085fd039716dde9ba98c1039069b93455972f42659c8dccc5cb66fb282","archiveBytes":278911,"archiveSha256":"daee7644cc5848ee49da7fa21c567695e73f755ba300023bdb0f4ba973432077","archiveSRI":"sha512-IxwS9s1L2muj8mj8AQSuiy7u8OFJdc02NRFo2me/Tj6DiaeG5SREqmpBE4rQpR2cadqSg5jl8Qab8Cjie616dg==","rootBuildscriptFloor":"2.11.0","requiredScopes":[{"project":":app","configuration":"releaseCompileClasspath","gsonRequired":false},{"project":":app","configuration":"releaseRuntimeClasspath","gsonRequired":true},{"project":":expo","configuration":"releaseCompileClasspath","gsonRequired":false},{"project":":expo","configuration":"releaseRuntimeClasspath","gsonRequired":true},{"project":":expo-log-box","configuration":"releaseCompileClasspath","gsonRequired":true},{"project":":expo-log-box","configuration":"releaseRuntimeClasspath","gsonRequired":true}]}\n'
GSON_POLICY_MANIFEST_SHA256 = '0c9d6290238ef606927627cc2aa688a7ec458e7e623060db7cb6a3e34c5303bb'


def gr_manifest():
    raw = GSON_POLICY_MANIFEST_JSON.encode('utf-8')
    if hashlib.sha256(raw).hexdigest() != GSON_POLICY_MANIFEST_SHA256:
        raise ValueError('Protected Gson owner manifest changed')
    return json.loads(raw)


def gr_version_ok(value, floor='2.8.9'):
    # Only unqualified canonical numeric releases are comparable here.
    pattern = r'(?:0|[1-9][0-9]{0,5})(?:\.(?:0|[1-9][0-9]{0,5})){1,3}'
    if type(value) is not str or len(value) > 32 or re.fullmatch(pattern, value) is None:
        return False
    normalize = lambda text: tuple(int(part) for part in text.split('.')) + (0,)*(4-len(text.split('.')))
    return normalize(value) >= normalize(floor)


def gr_constraint():
    policy = gr_manifest()
    return {'group':policy['group'],'module':policy['module'],'required':policy['floor'],
            'preferred':'','strict':'','rejected':[],
            'reason':'Reviewed Gson owner floor '+GSON_POLICY_MANIFEST_SHA256+' '+policy['ownerProject']}


def gr_validate_graph(graph, subject):
    manifest = gr_manifest(); subject = rp_subject(subject)
    policy = graph.get('gsonRuntimeOwnerPolicy')
    fields = {'schema','manifestSha256','semantics','toolSubject','ownerSource','ownerConstraint',
              'installationVerified','allConstraints','chosen','unresolvedCount','unresolvedComplete',
              'captureComplete','failures','selectedVersionsAccepted'}
    if type(policy) is not dict or set(policy) != fields or type(policy['schema']) is not int or policy['schema'] != 1:
        raise ValueError('Mandatory Gson runtime owner policy absent or malformed')
    if policy['manifestSha256'] != GSON_POLICY_MANIFEST_SHA256 or policy['semantics'] != manifest['semantics'] or policy['toolSubject'] != subject or policy['ownerSource'] != manifest['source'] or policy['ownerConstraint'] != gr_constraint():
        raise ValueError('Gson owner source, floor, subject or authority mismatch')
    if policy['installationVerified'] is not True or policy['captureComplete'] is not True or policy['unresolvedComplete'] is not True or type(policy['unresolvedCount']) is not int or policy['unresolvedCount'] != 0 or policy['failures'] != [] or policy['selectedVersionsAccepted'] is not True:
        raise ValueError('Gson scope incomplete, unresolved or rejected')
    constraints = policy['allConstraints']
    row_fields = {'group','module','required','preferred','strict','rejected','reason'}
    if type(constraints) is not list:
        raise ValueError('Gson configuration constraint inventory missing')
    for row in constraints:
        if type(row) is not dict or set(row) != row_fields or (row['group'] is not None and type(row['group']) is not str) or any(type(row[k]) is not str for k in ('module','required','preferred','strict')) or type(row['rejected']) is not list or any(type(v) is not str for v in row['rejected']) or (row['reason'] is not None and type(row['reason']) is not str):
            raise ValueError('Malformed Gson actual configuration constraint')
    if graph['project'] == manifest['ownerProject'] and constraints.count(gr_constraint()) != 1:
        raise ValueError('Gson owner require floor not inherited exactly once')
    winners = [row for row in graph['components'] if row['group'] == manifest['group'] and row['module'] == manifest['module']]
    required = next(row['gsonRequired'] for row in manifest['requiredScopes'] if row['project'] == graph['project'] and row['configuration'] == graph['configuration'])
    if len(winners) > 1 or (required and len(winners) != 1):
        raise ValueError('Required Gson winner absent or duplicate')
    chosen = policy['chosen']
    chosen_fields = {'group','module','version','constrained','forced','conflictResolution','selectedByRule','reasons','reasonCaptureComplete'}
    if type(chosen) is not list or len(chosen) != len(winners):
        raise ValueError('Gson selected reason inventory disagrees with raw winners')
    for row, winner in zip(chosen,winners):
        if type(row) is not dict or set(row) != chosen_fields or {k:row[k] for k in ('group','module','version')} != winner or not gr_version_ok(row['version']):
            raise ValueError('Gson selected winner below floor or unknown')
        if any(type(row[k]) is not bool for k in ('constrained','forced','conflictResolution','selectedByRule','reasonCaptureComplete')) or row['forced'] or row['selectedByRule'] or row['reasonCaptureComplete'] is not True or (graph['project'] == manifest['ownerProject'] and not row['constrained']):
            raise ValueError('Gson forced, ruled or incomplete selected reason')
        if type(row['reasons']) is not list or not 0 < len(row['reasons']) <= 128 or any(type(reason) is not dict or set(reason) != {'cause','description'} or type(reason['cause']) is not str or not 0 < len(reason['cause']) <= 64 or type(reason['description']) is not str or not 0 < len(reason['description']) <= 1024 for reason in row['reasons']):
            raise ValueError('Gson selection descriptions absent or unknown')


def gr_validate_documents(documents, subject):
    manifest = gr_manifest(); subject = rp_subject(subject)
    scopes = {(manifest['build'],row['project'],'project',row['configuration']) for row in manifest['requiredScopes']}
    if type(documents) is not list or not 0 < len(documents) <= 2048:
        raise ValueError('Gson raw graph inventory outside existing count bound')
    names=set(); observed=set(); scope_facts={}; graphs=[]; total=0; root_seen=False
    for name,raw in documents:
        if type(name) is not str or re.fullmatch(r'[A-Za-z0-9_.-]+\.json',name) is None or name in names or type(raw) is not bytes or not 0 < len(raw) <= 8*1024**2:
            raise ValueError('Gson graph identity or existing file bound invalid')
        names.add(name);total+=len(raw)
        if total > 64*1024**2: raise ValueError('Gson graphs exceed unchanged aggregate bound')
        graph=rp_decode(raw)
        if type(graph) is not dict or any(type(graph.get(k)) is not str for k in ('build','project','scope','configuration')) or type(graph.get('components')) is not list:
            raise ValueError('Malformed completed Gson graph scope')
        for row in graph['components']:
            if type(row) is not dict or set(row) != {'group','module','version'} or any(type(row[k]) is not str for k in row):
                raise ValueError('Malformed raw component winner')
            if row['group']==manifest['group'] and row['module']==manifest['module'] and not gr_version_ok(row['version']):
                raise ValueError('Old or unknown Gson survives in a retained graph')
        if sum(row['group']==manifest['group'] and row['module']==manifest['module'] for row in graph['components']) > 1:
            raise ValueError('Duplicate Gson winner rows in a retained graph')
        scope=tuple(graph[k] for k in ('build','project','scope','configuration'))
        if scope in scopes or scope == ROOT_POLICY_SCOPE:
            if scope in scope_facts and scope_facts[scope] != graph:
                raise ValueError('Conflicting complete raw facts for one fixed Gson scope')
            scope_facts[scope]=graph
        if scope == ROOT_POLICY_SCOPE:
            winners=[row for row in graph['components'] if row['group']==manifest['group'] and row['module']==manifest['module']]
            if len(winners)!=1 or not gr_version_ok(winners[0]['version'],manifest['rootBuildscriptFloor']):
                raise ValueError('Root buildscript Gson missing or downgraded below2.11.0')
            root_seen=True
        if scope not in scopes:
            if 'gsonRuntimeOwnerPolicy' in graph: raise ValueError('Foreign scope cannot provide Gson owner receipt')
            continue
        gr_validate_graph(graph,subject);observed.add(scope)
        graphs.append({'path':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
    if observed != scopes or not root_seen:
        raise ValueError('Mandatory completed six release scopes or root buildscript missing')
    return {'schema':'micro.android.gson-runtime-owner-validation/1','status':'validated-six-release-scopes-raw-receipts',
            'manifestSha256':GSON_POLICY_MANIFEST_SHA256,'toolSubject':subject,'graphs':sorted(graphs,key=lambda row:row['path'])}


def gr_validate_output(directory, subject):
    directory=Path(directory).absolute()
    if directory.is_symlink() or not directory.is_dir(): raise ValueError('Mandatory Gson graph directory absent or linked')
    paths=sorted(directory.iterdir())
    if not 0 < len(paths) <= 2048: raise ValueError('Gson graph inventory outside existing count bound')
    documents=[];total=0
    for path in paths:
        raw=rp_read_regular(path,8*1024**2);total+=len(raw)
        if total > 64*1024**2: raise ValueError('Gson graph bytes exceed unchanged aggregate bound')
        documents.append((path.name,raw))
    return gr_validate_documents(documents,subject)

def rp_manifest():
    raw = ROOT_POLICY_MANIFEST_JSON.encode('utf-8')
    if hashlib.sha256(raw).hexdigest() != ROOT_POLICY_MANIFEST_SHA256:
        raise ValueError('Protected root policy manifest bytes changed')
    value = json.loads(raw)
    if tuple(value[k] for k in ('build', 'project', 'scope', 'configuration')) != ROOT_POLICY_SCOPE or len(value['modules']) != 16:
        raise ValueError('Protected root policy manifest scope changed')
    return value

def rp_subject(value):
    if not isinstance(value, dict) or set(value) != set(ROOT_POLICY_TOOL_NAMES):
        raise ValueError('Root policy protected tool subject missing')
    for item in value.values():
        if not isinstance(item, dict) or set(item) != {'bytes', 'sha256'} or type(item['bytes']) is not int or not 0 < item['bytes'] <= 2*1024**2 or not isinstance(item['sha256'], str) or not re.fullmatch('[0-9a-f]{64}', item['sha256']):
            raise ValueError('Root policy protected tool subject malformed')
    return value

def rp_read_regular(path, maximum):
    path = Path(path).absolute()
    if any(parent.is_symlink() for parent in path.parents):
        raise ValueError('Root policy input parent link forbidden')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not 0 < before.st_size <= maximum:
            raise ValueError('Root policy input must be bounded independent regular bytes')
        raw = bytearray()
        while chunk := os.read(descriptor, min(262144, maximum-len(raw)+1)):
            raw.extend(chunk)
            if len(raw) > maximum:
                raise ValueError('Root policy input exceeds existing byte bound')
        def identity(info):
            return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns
        if identity(before) != identity(os.fstat(descriptor)) or identity(before) != identity(path.lstat()):
            raise ValueError('Root policy input changed during read')
        return bytes(raw)
    finally:
        os.close(descriptor)

def rp_tool_subject(directory):
    result = {}
    for name in ROOT_POLICY_TOOL_NAMES:
        raw = rp_read_regular(Path(directory)/name, 2*1024**2)
        result[name] = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    return rp_subject(result)

def rp_decode(raw):
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                raise ValueError('Duplicate root policy JSON field')
            value[key] = item
        return value
    def invalid_constant(value):
        raise ValueError('Nonfinite root policy JSON number')
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid_constant)

def rp_validate_graph(graph, subject):
    manifest = rp_manifest()
    policy = graph.get('rootBuildscriptConstraintPolicy')
    required = {'schema', 'failureSchema', 'manifestSha256', 'semantics', 'toolSubject',
                'captureComplete', 'installedConstraints', 'allConstraints', 'chosen',
                'unresolved', 'unresolvedCount', 'unresolvedTruncated', 'unresolvedComplete',
                'failures', 'selectedVersionsAccepted'}
    if not isinstance(policy, dict) or set(policy) != required:
        raise ValueError('Mandatory completed root policy receipt absent or malformed')
    if type(policy['schema']) is not int or policy['schema'] != 3 or type(policy['failureSchema']) is not int or policy['failureSchema'] != 1:
        raise ValueError('Unknown root policy receipt schema')
    if policy['manifestSha256'] != ROOT_POLICY_MANIFEST_SHA256 or policy['semantics'] != manifest['semantics'] or rp_subject(policy['toolSubject']) != subject:
        raise ValueError('Foreign root policy manifest or protected tool subject')
    if policy['captureComplete'] is not True or policy['unresolvedComplete'] is not True or policy['selectedVersionsAccepted'] is not True or policy['unresolvedTruncated'] is not False or type(policy['unresolvedCount']) is not int or policy['unresolvedCount'] != 0 or policy['unresolved'] != [] or policy['failures'] != []:
        raise ValueError('Root policy is failed, unresolved or incomplete')
    expected = {(r['group'], r['module']): r['candidate'] for r in manifest['modules']}
    if len(expected) != 16:
        raise ValueError('Duplicate protected root policy target')
    graph_selected = {}
    for component in graph['components']:
        if not isinstance(component, dict) or not all(isinstance(component.get(k), str) for k in ('group', 'module', 'version')):
            raise ValueError('Malformed root graph component')
        key = component['group'], component['module']
        if key in expected:
            if key in graph_selected:
                raise ValueError('Duplicate root graph target')
            graph_selected[key] = component['version']
    if graph_selected != expected:
        raise ValueError('Root graph target absent or different candidate')
    chosen = policy['chosen']
    selected = {}
    chosen_fields = {'group', 'module', 'version', 'constrained', 'forced', 'conflictResolution', 'selectedByRule', 'reasons', 'reasonCaptureComplete'}
    if not isinstance(chosen, list) or len(chosen) != 16:
        raise ValueError('Root chosen target inventory incomplete')
    for row in chosen:
        if not isinstance(row, dict) or set(row) != chosen_fields or not all(isinstance(row[k], str) for k in ('group', 'module', 'version')) or row['reasonCaptureComplete'] is not True or not all(type(row[k]) is bool for k in ('constrained', 'forced', 'conflictResolution', 'selectedByRule')) or not isinstance(row['reasons'], list):
            raise ValueError('Root selected identity or reasons malformed')
        for reason in row['reasons']:
            if not isinstance(reason, dict) or set(reason) != {'cause', 'description'} or not all(isinstance(reason[k], str) for k in reason):
                raise ValueError('Root selection reason capture incomplete')
        key = row['group'], row['module']
        if key in selected:
            raise ValueError('Duplicate root policy chosen target')
        selected[key] = row['version']
    if selected != expected or selected != graph_selected:
        raise ValueError('Root chosen identities disagree with actual graph')
    constraints = policy['installedConstraints']
    all_constraints = policy['allConstraints']
    if not isinstance(constraints, list) or len(constraints) != 16 or not isinstance(all_constraints, list):
        raise ValueError('Root installed constraint inventory missing')
    installed = {}
    fields = {'group', 'module', 'required', 'preferred', 'strict', 'rejected', 'reason'}
    # Gradle permits an external constraint's group and any constraint's reason to be null.
    # Module names and VersionConstraint version values remain strings, including empty versions.
    for row in all_constraints:
        if not isinstance(row, dict) or set(row) != fields or (row['group'] is not None and not isinstance(row['group'], str)) or not all(isinstance(row[k], str) for k in ('module', 'required', 'preferred', 'strict')) or not isinstance(row['rejected'], list) or not all(isinstance(version, str) for version in row['rejected']) or (row['reason'] is not None and not isinstance(row['reason'], str)):
            raise ValueError('Malformed actual root constraint row')
    for row in constraints:
        if not isinstance(row, dict) or set(row) != fields or not all(isinstance(row[k], str) for k in ('group', 'module', 'required')):
            raise ValueError('Malformed installed root constraint')
        key = row['group'], row['module']
        reason = 'Reviewed root buildscript candidate ' + ROOT_POLICY_MANIFEST_SHA256 + ' ' + row['group'] + ':' + row['module']
        if key not in expected or key in installed or row['required'] != expected[key] or row['preferred'] != '' or row['strict'] != '' or row['rejected'] != [] or row['reason'] != reason or row not in all_constraints:
            raise ValueError('Root installed constraint absent, changed or foreign')
        installed[key] = row['required']
    if installed != expected:
        raise ValueError('Root require constraints do not cover exact protected targets')

def rp_validate_documents(documents, subject):
    subject = rp_subject(subject)
    if not isinstance(documents, list) or not 0 < len(documents) <= 2048:
        raise ValueError('Root policy graph inventory missing or beyond existing count bound')
    total = 0
    names = set()
    roots = []
    for name, raw in documents:
        if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9_.-]+\.json', name) or name in names or not isinstance(raw, bytes) or not 0 < len(raw) <= 8*1024**2:
            raise ValueError('Root policy graph identity or existing file bound invalid')
        names.add(name); total += len(raw)
        if total > 64*1024**2:
            raise ValueError('Root policy graph inventory exceeds existing aggregate bound')
        graph = rp_decode(raw)
        if not isinstance(graph, dict) or not all(isinstance(graph.get(k), str) for k in ('build', 'project', 'scope', 'configuration')) or not isinstance(graph.get('components'), list):
            raise ValueError('Malformed completed graph scope')
        is_root = tuple(graph[k] for k in ('build', 'project', 'scope', 'configuration')) == ROOT_POLICY_SCOPE
        if not is_root:
            if 'rootBuildscriptConstraintPolicy' in graph:
                raise ValueError('Foreign scope cannot provide root policy receipt')
            continue
        rp_validate_graph(graph, subject)
        roots.append({'path': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
    if not roots:
        raise ValueError('Mandatory fixed main-root classpath graph absent')
    return {'schema': 'micro.android.root-buildscript-policy-validation/1',
            'status': 'validated-main-root-classpath-receipts', 'manifestSha256': ROOT_POLICY_MANIFEST_SHA256,
            'toolSubject': subject, 'graphs': sorted(roots, key=lambda r: r['path'])}

def rp_validate_output(directory, subject):
    directory = Path(directory).absolute()
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError('Mandatory fixed root graph directory absent or linked')
    paths = sorted(directory.iterdir())
    if not 0 < len(paths) <= 2048:
        raise ValueError('Root graph inventory outside existing count bound')
    documents = []
    total = 0
    for path in paths:
        raw = rp_read_regular(path, 8*1024**2)
        total += len(raw)
        if total > 64*1024**2:
            raise ValueError('Root graph bytes exceed existing aggregate bound')
        documents.append((path.name, raw))
    return rp_validate_documents(documents, subject)


class Supervisor:
    def __init__(self, state):
        self.state = state
        self.env = {'PATH': '/usr/bin:/bin', 'DOCKER_CONFIG': str(state / 'docker-config')}
        self.executed_source = Path(__file__).read_bytes()
        self.resource_roles = ('client', 'proxy')
        self.receipt = {'startedAt': time.time(), 'scope': 'trusted-native-fixture-acquisition-only', 'image': IMAGE, 'commands': [], 'created': []}
    def headroom(self):
        mem = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
        facts = {'memoryAvailableBytes': int(mem['MemAvailable'].split()[0]) * 1024, 'diskFreeBytes': shutil.disk_usage(self.state).free}
        owned = [p.stat() for p in DEFAULT_STATE.rglob('*') if p.is_file() and not p.is_symlink()]
        facts['ownedBytes'] = sum(s.st_size for s in owned)
        facts['ownedAllocatedBytes'] = sum(s.st_blocks * 512 for s in owned)
        return facts
    def command(self, name, argv, timeout=60, allow_failure=False):
        target = self.state / 'receipts' / (name + '.log')
        if target.exists():
            raise ValueError('Refuse to overwrite first command evidence: ' + name)
        start = time.monotonic()
        process = None
        failure = None
        limit_failure = None
        captured = bytearray()
        observed_headroom = None
        final_observation_error = None
        with target.open('xb') as output:
            try:
                process = subprocess.Popen(argv, env=self.env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
                os.set_blocking(process.stdout.fileno(), False)
                next_sample = start
                with selectors.DefaultSelector() as selector:
                    selector.register(process.stdout,selectors.EVENT_READ)
                    eof = False
                    while not eof or process.poll() is None:
                        now = time.monotonic()
                        if now-start > timeout:
                            limit_failure = 'wall-time'
                            raise ValueError('Acquisition supervisor wall bound exceeded')
                        if now >= next_sample:
                            observed_headroom = self.headroom()
                            next_sample = now+1
                            if not name.startswith('cleanup-') and (max(observed_headroom['ownedBytes'],observed_headroom['ownedAllocatedBytes']) > 8*1024**3 or observed_headroom['memoryAvailableBytes'] < 3*1024**3 or observed_headroom['diskFreeBytes'] < 30*1024**3):
                                limit_failure = 'resources'
                                raise ValueError('Acquisition supervisor resource bound exceeded: '+json.dumps(observed_headroom))
                            if name == 'native-client-run': self.sample_owned_jobs()
                        for key,_ in selector.select(.05):
                            chunk = os.read(key.fileobj.fileno(),65536)
                            if not chunk:
                                eof = True;selector.unregister(key.fileobj);continue
                            remaining = 20*1024**2-len(captured)
                            admitted = chunk[:remaining]
                            output.write(admitted);captured.extend(admitted)
                            if len(chunk) > remaining:
                                limit_failure = 'log-bytes'
                                raise ValueError('Acquisition supervisor log bound exceeded')
            except BaseException as error:
                failure = error
            finally:
                if process is not None:
                    try:
                        if process.poll() is None:
                            process.terminate()
                            try: process.wait(10)
                            except subprocess.TimeoutExpired:
                                process.kill();process.wait(5)
                    except BaseException as stop_error:
                        failure = failure or stop_error
                    finally:
                        if process.stdout is not None: process.stdout.close()
                output.flush()
                try: observed_headroom = self.headroom()
                except Exception as error: final_observation_error = str(error)
                self.receipt['commands'].append({'name':name,'argv':argv,
                    'exitCode':process.returncode if process is not None else None,
                    'seconds':time.monotonic()-start,'logSha256':hashlib.sha256(captured).hexdigest(),
                    'logBytes':len(captured),'headroomAfter':observed_headroom,
                    'headroomObservationError':final_observation_error,'timedOut':limit_failure=='wall-time',
                    'limitFailure':limit_failure,
                    'error':{'type':type(failure).__name__,'message':str(failure)} if failure else None})
        if failure: raise failure
        if final_observation_error: raise ValueError('Acquisition final headroom observation failed: '+final_observation_error)
        raw = bytes(captured)
        if process.returncode and not allow_failure:
            raise ValueError(name + ' failed with exit ' + str(process.returncode))
        return raw.decode(errors='replace'), process.returncode
    def sample_owned_jobs(self):
        if not hasattr(self, 'cgroups'):
            self.cgroups = {}
        sample = {'time': time.time()}
        for role in self.resource_roles:
            name = NAMES[role]
            if role not in self.cgroups:
                readback = subprocess.run(['docker', 'inspect', name], env=self.env, capture_output=True, text=True, timeout=10)
                if readback.returncode:
                    raise ValueError('Owned live job readback unavailable')
                value = json.loads(readback.stdout)[0]
                pid = value['State']['Pid']
                if not value['State']['Running']:
                    continue
                identifier = value['Id']
                lines = Path('/proc/' + str(pid) + '/cgroup').read_text().splitlines()
                line = next(line for line in lines if line.startswith('0::'))
                suffix = line[3:]
                if not re.fullmatch(r'/system.slice/docker-' + identifier + r'\.scope', suffix):
                    raise ValueError('Unreviewed owned Docker cgroup layout')
                self.cgroups[role] = Path('/sys/fs/cgroup' + suffix)
            group = self.cgroups[role]
            if group.exists():
                sample[role] = {field: (group / field).read_text().strip() for field in ('memory.current', 'memory.peak', 'memory.events', 'pids.current', 'pids.peak', 'cpu.stat') if (group / field).exists()}
        for role in self.resource_roles:
            if role in sample and (self.cgroups[role] / 'memory.stat').exists():
                stats = dict(line.split() for line in (self.cgroups[role] / 'memory.stat').read_text().splitlines())
                sample[role]['memory.stat'] = {name: int(stats[name]) for name in ('anon', 'file', 'shmem') if name in stats}
        self.receipt['lastResourceSample'] = sample
        target = self.state / 'receipts/live-cgroup-samples.jsonl'
        if target.exists() and target.stat().st_size > 2 * 1024**2:
            raise ValueError('Owned cgroup evidence log budget exceeded')
        with target.open('a') as output:
            output.write(json.dumps(sample) + '\n')
    def inspect(self, name, resource):
        raw, _ = self.command(name, ['docker', 'inspect', resource])
        return json.loads(raw)[0]
    def verify_client(self, value):
        hc = value['HostConfig']
        if value['Image'] != IMAGE or value['Config']['User'] != '1000:1000' or not hc['ReadonlyRootfs'] or hc['Memory'] != 2 * 1024 ** 3 or hc['MemorySwap'] != hc['Memory'] or hc['PidsLimit'] != 128 or hc['NanoCpus'] != 1000000000 or hc.get('CapDrop') != ['ALL'] or 'no-new-privileges' not in hc['SecurityOpt'] or hc.get('Privileged') or hc.get('PortBindings') or hc.get('ExtraHosts'):
            raise ValueError('Acquisition client isolation mismatch')
        networks = value['NetworkSettings']['Networks']
        if set(networks) != {NAMES['internal']} or networks[NAMES['internal']].get('Gateway'):
            raise ValueError('Acquisition client network/gateway mismatch')
        mounts = value['Mounts']
        expected = {'/seed/fixture', '/seed/tools', '/out'}
        if {m['Destination'] for m in mounts} != expected or any(m['RW'] for m in mounts if m['Destination'] != '/out') or any(m['Type'] != 'bind' for m in mounts):
            raise ValueError('Acquisition client mounts mismatch')
    def cleanup(self):
        failures = []
        for kind, name in reversed(self.receipt['created']):
            try:
                self.command('cleanup-' + name, ['docker', kind, 'rm'] + (['--force'] if kind == 'container' else []) + [name], allow_failure=False)
                raw, code = self.command('cleanup-readback-' + name, ['docker', kind, 'inspect', name], allow_failure=True)
                absent_messages = ('no such object: ' + name, 'no such container: ' + name, 'network ' + name + ' not found')
                if code != 1 or not any(message in raw.lower() for message in absent_messages):
                    raise ValueError('Owned resource absence not proved')
                listing, code = self.command('cleanup-scoped-list-' + name, ['docker', kind, 'ls', '--filter=name=^' + name + '$', '--format={{.ID}}'], allow_failure=True)
                if code or listing.strip():
                    raise ValueError('Owned scoped resource list is not empty')
            except Exception as error:
                failures.append({'name': name, 'error': str(error)})
        self.receipt['cleanupFailures'] = failures
        if failures:
            self.receipt['status'] = 'cleanup-unresolved'
    def npm(self):
        for name in ('receipts', 'proxy-cache', 'output', 'docker-config', 'protected'):
            (self.state / name).mkdir()
        (self.state / 'receipts/executed-controller.py').write_bytes(self.executed_source)
        self.receipt['supervisorSourceSha256'] = hashlib.sha256(self.executed_source).hexdigest()
        os.chmod(self.state / 'proxy-cache', 0o777)
        os.chmod(self.state / 'output', 0o777)
        fixture = TOOLS / 'fixtures/native-smoke'
        shutil.copytree(fixture, self.state / 'protected/fixture')
        toolcopy = self.state / 'protected/tools'
        toolcopy.mkdir()
        for name in ('locked_npm_proxy.py', 'native_network_probe.py', 'npm_fixture_job.py'):
            shutil.copyfile(TOOLS / name, toolcopy / name)
        protected = {}
        for p in (self.state / 'protected').rglob('*'):
            if p.is_symlink() or not (p.is_file() or p.is_dir()):
                raise ValueError('Protected fixture contains unsupported link/special input')
            if p.is_file():
                protected[str(p.relative_to(self.state))] = hashlib.sha256(p.read_bytes()).hexdigest()
                os.chmod(p, 0o444)
        self.receipt['protectedSha256'] = protected
        self.receipt['headroomBefore'] = self.headroom()
        if self.receipt['headroomBefore']['memoryAvailableBytes'] < 5 * 1024 ** 3:
            raise ValueError('Insufficient acquisition headroom')
        try:
            self.command('network-internal-create', ['docker', 'network', 'create', '--driver=bridge', '--internal', '--subnet=' + SUBNET, '--opt=com.docker.network.bridge.gateway_mode_ipv4=isolated', '--label=lifeos.factory.stage=native-acquisition', NAMES['internal']])
            self.receipt['created'].append(('network', NAMES['internal']))
            internal = self.inspect('network-internal-inspect', NAMES['internal'])
            if not internal['Internal'] or internal['Options'].get('com.docker.network.bridge.gateway_mode_ipv4') != 'isolated' or internal.get('EnableIPv6'):
                raise ValueError('Internal isolated network readback mismatch')
            self.command('network-egress-create', ['docker', 'network', 'create', '--driver=bridge', '--label=lifeos.factory.stage=native-acquisition', NAMES['egress']])
            self.receipt['created'].append(('network', NAMES['egress']))
            isolation = ['--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=1000:1000', '--memory=2g', '--memory-swap=2g', '--cpus=1', '--pids-limit=128', '--tmpfs=/tmp:rw,nosuid,nodev,size=67108864,mode=1777']
            self.command('proxy-create', ['docker', 'create', '--name=' + NAMES['proxy'], '--network=' + NAMES['internal'], '--network-alias=factory-acquisition-proxy', '--ip=' + PROXY_IP, '--sysctl=net.ipv4.ip_forward=0'] + isolation + ['--mount=type=bind,src=' + str(toolcopy) + ',dst=/seed/tools,readonly', '--mount=type=bind,src=' + str(self.state / 'protected/fixture') + ',dst=/seed/fixture,readonly', '--mount=type=bind,src=' + str(self.state / 'proxy-cache') + ',dst=/cache', '--entrypoint=python3', IMAGE, '/seed/tools/locked_npm_proxy.py', '--bind=' + PROXY_IP, '--lock=/seed/fixture/package-lock.json', '--cache=/cache'])
            self.receipt['created'].append(('container', NAMES['proxy']))
            self.command('proxy-egress-connect', ['docker', 'network', 'connect', NAMES['egress'], NAMES['proxy']])
            proxy = self.inspect('proxy-inspect', NAMES['proxy'])
            if set(proxy['NetworkSettings']['Networks']) != {NAMES['internal'], NAMES['egress']} or proxy['HostConfig'].get('PortBindings') or proxy['HostConfig']['Sysctls'] != {'net.ipv4.ip_forward': '0'}:
                raise ValueError('Proxy network settings mismatch')
            egress = self.inspect('egress-members-inspect', NAMES['egress'])
            if egress['Containers']:
                raise ValueError('Unexpected live member before proxy start')
            self.command('proxy-start', ['docker', 'start', NAMES['proxy']])
            egress = self.inspect('egress-members-after-start-inspect', NAMES['egress'])
            if {v['Name'] for v in egress['Containers'].values()} != {NAMES['proxy']}:
                raise ValueError('Unexpected owned egress live member after proxy start')
            self.command('client-create', ['docker', 'create', '--name=' + NAMES['client'], '--network=' + NAMES['internal'], '--dns=127.0.0.1'] + isolation + ['--tmpfs=/work:rw,nosuid,nodev,size=2147483648,uid=1000,gid=1000,mode=0700', '--mount=type=bind,src=' + str(toolcopy) + ',dst=/seed/tools,readonly', '--mount=type=bind,src=' + str(self.state / 'protected/fixture') + ',dst=/seed/fixture,readonly', '--mount=type=bind,src=' + str(self.state / 'output') + ',dst=/out', '--env=FACTORY_IMAGE_ID=' + IMAGE, '--entrypoint=/bin/sh', IMAGE, '-c', 'python3 /seed/tools/native_network_probe.py --proxy ' + PROXY_IP + ' && exec python3 /seed/tools/npm_fixture_job.py'])
            self.receipt['created'].append(('container', NAMES['client']))
            value = self.inspect('client-isolation-inspect', NAMES['client'])
            self.verify_client(value)
            self.command('npm-client-run', ['docker', 'start', '--attach', NAMES['client']], timeout=1200)
            value = self.inspect('client-state-final', NAMES['client'])
            self.receipt['clientState'] = value['State']
            if value['State']['ExitCode'] or value['State']['OOMKilled']:
                raise ValueError('Trusted npm client failed')
            for name, digest in protected.items():
                if hashlib.sha256((self.state / name).read_bytes()).hexdigest() != digest:
                    raise ValueError('Protected supervisor inputs changed')
            self.receipt['status'] = 'npm-acquisition-network-proved-native-pending'
        except Exception as error:
            self.receipt['status'] = 'first-failure-retained'
            self.receipt['firstFailure'] = {'type': type(error).__name__, 'message': str(error)}
            raise
        finally:
            try:
                self.command('proxy-logs-final', ['docker', 'logs', NAMES['proxy']], allow_failure=True)
            finally:
                self.cleanup()
                self.receipt['headroomAfter'] = self.headroom()
                self.receipt['finishedAt'] = time.time()
                (self.state / 'receipts/npm-acquisition.json').write_text(json.dumps(self.receipt, indent=2) + '\n')

    def maven(self, npm_seed, reuse_public_maven_seed=False):
        for name in ('receipts', 'proxy-cache', 'output', 'docker-config', 'protected'):
            (self.state / name).mkdir()
        (self.state / 'receipts/executed-controller.py').write_bytes(self.executed_source)
        self.receipt['supervisorSourceSha256'] = hashlib.sha256(self.executed_source).hexdigest()
        for name in ('proxy-cache', 'output'):
            os.chmod(self.state / name, 0o777)
        shutil.copytree(TOOLS / 'fixtures/native-smoke', self.state / 'protected/fixture')
        toolcopy = self.state / 'protected/tools'
        toolcopy.mkdir()
        for name in ('maven_proxy.py', 'native_network_probe.py', 'native_fixture_job.py', 'native_failure_diagnostics.py', 'npm_fixture_job.py', 'trusted_repositories.init.gradle', 'locked_local_maven.py', 'locked-local-maven-manifest.json', 'trusted_vendor_adapter.py', 'trusted-vendor-gradle-adapter.json'):
            shutil.copyfile(TOOLS / name, toolcopy / name)
        maven_body_seed = None
        proxy_seed_mounts, proxy_seed_args = [], []
        if reuse_public_maven_seed:
            from verified_maven_seed import admitted_host_seed,MANIFEST,MANIFEST_SHA256,SOURCE_ROOT
            maven_body_seed = admitted_host_seed()
            self.receipt['publicMavenSeedBefore'] = maven_body_seed.verify_all()
            shutil.copyfile(TOOLS/'verified_maven_seed.py',toolcopy/'verified_maven_seed.py')
            shutil.copyfile(MANIFEST,toolcopy/'verified-maven-seed.json')
            proxy_seed_mounts = ['--mount=type=bind,src='+str(SOURCE_ROOT)+',dst=/seed/maven-bodies,readonly']
            proxy_seed_args = ['--seed-root=/seed/maven-bodies','--seed-manifest=/seed/tools/verified-maven-seed.json','--seed-sha256='+MANIFEST_SHA256]
        seal = json.loads((npm_seed / 'seal.json').read_text())
        if seal['status'] != 'sealed-npm-and-native-template-only' or seal['image'] != IMAGE:
            raise ValueError('Maven acquisition requires admitted npm input identity')
        spec = importlib.util.spec_from_file_location('protected_archive_admission', DEFAULT_STATE.parent / 'android-builder/admit.py')
        safe = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(safe)
        for component in ('npm-cache', 'generated-android'):
            manifest = json.loads((npm_seed / (component + '-manifest.json')).read_text())
            data = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
            if hashlib.sha256(data).hexdigest() != seal['components'][component]['canonicalTreeSha256']:
                raise ValueError('Npm seed manifest identity changed')
            safe.verify_tree(npm_seed / component, manifest)
        preimages = {name: hashlib.sha256((npm_seed / 'generated-android' / name).read_bytes()).hexdigest() for name in ('build.gradle', 'app/build.gradle')}
        (self.state / 'protected/patch-preimages.json').write_text(json.dumps(preimages, indent=2) + '\n')
        protected = {str(p.relative_to(self.state)): hashlib.sha256(p.read_bytes()).hexdigest() for p in (self.state / 'protected').rglob('*') if p.is_file() and not p.is_symlink()}
        for path in protected: (self.state / path).chmod(0o444)
        self.receipt['protectedSha256'] = protected
        self.receipt['npmSeedSealSha256'] = hashlib.sha256((npm_seed / 'seal.json').read_bytes()).hexdigest()
        self.receipt['limits'] = {'memory': 6 * 1024**3, 'memorySwapTotal': 6 * 1024**3, 'cpus': 2, 'pids': 384, 'tmpfsWork': 8 * 1024**3, 'wallSeconds': 1800, 'logBytes': 20 * 1024**2, 'apkBytes': 512 * 1024**2}
        self.receipt['headroomBefore'] = self.headroom()
        if self.receipt['headroomBefore']['memoryAvailableBytes'] < 9 * 1024**3 or self.receipt['headroomBefore']['diskFreeBytes'] < 30 * 1024**3:
            self.receipt['status'] = 'compile-headroom-blocked-no-job-started'
            (self.state / 'receipts/maven-acquisition.json').write_text(json.dumps(self.receipt, indent=2) + '\n')
            raise ValueError('Native compile requires MemAvailable>=9GiB and diskfree>=30GiB')
        try:
            self.command('network-internal-create', ['docker', 'network', 'create', '--driver=bridge', '--internal', '--subnet=' + SUBNET, '--opt=com.docker.network.bridge.gateway_mode_ipv4=isolated', '--label=lifeos.factory.stage=native-acquisition', NAMES['internal']])
            self.receipt['created'].append(('network', NAMES['internal']))
            internal = self.inspect('network-internal-inspect', NAMES['internal'])
            if not internal['Internal'] or internal['Options'].get('com.docker.network.bridge.gateway_mode_ipv4') != 'isolated' or internal.get('EnableIPv6'):
                raise ValueError('Internal isolated network readback mismatch')
            bridge = 'br-' + internal['Id'][:12]
            raw, _ = self.command('bridge-ipv4-address-proof', ['/usr/sbin/ip', '-json', '-4', 'address', 'show', 'dev', bridge])
            if any(v['addr_info'] for v in json.loads(raw)):
                raise ValueError('Owned isolated bridge has host IPv4 address')
            self.command('network-egress-create', ['docker', 'network', 'create', '--driver=bridge', '--label=lifeos.factory.stage=native-acquisition', NAMES['egress']])
            self.receipt['created'].append(('network', NAMES['egress']))
            self.command('proxy-create', ['docker', 'create', '--name=' + NAMES['proxy'], '--network=' + NAMES['internal'], '--network-alias=factory-acquisition-proxy', '--ip=' + PROXY_IP, '--sysctl=net.ipv4.ip_forward=0', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=1000:1000', '--log-driver=none', '--memory=2g', '--memory-swap=2g', '--cpus=1', '--pids-limit=128', '--tmpfs=/tmp:rw,nosuid,nodev,size=67108864,mode=1777', '--mount=type=bind,src=' + str(toolcopy) + ',dst=/seed/tools,readonly', '--mount=type=bind,src=' + str(self.state / 'proxy-cache') + ',dst=/cache']+proxy_seed_mounts+['--entrypoint=python3', IMAGE, '/seed/tools/maven_proxy.py', '--bind=' + PROXY_IP, '--cache=/cache']+proxy_seed_args)
            self.receipt['created'].append(('container', NAMES['proxy']))
            self.command('proxy-egress-connect', ['docker', 'network', 'connect', NAMES['egress'], NAMES['proxy']])
            self.command('proxy-start', ['docker', 'start', NAMES['proxy']])
            proxy_deadline = time.monotonic() + 1800
            proxy = self.inspect('proxy-isolation-inspect', NAMES['proxy'])
            if set(proxy['NetworkSettings']['Networks']) != {NAMES['internal'], NAMES['egress']} or proxy['HostConfig'].get('PortBindings') or proxy['HostConfig']['Sysctls'] != {'net.ipv4.ip_forward': '0'}:
                raise ValueError('Proxy network settings mismatch')
            expected_proxy_mounts = {'/seed/tools':(str(toolcopy),False),'/cache':(str(self.state/'proxy-cache'),True)}
            if maven_body_seed is not None: expected_proxy_mounts['/seed/maven-bodies']=(str(SOURCE_ROOT),False)
            actual_proxy_mounts = {m['Destination']:(m['Source'],m['RW']) for m in proxy['Mounts'] if m['Type']=='bind'}
            if len(proxy['Mounts']) != len(expected_proxy_mounts) or actual_proxy_mounts != expected_proxy_mounts:
                raise ValueError('Proxy exact closed public seed mounts changed')
            if proxy['HostConfig']['Tmpfs'] != {'/tmp':'rw,nosuid,nodev,size=67108864,mode=1777'} or proxy['HostConfig']['LogConfig'] != {'Type':'none','Config':{}}:
                raise ValueError('Proxy tmpfs/disabled daemon logging changed')
            self.receipt['proxyMountReadback'] = proxy['Mounts']
            self.receipt['daemonLogging']='disabled: owned worker attach20MiB and proxy events20MiB only; docker logs intentionally unavailable'
            egress = self.inspect('egress-members-inspect', NAMES['egress'])
            if {v['Name'] for v in egress['Containers'].values()} != {NAMES['proxy']}:
                raise ValueError('Unexpected egress network member')
            mounts = ['--mount=type=bind,src=' + str(toolcopy) + ',dst=/seed/tools,readonly', '--mount=type=bind,src=' + str(self.state / 'protected/fixture') + ',dst=/seed/fixture,readonly', '--mount=type=bind,src=' + str(npm_seed / 'npm-cache') + ',dst=/seed/npm-cache,readonly', '--mount=type=bind,src=' + str(self.state / 'protected/patch-preimages.json') + ',dst=/seed/patch-preimages.json,readonly', '--mount=type=bind,src=' + str(self.state / 'output') + ',dst=/out']
            self.command('client-create', ['docker', 'create', '--name=' + NAMES['client'], '--network=' + NAMES['internal'], '--dns=127.0.0.1', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=1000:1000', '--log-driver=none', '--memory=6g', '--memory-swap=6g', '--cpus=2', '--pids-limit=384', '--tmpfs=/tmp:rw,nosuid,nodev,size=67108864,mode=1777', '--tmpfs=/work:rw,nosuid,nodev,exec,size=8589934592,uid=1000,gid=1000,mode=0700'] + mounts + ['--entrypoint=/bin/sh', IMAGE, '-c', 'python3 /seed/tools/native_network_probe.py --proxy ' + PROXY_IP + ' --maven && exec python3 /seed/tools/native_fixture_job.py'])
            self.receipt['created'].append(('container', NAMES['client']))
            client = self.inspect('client-isolation-inspect', NAMES['client'])
            hc = client['HostConfig']
            if client['Image'] != IMAGE or client['Config']['User'] != '1000:1000' or not hc['ReadonlyRootfs'] or hc['Memory'] != 6 * 1024**3 or hc['MemorySwap'] != hc['Memory'] or hc['PidsLimit'] != 384 or hc['NanoCpus'] != 2000000000 or hc.get('CapDrop') != ['ALL'] or 'no-new-privileges' not in hc['SecurityOpt'] or hc.get('PortBindings') or hc.get('ExtraHosts') or hc.get('Privileged'):
                raise ValueError('Native client isolation readback mismatch')
            if set(client['NetworkSettings']['Networks']) != {NAMES['internal']} or client['NetworkSettings']['Networks'][NAMES['internal']].get('Gateway'):
                raise ValueError('Native client network readback mismatch')
            if len(client['Mounts']) != 5 or any(m['RW'] for m in client['Mounts'] if m['Destination'] != '/out'):
                raise ValueError('Native client seed mount readback mismatch')
            if hc['Tmpfs'] != {'/tmp':'rw,nosuid,nodev,size=67108864,mode=1777','/work':'rw,nosuid,nodev,exec,size=8589934592,uid=1000,gid=1000,mode=0700'}:
                raise ValueError('Native client exact executable work tmpfs changed')
            if hc['LogConfig'] != {'Type':'none','Config':{}}:
                raise ValueError('Native client daemon logging must be disabled')
            self.command('native-client-run', ['docker', 'start', '--attach', NAMES['client']], timeout=max(1, proxy_deadline - time.monotonic()))
            final = self.inspect('client-state-final', NAMES['client'])
            self.receipt['clientState'] = final['State']
            if final['State']['OOMKilled'] or final['State']['ExitCode']:
                raise ValueError('Native acquisition failed')
            proxy_final = self.inspect('proxy-state-final',NAMES['proxy'])
            self.receipt['proxyState'] = proxy_final['State']
            if not proxy_final['State']['Running'] or proxy_final['State']['OOMKilled'] or (self.state/'proxy-cache/seed-integrity-failure.json').exists():
                raise ValueError('Trusted acquisition proxy integrity/state failed')
            for path, digest in protected.items():
                if hashlib.sha256((self.state / path).read_bytes()).hexdigest() != digest:
                    raise ValueError('Protected fixture or proxy changed')
            subject = rp_tool_subject(toolcopy)
            if any(subject[name]['sha256'] != protected['protected/tools/'+name] for name in ROOT_POLICY_TOOL_NAMES):
                raise ValueError('Current protected root policy tool subject changed')
            root_policy = rp_validate_output(self.state / 'output/graph', subject)
            gson_policy = gr_validate_output(self.state / 'output/graph', subject)
            worker = rp_decode(rp_read_regular(self.state / 'output/native-job.json', 2*1024**2))
            if worker.get('status') != 'trusted-fixture-native-task-closure-acquired' or worker.get('rootPolicyValidation') != root_policy or worker.get('gsonRuntimePolicyValidation') != gson_policy:
                raise ValueError('Actual acquisition worker/root policy receipt mismatch')
            self.receipt['rootPolicyValidation'] = root_policy
            self.receipt['gsonRuntimePolicyValidation'] = gson_policy
            self.receipt['status'] = 'native-acquisition-task-closure-complete-offline-proof-pending'
        except Exception as error:
            self.receipt['status'] = 'first-native-failure-retained'
            self.receipt['firstFailure'] = {'type': type(error).__name__, 'message': str(error)}
            if ('container', NAMES['client']) in self.receipt['created']:
                final = self.inspect('client-state-on-failure', NAMES['client'])
                self.receipt['clientState'] = final['State']
            raise
        finally:
            try:
                self.command('proxy-logs-final', ['docker', 'logs', NAMES['proxy']], allow_failure=True)
            finally:
                self.cleanup()
                if maven_body_seed is not None:
                    try:
                        after = admitted_host_seed().verify_all()
                        self.receipt['publicMavenSeedAfter'] = after
                        if after != self.receipt['publicMavenSeedBefore']: raise ValueError('Public Maven seed changed across job')
                    except Exception as seed_error:
                        self.receipt['publicMavenSeedPostcheckFailure'] = str(seed_error)
                        self.receipt['status'] = 'public-maven-seed-postcheck-failed'
                self.receipt['headroomAfter'] = self.headroom()
                self.receipt['finishedAt'] = time.time()
                (self.state / 'receipts/maven-acquisition.json').write_text(json.dumps(self.receipt, indent=2) + '\n')
        if self.receipt.get('publicMavenSeedPostcheckFailure'):
            raise ValueError('Public Maven seed postcheck failed; success rejected')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', type=Path, default=DEFAULT_STATE)
    parser.add_argument('--npm-seed', type=Path)
    parser.add_argument('--reuse-public-maven-seed', action='store_true')
    parser.add_argument('stage', choices=['npm', 'maven'])
    args = parser.parse_args()
    if not args.state.resolve().is_relative_to(DEFAULT_STATE):
        raise ValueError('State must remain in the authorized native-acquisition directory')
    if args.state.is_symlink() or args.state.exists():
        raise ValueError('Require a new owned acquisition state; no implicit first-failure retry')
    args.state.mkdir()
    if args.stage == 'npm':
        Supervisor(args.state).npm()
    else:
        if not args.npm_seed:
            raise ValueError('Maven stage requires exact sealed npm input')
        Supervisor(args.state).maven(args.npm_seed,reuse_public_maven_seed=args.reuse_public_maven_seed)

if __name__ == '__main__':
    main()
