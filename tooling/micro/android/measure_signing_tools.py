"""Proposal worker: hash three fixed public SDK tools, no caller inputs."""
import hashlib
import json
import os
from pathlib import Path
import stat
import sys

ROOT = Path('/opt/android-sdk/build-tools/36.0.0')
NAMES = ('aapt', 'apksigner', 'zipalign')
LIMIT = 64 * 1024**2


def measure():
    if len(sys.argv) != 1:
        raise ValueError('Fixed measurement accepts no arguments')
    result = {}
    for name in NAMES:
        path = ROOT / name
        for parent in (path, *path.parents):
            if parent.is_symlink():
                raise ValueError('Measured tool path is linked')
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            before = os.fstat(fd)
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not 0 < before.st_size <= LIMIT:
                raise ValueError('Measured tool is not bounded regular bytes')
            count = 0; digest = hashlib.sha256()
            while chunk := os.read(fd, min(1024**2, LIMIT-count+1)):
                count += len(chunk)
                if count > LIMIT:
                    raise ValueError('Measured tool grew beyond bound')
                digest.update(chunk)
            after = os.fstat(fd)
            identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
            if identity(before) != identity(after) or identity(after) != identity(path.lstat()) or count != after.st_size:
                raise ValueError('Measured tool changed during read')
            result[name] = {'path': str(path), 'sha256': digest.hexdigest(), 'bytes': count}
        finally:
            os.close(fd)
    return {'schema': 'micro.fixture-signing-tool-worker/1', 'tools': result,
            'scope': 'three fixed public SDK tools only'}


if __name__ == '__main__':
    try:
        print(json.dumps(measure(), sort_keys=True))
    except Exception as error:
        print(json.dumps({'schema': 'micro.fixture-signing-tool-worker-failure/1',
                          'error': {'type': type(error).__name__, 'reason': str(error)[:800]}}))
        sys.exit(1)
