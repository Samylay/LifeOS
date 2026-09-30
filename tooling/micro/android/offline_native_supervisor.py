#!/usr/bin/env python3
"""One actual clean native job from the fixed operator registry and Store.

This controller never runs online and receives no arbitrary product input path.
Preparation does not confer native, device, security or production readiness.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import subprocess
import time
from uuid import uuid4

from admission import IMAGE, NATIVE_POLICY, NATIVE_TMPFS, native_execution, native_inputs, native_runtime
from native_acquire import Supervisor
from pipeline import CONTROLLER_ROOT, load_registry


def digest(path):
    with Path(path).open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


class OfflineSupervisor(Supervisor):
    def __init__(self, store, binding, owner):
        self.store, self.binding, self.owner = store, binding, owner
        if not re.fullmatch(r'[a-f0-9]{32}', owner):
            raise ValueError('Generated unique owner required')
        self.inputs = native_inputs(binding, store)
        self.execution = native_execution(binding, store, self.inputs)
        state = store.path(self.inputs['outputRoot'] + '/' + owner)
        if state.exists(): raise ValueError('Fresh owner directory required')
        state.mkdir(mode=0o700)
        super().__init__(state)
        self.name = 'micro-native-' + owner
        self.container_id = None
        self.create_attempted = False
        self.receipt.update(scope='one-clean-offline-fixture-calibration', owner=owner,
                            cleanBuildId=owner, stage='native-integration')
        self.sources = {name: digest(Path(__file__).with_name(name)) for name in
                        ('offline_native_supervisor.py', 'native_acquire.py', 'admission.py', 'pipeline.py')}

    def headroom(self):
        budget = self.store.budget()
        available = next(x for x in Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:'))
        return {'memoryAvailableBytes': int(available.split()[1])*1024,
                'diskFreeBytes': budget['freeDiskBytes'], 'ownedBytes': budget['regularBytes'],
                'ownedAllocatedBytes': budget['allocatedBytes'], 'warningBytes': budget['warningBytes'],
                'approachingLimit': budget['approachingLimit']}

    def read_owned(self):
        if not self.container_id or not re.fullmatch(r'[a-f0-9]{64}', self.container_id):
            raise ValueError('Validated complete owned Docker identity required')
        result = subprocess.run(['docker', 'inspect', self.container_id], env=self.env,
                                capture_output=True, text=True, timeout=10)
        result.check_returncode()
        value = json.loads(result.stdout)[0]
        if (value['Id'] != self.container_id or value['Name'] != '/' + self.name or value['Image'] != IMAGE
                or value['Config'].get('Labels', {}).get('micro.native.owner') != self.owner):
            raise ValueError('Owned immutable ID/name/image/label changed')
        return value

    def command(self, name, argv, timeout=60, allow_failure=False):
        if not name.startswith('cleanup-'):
            return super().command(name, argv, timeout, allow_failure)
        # Cleanup remains possible after Store.budget rejects an overrun.
        # Only owner-checked bounded Docker observations/removal use this path.
        path = self.state/'receipts'/(name+'.log')
        start = time.monotonic()
        process = None
        failure = None
        limit_failure = None
        captured = bytearray()
        with path.open('xb') as output:
            try:
                process = subprocess.Popen(argv, env=self.env, stdout=subprocess.PIPE,
                                           stderr=subprocess.STDOUT)
                os.set_blocking(process.stdout.fileno(), False)
                with selectors.DefaultSelector() as selector:
                    selector.register(process.stdout, selectors.EVENT_READ)
                    eof = False
                    while not eof or process.poll() is None:
                        if time.monotonic()-start > min(timeout,30):
                            limit_failure = 'wall-time'
                            raise ValueError('Owned cleanup wall bound exceeded')
                        for key,_ in selector.select(.05):
                            chunk = os.read(key.fileobj.fileno(),65536)
                            if not chunk:
                                eof = True
                                selector.unregister(key.fileobj)
                                continue
                            remaining = 2*1024**2-len(captured)
                            admitted = chunk[:remaining]
                            output.write(admitted)
                            captured.extend(admitted)
                            if len(chunk) > remaining:
                                limit_failure = 'log-bytes'
                                raise ValueError('Owned cleanup log bound exceeded')
            except BaseException as error:
                failure = error
            finally:
                if process is not None:
                    try:
                        if process.poll() is None:
                            process.terminate()
                            try: process.wait(5)
                            except subprocess.TimeoutExpired:
                                process.kill(); process.wait(5)
                    except BaseException as stop_error:
                        failure = failure or stop_error
                    finally:
                        if process.stdout is not None: process.stdout.close()
                output.flush()
                self.receipt['commands'].append({'name':name,'argv':argv,
                    'exitCode':process.returncode if process is not None else None,
                    'seconds':time.monotonic()-start,'logSha256':hashlib.sha256(captured).hexdigest(),
                    'logBytes':len(captured),'timedOut':limit_failure=='wall-time',
                    'limitFailure':limit_failure,
                    'error':{'type':type(failure).__name__,'message':str(failure)} if failure else None,
                    'headroomSkippedForOwnerVerifiedCleanup':True})
        if failure: raise failure
        raw = bytes(captured)
        if process.returncode and not allow_failure: raise ValueError(name+' failed with exit '+str(process.returncode))
        return raw.decode(errors='replace'),process.returncode

    def assign_created_id(self, raw):
        created_id = raw.strip()
        if not re.fullmatch(r'[a-f0-9]{64}', created_id):
            raise ValueError('Full clean Docker create identity missing')
        self.container_id = created_id

    def sample_owned_jobs(self):
        value = self.read_owned()
        if not value['State']['Running']: return
        pid = value['State']['Pid']
        line = next(x for x in Path('/proc/' + str(pid) + '/cgroup').read_text().splitlines() if x.startswith('0::'))
        suffix = line[3:]
        if suffix != '/system.slice/docker-' + self.container_id + '.scope':
            raise ValueError('Owned cgroup identity/layout changed')
        root = Path('/sys/fs/cgroup' + suffix)
        sample = {'time': time.time(), 'containerId': self.container_id, 'pid': pid,
                  'startedAt': value['State']['StartedAt'],
                  'client': {name: (root/name).read_text().strip() for name in
                             ('memory.current', 'memory.peak', 'memory.events', 'memory.swap.current',
                              'memory.swap.peak', 'pids.current', 'pids.peak', 'cpu.stat') if (root/name).exists()}}
        target = self.state/'receipts/live-cgroup-samples.jsonl'
        if target.exists() and target.stat().st_size > 2*1024**2: raise ValueError('Cgroup evidence bound exceeded')
        with target.open('a') as output: output.write(json.dumps(sample)+'\n')
        self.receipt['lastResourceSample'] = sample

    def runtime(self, name):
        value = self.read_owned()
        native_runtime(value, self.owner, self.store, self.binding)
        path = self.state/'receipts'/(name+'.json')
        path.write_text(json.dumps(value, indent=2)+'\n')
        return self.store.describe(path.relative_to(self.store.root).as_posix()), value

    def cleanup(self):
        failures = []
        if self.create_attempted:
            try:
                target = self.container_id or self.name
                if self.container_id is not None and not re.fullmatch(r'[a-f0-9]{64}', self.container_id):
                    raise ValueError('Invalid recorded full container identity; no removal attempted')
                raw, code = self.command('cleanup-owned-owner', ['docker','inspect',target], allow_failure=True)
                if code == 0:
                    value = json.loads(raw)[0]
                    actual = value.get('Id','')
                    if (not re.fullmatch(r'[a-f0-9]{64}',actual)
                            or self.container_id is not None and actual != self.container_id
                            or value.get('Name') != '/'+self.name or value.get('Image') != IMAGE
                            or value.get('Config',{}).get('Labels',{}).get('micro.native.owner') != self.owner):
                        raise ValueError('Recovery/cleanup exact owner changed; no removal attempted')
                    self.container_id = actual
                    self.command('cleanup-owned-container', ['docker','container','rm','--force',actual])
                    target = actual
                elif code != 1 or not re.search(r'no such (?:object|container):\s*'+re.escape(target)+r'(?:\s|$)',raw,re.I):
                    raise ValueError('Cleanup owner readback failed; absence unknown')
                raw, code = self.command('cleanup-owned-absence', ['docker','container','inspect',target], allow_failure=True)
                if code != 1 or not re.search(r'no such (?:object|container):\s*'+re.escape(target)+r'(?:\s|$)',raw,re.I):
                    raise ValueError('Exact owned resource absence not proved')
                raw, code = self.command('cleanup-owned-label-list', ['docker','container','ls','--all',
                                        '--no-trunc','--filter=name=^/'+self.name+'$',
                                        '--filter=label=micro.native.owner='+self.owner,'--format={{.ID}}'], allow_failure=True)
                if code or raw.strip(): raise ValueError('Owned label list is not empty')
            except Exception as error:
                failures.append({'containerId':self.container_id,'name':self.name,'owner':self.owner,'error':str(error)})
        self.receipt['cleanupFailures'] = failures
        if failures: self.receipt['status'] = 'cleanup-unresolved'

    def run(self):
        for name in ('receipts','output','docker-config'): (self.state/name).mkdir()
        os.chmod(self.state/'output',0o777)
        for name in self.sources:
            (self.state/'receipts'/('executed-'+name)).write_bytes(Path(__file__).with_name(name).read_bytes())
        self.receipt['supervisorSourceSha256'] = self.sources
        normalized = None
        error = None
        try:
            self.receipt['headroomBefore'] = self.headroom()
            if self.receipt['headroomBefore']['memoryAvailableBytes'] < 9*1024**3 or self.receipt['headroomBefore']['diskFreeBytes'] < 30*1024**3:
                raise ValueError('Offline compile requires available9GiB/free30GiB')
            self.receipt['seedManifestsBefore'] = native_inputs(self.binding,self.store)
            argv = ['docker','create','--name='+self.name,'--label=micro.native.owner='+self.owner,
                    '--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
                    '--user=1000:1000','--memory=6g','--memory-swap=6g','--cpus=2','--pids-limit=384','--log-driver=none']
            argv += ['--tmpfs='+path+':'+options for path,options in NATIVE_TMPFS.items()]
            argv += ['--mount=type=bind,src='+str(self.store.path(tree['path']))+',dst='+destination+',readonly'
                     for destination,tree in self.inputs['seeds'].items()]
            argv += ['--mount=type=bind,src='+str(self.state/'output')+',dst=/out', '--entrypoint=python3',
                     IMAGE,'/seed/tools/native_fixture_job.py','--offline']
            self.create_attempted = True
            raw,_ = self.command('client-create',argv)
            self.assign_created_id(raw)
            before_ref,_ = self.runtime('runtime-before')
            self.command('native-client-run',['docker','start','--attach',self.container_id],timeout=1800)
            after_ref,after = self.runtime('runtime-after')
            self.receipt['clientState'] = after['State']
            if after['State']['ExitCode'] or after['State']['OOMKilled'] or after['State']['Running']:
                raise ValueError('Offline job failed')
            job_path = self.state/'output/native-job.json'
            job_ref = self.store.describe(job_path.relative_to(self.store.root).as_posix())
            job = self.store.json(job_ref)
            if job['status'] != 'clean-offline-fixture-unsigned-apk' or job['offline'] is not True:
                raise ValueError('Actual offline worker success missing')
            events = dict(line.split() for line in job['resources']['memory.events'].splitlines())
            if any(int(events.get(k,0)) for k in ('max','oom','oom_kill','oom_group_kill')):
                raise ValueError('Actual memory/OOM limit reached')
            if int(job['resources']['memory.peak']) > 6*1024**3 or int(job['resources']['pids.peak']) > 384:
                raise ValueError('Observed native resource bound exceeded')
            apk = self.store.describe((self.state/'output/fixture-release-unsigned.apk').relative_to(self.store.root).as_posix(),512*1024**2)
            if apk.bytes <= 0 or apk.sha256 != job['apk']['sha256'] or apk.bytes != job['apk']['bytes']:
                raise ValueError('Actual APK/worker digest mismatch')
            expected = self.store.json(self.binding.identities['recipe'])['commands']
            if [x['argv'] for x in job['commands']] != expected or any(x['exitCode'] for x in job['commands']):
                raise ValueError('Actual commands differ from reviewed recipe')
            log = self.store.describe((self.state/'receipts/native-client-run.log').relative_to(self.store.root).as_posix(),20*1024**2)
            self.receipt['seedManifestsAfter'] = native_inputs(self.binding,self.store)
            if self.receipt['seedManifestsBefore'] != self.receipt['seedManifestsAfter']:
                raise ValueError('Protected input bytes changed across execution')
            if any(digest(Path(__file__).with_name(n)) != wanted for n,wanted in self.sources.items()):
                raise ValueError('Trusted supervisor source changed during execution')
            normalized = {'schema':'micro.android.native-build/1','context':self.binding.context(),
                          'startedAt':self.receipt['startedAt'],'status':'built','cleanBuildId':self.owner,
                          'owner':self.owner,'runtimePolicy':NATIVE_POLICY,'runtimeBefore':before_ref.json(),
                          'runtimeAfter':after_ref.json(),'state':after['State'],'job':job_ref.json(),
                          'unsignedApk':apk.json(),'commands':[{**x,'log':log.json(),'signal':None,
                                                             'limitFailure':None} for x in job['commands']]}
            self.receipt['status'] = 'one-clean-offline-native-fixture-apk-device-security-reproduction-pending'
        except BaseException as exception:
            error = exception
            self.receipt['status'] = 'first-offline-native-failure-retained'
            self.receipt['firstFailure'] = {'type':type(exception).__name__,'message':str(exception)}
            if self.container_id:
                try:
                    _,value = self.runtime('runtime-failure')
                    self.receipt['clientState'] = value['State']
                except Exception as observation_error: self.receipt['failureObservationError'] = str(observation_error)
        finally:
            self.cleanup()
            try: self.receipt['headroomAfter'] = self.headroom()
            except Exception as final_error:
                self.receipt['finalObservationError'] = str(final_error)
                error = error or final_error
            self.receipt['finishedAt'] = time.time()
            (self.state/'receipts/offline-native-smoke.json').write_text(json.dumps(self.receipt,indent=2)+'\n')
        if error: raise error
        if normalized is None or self.receipt['cleanupFailures']: raise ValueError('Offline completion/cleanup unresolved')
        normalized.update(cleanup={'absent':True},finishedAt=self.receipt['finishedAt'])
        target = self.state/'receipts/native-build.json'
        target.write_text(json.dumps(normalized,indent=2)+'\n')
        return self.store.describe(target.relative_to(self.store.root).as_posix())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-id',required=True)
    parser.add_argument('--adapter-id',required=True)
    args = parser.parse_args()
    registry = load_registry()
    if registry.store.root != CONTROLLER_ROOT or registry.store.root.stat().st_mode & 0o077:
        raise ValueError('Fixed dedicated owned700 integration Store required')
    binding = registry.select(args.project_id,args.adapter_id)
    result = OfflineSupervisor(registry.store,binding,uuid4().hex).run()
    print(json.dumps(result.json()))


if __name__ == '__main__': main()
