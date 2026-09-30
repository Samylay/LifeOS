#!/usr/bin/env python3
"""Run the fixed APK inspector with bounded, credential-free container inputs."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import stat
import subprocess
import time
from uuid import uuid4

APK_LIMIT = 512 * 1024 * 1024
OUTPUT_LIMIT = 1024 * 1024
MEMORY = 1024 * 1024 * 1024


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        while chunk := source.read(1024 * 1024): value.update(chunk)
    return value.hexdigest()


def admit_apk(source, destination):
    descriptor = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= APK_LIMIT:
            raise ValueError('APK must be a bounded regular input')
        value = hashlib.sha256(); count = 0
        with destination.open('xb') as output:
            while chunk := os.read(descriptor, min(1024 * 1024, APK_LIMIT-count+1)):
                count += len(chunk)
                if count > APK_LIMIT: raise ValueError('APK grew beyond admission byte limit')
                output.write(chunk); value.update(chunk)
        after = os.fstat(descriptor)
        identity = lambda info: (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
        if identity(before) != identity(after) or count != before.st_size or identity(source.stat(follow_symlinks=False)) != identity(after):
            raise ValueError('Source APK changed during admission')
        destination.chmod(0o444)
        return value.hexdigest(), count
    finally: os.close(descriptor)


def bounded(argv, output, seconds=30):
    started = time.monotonic(); count = 0; reason = None
    with output.open('xb') as capture:
        process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   stdin=subprocess.DEVNULL, start_new_session=True)
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)
        try:
            while selector.get_map():
                if time.monotonic() - started > seconds:
                    reason = 'wall-time-limit'; break
                for key, _ in selector.select(timeout=0.1):
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        selector.unregister(key.fileobj); continue
                    count += len(chunk)
                    capture.write(chunk[:max(0, OUTPUT_LIMIT - capture.tell())])
                    if count > OUTPUT_LIMIT:
                        reason = 'output-limit'; break
                if reason: break
            if reason: process.kill()
            code = process.wait(timeout=5)
        finally:
            selector.close(); process.stdout.close()
            if process.poll() is None:
                process.kill(); process.wait(timeout=5)
    result = {'argv': argv, 'exitCode': code, 'seconds': round(time.monotonic()-started, 3),
              'capturedBytes': output.stat().st_size, 'sha256': digest(output), 'limitFailure': reason}
    return result


def require_command(result):
    if result['exitCode'] or result['limitFailure']:
        raise RuntimeError('Supervisor command failed: ' + Path(result['argv'][0]).name)


def runtime_policy(observed, identifier, image, owner):
    config = observed['Config']; host = observed['HostConfig']
    expected = {
        'containerId': observed['Id'] == identifier,
        'owner': config.get('Labels', {}).get('micro.artifact.owner') == owner,
        'image': observed['Image'] == image,
        'user': config['User'] == '1000:1000',
        'networkNone': host['NetworkMode'] == 'none',
        'readOnly': host['ReadonlyRootfs'],
        'capDrop': host['CapDrop'] == ['ALL'],
        'noPrivileges': 'no-new-privileges' in host['SecurityOpt'],
        'memory': host['Memory'] == MEMORY and host['MemorySwap'] == MEMORY,
        'cpu': host['NanoCpus'] == 1_000_000_000,
        'pids': host['PidsLimit'] == 128,
        'logDriver': host['LogConfig']['Type'] == 'none',
        'tmpfs': host.get('Tmpfs') == {'/tmp': 'rw,nosuid,nodev,noexec,size=134217728,mode=1777'},
        'env': all(value.split('=', 1)[0] in ('PATH', 'NODE_VERSION', 'YARN_VERSION', 'JAVA_HOME',
                     'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'EXPO_OFFLINE', 'EXPO_NO_TELEMETRY',
                     'HOME', 'JAVA_TOOL_OPTIONS') for value in config['Env']),
        'mounts': len(observed['Mounts']) == 2 and all(
            mount['Type'] == 'bind' and not mount['RW'] and mount['Destination'] in
            ('/input/app.apk', '/inspector.py') for mount in observed['Mounts']),
        'entrypoint': config['Entrypoint'] == ['python3'] and config['Cmd'] == ['/inspector.py'],
    }
    if not all(expected.values()): raise ValueError('Runtime policy mismatch: '+str(expected))
    return expected


def cleanup_owned(command, output, identifier, image, owner):
    name = 'micro-artifact-' + owner
    target = identifier or name
    current = command(['docker', 'inspect', target], 'cleanup-owner')
    if current['exitCode'] == 0 and not current['limitFailure']:
        observed = json.loads((output/'cleanup-owner.log').read_text())[0]
        actual = observed.get('Id', '')
        if (not re.fullmatch(r'[0-9a-f]{64}', actual)
                or identifier is not None and actual != identifier
                or observed.get('Name') != '/' + name or observed.get('Image') != image
                or observed.get('Config', {}).get('Labels', {}).get('micro.artifact.owner') != owner):
            raise ValueError('Cleanup exact owner identity changed; no removal attempted')
        removed = command(['docker', 'rm', '--force', actual], 'cleanup-remove'); require_command(removed)
        target = actual
    absent = command(['docker', 'inspect', target], 'cleanup-absent')
    listing = command(['docker', 'ps', '--all', '--quiet', '--no-trunc',
                       '--filter', 'name=^/' + name + '$',
                       '--filter', 'label=micro.artifact.owner='+owner], 'cleanup-list')
    require_command(listing)
    diagnostic = (output/'cleanup-absent.log').read_text()
    missing = re.search(r'no such object:\s*' + re.escape(target) + r'(?:\s|$)', diagnostic, re.IGNORECASE)
    if (absent['exitCode'] != 1 or absent['limitFailure'] or not missing
            or (output/'cleanup-list.log').read_text().strip()):
        raise ValueError('Scoped cleanup absence not proven')
    return {'absent': True}


def inspect_apk(apk, image, output):
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', image):
        raise ValueError('Use an admitted exact local image ID')
    if apk.is_symlink() or not apk.is_file() or not 0 < apk.stat().st_size <= APK_LIMIT:
        raise ValueError('APK must be a bounded regular input')
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    owner = uuid4().hex
    name = 'micro-artifact-' + owner
    receipt = {'schema': 'micro.android.artifact-supervisor/1', 'owner': owner,
               'supervisorSha256': digest(Path(__file__).resolve()),
               'startedAt': datetime.now(timezone.utc).isoformat(), 'status': 'started',
               'commands': [], 'cleanup': None, 'limitations': ['Identity inspection does not approve package, permissions, signing policy, source, security or device behavior.']}
    identifier = None; error = None; create_attempted = False

    def command(argv, label, seconds=30):
        result = bounded(argv, output/(label+'.log'), seconds)
        receipt['commands'].append(result)
        return result

    try:
        copied = output/'app.apk'; original, copied_bytes = admit_apk(apk, copied)
        script = output/'inspector.py'
        shutil.copyfile(Path(__file__).with_name('inspect_apk.py'), script); script.chmod(0o444)
        if original != digest(copied): raise ValueError('Admitted APK copy changed')
        receipt['inputs'] = {'apkSha256': original, 'apkBytes': copied_bytes,
                             'inspectorSha256': digest(script), 'image': image}
        create_attempted = True
        created = command(['docker', 'create', '--name', name, '--label', 'micro.artifact.owner='+owner,
                           '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL',
                           '--security-opt=no-new-privileges', '--user=1000:1000',
                           '--memory=1g', '--memory-swap=1g', '--cpus=1', '--pids-limit=128',
                           '--log-driver=none', '--ulimit=nofile=256:256', '--ulimit=core=0:0',
                           '--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=134217728,mode=1777',
                           '--env=HOME=/tmp', '--env=JAVA_TOOL_OPTIONS=-Djava.io.tmpdir=/tmp',
                           '--mount=type=bind,src='+str(copied.resolve())+',dst=/input/app.apk,readonly',
                           '--mount=type=bind,src='+str(script.resolve())+',dst=/inspector.py,readonly',
                           '--workdir=/tmp', '--entrypoint=python3', image, '/inspector.py'], 'create')
        require_command(created)
        identifier = (output/'create.log').read_text().strip()
        if not re.fullmatch(r'[0-9a-f]{64}', identifier): raise ValueError('Invalid Docker container identity')
        before = command(['docker', 'inspect', identifier], 'inspect-before'); require_command(before)
        observed = json.loads((output/'inspect-before.log').read_text())[0]
        if observed.get('Name') != '/' + name: raise ValueError('Inspector exact container name changed')
        receipt['runtimePolicy'] = runtime_policy(observed, identifier, image, owner)
        run = command(['docker', 'start', '--attach', identifier], 'inspection', seconds=120)
        after = command(['docker', 'inspect', identifier], 'inspect-after'); require_command(after)
        state = json.loads((output/'inspect-after.log').read_text())[0]
        runtime_policy(state, identifier, image, owner)
        receipt['state'] = state['State']
        require_command(run)
        if state['State']['Running'] or state['State']['OOMKilled'] or state['State']['ExitCode']:
            raise ValueError('Inspector container did not exit successfully')
        lines = (output/'inspection.log').read_text().splitlines()
        values = [json.loads(line) for line in lines if line.startswith('{')]
        if len(values) != 1 or values[0].get('status') != 'inspected' or values[0].get('apkSha256') != original:
            raise ValueError('Inspector result does not identify admitted APK')
        if digest(copied) != original or digest(script) != receipt['inputs']['inspectorSha256']:
            raise ValueError('Inspector inputs changed')
        receipt['inspection'] = values[0]; receipt['status'] = 'inspected'
    except Exception as problem:
        error = problem; receipt['status'] = 'failed'
        receipt['error'] = {'type': type(problem).__name__, 'message': str(problem)[:1200]}
    finally:
        if create_attempted:
            try:
                receipt['cleanup'] = cleanup_owned(command, output, identifier, image, owner)
            except Exception as cleanup:
                receipt['cleanup'] = {'absent': False, 'error': str(cleanup)[:1200]}
                if error is None:
                    error = cleanup; receipt['status'] = 'failed'
        else:
            receipt['cleanup'] = {'absent': True}
        receipt['finishedAt'] = datetime.now(timezone.utc).isoformat()
        (output/'result.json').write_text(json.dumps(receipt, indent=2)+'\n')
    if error: raise error
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', required=True, type=Path)
    parser.add_argument('--image', required=True)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        receipt = inspect_apk(args.apk, args.image, args.output)
    except Exception as error:
        print(json.dumps({'status': 'failed', 'error': type(error).__name__,
                          'message': str(error)[:1200], 'receipt': str(args.output/'result.json')}))
        return 1
    print(json.dumps({'status': receipt['status'], 'apkSha256': receipt['inputs']['apkSha256'],
                      'cleanup': receipt['cleanup']}))
    return 0


if __name__ == '__main__': raise SystemExit(main())
