#!/usr/bin/env python3
"""Trusted variant closure acquisition or one fresh strict offline calibration."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

from npm_fixture_job import archive
from native_failure_diagnostics import collect as collect_failure_diagnostics
from locked_local_maven import verify_all
from trusted_vendor_adapter import apply as apply_vendor_adapter, verify_after as verify_vendor_adapter

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
        if args.offline:
            shutil.copyfile('/seed/verification-metadata.xml', fixture / 'android/gradle/verification-metadata.xml')
        argv = ['/opt/gradle/bin/gradle', '-p', 'android', '--no-daemon', '--max-workers=1', '--no-build-cache', '--no-configuration-cache', '--console=plain', '--stacktrace', '--info', '--init-script=/seed/tools/trusted_repositories.init.gradle']
        if args.offline:
            argv += ['--offline', '--dependency-verification=strict']
        argv += ['app:assembleRelease']
        run(argv)
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
