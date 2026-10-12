#!/usr/bin/env python3
"""Trusted npm acquisition/prebuild, run only inside the bounded client."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import time

def archive(source, target, ceiling, *, admitted_top=None, skip_names=()):
    count = 0
    entries = 0
    with tarfile.open(target, 'w') as output:
        for path in sorted(source.rglob('*')):
            relative = path.relative_to(source)
            if admitted_top is not None and relative.parts[0] not in admitted_top:
                continue
            if path.name in skip_names or path.name.endswith('.lock'):
                continue
            if path.is_symlink():
                raise ValueError('Exported npm cache/native files contain link')
            if not path.is_file() and not path.is_dir():
                raise ValueError('Exported input contains special file')
            entries += 1
            if path.is_file():
                count += path.stat().st_size
            if count > ceiling or entries > 50000:
                raise ValueError('Input export bound exceeded')
            output.add(path, arcname=relative, recursive=False)
    if target.stat().st_size > ceiling + 50 * 1024 * 1024:
        raise ValueError('Tar export size exceeded')
    digest = hashlib.sha256()
    with target.open('rb') as source:
        while chunk := source.read(256 * 1024):
            digest.update(chunk)
    return {'bytes': target.stat().st_size, 'regularBytes': count, 'entries': entries, 'sha256': digest.hexdigest()}

def main():
    work = Path('/work')
    fixture = work / 'fixture'
    shutil.copytree('/seed/fixture', fixture)
    home = work / 'home'
    home.mkdir()
    (work / 'empty-user.npmrc').write_text('')
    (work / 'empty-global.npmrc').write_text('')
    env = {'PATH': '/opt/jdk17/bin:/opt/gradle/bin:/usr/local/bin:/usr/bin:/bin', 'HOME': str(home), 'CI': '1', 'EXPO_OFFLINE': '1', 'EXPO_NO_TELEMETRY': '1', 'JAVA_HOME': '/opt/jdk17', 'ANDROID_HOME': '/opt/android-sdk', 'ANDROID_SDK_ROOT': '/opt/android-sdk', 'npm_config_userconfig': str(work / 'empty-user.npmrc'), 'npm_config_globalconfig': str(work / 'empty-global.npmrc'), 'npm_config_cache': str(work / 'npm-cache'), 'npm_config_registry': 'http://factory-acquisition-proxy:8081/', 'npm_config_update_notifier': 'false', 'npm_config_fetch_retries': '0', 'npm_config_maxsockets': '4'}
    receipt = {'startedAt': time.time(), 'image': os.environ['FACTORY_IMAGE_ID'], 'lockSha256': hashlib.sha256((fixture / 'package-lock.json').read_bytes()).hexdigest(), 'commands': []}
    for argv in (['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], ['node', './node_modules/expo/bin/cli', 'prebuild', '--platform', 'android', '--no-install']):
        start = time.monotonic()
        result = subprocess.run(argv, cwd=fixture, env=env)
        receipt['commands'].append({'argv': argv, 'exitCode': result.returncode, 'seconds': time.monotonic() - start})
        if result.returncode:
            Path('/out/npm-job-first-failure.json').write_text(json.dumps(receipt, indent=2) + '\n')
            raise ValueError('Trusted npm/Expo command failed, no automatic retry')
    if hashlib.sha256((fixture / 'package-lock.json').read_bytes()).hexdigest() != receipt['lockSha256']:
        raise ValueError('Fixture command mutated immutable lock')
    receipt['npmCache'] = archive(work / 'npm-cache', Path('/out/npm-cache.tar'), 1024 * 1024 * 1024)
    receipt['generatedNative'] = archive(fixture / 'android', Path('/out/generated-android.tar'), 64 * 1024 * 1024)
    receipt['status'] = 'fresh-node24-npm-cache-and-generated-native-fixture'
    receipt['finishedAt'] = time.time()
    Path('/out/npm-job.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt), flush=True)

if __name__ == '__main__':
    main()
