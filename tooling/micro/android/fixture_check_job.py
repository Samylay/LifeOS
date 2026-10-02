#!/usr/bin/env python3
"""Fixed offline checks on the protected synthetic fixture, inside Node24."""
import hashlib
import json
import os
from pathlib import Path
import selectors
import shutil
import subprocess
import time


LOG_BYTES = 1024**2


def capture_command(argv, cwd, env, log_path, seconds=40):
    """Bound the log stream without limiting dependency files to log size."""
    started = time.monotonic()
    process = None
    captured = 0
    limit = None
    with log_path.open('xb') as log, selectors.DefaultSelector() as selector:
        try:
            process = subprocess.Popen(argv, cwd=cwd, env=env,
                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            os.set_blocking(process.stdout.fileno(), False)
            selector.register(process.stdout, selectors.EVENT_READ)
            while selector.get_map() or process.poll() is None:
                if time.monotonic()-started >= seconds:
                    limit = 'command wall-time limit'
                    break
                for key, _ in selector.select(min(.1, max(0, seconds-(time.monotonic()-started)))):
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    admitted = chunk[:max(0, LOG_BYTES-captured)]
                    log.write(admitted)
                    captured += len(admitted)
                    if len(admitted) != len(chunk):
                        limit = 'command log-byte limit'
                        break
                if limit:
                    break
        finally:
            if process is not None:
                if process.poll() is None:
                    process.kill()
                process.wait(timeout=3)
                process.stdout.close()
    data = log_path.read_bytes()
    if len(data) > LOG_BYTES:
        raise ValueError('Protected command log changed beyond limit')
    return process.returncode, time.monotonic()-started, data, limit


def main():
    fixture = Path('/work/fixture')
    shutil.copytree('/seed/fixture', fixture)
    fixture.chmod(0o755)
    for item in fixture.rglob('*'):
        if item.is_symlink(): raise ValueError('Protected fixture contains a link')
        item.chmod(0o755 if item.is_dir() else 0o644)
    cache = Path('/work/npm-cache')
    shutil.copytree('/seed/npm-cache', cache)
    for item in cache.rglob('*'):
        if not item.is_symlink(): item.chmod(0o755 if item.is_dir() else 0o644)
    Path('/work/user.npmrc').write_text('')
    Path('/work/global.npmrc').write_text('')
    output = Path('/out/fixture-checks')
    output.mkdir()
    commands = {
        'setup': ['npm', 'ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'],
        'lint': ['node', './node_modules/eslint/bin/eslint.js', '--no-config-lookup', '--config', '/seed/tools/fixture-eslint.config.mjs', '--no-cache', 'app'],
        'types': ['node', './node_modules/typescript/bin/tsc', '--noEmit', '-p', '.'],
        'domain-storage': ['node', '/seed/tools/fixture_checks.mjs'],
    }
    receipt = {'schema': 'micro.fixture-offline-check-worker/1', 'startedAt': time.time(), 'commands': []}
    env = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': '/work', 'CI': '1', 'EXPO_OFFLINE': '1', 'EXPO_NO_TELEMETRY': '1', 'NODE_OPTIONS': '--max-old-space-size=512', 'npm_config_cache': str(cache), 'npm_config_userconfig': '/work/user.npmrc', 'npm_config_globalconfig': '/work/global.npmrc', 'npm_config_update_notifier': 'false'}
    try:
        for label, argv in commands.items():
            code, duration, data, limit = capture_command(argv, fixture, env, output/(label+'.log'))
            receipt['commands'].append({'check': label, 'argv': argv, 'exitCode': code, 'seconds': duration, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
            if limit or code:
                raise ValueError('Protected fixture check failed: '+label+' ('+(limit or 'exit '+str(code))+')')
        results = json.loads((output/'results.json').read_text())
        cases = results['results']
        expected = {'domain': 3, 'storage': 6}
        if len(cases) != 9 or any(case['passed'] is not True for case in cases) or any(sum(case['group']==group for case in cases)!=count for group,count in expected.items()):
            raise ValueError('Protected domain/storage cases missing or failed')
        receipt['mandatoryCases'] = {'lint': 1, 'types': 1, **expected}
        receipt['sourceSha256'] = results['sourceSha256']
        receipt['status'] = 'protected-offline-fixture-checks-passed'
    except Exception as error:
        receipt['status'] = 'first-offline-check-failure-retained'
        receipt['failure'] = {'type': type(error).__name__, 'message': str(error)}
        raise
    finally:
        receipt['finishedAt'] = time.time()
        (output/'worker.json').write_text(json.dumps(receipt, indent=2)+'\n')
        print(json.dumps(receipt), flush=True)


if __name__ == '__main__':
    main()
