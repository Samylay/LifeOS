#!/usr/bin/env python3
"""Trusted variant closure acquisition or one fresh strict offline calibration."""
import argparse
import hashlib
import json
import os
import re
import stat
from pathlib import Path
import shutil
import subprocess
import time

from npm_fixture_job import archive
from native_failure_diagnostics import collect as collect_failure_diagnostics
from locked_local_maven import verify_all
from trusted_vendor_adapter import apply as apply_vendor_adapter, verify_after as verify_vendor_adapter

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


# Fixed compiler control for this private fixture alone.
NATIVE_NINJA_WRAPPER = '#!/bin/sh\n# Private fixture only. Reject every caller-supplied concurrency override.\nfor native_arg in "$@"; do\n    case "$native_arg" in\n        --|-*j*|--jobs*)\n            printf \'%s\\n\' \'Native Ninja concurrency override or option boundary forbidden\' >&2\n            exit 64\n            ;;\n    esac\ndone\nexec /opt/android-sdk/cmake/3.22.1/bin/ninja -j2 "$@"\n'
NATIVE_NINJA_GRADLE = '\n// Private fixture: AGP uses this executable for direct Ninja launches.\nsubprojects { nativeProject ->\n    ["com.android.application", "com.android.library"].each { nativePlugin ->\n        nativeProject.plugins.withId(nativePlugin) {\n            def nativeArgument = "-DCMAKE_MAKE_PROGRAM=/work/native-ninja"\n            def nativeCmakeArguments = nativeProject.extensions.getByName("android").defaultConfig.externalNativeBuild.cmake.arguments\n            if (nativeCmakeArguments.any { it.startsWith("-DCMAKE_MAKE_PROGRAM") }) {\n                throw new GradleException("Native Ninja executable already configured")\n            }\n            nativeCmakeArguments.add(nativeArgument)\n            nativeProject.afterEvaluate {\n                def nativeArguments = nativeCmakeArguments.findAll { it.startsWith("-DCMAKE_MAKE_PROGRAM") }\n                if (nativeArguments != [nativeArgument]) {\n                    throw new GradleException("Native Ninja executable override or removal forbidden")\n                }\n            }\n        }\n    }\n}\n'
NATIVE_NINJA_ARGUMENTS = ['-DCMAKE_MAKE_PROGRAM=/work/native-ninja']

def install_native_compiler_control(fixture, work, receipt):
    root = fixture / 'android/build.gradle'
    raw = rp_read_regular(root, 2*1024**2)
    before = hashlib.sha256(raw).hexdigest()
    if before != receipt['patches'][0]['afterSha256'] or b'CMAKE_MAKE_PROGRAM' in raw:
        raise ValueError('Native compiler generated root preimage mismatch')
    wrapper = work / 'native-ninja'
    with wrapper.open('xb') as destination:
        destination.write(NATIVE_NINJA_WRAPPER.encode())
    wrapper.chmod(0o500)
    root.write_bytes(raw + NATIVE_NINJA_GRADLE.encode())
    receipt['patches'].append({'path': str(root), 'beforeSha256': before,
        'afterSha256': hash_file(root), 'purpose': 'AGP direct Ninja ceiling2',
        'appendSha256': hashlib.sha256(NATIVE_NINJA_GRADLE.encode()).hexdigest(),
        'cmakeArguments': list(NATIVE_NINJA_ARGUMENTS),
        'wrapper': {'path': '/work/native-ninja', 'bytes': len(NATIVE_NINJA_WRAPPER.encode()),
            'sha256': hash_file(wrapper), 'mode': '0500',
            'realNinja': '/opt/android-sdk/cmake/3.22.1/bin/ninja', 'jobs': 2}})


def verify_native_compiler_control(fixture, work, receipt):
    observed = receipt['patches'][3]
    wrapper = work / 'native-ninja'
    if (hashlib.sha256(rp_read_regular(wrapper, 8192)).hexdigest() != observed['wrapper']['sha256']
            or wrapper.stat().st_mode & 0o777 != 0o500
            or hash_file(fixture / 'android/build.gradle') != observed['afterSha256']):
        raise ValueError('Native compiler protected wrapper or generated root changed')


def hash_file(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        while chunk := f.read(256 * 1024): h.update(chunk)
    return h.hexdigest()

def facts():
    base = Path('/sys/fs/cgroup')
    result = {}
    for name in ('memory.current', 'memory.peak', 'memory.events', 'memory.swap.current', 'memory.swap.peak', 'pids.current', 'pids.peak', 'cpu.stat'):
        p = base / name
        result[name] = p.read_text().strip() if p.exists() else None
    result['workRegularBytes'] = sum(p.stat().st_size for p in Path('/work').rglob('*') if p.is_file() and not p.is_symlink())
    return result

def patch(path, old, new, expected_hash, receipt):
    data = path.read_text()
    before = hash_file(path)
    if before != expected_hash or data.count(old) != 1:
        raise ValueError('Protected patch preimage mismatch: ' + str(path))
    path.write_text(data.replace(old, new))
    receipt.append({'path': str(path), 'beforeSha256': before, 'afterSha256': hash_file(path), 'oldSha256': hashlib.sha256(old.encode()).hexdigest(), 'newSha256': hashlib.sha256(new.encode()).hexdigest()})

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    receipt = {'scope': 'trusted-fixture-only', 'offline': args.offline, 'startedAt': time.time(), 'commands': [], 'patches': []}
    output = Path('/out')
    work = Path('/work')
    fixture = work / 'fixture'
    seed_fixture = Path('/seed/fixture')
    for path in [seed_fixture, *seed_fixture.rglob('*')]:
        if path.is_symlink() or not (path.is_dir() or path.is_file()):
            raise ValueError('Fixture seed link/special file forbidden')
    shutil.copytree(seed_fixture, fixture)
    # Mutability belongs only to this fresh worker-private source copy.
    for path in [fixture, *fixture.rglob('*')]:
        path.chmod(0o755 if path.is_dir() else 0o644)
    shutil.copytree('/seed/npm-cache', work / 'npm-cache')
    # Copies become mutable only inside this fresh job.
    for p in (work / 'npm-cache').rglob('*'):
        if not p.is_symlink(): p.chmod(0o755 if p.is_dir() or p.stat().st_mode & 0o111 else 0o644)
    home = work / 'home'
    home.mkdir()
    (home / '.android').mkdir()
    gradle_home = work / 'gradle-home'
    gradle_home.mkdir()
    if args.offline:
        shutil.copytree('/seed/gradle-caches', gradle_home / 'caches')
        for p in (gradle_home / 'caches').rglob('*'):
            if not p.is_symlink(): p.chmod(0o755 if p.is_dir() or p.stat().st_mode & 0o111 else 0o644)
    (work / 'empty-user.npmrc').write_text('')
    (work / 'empty-global.npmrc').write_text('')
    gradle_jvm_args = '-Duser.home=/work/home -Xmx1024m -XX:MaxMetaspaceSize=512m -XX:ActiveProcessorCount=2'
    java_tool_options = '-Duser.home=/work/home -XX:ActiveProcessorCount=2 -Xmx512m -XX:MaxMetaspaceSize=256m'
    properties = '\n'.join([
        'org.gradle.java.installations.auto-download=false', 'org.gradle.java.installations.auto-detect=false', 'org.gradle.java.installations.paths=/opt/jdk17',
        'org.gradle.jvmargs=' + gradle_jvm_args, 'org.gradle.parallel=false', 'org.gradle.workers.max=1', 'org.gradle.vfs.watch=false',
        'org.gradle.caching=false', 'org.gradle.configuration-cache=false', 'org.gradle.daemon=false', 'kotlin.compiler.execution.strategy=in-process', 'kotlin.incremental=false',
        'reactNativeArchitectures=x86_64', 'android.cmakeVersion=3.22.1', 'react.includeJitpackRepository=false', 'android.builder.sdkDownload=false', 'hermesEnabled=true',
    ]) + '\n'
    (gradle_home / 'gradle.properties').write_text(properties)
    env = {'PATH': '/opt/jdk17/bin:/opt/gradle/bin:/usr/local/bin:/usr/bin:/bin', 'HOME': str(home), 'GRADLE_USER_HOME': str(gradle_home), 'CI': '1', 'EXPO_OFFLINE': '1', 'EXPO_NO_TELEMETRY': '1', 'JAVA_HOME': '/opt/jdk17', 'ANDROID_HOME': '/opt/android-sdk', 'ANDROID_SDK_ROOT': '/opt/android-sdk', 'npm_config_userconfig': str(work / 'empty-user.npmrc'), 'npm_config_globalconfig': str(work / 'empty-global.npmrc'), 'npm_config_cache': str(work / 'npm-cache'), 'npm_config_registry': 'http://factory-acquisition-proxy:8081/', 'npm_config_update_notifier': 'false', 'NODE_OPTIONS': '--max-old-space-size=768', 'JAVA_TOOL_OPTIONS': java_tool_options, 'ANDROID_USER_HOME': '/work/home/.android', 'CMAKE_BUILD_PARALLEL_LEVEL': '1', 'OMP_NUM_THREADS': '1', 'MAKEFLAGS': '-j1', 'FACTORY_GRAPH_DIR': '/out/graph'}
    actual_properties = dict(line.split('=', 1) for line in (gradle_home / 'gradle.properties').read_text().splitlines())
    receipt['jvmPolicy'] = {'gradleJvmArgs': actual_properties['org.gradle.jvmargs'], 'javaToolOptions': env['JAVA_TOOL_OPTIONS']}
    def run(argv):
        start = time.monotonic()
        result = subprocess.run(argv, env=env, cwd=fixture)
        receipt['commands'].append({'argv': argv, 'exitCode': result.returncode, 'seconds': time.monotonic() - start})
        receipt['resources'] = facts()
        output.joinpath('native-job-progress.json').write_text(json.dumps(receipt, indent=2) + '\n')
        if result.returncode:
            raise ValueError('Trusted fixture command failed; do not automatically change budget or inputs')
    try:
        run(['npm', 'ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'])
        receipt['vendorAdapter'] = apply_vendor_adapter(fixture, '/seed/tools/trusted-vendor-gradle-adapter.json')
        private_maven = home / '.m2/repository'
        if private_maven.exists() or private_maven.is_symlink(): raise ValueError('Fresh worker must have no local Maven inputs')
        receipt['privateMavenBefore'] = {'path': str(private_maven), 'exists': False}
        receipt['localMavenPrebuild'] = verify_all(fixture, '/seed/tools/locked-local-maven-manifest.json', remove_metadata=True)
        # Fresh generated sources, never acquisition build outputs.
        run(['node', './node_modules/expo/bin/cli', 'prebuild', '--platform', 'android', '--no-install'])
        expected = json.loads(Path('/seed/patch-preimages.json').read_text())
        patch(fixture / 'android/build.gradle', "    maven { url 'https://www.jitpack.io' }\n", '', expected['build.gradle'], receipt['patches'])
        release = "            // Caution! In production, you need to generate your own keystore file.\n            // see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug\n"
        patch(fixture / 'android/app/build.gradle', release, '            // Private fixture emits an unsigned release for supervisor signing.\n', expected['app/build.gradle'], receipt['patches'])
        # Clamp Metro workers through vendor-supported RN bundle arguments.
        app = fixture / 'android/app/build.gradle'
        data = app.read_text()
        pre = '    bundleCommand = "export:embed"\n'
        if data.count(pre) != 1: raise ValueError('Metro workers protected preimage missing')
        before = hash_file(app)
        app.write_text(data.replace(pre, pre + '    extraPackagerArgs = ["--max-workers", "1"]\n'))
        receipt['patches'].append({'path': str(app), 'beforeSha256': before, 'afterSha256': hash_file(app), 'purpose': 'Metro worker ceiling1'})
        install_native_compiler_control(fixture, work, receipt)
        if args.offline:
            shutil.copyfile('/seed/verification-metadata.xml', fixture / 'android/gradle/verification-metadata.xml')
        argv = ['/opt/gradle/bin/gradle', '-p', 'android', '--no-daemon', '--max-workers=1', '--no-build-cache', '--no-configuration-cache', '--console=plain', '--stacktrace', '--info', '--init-script=/seed/tools/trusted_repositories.init.gradle']
        if args.offline:
            argv += ['--offline', '--dependency-verification=strict']
        argv += ['app:assembleRelease']
        run(argv)
        verify_native_compiler_control(fixture, work, receipt)
        receipt['rootPolicyValidation'] = rp_validate_output(output / 'graph', rp_tool_subject(Path('/seed/tools')))
        receipt['gsonRuntimePolicyValidation'] = gr_validate_output(output / 'graph', rp_tool_subject(Path('/seed/tools')))
        receipt['vendorAdapterPostbuild'] = verify_vendor_adapter(fixture, '/seed/tools/trusted-vendor-gradle-adapter.json')
        if private_maven.is_symlink() or (private_maven.exists() and any(private_maven.rglob('*'))): raise ValueError('Worker local Maven inputs appeared')
        receipt['privateMavenAfter'] = {'path': str(private_maven), 'exists': private_maven.exists(), 'inputs': 0}
        receipt['localMavenPostbuild'] = verify_all(fixture, '/seed/tools/locked-local-maven-manifest.json', metadata_removed=True)
        apks = list((fixture / 'android/app/build/outputs/apk/release').glob('*.apk'))
        if len(apks) != 1 or apks[0].stat().st_size > 512 * 1024**2 or 'unsigned' not in apks[0].name:
            raise ValueError('Expected one bounded unsigned release APK')
        shutil.copyfile(apks[0], output / 'fixture-release-unsigned.apk')
        receipt['apk'] = {'bytes': apks[0].stat().st_size, 'sha256': hash_file(apks[0]), 'unsigned': True, 'signing': 'No business key or production identity; supervisor signing still pending'}
        if not args.offline:
            # Dependencies only. Discard transform/task/JVM compilation outputs from the seed.
            receipt['gradleDependencyCache'] = archive(gradle_home / 'caches', output / 'gradle-dependency-caches.tar', 4 * 1024**3, admitted_top={'modules-2'}, skip_names={'gc.properties'})
            # Trusted sealer generates independent task-cache verification XML.
            # This immutable worker receipt reports only bytes it created.
        receipt['resources'] = facts()
        receipt['status'] = 'clean-offline-fixture-unsigned-apk' if args.offline else 'trusted-fixture-native-task-closure-acquired'
    except Exception as error:
        receipt['status'] = 'first-native-failure-retained'
        receipt['firstFailure'] = {'type': type(error).__name__, 'message': str(error)}
        try:
            receipt['failureDiagnostics'] = collect_failure_diagnostics(fixture, output / 'native-failure-diagnostics')
        except Exception as diagnostic_error:
            receipt['failureDiagnostics'] = {'error': str(diagnostic_error), 'originalFailurePreserved': True}
        receipt['resources'] = facts()
        raise
    finally:
        receipt['finishedAt'] = time.time()
        output.joinpath('native-job.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps(receipt), flush=True)

if __name__ == '__main__':
    main()
