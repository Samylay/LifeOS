#!/usr/bin/env python3
"""Verify exact reviewed npm-bundled repositories before deleting mutable metadata."""
import hashlib
import json
from pathlib import Path, PurePosixPath

MANIFEST_SHA256 = '3057f94e9f68195bd83191c20bd61e9f145b14bce4a9444c1d98b7b28cbc43ab'

def verify_repository(fixture, repository, remove_metadata=False, metadata_removed=False):
    fixture = Path(fixture).resolve(strict=True)
    relative = PurePosixPath(repository['root'])
    if relative.is_absolute() or '..' in relative.parts or not str(relative).startswith('node_modules/'):
        raise ValueError('Unreviewed local Maven root')
    root = fixture.joinpath(*relative.parts)
    current = root
    while current != fixture:
        if current.is_symlink(): raise ValueError('Local Maven ancestor link forbidden')
        current = current.parent
    if not root.resolve(strict=True).is_relative_to(fixture): raise ValueError('Local Maven root escape')
    expected = {item['path']: item for item in repository['files']}
    if metadata_removed:
        expected = {name: info for name, info in expected.items() if name not in repository['removeMetadata']}
    actual = {}
    for path in root.rglob('*'):
        if path.is_symlink() or not (path.is_file() or path.is_dir()): raise ValueError('Local Maven link/special file forbidden')
        if path.is_file(): actual[str(path.relative_to(root))] = path
    if set(actual) != set(expected): raise ValueError('Local Maven file inventory changed')
    for name, path in actual.items():
        info = expected[name]
        if path.stat().st_size != info['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest() != info['sha256']:
            raise ValueError('Local Maven bytes changed')
        if name.endswith(('.sha256', '.sha512')):
            base, algorithm = name.rsplit('.', 1)
            if base not in actual or path.read_text().strip() != hashlib.new(algorithm, actual[base].read_bytes()).hexdigest():
                raise ValueError('Local Maven published checksum mismatch')
    remove = set(repository['removeMetadata'])
    observed = {name for name in actual if PurePosixPath(name).name.startswith('maven-metadata.xml')}
    if (observed if metadata_removed else remove.symmetric_difference(observed)) or any(PurePosixPath(name).name not in {'maven-metadata.xml', 'maven-metadata.xml.md5', 'maven-metadata.xml.sha1', 'maven-metadata.xml.sha256', 'maven-metadata.xml.sha512'} for name in remove):
        raise ValueError('Unreviewed mutable metadata removal')
    if remove_metadata:
        for name in sorted(remove): actual[name].unlink()
    return {'root': str(root), 'verifiedFiles': len(actual), 'removedMetadata': sorted(remove) if remove_metadata else []}

def verify_all(fixture, manifest, remove_metadata=False, metadata_removed=False):
    data = Path(manifest).read_bytes()
    if hashlib.sha256(data).hexdigest() != MANIFEST_SHA256: raise ValueError('Local Maven manifest identity changed')
    document = json.loads(data)
    if document['sourceLockSha256'] != 'ae8bbc085fd039716dde9ba98c1039069b93455972f42659c8dccc5cb66fb282': raise ValueError('Local Maven lock mismatch')
    return [verify_repository(fixture, item, remove_metadata, metadata_removed) for item in document['repositories']]
