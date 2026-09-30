#!/usr/bin/env python3
"""Seal a completed mediated trusted fixture task closure, never warmed task outputs."""
import argparse
import hashlib
import importlib.util
import json
import re
from pathlib import Path
import shutil
import tarfile

from native_acquire import DEFAULT_STATE, IMAGE
from native_seal_destination import destination_store, seal_headroom, stage_bytes

def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as source:
        while data := source.read(256 * 1024): h.update(data)
    return h.hexdigest()

def contained(path):
    path = Path(path)
    if path.is_symlink() or not path.resolve().is_relative_to(DEFAULT_STATE):
        raise ValueError('Input/seal must stay in owned native state')
    return path

def readonly(root):
    for p in root.rglob('*'):
        if p.is_symlink() or not (p.is_file() or p.is_dir()): raise ValueError('Native seal link/special input forbidden')
        p.chmod(0o555 if p.is_dir() or p.stat().st_mode & 0o111 else 0o444)
    root.chmod(0o555)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--attempt', type=Path, required=True)
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    attempt = contained(args.attempt)
    destination, integration_store = destination_store(args.destination)
    supervisor = json.loads((attempt / 'receipts/maven-acquisition.json').read_text())
    job = json.loads((attempt / 'output/native-job.json').read_text())
    if supervisor['status'] != 'native-acquisition-task-closure-complete-offline-proof-pending' or supervisor['cleanupFailures'] or supervisor['image'] != IMAGE or job['status'] != 'trusted-fixture-native-task-closure-acquired' or job['offline']:
        raise ValueError('Native task closure not successful and scoped-clean')
    apk = attempt / 'output/fixture-release-unsigned.apk'
    if apk.stat().st_size != job['apk']['bytes'] or digest(apk) != job['apk']['sha256']:
        raise ValueError('Acquisition APK identity mismatch')
    archive = attempt / 'output/gradle-dependency-caches.tar'
    identity = job['gradleDependencyCache']
    if archive.stat().st_size != identity['bytes'] or archive.stat().st_size > 4 * 1024**3 or digest(archive) != identity['sha256']:
        raise ValueError('Native dependency archive identity/bound mismatch')
    with tarfile.open(archive) as source:
        entries = source.getmembers()
        if any(not (m.isdir() or m.isfile()) or Path(m.name).parts[0] != 'modules-2' or m.name.endswith('.lock') or Path(m.name).name == 'gc.properties' for m in entries):
            raise ValueError('Native seed contains nondependency outputs/links/locks')
        expanded = sum(m.size for m in entries)
        # ext4 block rounding and directory entries count against physical ceiling.
        expanded_allocated = sum(((m.size + 4095) // 4096) * 4096 if m.isfile() else 4096 for m in entries)
    copied = sum(p.stat().st_size for p in (attempt / 'protected/fixture').rglob('*') if p.is_file())
    copied += sum(p.stat().st_size for p in (attempt / 'output/graph').glob('*.json'))
    copied += (attempt / 'proxy-cache/events.jsonl').stat().st_size * 4
    copied += (attempt / 'output/verification-metadata.xml').stat().st_size
    storage_admission = seal_headroom(integration_store, max(expanded, expanded_allocated), copied)
    spec = importlib.util.spec_from_file_location('protected_archive_admission', DEFAULT_STATE.parent / 'android-builder/admit.py')
    safe = importlib.util.module_from_spec(spec); spec.loader.exec_module(safe)
    if (attempt/'proxy-cache/events.jsonl').stat().st_size > 20*1024**2: raise ValueError('Maven event log exceeds20MiB')
    if (attempt/'proxy-cache/seed-integrity-failure.json').exists(): raise ValueError('Public seed integrity failure marker retained')
    events = [json.loads(line) for line in (attempt / 'proxy-cache/events.jsonl').read_text().splitlines()]
    from verified_maven_seed import verify_reuse_events
    reuse_responses = verify_reuse_events(events)
    artifact_events = [e for e in events if e['action'] in ('artifact-acquired','artifact-reused')]
    seed = None
    if any(e['action']=='artifact-reused' for e in artifact_events):
        from verified_maven_seed import admitted_host_seed,resolve_reused_body,MANIFEST_SHA256
        protected_seed = attempt/'protected/tools/verified-maven-seed.json'
        if digest(protected_seed) != MANIFEST_SHA256: raise ValueError('Protected public seed manifest changed')
        seed = admitted_host_seed()
        if supervisor.get('publicMavenSeedBefore') != seed.verify_all() or supervisor.get('publicMavenSeedAfter') != seed.verify_all():
            raise ValueError('Public Maven seed pre/post observations missing or changed')
    acquired,unique = [],{}
    for e in artifact_events:
        if e['action']=='artifact-reused':
            if seed is None: raise ValueError('Public Maven seed missing')
            blob = resolve_reused_body(seed,e)
        else:
            if not isinstance(e['file'],str) or re.fullmatch(r'[0-9a-f]{32}\.blob',e['file']) is None:
                raise ValueError('Fresh public Maven body reference invalid')
            blob = attempt/'proxy-cache'/e['file']
        # Fresh bodies stay in the new cache; reused bodies resolve only through
        # the fixed digest-pinned source manifest, never a caller supplied path.
        body_root = seed.root if e['action']=='artifact-reused' else attempt/'proxy-cache'
        if blob.is_symlink() or not blob.resolve().is_relative_to(body_root) or blob.stat().st_size != e['bytes'] or digest(blob) != e['sha256']:
            raise ValueError('Maven acquisition receipt/body mismatch')
        if e.get('redirectPathSha256') and e['redirectPathSha256'] != e['sha256']:
            raise ValueError('Publisher CDN content hash mismatch')
        if e.get('publisherSha256') and e['publisherSha256'] != e['sha256']:
            raise ValueError('Frozen published artifact checksum mismatch')
        artifact_identity = (e['sha256'],e['bytes'],e.get('seedManifestSha256'),e.get('seedFile'),e['file'])
        if e['url'] in unique:
            if unique[e['url']] != artifact_identity: raise ValueError('Conflicting public artifact use observations')
        else:
            unique[e['url']] = artifact_identity
            acquired.append(e)
    if (seed.input_bytes if seed is not None else 0)+sum(e['bytes'] for e in acquired if e['action']=='artifact-acquired') > 4*1024**3:
        raise ValueError('Full public seed plus acquired body budget exceeds4GiB')
    if seed is not None: seed.verify_all()
    if not destination.parent.exists(): destination.parent.mkdir(mode=0o700)
    destination.mkdir(mode=0o700)
    try:
        extraction = safe.safe_extract(archive, destination / 'gradle-caches', 'tar', 'flat', max_bytes=4 * 1024**3, max_files=100000, max_single=256 * 1024**2)
        readonly(destination / 'gradle-caches')
        manifest = safe.tree_manifest(destination / 'gradle-caches')
        data = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
        (destination / 'gradle-caches-manifest.json').write_bytes(data + b'\n')
        meta = attempt / 'output/verification-metadata.xml'
        if digest(meta) != job['verificationMetadataSha256']: raise ValueError('Verification metadata changed')
        shutil.copyfile(meta, destination / 'verification-metadata.xml')
        shutil.copytree(attempt / 'protected/fixture', destination / 'fixture')
        shutil.copyfile(attempt / 'protected/patch-preimages.json', destination / 'patch-preimages.json')
        shutil.copyfile(attempt/'proxy-cache/events.jsonl',destination/'maven-use-events.jsonl')
        if seed is not None: shutil.copyfile(attempt/'protected/tools/verified-maven-seed.json',destination/'public-maven-seed-manifest.json')
        (destination / 'maven-artifact-manifest.json').write_text(json.dumps(acquired, sort_keys=True, indent=2) + '\n')
        graphs = [json.loads(p.read_text()) for p in sorted((attempt / 'output/graph').glob('*.json'))]
        (destination / 'resolved-task-graph.json').write_text(json.dumps(graphs, sort_keys=True, indent=2) + '\n')
        union = {}
        for graph in graphs:
            scope = {name: graph[name] for name in ('build', 'project', 'scope', 'configuration')}
            for component in graph['components']:
                key = (component['group'], component['module'], component['version'])
                entry = union.setdefault(key, {**component, 'scopes': []})
                if scope not in entry['scopes']: entry['scopes'].append(scope)
        coordinates = [union[key] for key in sorted(union)]
        (destination / 'resolved-coordinate-union.json').write_text(json.dumps(coordinates, sort_keys=True, indent=2) + '\n')
        authority = attempt / 'output/publisher-checks.json'
        if authority.exists(): shutil.copyfile(authority, destination / 'publisher-checks.json')
        result = {'status': 'sealed-native-task-closure-offline-proof-pending', 'image': IMAGE, 'sourceReceiptSha256': digest(attempt / 'receipts/maven-acquisition.json'), 'sourceJobSha256': digest(attempt / 'output/native-job.json'), 'npmSealSha256': supervisor['npmSeedSealSha256'], 'verificationMetadataSha256': digest(meta), 'components': {'gradle-caches': {'canonicalTreeSha256': hashlib.sha256(data).hexdigest(), 'archiveSha256': identity['sha256'], 'extraction': extraction}}, 'protectedToolSha256': {p.name: digest(p) for p in (attempt / 'protected/tools').iterdir() if p.is_file()}, 'mavenManifestSha256': digest(destination / 'maven-artifact-manifest.json'), 'resolvedGraphSha256': digest(destination / 'resolved-task-graph.json'), 'mavenArtifacts': len(acquired), 'artifactUseObservations':len(artifact_events), 'reuseResponses':reuse_responses, 'rawMavenUseEventsSha256':digest(destination/'maven-use-events.jsonl'), 'publicMavenSeedManifestSha256':seed.manifest_sha256 if seed is not None else None, 'mavenDownloadedBytes': sum(e['bytes'] for e in acquired), 'graphs': len(graphs), 'resolvedCoordinates': len(coordinates), 'resolvedCoordinateUnionSha256': digest(destination / 'resolved-coordinate-union.json'), 'authenticity': 'HTTPS acquisition plus independently checked official CDN embedded hashes where present; Gradle SHA256 verification is TOFU unless separately published checks verified. No publisher signing keys admitted.', 'taskOutputsSeeded': False, 'acquisitionApkSha256': job['apk']['sha256'], 'offlineProof': 'pending'}
        (destination / 'seal.json').write_text(json.dumps(result, indent=2) + '\n')
        storage_admission['integrationAfter'] = integration_store.budget()
        storage_admission['retainedAcquisitionAfter'] = stage_bytes(DEFAULT_STATE)
        storage_admission['acquisitionBytesMovedOrDeleted'] = False
        (destination / 'storage-admission.json').write_text(json.dumps(storage_admission, indent=2) + '\n')
        readonly(destination)
        print(json.dumps(result, sort_keys=True))
    except Exception as error:
        (destination / 'first-seal-failure.json').write_text(json.dumps({'error': str(error)}) + '\n')
        raise

if __name__ == '__main__': main()
