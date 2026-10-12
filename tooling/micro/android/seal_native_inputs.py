#!/usr/bin/env python3
"""Seal fresh trusted npm acquisition; reusable safe archive checks from controller."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil

BUILDER = Path('/home/quorky/apps/lifeos/.scratch/software-factory-benchmark/run-20260930/controller/android-builder')

def file_hash(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        while chunk := f.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--attempt', type=Path, required=True)
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    if args.destination.exists() or args.destination.is_symlink():
        raise ValueError('Fresh seal destination required')
    acquisition = json.loads((args.attempt / 'receipts/npm-acquisition.json').read_text())
    job = json.loads((args.attempt / 'output/npm-job.json').read_text())
    if acquisition['status'] != 'npm-acquisition-network-proved-native-pending' or acquisition['cleanupFailures'] or job['status'] != 'fresh-node24-npm-cache-and-generated-native-fixture':
        raise ValueError('Acquisition was not successful and clean')
    spec = importlib.util.spec_from_file_location('protected_archive_admission', BUILDER / 'admit.py')
    safe = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(safe)
    args.destination.mkdir()
    receipt = {'scope': 'fresh-npm-and-native-template-only-native-closure-pending', 'image': job['image'], 'sourceLockSha256': job['lockSha256'], 'sourceReceiptSha256': file_hash(args.attempt / 'receipts/npm-acquisition.json'), 'archiveAdmissionSourceSha256': file_hash(BUILDER / 'admit.py'), 'components': {}}
    for name, key, bound in (('npm-cache', 'npmCache', 1024**3), ('generated-android', 'generatedNative', 64 * 1024**2)):
        archive = args.attempt / 'output' / (name + '.tar')
        if archive.is_symlink() or archive.stat().st_size != job[key]['bytes'] or file_hash(archive) != job[key]['sha256']:
            raise ValueError('Acquired archive identity mismatch')
        target = args.destination / name
        extraction = safe.safe_extract(archive, target, 'tar', 'flat', max_bytes=bound, max_files=50000, max_single=256 * 1024**2)
        for p in target.rglob('*'):
            if not p.is_symlink():
                p.chmod(0o555 if p.is_dir() or p.stat().st_mode & 0o111 else 0o444)
        target.chmod(0o555)
        tree = safe.tree_manifest(target)
        serialized = json.dumps(tree, sort_keys=True, separators=(',', ':')).encode()
        (args.destination / (name + '-manifest.json')).write_bytes(serialized + b'\n')
        receipt['components'][name] = {'archiveSha256': job[key]['sha256'], 'canonicalTreeSha256': hashlib.sha256(serialized).hexdigest(), 'extraction': extraction}
    events = [json.loads(line) for line in (args.attempt / 'proxy-cache/events.jsonl').read_text().splitlines()]
    acquired = [e for e in events if e['action'] == 'npm-artifact-acquired']
    for event in acquired:
        p = args.attempt / 'proxy-cache' / event['file']
        if p.is_symlink() or p.stat().st_size != event['bytes'] or file_hash(p) != event['sha256']:
            raise ValueError('Locked tarball seal check failed')
    (args.destination / 'npm-tarball-manifest.json').write_text(json.dumps(acquired, sort_keys=True, indent=2) + '\n')
    receipt['npmTarballs'] = {'count': len(acquired), 'bytes': sum(e['bytes'] for e in acquired), 'manifestSha256': file_hash(args.destination / 'npm-tarball-manifest.json')}
    receipt['status'] = 'sealed-npm-and-native-template-only'
    (args.destination / 'seal.json').write_text(json.dumps(receipt, indent=2) + '\n')
    for p in args.destination.iterdir():
        if p.is_file():
            p.chmod(0o444)
    args.destination.chmod(0o555)
    print(json.dumps(receipt, sort_keys=True))

if __name__ == '__main__':
    main()
