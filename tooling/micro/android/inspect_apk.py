#!/usr/bin/env python3
"""Inspect one read-only APK inside the admitted toolchain container.

Run only behind the supervisor's process, filesystem and output budgets. This
reports identity and bundle facts; source, security and device acceptance are
separate gates. It never installs, extracts or executes application code.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import zipfile

SDK = Path('/opt/android-sdk/build-tools/36.0.0')
APK_BYTES = 512 * 1024 * 1024
EXPANDED_BYTES = 1024 * 1024 * 1024
BUNDLE_BYTES = 64 * 1024 * 1024
ENTRY_COUNT = 30_000
PACKAGE = r'[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+'
HEX = r'[0-9a-f]{64}'


def digest(path: Path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        while chunk := source.read(1024 * 1024): value.update(chunk)
    return value.hexdigest()


def bundle_info(path: Path):
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if not 1 <= len(entries) <= ENTRY_COUNT:
            raise ValueError('APK entry count exceeds policy')
        seen = set(); total = 0
        for entry in entries:
            name = PurePosixPath(entry.filename)
            mode = stat.S_IFMT(entry.external_attr >> 16)
            if name.is_absolute() or '..' in name.parts or not name.parts or '\\' in entry.filename or name.as_posix() in seen:
                raise ValueError('APK has unsafe or duplicate entry paths')
            if mode not in (0, stat.S_IFREG, stat.S_IFDIR) or entry.flag_bits & 1 or entry.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                raise ValueError('APK has links, encryption or unsupported compression')
            seen.add(name.as_posix()); total += entry.file_size
            if total > EXPANDED_BYTES:
                raise ValueError('Expanded APK exceeds policy')
        if 'assets/index.android.bundle' not in seen:
            raise ValueError('Standalone Android bundle is missing')
        info = archive.getinfo('assets/index.android.bundle')
        if not 0 < info.file_size <= BUNDLE_BYTES:
            raise ValueError('Android bundle size exceeds policy')
        value = hashlib.sha256(); count = 0
        with archive.open(info) as source:
            while chunk := source.read(1024 * 1024):
                count += len(chunk)
                if count > BUNDLE_BYTES: raise ValueError('Android bundle expansion exceeded policy')
                value.update(chunk)
        if count != info.file_size:
            raise ValueError('Android bundle length mismatch')
        return {'sha256': value.hexdigest(), 'bytes': count, 'entryCount': len(entries),
                'declaredExpandedBytes': total}


def parse_badging(output: str):
    lines = output.splitlines()
    packages = [line for line in lines if line.startswith('package: ')]
    if len(packages) != 1:
        raise ValueError('APK must expose exactly one package')
    match = re.search(r"name='(" + PACKAGE + r")' versionCode='([0-9]{1,10})' versionName='([^'\r\n]{1,64})'", packages[0])
    if not match or int(match.group(2)) <= 0:
        raise ValueError('Invalid package or version metadata')
    versions = {}
    for field in ('sdkVersion', 'targetSdkVersion'):
        values = [line for line in lines if line.startswith(field + ':')]
        if len(values) != 1 or not re.fullmatch(field + r":'[0-9]{1,3}'", values[0]):
            raise ValueError('Missing or ambiguous SDK version')
        versions[field] = int(values[0].split("'")[1])
    permissions = []
    for line in lines:
        if line.startswith('uses-permission:') or line.startswith('uses-permission-sdk-23:'):
            value = re.search(r"name='([^'\r\n]{1,256})'", line)
            if not value: raise ValueError('Malformed permission metadata')
            permissions.append(value.group(1))
    abi_lines = [line for line in lines if line.startswith('native-code:')]
    if len(abi_lines) != 1: raise ValueError('Missing or ambiguous native ABI list')
    abis = re.findall(r"'([^']+)'", abi_lines[0])
    if not abis or len(set(abis)) != len(abis) or any(abi not in ('x86', 'x86_64', 'armeabi-v7a', 'arm64-v8a') for abi in abis):
        raise ValueError('Unsupported native ABI')
    return {'package': match.group(1), 'versionCode': int(match.group(2)), 'versionName': match.group(3),
            'minSdk': versions['sdkVersion'], 'targetSdk': versions['targetSdkVersion'],
            'debuggable': 'application-debuggable' in lines,
            'permissions': sorted(set(permissions)), 'abis': sorted(abis)}


def parse_signature(output: str):
    certificates = re.findall(r'^Signer #[0-9]+ certificate SHA-256 digest: (' + HEX + r')$', output, flags=re.MULTILINE)
    if len(certificates) != 1:
        raise ValueError('Exactly one verified current signing certificate is required')
    return certificates[0]


def run_tool(command):
    result = subprocess.run(command, capture_output=True, timeout=30)
    if len(result.stdout) > 128 * 1024 or len(result.stderr) > 128 * 1024:
        raise ValueError('Artifact tool output exceeded policy')
    if result.returncode:
        raise ValueError('Artifact tool failed: ' + result.stderr.decode(errors='replace')[:1000])
    return result.stdout.decode('utf-8')


def inspect(path: Path):
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= APK_BYTES:
        raise ValueError('APK must be a bounded regular file')
    before = digest(path)
    bundle = bundle_info(path)
    metadata = parse_badging(run_tool([str(SDK/'aapt'), 'dump', 'badging', str(path)]))
    certificate = parse_signature(run_tool([str(SDK/'apksigner'), 'verify', '--verbose', '--print-certs', str(path)]))
    if before != digest(path): raise ValueError('APK bytes changed during inspection')
    return {'schema': 'micro.android.apk-inspection/1', 'status': 'inspected',
            'apkSha256': before, 'apkBytes': path.stat().st_size, 'bundle': bundle,
            'metadata': metadata, 'certificateSha256': certificate,
            'toolSha256': {name: digest(SDK/name) for name in ('aapt', 'apksigner')},
            'scope': 'artifact identity only; no source, vulnerability, installation or product verdict'}


def main():
    try:
        if len(sys.argv) != 1: raise ValueError('Inspector accepts no candidate-selected arguments')
        print(json.dumps(inspect(Path('/input/app.apk')), sort_keys=True))
        return 0
    except Exception as error:
        print(json.dumps({'schema': 'micro.android.apk-inspection/1', 'status': 'failed',
                          'error': {'type': type(error).__name__, 'message': str(error)[:1200]}}))
        return 1


if __name__ == '__main__': raise SystemExit(main())
