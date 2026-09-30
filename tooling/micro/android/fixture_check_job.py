#!/usr/bin/env python3
"""Fixed offline checks on the protected synthetic fixture, inside Node24."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time


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
            started = time.monotonic()
            with (output / (label + '.log')).open('xb') as log:
                result = subprocess.run(argv, cwd=fixture, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=40)
            data = (output / (label + '.log')).read_bytes()
            receipt['commands'].append({'check': label, 'argv': argv, 'exitCode': result.returncode, 'seconds': time.monotonic()-started, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
            if len(data) > 1024**2 or result.returncode:
                raise ValueError('Protected fixture check failed: '+label)
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
