"""Controller logic only: all observations below are intentionally synthetic.

No APK was built/scanned/installed by these fixtures. Passing unit tests proves
fail-closed plumbing, not actual native, security, device, recovery or CI proof.
"""
import copy
from dataclasses import replace
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import admission as a
import artifact_supervisor as inspector
import ci
import pipeline as p
import security_native as scanner


class SyntheticFixture:
    def __init__(self, directory):
        self.store = a.Store(Path(directory)); self.count = 0; self.now = time.time()
        self.commands = [['npm', 'ci', '--offline', '--ignore-scripts'],
                         ['node', './node_modules/expo/bin/cli', 'prebuild', '--platform', 'android', '--no-install'],
                         ['/opt/gradle/bin/gradle', '--offline', 'app:assembleRelease']]
        identities = {name: self.put(name.encode()) for name in a.IDENTITIES}
        # Actual public frozen lock/policy bytes exercise fixture authority. All
        # APKs, worker/jobs/scans and observations below remain explicitly FAKE.
        identities['sourceLock'] = self.put(Path(a.__file__).with_name('fixtures').joinpath('native-smoke/package-lock.json').read_bytes())
        identities['scannerPolicy'] = self.put(scanner.POLICY)
        identities['toolchain'] = self.put({'artifactToolsSha256': {'aapt': 'a'*64, 'apksigner': 'c'*64}})
        source_tree = self.fake_tree('sealed/fixture', {'package-lock.json': self.store.read(identities['sourceLock']),
                                                     'package.json': b'FAKE package', 'app.js': b'FAKE app'})
        self.source_files = source_tree['files']
        self.source_export = self.put({'schema': 'micro.android.source-export/1', 'sourceSha': '1'*40,
                                       'sourceArchiveSha256': identities['sourceArchive'].sha256,
                                       'sourceLock': identities['sourceLock'].json(), 'exporterSha256': 'e'*64,
                                       'tree': source_tree})
        self.seeds = {'/seed/fixture': source_tree}
        for destination in sorted(a.NATIVE_SEEDS - {'/seed/fixture'}):
            kind = 'file' if destination.endswith(('.xml', '.json')) else 'directory'
            files = {'FAKE-input': ('FAKE seed '+destination).encode()}
            if destination == '/seed/tools':
                files = {'native_fixture_job.py': b'FAKE worker bytes, not executed'}
                for name in ('trusted-vendor-gradle-adapter.json', 'locked-local-maven-manifest.json'):
                    files[name] = Path(a.__file__).with_name(name).read_bytes()
            elif destination == '/seed/patch-preimages.json':
                files = {'FAKE-input': a.canonical({'build.gradle': 'a'*64, 'app/build.gradle': 'b'*64})}
            self.seeds[destination] = self.fake_tree('sealed/'+destination.split('/')[-1], files, kind)
        # FAKE environment and worker bytes are administrative test pins only.
        self.execution = {'entrypoint': ['python3'], 'argv': ['/seed/tools/native_fixture_job.py', '--offline'],
                          'environment': ['PATH=/opt/jdk17/bin:/opt/gradle/bin:/usr/local/bin:/usr/bin:/bin',
                                          'NODE_VERSION=24.19.0', 'YARN_VERSION=1.22.22', 'JAVA_HOME=/opt/jdk17',
                                          'ANDROID_HOME=/opt/android-sdk', 'ANDROID_SDK_ROOT=/opt/android-sdk',
                                          'EXPO_OFFLINE=1', 'EXPO_NO_TELEMETRY=1'],
                          'worker': self.store.describe('sealed/tools/native_fixture_job.py').json()}
        identities['recipe'] = self.put({'schema': 'micro.android.native-recipe/1', 'commands': self.commands,
                                         'execution': self.execution})
        self.store.path('native-jobs').mkdir(mode=0o700)
        native_inputs = self.put({'schema': 'micro.android.native-inputs/1', 'sourceExport': self.source_export.json(),
                                   'identities': {name: identities[name].json() for name in ('toolchain','npmSeal','mavenSeal','recipe')},
                                   'seeds': self.seeds, 'outputRoot': 'native-jobs'})
        identities['adapter'] = self.put({'schema': 'micro.android.reviewed-adapter/1',
                                         'sourceExporterSha256': 'e'*64, 'sourceExport': self.source_export.json(),
                                         'nativeInputs': native_inputs.json()})
        self.binding = a.Binding('synthetic-native-fixture', 'expo-android', '1'*40,
                                identities, 'b'*64, self.now+3600, admitted=True)
        self.registry = p.Registry(self.store, {(self.binding.project_id, 'expo-android'): self.binding})
        self.unsigned = self.put(b'FAKE unsigned APK unit fixture', '.apk')
        self.signed = self.put(b'FAKE signed APK unit fixture', '.apk')
        self.builds = [self.build(i) for i in range(2)]
        self.inspection = self.inspect()
        self.signing = self.put({'schema': 'micro.android.signing/1', 'context': self.binding.context(),
                                'status': 'signed', 'startedAt': self.now-5, 'finishedAt': self.now-1,
                                'unsignedApkSha256': self.unsigned.sha256, 'signedApkSha256': self.signed.sha256,
                                'certificateSha256': self.binding.certificate_sha256, 'exitCode': 0,
                                'cleanup': {'absent': True}, 'log': self.put(b'FAKE signing output').json()})

        self.prepare_fake_native_mapping()

    def prepare_fake_native_mapping(self):
        # Explicit FAKE operator review for controller logic only. It makes no
        # statement about an actual APK, native component or source build.
        self.native_purl = 'pkg:maven/fake.native/fixture@0.0.0'
        self.native_graph = self.put({'build': 'FAKE-build', 'scope': 'project',
                                      'configuration': 'releaseRuntimeClasspath',
                                      'components': [{'group': 'fake.native', 'module': 'fixture', 'version': '0.0.0'}]})
        self.native_manifest = [{'path': 'fake-runtime.json', 'sha256': self.native_graph.sha256, 'bytes': self.native_graph.bytes}]
        component_purls = ['pkg:npm/fake-component@0.0.0', self.native_purl]
        closure = self.put({'schema': 'micro.android.native-closure/1', 'context': self.binding.context(),
                            'status': 'complete-independent-review', 'sourceLockSha256': self.binding.identities['sourceLock'].sha256,
                            'mavenSealSha256': self.binding.identities['mavenSeal'].sha256,
                            'recipeSha256': self.binding.identities['recipe'].sha256,
                            'mavenGraphs': {'fake-runtime.json': self.native_graph.json()}, 'componentPurls': component_purls,
                            'nativeBuilds': [ref.json() for ref in self.builds],
                            'evidence': [self.put(b'FAKE independently reviewed native closure observations').json()]})
        library = {'path': 'lib/x86_64/libfake.so', 'sha256': 'c'*64, 'bytes': 42}
        packaged = {'kind': 'packaged-APK-files', 'apkSha256': self.signed.sha256, 'apkBytes': self.signed.bytes,
                    'files': [{**library, 'compressedBytes': 42, 'kind': 'native-library', 'componentIdentity': 'unknown, requires resolved input mapping'}],
                    'expandedBytes': 42, 'limits': ['FAKE unit fixture only']}
        packaged_report = self.put(packaged, name='FAKE-packaged/stdout.json')
        sandbox = {'Id': 'a'*64, 'Image': scanner.POLICY['image'],
                   'Config': {'Image': scanner.POLICY['image'], 'User': '65534:65534', 'Env': []},
                   'HostConfig': {'NetworkMode': 'none', 'ReadonlyRootfs': True, 'Memory': scanner.POLICY['memoryBytes'],
                                 'MemorySwap': scanner.POLICY['memoryBytes'], 'NanoCpus': 10**9, 'PidsLimit': 128,
                                 'CapDrop': ['ALL'], 'Privileged': False, 'SecurityOpt': ['no-new-privileges'],
                                 'LogConfig': {'Type': 'none'}, 'PortBindings': {}, 'Devices': [], 'Tmpfs': {'/tmp': 'rw,size=384m'}},
                   'Mounts': [{'Type': 'bind', 'Destination': destination, 'RW': False} for destination in ('/worker.mjs','/config','/source')],
                   'State': {'Running': False, 'OOMKilled': False, 'ExitCode': 0, 'Error': ''}}
        packaged_receipt = self.put(self.fake_scanner_supervision({'mode': 'packaged', 'authority': scanner.authority(), 'containerExitCode': 0,
                                     'cleanup': {'removeExitCode': 0, 'absent': True}, 'inspectBefore': sandbox,
                                     'inspectAfter': sandbox, 'sourceFiles': [{'path': 'app.apk', 'bytes': self.signed.bytes, 'sha256': self.signed.sha256}],
                                     'workerSha256': packaged_report.sha256, 'worker': packaged}), name='FAKE-packaged/receipt.json')
        evidence = self.put({'schema': 'micro.android.component-evidence/1', 'context': self.binding.context(),
                             'status': 'reviewed', 'apkSha256': self.signed.sha256, **library,
                             'componentPurls': [self.native_purl], 'method': 'reviewed-input-and-build-linkage',
                             'sources': [self.builds[0].json(), self.native_graph.json()]})
        mappings = [{**library, 'componentPurls': [self.native_purl], 'evidence': [evidence.json()]}]
        review = self.put({'schema': 'micro.android.native-review/1', 'context': self.binding.context(),
                           'status': 'approved-local-benchmark', 'apkSha256': self.signed.sha256,
                           'nativeClosureSha256': closure.sha256, 'packagedReportSha256': packaged_report.sha256,
                           'libraryMappingsSha256': hashlib.sha256(a.canonical(mappings)).hexdigest(),
                           'runtimeInputPurlsSha256': hashlib.sha256(a.canonical(component_purls)).hexdigest()})
        native_map = self.put({'schema': 'micro.android.native-component-map/1', 'context': self.binding.context(),
                               'status': 'independently-reviewed', 'apkSha256': self.signed.sha256,
                               'sourceLockSha256': self.binding.identities['sourceLock'].sha256,
                               'nativeClosure': closure.json(), 'packagedReceipt': packaged_receipt.json(),
                               'packagedReport': packaged_report.json(), 'libraryMappings': mappings,
                               'runtimeInputPurls': component_purls, 'reviewEvidence': review.json(),
                               'startedAt': self.now-5, 'finishedAt': self.now-1, 'expiresAt': self.now+300})
        self.binding = replace(self.binding, native_mapping=native_map)
        self.registry = p.Registry(self.store, {(self.binding.project_id, self.binding.adapter_id): self.binding})

    def fake_scanner_supervision(self, value):
        # Exact synthetic schema-2 ownership/cleanup shape, not Docker proof.
        owner = 'f'*32; name = 'micro-native-security-'+owner
        for key in ('inspectBefore', 'inspectAfter'):
            value[key]['Name'] = '/'+name
            value[key]['Config']['Labels'] = {scanner.OWNER_LABEL: owner}
            value[key]['State']['Error'] = ''
        observed = value['inspectAfter']; identifier = observed['Id']
        readback = {'exitCode': 0, 'stdout': json.dumps([observed]), 'stderr': ''}
        value['startedAt'] = datetime.fromtimestamp(self.now-5, timezone.utc).isoformat()
        value['finishedAt'] = datetime.fromtimestamp(self.now-1, timezone.utc).isoformat()
        value.update(schema=2, containerName=name, ownerLabel={scanner.OWNER_LABEL: owner}, containerId=identifier)
        value['cleanup'] = {'absent': True, 'errors': [], 'containerId': identifier, 'inspectAfter': observed,
                            'ownershipInspect': readback, 'beforeRemovalInspect': readback,
                            'remove': {'exitCode': 0, 'stdout': identifier+'\n', 'stderr': ''}, 'removeExitCode': 0,
                            'absenceInspect': {'exitCode': 1, 'stdout': '', 'stderr': 'Error: No such object: '+identifier},
                            'scopedList': {'exitCode': 0, 'stdout': '', 'stderr': ''}}
        return value

    def put(self, value, suffix='.json', name=None):
        self.count += 1
        path = name or f'fixture-{self.count}{suffix}'
        if isinstance(value, bytes):
            self.store.path(path).parent.mkdir(parents=True, mode=0o700, exist_ok=True)
            self.store.path(path).write_bytes(value)
            return self.store.describe(path, max(2*1024**2, len(value)))
        self.store.path(path).parent.mkdir(parents=True, mode=0o700, exist_ok=True)
        return self.store.write(path, value)

    def fake_tree(self, path, files, kind='directory'):
        rows = []
        for name, data in sorted(files.items()):
            ref = self.put(data, name=path+'/'+name if kind == 'directory' else path)
            rows.append({'path': name if kind == 'directory' else Path(path).name, 'bytes': ref.bytes, 'sha256': ref.sha256})
        return {'path': path, 'kind': kind, 'files': rows, 'manifestSha256': hashlib.sha256(a.canonical(rows)).hexdigest()}

    def native_docker(self, owner):
        self.store.path('native-jobs/'+owner+'/output').mkdir(parents=True, mode=0o700, exist_ok=True)
        index = int(owner[-1])
        start, finish = self.now-9+index*4, self.now-6+index*4
        return {'Id': ('a' if owner == 'build0' else 'c')*64, 'Image': a.IMAGE,
                'Path': 'python3', 'Args': self.execution['argv'],
                'Config': {'User': '1000:1000', 'Labels': {'micro.native.owner': owner},
                           'Env': self.execution['environment'], 'Entrypoint': self.execution['entrypoint'], 'Cmd': self.execution['argv']},
                'HostConfig': {'NetworkMode': 'none', 'ReadonlyRootfs': True, 'Privileged': False,
                               'Memory': 6*1024**3, 'MemorySwap': 6*1024**3, 'NanoCpus': 2_000_000_000,
                               'PidsLimit': 384, 'CapDrop': ['ALL'], 'SecurityOpt': ['no-new-privileges'],
                               'Devices': [], 'PortBindings': {}, 'ExtraHosts': [], 'LogConfig': {'Type': 'none'}, 'Tmpfs': a.NATIVE_TMPFS},
                'Mounts': [{'Type': 'bind', 'Destination': dest, 'RW': False,
                            'Source': str(self.store.path(tree['path']))} for dest, tree in self.seeds.items()] +
                           [{'Type': 'bind', 'Destination': '/out', 'RW': True,
                             'Source': str(self.store.path('native-jobs/'+owner+'/output'))}],
                'State': {'Running': False, 'OOMKilled': False, 'ExitCode': 0, 'Error': '',
                          'StartedAt': datetime.fromtimestamp(start, timezone.utc).isoformat(),
                          'FinishedAt': datetime.fromtimestamp(finish, timezone.utc).isoformat()}}


    def fake_worker_verifications(self):
        vendor = json.loads(Path(a.__file__).with_name('trusted-vendor-gradle-adapter.json').read_bytes())
        local = json.loads(Path(a.__file__).with_name('locked-local-maven-manifest.json').read_bytes())
        # FAKE worker observations, calculated from the real public fixed policy.
        def digest(text): return hashlib.sha256(text.encode()).hexdigest()
        jitpack = "    maven { url 'https://www.jitpack.io' }\n"
        signing = "            // Caution! In production, you need to generate your own keystore file.\n            // see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug\n"
        replacement = "            // Private fixture emits an unsigned release for supervisor signing.\n"
        return {'vendorAdapter': {'manifestSha256': a.FIXTURE_VENDOR_MANIFEST,
                     'files': [{**{key: row[key] for key in ('path','beforeSha256','afterSha256','npmUrl','npmIntegrity','npmTarballSha256')},
                                'edits': len(row['edits'])} for row in vendor['files']]},
                'vendorAdapterPostbuild': {'manifestSha256': a.FIXTURE_VENDOR_MANIFEST, 'verifiedFiles': 7},
                'privateMavenBefore': {'path': '/work/home/.m2/repository', 'exists': False},
                'privateMavenAfter': {'path': '/work/home/.m2/repository', 'exists': False, 'inputs': 0},
                'localMavenPrebuild': [{'root': '/work/fixture/'+row['root'], 'verifiedFiles': len(row['files']),
                                       'removedMetadata': sorted(row['removeMetadata'])} for row in local['repositories']],
                'localMavenPostbuild': [{'root': '/work/fixture/'+row['root'], 'verifiedFiles': len(row['files'])-len(row['removeMetadata']),
                                        'removedMetadata': []} for row in local['repositories']],
                'patches': [{'path': '/work/fixture/android/build.gradle', 'beforeSha256': 'a'*64, 'afterSha256': 'c'*64,
                             'oldSha256': digest(jitpack), 'newSha256': digest('')},
                            {'path': '/work/fixture/android/app/build.gradle', 'beforeSha256': 'b'*64, 'afterSha256': 'd'*64,
                             'oldSha256': digest(signing), 'newSha256': digest(replacement)},
                            {'path': '/work/fixture/android/app/build.gradle', 'beforeSha256': 'd'*64, 'afterSha256': 'e'*64,
                             'purpose': 'Metro worker ceiling1'}]}

    def build(self, index):
        owner = 'build'+str(index); raw = self.native_docker(owner)
        start, finish = self.now-9+index*4, self.now-6+index*4
        job = {'scope': 'trusted-fixture-only', 'offline': True, 'startedAt': start+0.1, 'finishedAt': finish-0.1,
               'commands': [{'argv': argv, 'exitCode': 0, 'seconds': 1} for argv in self.commands],
               **self.fake_worker_verifications(), 'resources': {'memory.current':'1', 'memory.peak':'1',
                           'memory.swap.current':'0', 'memory.swap.peak':'0', 'pids.current':'1', 'pids.peak':'1',
                           'memory.events':'low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\noom_group_kill 0',
                           'cpu.stat':'usage_usec 1\nuser_usec 1\nsystem_usec 0', 'workRegularBytes':1}, 'apk': {'bytes': self.unsigned.bytes, 'sha256': self.unsigned.sha256,
               'unsigned': True, 'signing': 'No business key or production identity; supervisor signing still pending'},
               'status': 'clean-offline-fixture-unsigned-apk'}
        value = {'schema': 'micro.android.native-build/1', 'context': self.binding.context(),
                 'startedAt': start-0.1, 'finishedAt': finish+0.1, 'status': 'built', 'cleanBuildId': owner,
                 'runtimePolicy': a.NATIVE_POLICY, 'runtimeBefore': self.put(raw).json(), 'runtimeAfter': self.put(raw).json(),
                 'owner': owner, 'state': raw['State'], 'cleanup': {'absent': True},
                 'commands': [{'argv': argv, 'exitCode': 0, 'seconds': 1, 'signal': None,
                               'limitFailure': None, 'log': self.put(b'FAKE native command output').json()} for argv in self.commands],
                 'job': self.put(job).json(), 'unsignedApk': self.unsigned.json()}
        return self.put(value)

    def inspect(self):
        owner = 'synthetic-owner'; directory = 'fake-inspection'
        raw = {'Id': 'd'*64, 'Image': a.IMAGE,
               'Config': {'Labels': {'micro.artifact.owner': owner}, 'User': '1000:1000', 'Env': ['HOME=/tmp'],
                          'Entrypoint': ['python3'], 'Cmd': ['/inspector.py']},
               'HostConfig': {'NetworkMode': 'none', 'ReadonlyRootfs': True, 'CapDrop': ['ALL'],
                              'SecurityOpt': ['no-new-privileges'], 'Memory': inspector.MEMORY,
                              'MemorySwap': inspector.MEMORY, 'NanoCpus': 1_000_000_000, 'PidsLimit': 128,
                              'LogConfig': {'Type': 'none'}, 'Tmpfs': {'/tmp': 'rw,nosuid,nodev,noexec,size=134217728,mode=1777'}},
               'Mounts': [{'Type': 'bind', 'RW': False, 'Destination': d} for d in ('/input/app.apk', '/inspector.py')],
               'State': {'Running': False, 'OOMKilled': False, 'ExitCode': 0, 'Error': ''}}
        inspected = {'schema': 'micro.android.apk-inspection/1', 'status': 'inspected', 'apkSha256': self.signed.sha256,
                     'apkBytes': self.signed.bytes, 'bundle': {'sha256': 'f'*64, 'bytes': 100},
                     'certificateSha256': self.binding.certificate_sha256, 'toolSha256': {'aapt': 'a'*64, 'apksigner': 'c'*64},
                     'metadata': {'package': self.binding.package, 'versionCode': 1, 'versionName': '1.0.0',
                                  'minSdk': 24, 'targetSdk': 36, 'debuggable': False, 'permissions': [], 'abis': ['x86_64']}}
        outputs = {'create': b'd'*64+b'\n', 'inspect-before': a.canonical([raw]), 'inspect-after': a.canonical([raw]),
                   'inspection': a.canonical(inspected)+b'\n', 'cleanup-owner': a.canonical([raw]),
                   'cleanup-remove': b'd'*64+b'\n', 'cleanup-absent': b'Error: No such object: '+b'd'*64,
                   'cleanup-list': b''}
        commands = []
        for name, data in outputs.items():
            ref = self.put(data, name=directory+'/'+name+'.log')
            commands.append({'argv': ['docker', name], 'exitCode': 1 if name == 'cleanup-absent' else 0,
                             'seconds': 0.1, 'capturedBytes': ref.bytes, 'sha256': ref.sha256, 'limitFailure': None})
        self.put(self.store.read(self.signed), name=directory+'/app.apk')
        script = Path(a.__file__).with_name('inspect_apk.py').read_bytes()
        self.put(script, name=directory+'/inspector.py')
        value = {'schema': 'micro.android.artifact-supervisor/1', 'owner': owner,
                 'supervisorSha256': hashlib.sha256(Path(a.__file__).with_name('artifact_supervisor.py').read_bytes()).hexdigest(),
                 'startedAt': datetime.fromtimestamp(self.now-5, timezone.utc).isoformat(),
                 'finishedAt': datetime.fromtimestamp(self.now-1, timezone.utc).isoformat(), 'status': 'inspected',
                 'commands': commands, 'cleanup': {'absent': True}, 'limitations': ['FAKE unit fixture'],
                 'inputs': {'apkSha256': self.signed.sha256, 'apkBytes': self.signed.bytes,
                            'inspectorSha256': hashlib.sha256(script).hexdigest(), 'image': a.IMAGE},
                 'runtimePolicy': inspector.runtime_policy(raw, raw['Id'], a.IMAGE, owner), 'state': raw['State'],
                 'inspection': inspected}
        return self.put(value, name=directory+'/result.json')

    def security(self, artifact=None):
        database = self.put(b'FAKE advisory database'); built = datetime.fromtimestamp(self.now-60, timezone.utc).isoformat()
        metadata = {'valid': True, 'built': built, 'checksum': 'sha256:'+database.sha256, 'from': 'synthetic-public-fixture'}
        files = [{'path': 'vulnerability.db', 'bytes': database.bytes, 'sha256': database.sha256}]
        accepted = scanner.validate_database(metadata, files, now=datetime.fromtimestamp(self.now, timezone.utc))
        # All content is deliberately FAKE unit data, not scanner/native proof.
        component = {'name': 'fake-component', 'version': '0.0.0', 'purl': 'pkg:npm/fake-component@0.0.0',
                     'properties': [{'name': 'micro:inventory-provenance', 'value': 'FAKE-unit-fixture'},
                                    {'name': 'micro:packaged-presence', 'value': 'unknown'}]}
        inventory = {'schema': 'micro.native-build-input-inventory/1',
                     'lockSha256': self.binding.identities['sourceLock'].sha256,
                     'lockedEntryCount': 1, 'lockedUniqueComponentCount': 1,
                     'lockEntries': [{'name': 'fake-component', 'version': '0.0.0',
                                      'lockPath': 'node_modules/fake-component', 'dev': False,
                                      'optional': False, 'devOptional': False,
                                      'classification': 'runtime-input', 'packagedPresence': 'unknown'}],
                     'missingBefore': [], 'missingAfter': [],
                     'maven': {'status': 'pending', 'entries': [], 'files': []}}
        reports = {'secrets.json': [],
                   'syft.sbom.cdx.json': {'bomFormat': 'CycloneDX', 'components': [component]},
                   'trusted.inventory.json': inventory,
                   'sbom.cdx.json': {'bomFormat': 'CycloneDX', 'components': [component]},
                   'vulnerabilities.json': {'matches': [], 'descriptor': {'db': {'status': metadata}}}}
        if artifact:
            inventory['maven'] = {'status': 'resolved-inputs-scanned', 'files': self.native_manifest,
                                  'entries': [{'group': 'fake.native', 'module': 'fixture', 'version': '0.0.0',
                                               'purl': self.native_purl, 'classification': 'runtime-input'}]}
            reports['sbom.cdx.json']['components'].append({'name': 'fixture', 'version': '0.0.0',
                                                         'purl': self.native_purl, 'properties': component['properties']})
        worker = {'tools': {name: {'exitCode': 0, 'binarySha256': value['binarySha256'],
                                  'versionOutput': 'Version: '+value['version']} for name, value in scanner.POLICY['tools'].items()},
                  'databaseBefore': metadata, 'databaseAfter': metadata, 'reports': reports,
                  'commands': [{'binary': name, 'args': ['sbom:/tmp/sbom.cdx.json' if name == 'grype' else 'scan'], 'exitCode': 0, 'signal': None} for name in ('gitleaks','syft','grype')]}
        raw_docker = {'Id': 'a'*64, 'Image': scanner.POLICY['image'],
                      'Config': {'Image': scanner.POLICY['image'], 'User': '65534:65534', 'Env': []},
                      'HostConfig': {'NetworkMode': 'none', 'ReadonlyRootfs': True, 'Memory': scanner.POLICY['memoryBytes'],
                                    'MemorySwap': scanner.POLICY['memoryBytes'], 'NanoCpus': 10**9, 'PidsLimit': 128,
                                    'CapDrop': ['ALL'], 'Privileged': False, 'SecurityOpt': ['no-new-privileges'],
                                    'LogConfig': {'Type': 'none'}, 'PortBindings': {}, 'Devices': [], 'Tmpfs': {'/tmp': 'rw,size=384m'}},
                      'Mounts': [{'Type': 'bind', 'Destination': dest, 'RW': False} for dest in ('/worker.mjs','/config','/source','/db')],
                      'State': {'Running': False, 'OOMKilled': False, 'ExitCode': 0}}
        stdout = self.put(worker, name=f'scanner-{self.count}/stdout.json')
        raw = self.put(self.fake_scanner_supervision({'mode': 'scan', 'containerExitCode': 0, 'cleanup': {'removeExitCode': 0, 'absent': True},
                        'authority': scanner.authority(), 'inspectBefore': raw_docker, 'inspectAfter': raw_docker,
                        'workerSha256': stdout.sha256, 'worker': worker, 'sourceFiles': self.source_files,
                        'mavenFiles': self.native_manifest if artifact else []}), name=str(Path(stdout.path).parent/'receipt.json'))
        report_refs = {short: self.put(a.canonical(reports[name])).json() for short,name in
                       [('secrets','secrets.json'),('inventory','sbom.cdx.json'),('vulnerabilities','vulnerabilities.json')]}
        coverage = {'scope': 'final-artifact-and-native' if artifact else 'source-inputs', 'status': 'complete-reviewed', 'databaseCreatedAt': self.now-60, 'runtime': True, 'buildOnly': True, 'omissions': []}
        receipt = self.put({'schema': 'micro.android.security-admission/1', 'context': self.binding.context(), 'status': 'passed',
                            'startedAt': self.now-5, 'finishedAt': self.now-1,
                            'subjectSha256': artifact or self.binding.identities['sourceArchive'].sha256,
                            'scannerPolicySha256': self.binding.identities['scannerPolicy'].sha256,
                            'databaseSha256': database.sha256, 'reports': report_refs,
                            'exitCodes': {'secrets': 0, 'inventory': 0, 'vulnerabilities': 0},
                            'cleanup': {'absent': True}, 'coverage': coverage, 'waiversExpireAt': None})
        return {'receipt': receipt.json(), 'rawReceipt': raw.json(), 'databaseReceipt': self.put(accepted).json(),
                'scannerPolicy': self.binding.identities['scannerPolicy'].json(), 'database': database.json(),
                'databaseFiles': {'vulnerability.db': database.json()},
                'reports': report_refs, 'coverage': coverage,
                'nativeMap': self.binding.native_mapping.json() if artifact and self.binding.native_mapping else None}

    def details(self, job):
        if job.stage == p.Stage.SOURCE:
            return {'receipt': self.put({'schema': 'micro.android.source-admission/1', 'context': self.binding.context(),
                                        'status': 'admitted', 'cleanCommit': True, 'archiveValidated': True,
                                        'protectedInputsMatched': True, 'exporterSha256': 'e'*64, 'sourceExport': self.source_export.json()}).json()}
        if job.stage in (p.Stage.SOURCE_SECURITY, p.Stage.ARTIFACT_SECURITY): return self.security(job.artifact_sha256)
        if job.stage == p.Stage.CHECKS:
            return {'checks': {name: {'exitCode': 0, 'skipped': False, 'log': self.put(b'FAKE check').json()} for name in ('lint','types','domain','storage')},
                    'mandatoryCases': {name: 1 for name in ('lint','types','domain','storage')}, 'offline': True,
                    'recipeSha256': self.binding.identities['recipe'].sha256}
        if job.stage == p.Stage.BUILD:
            return {'builds': [r.json() for r in self.builds], 'comparison': a.validate_build_pair(self.builds, self.binding, self.store, self.now, 3600)}
        if job.stage == p.Stage.INSPECTION:
            record = {'schema': 'micro.android.artifact-record/1', 'context': self.binding.context(),
                      'startedAt': self.now-5, 'finishedAt': self.now-1, 'expiresAt': self.now+300,
                      'target': 'local-benchmark', 'apk': self.signed.json(), 'inspector': self.inspection.json(),
                      'builds': [r.json() for r in self.builds], 'signing': self.signing.json(),
                      'preflight': {stage.value: ref.json() for stage, ref in zip(p.GRAPH[:3], job.prior_receipts[:3])}}
            return {'artifactRecord': self.put(record).json()}
        if job.stage == p.Stage.DEVICE:
            return {'installed': {'apkSha256': job.artifact_sha256, 'package': self.binding.package,
                                   'versionCode': 1, 'certificateSha256': self.binding.certificate_sha256},
                    'leaseReceipt': self.put({'FAKE': 'no actual device'}).json(), 'suiteSha256': self.binding.identities['suite'].sha256,
                    'journey': 'passed', 'persistence': 'passed', 'offlineLaunch': 'passed', 'crashCount': 0, 'anrCount': 0,
                    'evidence': [self.put(b'FAKE journey assertions').json()]}
        return {'fixtureSha256': self.binding.identities['recovery'].sha256, 'backup': self.put(b'FAKE backup').json(),
                'emptyTarget': True, 'integrity': True, 'semanticRestore': True, 'sentinelExcluded': True,
                'durableNewWrite': True, 'reopened': True, 'recoveredPoint': 'FAKE fixture point', 'elapsedSeconds': 1,
                'evidence': [self.put(b'FAKE restore assertions').json()]}

    def hook(self, change=None):
        def observe(job):
            report = {'schema': 'micro.android.stage-observation/1', 'runId': job.run_id, 'stage': job.stage.value,
                      'status': 'passed', 'context': self.binding.context(), 'startedAt': self.now-5, 'finishedAt': self.now-1,
                      'exitCode': 0, 'signal': None, 'timeout': False, 'oom': False, 'resourceError': None,
                      'cleanup': {'absent': True}, 'artifactSha256': job.artifact_sha256, 'details': self.details(job)}
            if change: change(job, report)
            return p.Observation(self.put(report, name=job.run_directory+'/'+job.stage.value+'-observation.json'))
        return observe

    def run(self, change=None):
        hook = self.hook(change)
        return p.Pipeline(self.registry, {s: hook for s in p.GRAPH}, clock=lambda: self.now).run(self.binding.project_id, 'expo-android')


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.fixture = SyntheticFixture(self.temp.name)

    def test_synthetic_logic_only_complete_graph_and_local_scope(self):
        result, ref = self.fixture.run()
        self.assertEqual(result['status'], 'passed', result['firstFailure'])
        self.assertEqual([s['stage'] for s in result['stages']], [s.value for s in p.GRAPH])
        self.assertEqual(result['artifactSha256'], self.fixture.signed.sha256)
        self.assertFalse(result['publishAuthorized']); self.assertFalse(result['productionApproved']); self.assertFalse(result['hostedCiObserved'])
        self.assertEqual(self.fixture.store.json(ref), result)

    def test_review_source_manifest_missing_changed_lock_omitted_or_extra_source_blocks(self):
        for kind in ('missing', 'wrong-lock', 'omitted-source', 'extra-source'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temp:
                fixture = SyntheticFixture(temp)
                def change(job, report):
                    if job.stage != p.Stage.SOURCE_SECURITY: return
                    reference = a.Evidence.parse(report['details']['rawReceipt'])
                    raw = fixture.store.json(reference, 64*1024**2)
                    if kind == 'missing': raw.pop('sourceFiles')
                    elif kind == 'wrong-lock':
                        raw['sourceFiles'] = [{'path': 'package-lock.json', 'bytes': 4, 'sha256': 'd'*64}]
                    elif kind == 'omitted-source': raw['sourceFiles'].pop(0)
                    else: raw['sourceFiles'].append({'path': 'FAKE-extra', 'bytes': 4, 'sha256': 'd'*64})
                    report['details']['rawReceipt'] = fixture.put(raw, name=str(Path(reference.path).parent/'changed-receipt.json')).json()
                result, _ = fixture.run(change)
                self.assertEqual(result['status'], 'failed')
                self.assertEqual(result['firstFailure']['stage'], p.Stage.SOURCE_SECURITY.value)
                self.assertIn('full source manifest', result['firstFailure']['reason'])

    def test_review_second_build_cannot_relabel_same_actual_execution_or_job(self):
        first = self.fixture.store.json(self.fixture.builds[0])
        relabeled = copy.deepcopy(first); relabeled['cleanBuildId'] = 'different-clean-build'
        second_ref = self.fixture.put(relabeled)
        # Both standalone wrappers still satisfy all existing build predicates.
        a.validate_build(second_ref, self.fixture.binding, self.fixture.store, self.fixture.now, 3600)
        with self.assertRaisesRegex(a.Rejected, 'distinct actual'):
            a.validate_build_pair([self.fixture.builds[0], second_ref], self.fixture.binding, self.fixture.store, self.fixture.now, 3600)
        second = self.fixture.store.json(self.fixture.builds[1])
        raw = self.fixture.store.json(a.Evidence.parse(second['runtimeAfter']))
        raw['Id'] = self.fixture.store.json(a.Evidence.parse(first['runtimeAfter']))['Id']
        second['runtimeBefore'] = self.fixture.put(raw).json(); second['runtimeAfter'] = self.fixture.put(raw).json()
        with self.assertRaisesRegex(a.Rejected, 'distinct actual'):
            a.validate_build_pair([self.fixture.builds[0], self.fixture.put(second)], self.fixture.binding, self.fixture.store, self.fixture.now, 3600)

    def test_actual_native_six_pre_post_verifications_provenance_and_patches_required(self):
        changes = [
            ('missing-post', lambda job: job.pop('vendorAdapterPostbuild')),
            ('vendor-identity', lambda job: job['vendorAdapter'].update(manifestSha256='d'*64)),
            ('vendor-preimage', lambda job: job['vendorAdapter']['files'][0].update(beforeSha256='d'*64)),
            ('vendor-postimage', lambda job: job['vendorAdapter']['files'][0].update(afterSha256='d'*64)),
            ('npm-origin', lambda job: job['vendorAdapter']['files'][0].update(npmUrl='https://FAKE-unreviewed.invalid/package.tgz')),
            ('npm-integrity', lambda job: job['vendorAdapter']['files'][0].update(npmIntegrity='sha512-FAKE')),
            ('npm-tarball', lambda job: job['vendorAdapter']['files'][0].update(npmTarballSha256='d'*64)),
            ('omitted-vendor', lambda job: job['vendorAdapter']['files'].pop()),
            ('boolean-edits', lambda job: job['vendorAdapter']['files'][-1].update(edits=True)),
            ('post-count', lambda job: job['vendorAdapterPostbuild'].update(verifiedFiles=6)),
            ('private-before', lambda job: job['privateMavenBefore'].update(exists=True)),
            ('private-after', lambda job: job['privateMavenAfter'].update(inputs=1)),
            ('private-path', lambda job: job['privateMavenAfter'].update(path='/home/FAKE/.m2/repository')),
            ('missing-local', lambda job: job['localMavenPrebuild'].pop()),
            ('unknown-repo', lambda job: job['localMavenPostbuild'].append({'root':'/work/fixture/FAKE-unreviewed', 'verifiedFiles':1,'removedMetadata':[]})),
            ('changed-root', lambda job: job['localMavenPrebuild'][0].update(root='/work/fixture/FAKE-other-repo')),
            ('post-files', lambda job: job['localMavenPostbuild'][0].update(verifiedFiles=25)),
            ('missing-metadata', lambda job: job['localMavenPrebuild'][0]['removedMetadata'].pop()),
            ('unexpected-metadata', lambda job: job['localMavenPostbuild'][0].update(removedMetadata=['FAKE-delete.aar'])),
            ('missing-patches', lambda job: job.update(patches=[])),
            ('patch-preimage', lambda job: job['patches'][0].update(beforeSha256='d'*64)),
            ('patch-edit', lambda job: job['patches'][1].update(newSha256='d'*64)),
            ('patch-chain', lambda job: job['patches'][2].update(beforeSha256='a'*64)),
            ('actual-duration', lambda job: job['commands'][0].update(seconds=99)),
            ('missing-resource', lambda job: job['resources'].pop('memory.events')),
            ('unknown-resource', lambda job: job['resources'].update({'memory.peak':None})),
            ('oom-event', lambda job: job['resources'].update({'memory.events':'oom 1\noom_kill 0\noom_group_kill 0'})),
            ('work-budget', lambda job: job['resources'].update(workRegularBytes=8*1024**3+1)),
            ('pids-budget', lambda job: job['resources'].update({'pids.peak':'385'})),
            ('swap-budget', lambda job: job['resources'].update({'memory.swap.peak':'1'})),
            ('unknown-field', lambda job: job.update(candidateChosenRepository='FAKE')),
            ('acquisition', lambda job: job.update(offline=False, status='trusted-fixture-native-task-closure-acquired')),
            ('failure', lambda job: job.update(status='first-native-failure-retained', firstFailure={'message':'FAKE failed acquisition'})),
        ]
        original = self.fixture.store.json(self.fixture.builds[0])
        for kind, change in changes:
            with self.subTest(kind=kind):
                build = copy.deepcopy(original); job = self.fixture.store.json(a.Evidence.parse(build['job']))
                change(job); build['job'] = self.fixture.put(job).json()
                with self.assertRaises(a.Rejected):
                    a.validate_build(self.fixture.put(build), self.fixture.binding, self.fixture.store, self.fixture.now, 3600)
        # Changed sealed public policy itself cannot authorize even matching
        # newly fabricated reports. The complete pinned tools hash refuses it.
        path = self.fixture.store.path('sealed/tools/locked-local-maven-manifest.json')
        path.write_bytes(b'FAKE substitute manifest')
        with self.assertRaises(a.Rejected):
            a.validate_build(self.fixture.builds[0], self.fixture.binding, self.fixture.store, self.fixture.now, 3600)

    def test_actual_native_noop_entrypoint_argv_environment_or_worker_cannot_fake_build(self):
        for kind in ('bin-true', 'missing-entrypoint', 'online-worker', 'different-worker',
                     'raw-path', 'raw-args', 'changed-env', 'missing-env', 'duplicate-env', 'worker-bytes'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temp:
                fixture = SyntheticFixture(temp)
                build = fixture.store.json(fixture.builds[0])
                raw = fixture.store.json(a.Evidence.parse(build['runtimeAfter']))
                if kind == 'bin-true': raw['Config']['Entrypoint'] = ['/bin/true']; raw['Config']['Cmd'] = ['fake-no-build']
                elif kind == 'missing-entrypoint': raw['Config'].pop('Entrypoint')
                elif kind == 'online-worker': raw['Config']['Cmd'] = ['/seed/tools/native_fixture_job.py']
                elif kind == 'different-worker': raw['Config']['Cmd'] = ['/seed/tools/fake_no_build.py', '--offline']
                elif kind == 'raw-path': raw['Path'] = '/bin/true'
                elif kind == 'raw-args': raw['Args'] = ['fake-no-build']
                elif kind == 'changed-env': raw['Config']['Env'] = ['HOME=/work/fake-other-home']
                elif kind == 'missing-env': raw['Config']['Env'].pop()
                elif kind == 'duplicate-env': raw['Config']['Env'] += ['PATH=/bin']
                else: fixture.store.path('sealed/tools/native_fixture_job.py').write_bytes(b'FAKE replaced worker')
                # Command/job success reports are untouched, exercising raw execution.
                build['runtimeBefore'] = fixture.put(raw).json(); build['runtimeAfter'] = fixture.put(raw).json()
                with self.assertRaises(a.Rejected):
                    a.validate_build(fixture.put(build), fixture.binding, fixture.store, fixture.now, 3600)

    def test_actual_native_execution_timestamps_and_full_ids_must_match_job(self):
        for kind in ('short-id', 'missing-start', 'future-finish', 'job-outside-container'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temp:
                fixture = SyntheticFixture(temp)
                build = fixture.store.json(fixture.builds[0])
                raw = fixture.store.json(a.Evidence.parse(build['runtimeAfter']))
                if kind == 'short-id': raw['Id'] = 'a'*12
                elif kind == 'missing-start': raw['State'].pop('StartedAt')
                elif kind == 'future-finish': raw['State']['FinishedAt'] = datetime.fromtimestamp(fixture.now+1, timezone.utc).isoformat()
                else:
                    job = fixture.store.json(a.Evidence.parse(build['job']))
                    job['startedAt'] = fixture.now-20
                    build['job'] = fixture.put(job).json()
                build['state'] = raw['State']; build['runtimeBefore'] = fixture.put(raw).json(); build['runtimeAfter'] = fixture.put(raw).json()
                with self.assertRaises(a.Rejected):
                    a.validate_build(fixture.put(build), fixture.binding, fixture.store, fixture.now, 3600)

    def test_review_exact_existing_seed_bytes_mounts_and_tmpfs_budgets_required(self):
        for kind in ('missing-path', 'wrong-seed', 'extra-mount', 'changed-seed', 'extra-seed-file', 'work-size', 'tmp-size'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temp:
                fixture = SyntheticFixture(temp)
                build = fixture.store.json(fixture.builds[0])
                raw = fixture.store.json(a.Evidence.parse(build['runtimeAfter']))
                if kind == 'missing-path': raw['Mounts'][0]['Source'] = str(fixture.store.root/'nonexistent')
                elif kind == 'wrong-seed': raw['Mounts'][0]['Source'] = raw['Mounts'][1]['Source']
                elif kind == 'extra-mount': raw['Mounts'].append({'Type': 'bind', 'Destination': '/seed/unreviewed', 'RW': False, 'Source': raw['Mounts'][0]['Source']})
                elif kind == 'changed-seed': fixture.store.path('sealed/fixture/app.js').write_bytes(b'FAKE changed seed')
                elif kind == 'extra-seed-file': fixture.put(b'FAKE extra seed', name='sealed/fixture/extra.js')
                elif kind == 'work-size': raw['HostConfig']['Tmpfs']['/work'] = 'rw,nosuid,nodev,size=1000g,uid=1000,gid=1000,mode=0700'
                else: raw['HostConfig']['Tmpfs']['/tmp'] = 'rw,nosuid,nodev,size=1000g,mode=1777'
                build['runtimeBefore'] = fixture.put(raw).json(); build['runtimeAfter'] = fixture.put(raw).json()
                with self.assertRaises(a.Rejected):
                    a.validate_build(fixture.put(build), fixture.binding, fixture.store, fixture.now, 3600)

    def test_reviewed_adapter_export_and_seed_schemas_are_closed_and_match_fake_bytes(self):
        from jsonschema import Draft202012Validator
        schema = json.loads(Path(a.__file__).with_name('adapter.schema.json').read_text())
        adapter = a.reviewed_adapter(self.fixture.binding, self.fixture.store)
        for definition, value in (('reviewedAdapter', adapter),
                                  ('sourceExport', self.fixture.store.json(a.Evidence.parse(adapter['sourceExport']))),
                                  ('nativeInputs', self.fixture.store.json(a.Evidence.parse(adapter['nativeInputs']))),
                                  ('nativeRecipe', self.fixture.store.json(self.fixture.binding.identities['recipe'])),
                                  ('nativeJob', self.fixture.store.json(a.Evidence.parse(self.fixture.store.json(self.fixture.builds[0])['job'])))):
            document = {**schema, '$ref': '#/$defs/'+definition}
            for key in ('type', 'properties', 'required', 'additionalProperties', 'allOf'): document.pop(key, None)
            Draft202012Validator.check_schema(document)
            Draft202012Validator(document).validate(value)
            with self.assertRaises(Exception): Draft202012Validator(document).validate({**value, 'unknownAuthority': True})
        exported = self.fixture.store.json(self.fixture.source_export)
        exported['sourceArchiveSha256'] = 'd'*64
        changed = self.fixture.put(exported)
        adapter['sourceExport'] = changed.json()
        identities = {**self.fixture.binding.identities, 'adapter': self.fixture.put(adapter)}
        changed_binding = replace(self.fixture.binding, identities=identities)
        with self.assertRaisesRegex(a.Rejected, 'export/archive/lock'):
            a.source_export(changed_binding, self.fixture.store)

    def test_no_hooks_cannot_claim_local_ci_pass(self):
        result, code = ci.run_local_ci(self.fixture.binding.project_id, 'expo-android', self.fixture.registry)
        self.assertEqual(result['status'], 'pending'); self.assertEqual(code, 2)

    def test_unsigned_unadmitted_or_expired_policy_stays_pending(self):
        for replacement in [dict(certificate_sha256=None), dict(admitted=False), dict(expires_at=self.fixture.now-1)]:
            binding = replace(self.fixture.binding, **replacement)
            registry = p.Registry(self.fixture.store, {(binding.project_id, binding.adapter_id): binding})
            result, _ = p.Pipeline(registry).run(binding.project_id, binding.adapter_id)
            self.assertEqual(result['status'], 'pending'); self.assertEqual(result['firstFailure']['stage'], 'registry-admission')

    def test_missing_mandatory_stage_stops_successors(self):
        for missing in p.GRAPH:
            calls=[]
            def hook(job): calls.append(job.stage); return self.fixture.hook()(job)
            result, _ = p.Pipeline(self.fixture.registry, {s: hook for s in p.GRAPH if s != missing}, clock=lambda:self.fixture.now).run(self.fixture.binding.project_id, 'expo-android')
            self.assertEqual(result['status'], 'pending', result['firstFailure'])
            self.assertEqual(calls, list(p.GRAPH[:p.GRAPH.index(missing)]))

    def test_failed_environment_invalid_and_pending_results_propagate(self):
        for status in ('failed', 'environment-invalid', 'pending'):
            def change(job, report):
                if job.stage == p.Stage.CHECKS: report.update(status=status, exitCode=None, resourceError='fixture-resource-error')
            result,_=self.fixture.run(change)
            self.assertEqual(result['status'], status)
            self.assertEqual(result['firstFailure']['stage'], p.Stage.CHECKS.value)
            self.assertEqual(result['stages'][2]['resourceError'], 'fixture-resource-error')
            self.assertIsNone(result['crashCount']); self.assertEqual(result['recovery'], 'unknown')

    def test_false_pass_resource_signal_cleanup_and_unknown_authority_block(self):
        changes=[('exitCode',1),('signal',9),('oom',True),('timeout',True),('resourceError','disk-full'),('cleanup',None),('publishAuthorized',True)]
        for key,value in changes:
            def change(job, report):
                if job.stage == p.Stage.CHECKS: report[key]=value
            result,_=self.fixture.run(change)
            self.assertEqual(result['status'], 'failed', key)

    def test_wrong_project_policy_source_suite_and_artifact_block(self):
        for kind in ('project','source','policy','suite','artifact'):
            def change(job, report):
                if job.stage != p.Stage.DEVICE: return
                if kind=='project': report['context']['projectId']='another-project'
                elif kind=='source': report['context']['sourceSha']='2'*40
                elif kind=='policy': report['context']['identities']['policy']='a'*64
                elif kind=='suite': report['details']['suiteSha256']='a'*64
                else: report['details']['installed']['apkSha256']='a'*64
            result,_=self.fixture.run(change)
            self.assertEqual(result['status'], 'failed', kind)

    def test_unknown_crash_anr_and_recovery_cannot_pass(self):
        for field in ('crashCount','anrCount','emptyTarget','semanticRestore','sentinelExcluded','durableNewWrite','reopened'):
            def change(job, report):
                if job.stage == (p.Stage.DEVICE if field in ('crashCount','anrCount') else p.Stage.RECOVERY): report['details'][field]=None
            result,_=self.fixture.run(change)
            self.assertEqual(result['status'], 'failed', field)

    def test_missing_cases_and_skipped_check_block(self):
        for skipped in (True,False):
            def change(job, report):
                if job.stage==p.Stage.CHECKS:
                    if skipped: report['details']['checks']['domain']['skipped']=True
                    else: report['details']['mandatoryCases']['domain']=0
            result,_=self.fixture.run(change)
            self.assertEqual(result['status'],'failed')

    def test_tampered_apk_receipt_and_expired_artifact_block(self):
        for kind in ('apk','receipt','expired','production','preflight'):
            with tempfile.TemporaryDirectory() as temp:
                fixture=SyntheticFixture(temp)
                def change(job, report):
                    if job.stage!=p.Stage.INSPECTION:return
                    if kind=='apk': fixture.store.path(fixture.signed.path).write_bytes(b'one changed byte')
                    elif kind=='receipt': fixture.store.path(fixture.inspection.path).write_bytes(b'{}')
                    else:
                        ref=a.Evidence.parse(report['details']['artifactRecord']); record=fixture.store.json(ref)
                        if kind=='expired': record['expiresAt']=fixture.now-1
                        elif kind=='production': record['target']='production'
                        else: record['preflight']={}
                        report['details']['artifactRecord']=fixture.put(record).json()
                result,_=fixture.run(change)
                self.assertEqual(result['status'],'failed',kind)

    def test_native_network_oom_recipe_exit_missing_job_and_duplicate_build_block(self):
        for kind in ('network','oom','recipe','exit','job','duplicate'):
            with tempfile.TemporaryDirectory() as temp:
                fixture=SyntheticFixture(temp)
                first=fixture.store.json(fixture.builds[0])
                if kind=='network':
                    ref=a.Evidence.parse(first['runtimeBefore']); raw=fixture.store.json(ref); raw['HostConfig']['NetworkMode']='bridge'; first['runtimeBefore']=fixture.put(raw).json()
                elif kind=='oom': first['state']['OOMKilled']=True
                elif kind=='recipe': first['commands'][0]['argv']=['candidate-command']
                elif kind=='exit': first['commands'][0]['exitCode']=1
                elif kind=='job': first['job']=fixture.put({'status':'declared-success'}).json()
                else: fixture.builds[1]=fixture.builds[0]
                if kind!='duplicate': fixture.builds[0]=fixture.put(first)
                with self.assertRaises((a.Rejected,ValueError)):a.validate_build_pair(fixture.builds,fixture.binding,fixture.store,fixture.now,3600)

    def test_signing_certificate_package_permission_version_and_abi_refused(self):
        for field,value in [('certificateSha256','a'*64),('package','app.wrong.fixture'),('versionCode',2),('permissions',['android.permission.INTERNET']),('abis',['arm64-v8a'])]:
            with tempfile.TemporaryDirectory() as temp:
                fixture=SyntheticFixture(temp); receipt=fixture.store.json(fixture.inspection)
                if field=='certificateSha256': receipt['inspection'][field]=value
                else: receipt['inspection']['metadata'][field]=value
                # Change both raw output and wrapper to exercise semantic policy,
                # with the command log hashes adjusted by a trusted fake producer.
                log=fixture.store.path('fake-inspection/inspection.log'); log.write_bytes(a.canonical(receipt['inspection'])+b'\n')
                for c in receipt['commands']:
                    if c['argv']==['docker','inspection']:
                        ref=fixture.store.describe('fake-inspection/inspection.log'); c['sha256']=ref.sha256;c['capturedBytes']=ref.bytes
                reference=fixture.put(receipt)
                # Keep original inspector directory for raw sidecar references.
                original=fixture.store.path(fixture.inspection.path); original.chmod(0o600);original.write_bytes(a.canonical(receipt)+b'\n')
                reference=fixture.store.describe(fixture.inspection.path)
                with self.assertRaises(a.Rejected):a.validate_inspector(reference,fixture.signed,fixture.binding,fixture.store)

    def test_procedure_and_byte_comparison_are_separate(self):
        second=self.fixture.store.json(self.fixture.builds[1]); changed=self.fixture.put(b'FAKE different unsigned APK','.apk')
        second['unsignedApk']=changed.json(); job=self.fixture.store.json(a.Evidence.parse(second['job']));job['apk']['bytes']=changed.bytes;job['apk']['sha256']=changed.sha256
        second['job']=self.fixture.put(job).json();self.fixture.builds[1]=self.fixture.put(second)
        result=a.validate_build_pair(self.fixture.builds,self.fixture.binding,self.fixture.store,self.fixture.now,3600)
        self.assertTrue(result['procedureReproducible']);self.assertFalse(result['byteReproducible'])

    def test_tampered_predecessor_during_later_job_blocks(self):
        def change(job, report):
            if job.stage==p.Stage.DEVICE:self.fixture.store.path(job.prior_receipts[0].path).write_bytes(b'{}')
        result,_=self.fixture.run(change);self.assertEqual(result['status'],'failed')

    def test_first_failure_retained_and_explicit_retry_is_new_run(self):
        def fail(job, report):
            if job.stage==p.Stage.CHECKS:report.update(status='failed',exitCode=1)
        first,ref=self.fixture.run(fail);original=self.fixture.store.read(ref)
        retry,_=p.Pipeline(self.fixture.registry,clock=lambda:self.fixture.now).run(self.fixture.binding.project_id,'expo-android',retry_of=ref)
        self.assertEqual(first['status'],'failed');self.assertEqual(retry['attemptKind'],'explicit-retry')
        self.assertNotEqual(first['runId'],retry['runId']);self.assertEqual(original,self.fixture.store.read(ref))
        with self.assertRaises(FileExistsError):self.fixture.store.write(ref.path,{'overwrite':True})

    def test_unknown_registry_path_cli_id_and_symlink_rejected(self):
        result,code=ci.run_local_ci('another-project','expo-android',self.fixture.registry)
        self.assertEqual(code,2);self.assertEqual(result['status'],'pending')
        for project in ('../x','Uppercase','a;touch-x'):
            with self.assertRaises(a.Rejected):ci.run_local_ci(project,'expo-android',self.fixture.registry)
        for path in ('../outside','/absolute','x/../y','a\\b'):
            with self.assertRaises(a.Rejected):self.fixture.store.path(path)
        self.fixture.store.path('linked').symlink_to(self.fixture.store.path(self.fixture.signed.path))
        with self.assertRaises(a.Rejected):self.fixture.store.describe('linked')

    def test_duplicate_unknown_and_nonfinite_authority_json_rejected(self):
        for data in (b'{"status":"passed","status":"failed"}',b'{"time":NaN}'):
            with self.assertRaises(a.Rejected):a.decode(data)
        with self.assertRaises(a.Rejected):a.exact({'status':'passed','commands':['untrusted']},{'status'},'fixture')

    def test_missing_inspector_logs_wrong_inputs_code_and_cleanup_block(self):
        for kind in ('log', 'input', 'code', 'cleanup', 'time', 'tool'):
            with tempfile.TemporaryDirectory() as temp:
                fixture = SyntheticFixture(temp)
                def change(job, report):
                    if job.stage != p.Stage.INSPECTION: return
                    receipt = fixture.store.json(fixture.inspection)
                    if kind == 'log': fixture.store.path('fake-inspection/inspect-before.log').unlink(); return
                    if kind == 'input': receipt['inputs']['image'] = 'sha256:'+'f'*64
                    elif kind == 'code': receipt['supervisorSha256'] = 'f'*64
                    elif kind == 'cleanup': receipt['cleanup'] = None
                    elif kind == 'time': receipt['finishedAt'] = '2020-01-01T00:00:00+00:00'
                    elif kind == 'tool': receipt['inspection']['toolSha256']['aapt'] = 'f'*64
                    path = fixture.store.path(fixture.inspection.path); path.chmod(0o600); path.write_bytes(a.canonical(receipt)+b'\n')
                    record_ref = a.Evidence.parse(report['details']['artifactRecord']); record = fixture.store.json(record_ref)
                    record['inspector'] = fixture.store.describe(fixture.inspection.path).json()
                    report['details']['artifactRecord'] = fixture.put(record).json()
                result, _ = fixture.run(change)
                self.assertEqual(result['status'], 'failed', kind)

    def test_scanner_crash_missing_database_tampered_report_and_expired_waiver_block(self):
        for kind in ('raw', 'db', 'report', 'waiver', 'coverage', 'policy'):
            def change(job, report):
                if job.stage != p.Stage.SOURCE_SECURITY: return
                details = report['details']
                if kind == 'raw': details['rawReceipt'] = self.fixture.put({'containerExitCode': 1}).json()
                elif kind == 'db': self.fixture.store.path(details['database']['path']).unlink()
                elif kind == 'report': self.fixture.store.path(details['reports']['inventory']['path']).write_bytes(b'{}')
                elif kind == 'waiver':
                    original = self.fixture.store.json(a.Evidence.parse(details['receipt'])); original['waiversExpireAt'] = self.fixture.now-1
                    details['receipt'] = self.fixture.put(original).json()
                elif kind == 'coverage': details['coverage']['omissions'] = ['native unknown']
                else: details['scannerPolicy'] = self.fixture.put(scanner.POLICY).json()
            result, _ = self.fixture.run(change)
            self.assertEqual(result['status'], 'failed', kind)

    def test_altered_sealed_input_blocks_registry_before_jobs(self):
        path = self.fixture.store.path(self.fixture.binding.identities['npmSeal'].path)
        path.write_bytes(b'changed sealed npm input')
        result, _ = self.fixture.run()
        self.assertEqual(result['status'], 'pending')
        self.assertEqual(result['firstFailure']['stage'], 'registry-admission')

    def test_fixed_administrative_registry_rejects_embedded_commands_and_duplicates(self):
        fixture = self.fixture; binding = fixture.binding
        entry = {'schema': 'micro.android.adapter/1', 'projectKind': 'fixture', 'projectId': binding.project_id,
                 'adapterId': binding.adapter_id, 'sourceSha': binding.source_sha,
                 'identities': {name: ref.json() for name, ref in binding.identities.items()},
                 'certificateSha256': binding.certificate_sha256, 'expiresAt': binding.expires_at,
                 'versionCode': 1, 'versionName': '1.0.0', 'package': binding.package, 'minSdk': 24,
                 'targetSdk': 36, 'permissions': [], 'admitted': True, 'image': a.IMAGE,
                 'nativeMapping': binding.native_mapping.json(),
                 'runtimePolicy': {'user': '1000:1000', 'network': 'none', 'memoryBytes': 6*1024**3,
                                   'memorySwapBytes': 6*1024**3, 'nanoCpus': 2_000_000_000, 'pids': 384}}
        fixture.store.path('native-integration').mkdir(exist_ok=True)
        path = fixture.store.path(p.REGISTRY_PATH)
        for kind in ('valid', 'command', 'image', 'serial', 'duplicate'):
            value = copy.deepcopy(entry)
            if kind == 'command': value['commands'] = ['candidate controlled']
            elif kind == 'image': value['image'] = 'moving:latest'
            elif kind == 'serial': value['serial'] = 'unowned-device'
            raw = {'schema': 'micro.android.registry/1', 'entries': [value, value] if kind == 'duplicate' else [value]}
            path.write_bytes(a.canonical(raw)+b'\n')
            with patch.object(p, 'CONTROLLER_ROOT', fixture.store.root):
                if kind == 'valid':
                    registry = p.load_registry(); selected = registry.select(binding.project_id, binding.adapter_id)
                    selected.validate(registry.store, fixture.now)
                else:
                    with self.assertRaises(a.Rejected): p.load_registry()

    def test_state_budget_and_independent_copy_boundary(self):
        linked = self.fixture.store.path('hardlink')
        os.link(self.fixture.store.path(self.fixture.signed.path), linked)
        with self.assertRaises(a.Rejected): self.fixture.store.describe('hardlink')
        with self.assertRaises(a.Rejected): self.fixture.store.budget()
        linked.unlink()
        path = self.fixture.store.path('sparse-budget-negative')
        with path.open('xb') as output: output.truncate(a.STORE_BYTES+1)
        with self.assertRaises(a.Rejected): self.fixture.store.budget()
        path.unlink()
        budget = self.fixture.store.budget()
        self.assertEqual(budget['maximumBytes'], 8*1024**3)
        self.assertEqual(budget['warningBytes'], 7*1024**3)
        self.assertFalse(budget['approachingLimit'])
        self.assertGreater(budget['freeDiskBytes'], 0)

    def test_missing_or_changed_actual_scanned_lock_blocks_source_security(self):
        for missing in (True, False):
            def change(job, report):
                if job.stage != p.Stage.SOURCE_SECURITY: return
                details = report['details']; reference = a.Evidence.parse(details['rawReceipt'])
                raw = self.fixture.store.json(reference)
                inventory = raw['worker']['reports']['trusted.inventory.json']
                if missing: inventory.pop('lockSha256')
                else: inventory['lockSha256'] = 'f'*64
                stdout_path = str(Path(reference.path).parent/'stdout.json')
                path = self.fixture.store.path(stdout_path); path.chmod(0o600)
                path.write_bytes(a.canonical(raw['worker'])+b'\n')
                raw['workerSha256'] = self.fixture.store.describe(stdout_path).sha256
                path = self.fixture.store.path(reference.path); path.chmod(0o600)
                path.write_bytes(a.canonical(raw)+b'\n')
                details['rawReceipt'] = self.fixture.store.describe(reference.path).json()
            result, _ = self.fixture.run(change)
            self.assertEqual(result['status'], 'failed')
            self.assertEqual(result['firstFailure']['stage'], p.Stage.SOURCE_SECURITY.value)
            self.assertIn('lock', result['firstFailure']['reason'])

    def test_native_map_missing_tampered_library_wrong_apk_unknown_purl_and_closure_block(self):
        for kind in ('missing', 'library', 'apk', 'purl', 'closure', 'comments'):
            with tempfile.TemporaryDirectory() as temporary:
                fixture = SyntheticFixture(temporary)
                if kind == 'missing':
                    fixture.binding = replace(fixture.binding, native_mapping=None)
                else:
                    mapping = fixture.store.json(fixture.binding.native_mapping)
                    if kind == 'library': mapping['libraryMappings'][0]['sha256'] = 'a'*64
                    elif kind == 'apk': mapping['apkSha256'] = 'a'*64
                    elif kind == 'purl': mapping['libraryMappings'][0]['componentPurls'] = ['pkg:maven/unknown/fixture@9.9.9']
                    elif kind == 'closure':
                        closure = fixture.store.json(a.Evidence.parse(mapping['nativeClosure'])); closure['mavenGraphs'] = {}
                        mapping['nativeClosure'] = fixture.put(closure).json()
                    else:
                        proof = fixture.store.json(a.Evidence.parse(mapping['libraryMappings'][0]['evidence'][0]))
                        proof['sources'] = [fixture.put(b'FAKE mapper comment, no physical build/input linkage').json()]
                        mapping['libraryMappings'][0]['evidence'] = [fixture.put(proof).json()]
                    fixture.binding = replace(fixture.binding, native_mapping=fixture.put(mapping))
                fixture.registry = p.Registry(fixture.store, {(fixture.binding.project_id, fixture.binding.adapter_id): fixture.binding})
                result, _ = fixture.run()
                self.assertEqual(result['status'], 'failed', kind)
                self.assertEqual(result['firstFailure']['stage'], p.Stage.ARTIFACT_SECURITY.value)

    def test_bounded_large_actual_shaped_scanner_reports_and_overflow(self):
        for overflow in (False, True):
            def change(job, report):
                if job.stage != p.Stage.SOURCE_SECURITY: return
                details = report['details']; ref = a.Evidence.parse(details['rawReceipt'])
                raw = self.fixture.store.json(ref, 64*1024**2)
                if overflow:
                    target = self.fixture.store.path(ref.path); target.chmod(0o600)
                    with target.open('wb') as output: output.truncate(64*1024**2+1)
                    details['rawReceipt'] = {'path': ref.path, 'sha256': 'a'*64, 'bytes': 64*1024**2+1}
                    return
                # Metadata in an otherwise valid augmented BOM makes the actual
                # worker and containing receipt exceed the generic 2MiB limit.
                raw['worker']['reports']['sbom.cdx.json']['metadata'] = {'description': 'FAKE large bounded report '+('x'*(2*1024**2))}
                inventory = self.fixture.put(a.canonical(raw['worker']['reports']['sbom.cdx.json']))
                details['reports']['inventory'] = inventory.json()
                normalized = self.fixture.store.json(a.Evidence.parse(details['receipt']))
                normalized['reports'] = details['reports']; details['receipt'] = self.fixture.put(normalized).json()
                stdout_path = str(Path(ref.path).parent/'stdout.json')
                path = self.fixture.store.path(stdout_path); path.chmod(0o600)
                path.write_bytes(a.canonical(raw['worker'])+b'\n')
                raw['workerSha256'] = self.fixture.store.describe(stdout_path, 64*1024**2).sha256
                path = self.fixture.store.path(ref.path); path.chmod(0o600)
                path.write_bytes(a.canonical(raw)+b'\n')
                updated = self.fixture.store.describe(ref.path, 64*1024**2)
                self.assertGreater(updated.bytes, 2*1024**2)
                details['rawReceipt'] = updated.json()
            result, _ = self.fixture.run(change)
            if overflow:
                self.assertEqual(result['status'], 'failed')
                self.assertEqual(result['firstFailure']['stage'], p.Stage.SOURCE_SECURITY.value)
            else: self.assertEqual(result['status'], 'passed', result['firstFailure'])

    def test_schemas_are_valid_json_with_closed_authority(self):
        for name in ('adapter.schema.json','artifact-record.schema.json','operations.schema.json'):
            schema=json.loads(Path(a.__file__).with_name(name).read_text())
            self.assertFalse(schema['additionalProperties'])
            self.assertEqual(set(schema['required']),set(schema['properties']))


if __name__=='__main__':unittest.main()
