#!/usr/bin/env python3
"""Controller supervisor, never placed inside product jobs or given source from candidates."""
import argparse
import hashlib
import json
import os
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
