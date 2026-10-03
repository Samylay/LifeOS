#!/usr/bin/env python3
"""Sign only the synthetic fixture, using the exact public Expo test key.

Run inside the fixed supervisor sandbox. This key is public and confers no
production identity. No candidate arguments or uploaded signing inputs exist.
"""
import json
from pathlib import Path
import sys

from inspect_apk import SDK, APK_BYTES, bundle_info, digest, inspect, parse_badging, run_tool

KEY_SHA256 = '221e0a3106aa4c3ccc154e0a418b55020b3f9ea6e84f92e8749cd9e2f39f5e58'


def main():
    try:
        if len(sys.argv) != 1: raise ValueError('Fixture signer accepts no arguments')
        source = Path('/input/app.apk'); key = Path('/input/debug.keystore')
        if source.is_symlink() or not source.is_file() or not 0 < source.stat().st_size <= APK_BYTES:
            raise ValueError('Invalid unsigned fixture APK')
        if key.is_symlink() or key.stat().st_size != 2257 or digest(key) != KEY_SHA256:
            raise ValueError('Unadmitted public fixture signing input')
        before = digest(source); bundle_info(source)
        metadata = parse_badging(run_tool([str(SDK/'aapt'), 'dump', 'badging', str(source)]))
        if (metadata['package'] != 'app.micro.factory.fixture' or metadata['versionCode'] != 1
                or metadata['versionName'] != '1.0.0' or metadata['minSdk'] != 24
                or metadata['targetSdk'] != 36 or metadata['debuggable']
                or metadata['abis'] != ['x86_64']
                or metadata['permissions'] != ['app.micro.factory.fixture.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']):
            raise ValueError('Unsigned artifact differs from reviewed fixture policy')
        aligned = Path('/output/aligned.apk'); signed = Path('/output/app.apk')
        if any(Path('/output').iterdir()): raise ValueError('Signing output is not empty')
        run_tool([str(SDK/'zipalign'), '-P', '16', '-f', '4', str(source), str(aligned)])
        run_tool([str(SDK/'apksigner'), 'sign', '--ks', str(key), '--ks-key-alias', 'androiddebugkey',
                  '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', str(signed), str(aligned)])
        run_tool([str(SDK/'zipalign'), '-c', '-P', '16', '4', str(signed)])
        result = inspect(signed)
        if digest(source) != before or digest(key) != KEY_SHA256:
            raise ValueError('Fixture signing input changed')
        if result['metadata'] != metadata: raise ValueError('Signing changed artifact metadata')
        aligned.unlink()
        print(json.dumps({'schema': 'micro.fixture-signing-worker/1', 'status': 'signed',
                          'unsignedApkSha256': before, 'publicKeySha256': KEY_SHA256,
                          'inspection': result, 'toolSha256': {name: digest(SDK/name) for name in ('zipalign', 'apksigner', 'aapt')},
                          'scope': 'public synthetic test key only; no production signing authority'}, sort_keys=True))
        return 0
    except Exception as error:
        print(json.dumps({'schema': 'micro.fixture-signing-worker/1', 'status': 'failed',
                          'error': {'type': type(error).__name__, 'message': str(error)[:1000]}}))
        return 1


if __name__ == '__main__': raise SystemExit(main())
