#!/usr/bin/env python3
"""Apply only the frozen controller-reviewed public vendor Gradle adapter."""
import hashlib
import json
from pathlib import Path, PurePosixPath

MANIFEST_SHA256 = '4e92e169011618caca972e97f4e56483450df97aaadc73e07dd41d7444b1e6ce'

def manifest(path):
    data = Path(path).read_bytes()
    if hashlib.sha256(data).hexdigest() != MANIFEST_SHA256: raise ValueError('Unreviewed vendor adapter manifest')
    return json.loads(data)

def safe_path(root, name):
    relative = PurePosixPath(name)
    if relative.is_absolute() or '..' in relative.parts or not name.startswith('node_modules/'):
        raise ValueError('Vendor adapter path escape')
    root = Path(root).resolve(strict=True)
    path = root.joinpath(*relative.parts)
    parent = path
    while parent != root:
        if parent.is_symlink(): raise ValueError('Vendor adapter input/ancestor link')
        parent = parent.parent
    if not path.is_file() or not path.resolve(strict=True).is_relative_to(root): raise ValueError('Vendor adapter input escaped/absent')
    return path

def apply(root, manifest_path):
    patches = []
    document = manifest(manifest_path)
    prepared = []
    for item in document['files']:
        path = safe_path(root, item['path']); data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != item['beforeSha256']: raise ValueError('Vendor adapter preimage changed or already patched')
        text = data.decode('utf-8')
        for edit in item['edits']:
            if text.count(edit['before']) != 1: raise ValueError('Vendor adapter fragment is not unique')
            text = text.replace(edit['before'], edit['after'])
        result = text.encode('utf-8')
        if hashlib.sha256(result).hexdigest() != item['afterSha256']: raise ValueError('Vendor adapter postimage mismatch')
        prepared.append((path, result, item))
    # Preflight every file before mutating any worker-private copy.
    for path, data, item in prepared:
        path.write_bytes(data)
        patches.append({'path': item['path'], 'beforeSha256': item['beforeSha256'], 'afterSha256': item['afterSha256'], 'npmUrl': item['npmUrl'], 'npmIntegrity': item['npmIntegrity'], 'npmTarballSha256': item['npmTarballSha256'], 'edits': len(item['edits'])})
    return {'manifestSha256': MANIFEST_SHA256, 'files': patches}

def verify_after(root, manifest_path):
    for item in manifest(manifest_path)['files']:
        if hashlib.sha256(safe_path(root, item['path']).read_bytes()).hexdigest() != item['afterSha256']:
            raise ValueError('Patched vendor source bytes changed after build')
    return {'manifestSha256': MANIFEST_SHA256, 'verifiedFiles': len(manifest(manifest_path)['files'])}
