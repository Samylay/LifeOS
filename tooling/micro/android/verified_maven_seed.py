#!/usr/bin/env python3
"""Read-only public bodies from one exact failed acquisition, never native outputs.

The caller must bind the reviewed manifest identity and exact source directory.
All bodies are counted as admitted inputs, even when a request never uses them.
"""
import hashlib
import json
from pathlib import Path
import re
import stat

MAX_BLOB_BYTES = 256 * 1024**2
MAX_INPUT_BYTES = 4 * 1024**3
STATE = Path('/home/quorky/apps/lifeos/.scratch/software-factory-benchmark/run-20260930/controller/native-acquisition')
SOURCE_ROOT = STATE/'maven-attempt10/proxy-cache'
SOURCE_RECEIPT = STATE/'maven-attempt10/receipts/maven-acquisition.json'
MANIFEST = STATE/'readonly-maven-seed-proposal/verified-maven-seed.json'
MANIFEST_SHA256 = '1f3f0bfbb2c0b9275ba736deea1b71654e6f9909057f3f4de519e6916d9e0140'


def file_sha256(path):
    with Path(path).open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def regular(path):
    path = Path(path)
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise ValueError('Maven seed link/ancestor alias forbidden')
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError('Maven seed special/hardlinked file forbidden')
    return info


class VerifiedMavenSeed:
    def __init__(self, root, manifest, manifest_sha256, path_url, check_upstream, pins):
        self.root, self.manifest = Path(root), Path(manifest)
        if any(p.is_symlink() for p in (self.root, *self.root.parents)) or not self.root.is_dir():
            raise ValueError('Maven seed root is not a plain directory')
        if regular(self.manifest).st_size > 8*1024**2: raise ValueError('Maven seed manifest bound exceeded')
        if not re.fullmatch('[0-9a-f]{64}', manifest_sha256) or file_sha256(self.manifest) != manifest_sha256:
            raise ValueError('Maven seed manifest changed')
        self.manifest_sha256 = manifest_sha256
        self.path_url, self.check_upstream, self.pins = path_url, check_upstream, pins
        value = json.loads(self.manifest.read_bytes())
        if value['schema'] != 'verified-public-maven-seed/1' or value['source']['attempt'] != 'maven-attempt10':
            raise ValueError('Unreviewed Maven seed source/schema')
        if value['source']['nativeStatus'] != 'first-native-failure-retained' or value['nativeReadiness'] is not False:
            raise ValueError('Maven seed cannot confer native readiness')
        self.value = value
        if type(value['artifacts']) is not list or len(value['artifacts']) > 20000:
            raise ValueError('Maven seed artifact count bound exceeded')
        if sum(e['bytes'] for e in value['artifacts']) > MAX_INPUT_BYTES:
            raise ValueError('Maven seed admitted input bound exceeded')
        self.items = {}
        files = set()
        lines = []
        events = self.root/'events.jsonl'
        if regular(events).st_size > 20*1024**2: raise ValueError('Maven seed event bound exceeded')
        if file_sha256(events) != value['source']['eventsSha256']:
            raise ValueError('Maven seed source events changed')
        for line in events.read_text().splitlines():
            event = json.loads(line)
            if event['action'] == 'artifact-acquired': lines.append(event)
        if lines != value['artifacts']:
            raise ValueError('Maven seed receipts are not exact acquired source events')
        for entry in value['artifacts']:
            url, name = entry['url'], entry['file']
            if url in self.items or name in files:
                raise ValueError('Duplicate/aliased Maven seed URL or file')
            if not re.fullmatch(r'[0-9a-f]{32}\.blob', name):
                raise ValueError('Maven seed traversal/non-body reference')
            files.add(name)
            self.items[url] = entry
            self.verify_entry(entry)
        if {p.name for p in self.root.iterdir()} != files | {'events.jsonl'}:
            raise ValueError('Maven seed source inventory changed')
        self.input_bytes = sum(e['bytes'] for e in self.items.values())
        if (value['artifactCount'] != len(self.items) or value['artifactBytes'] != self.input_bytes
                or self.input_bytes > MAX_INPUT_BYTES):
            raise ValueError('Maven seed inventory/input budget mismatch')

    def verify_entry(self, entry):
        url = entry['url']
        prefixes = {'https://dl.google.com/dl/android/maven2/':'google',
                    'https://repo.maven.apache.org/maven2/':'central',
                    'https://plugins.gradle.org/m2/':'plugins'}
        origin = next((x for x in prefixes if url.startswith(x)), None)
        if origin is None: raise ValueError('Unadmitted Maven seed URL')
        artifact = url[len(origin):]
        if self.path_url('/'+prefixes[origin]+'/'+artifact) != url:
            raise ValueError('Maven seed logical URL mismatch')
        expected = self.check_upstream(url, artifact)
        for redirect in entry['redirects']:
            if type(redirect['status']) is not int or redirect['status'] not in (301,302,303,307,308):
                raise ValueError('Unadmitted Maven seed redirect status')
            observed = self.check_upstream(redirect['url'], artifact, url)
            if observed:
                if expected and observed != expected: raise ValueError('Maven seed redirect hash changed')
                expected = observed
        final = self.check_upstream(entry['finalUrl'], artifact, url)
        if final:
            if expected and expected != final: raise ValueError('Maven seed final hash changed')
            expected = final
        if (entry['redirects'] and entry['redirects'][-1]['url'] != entry['finalUrl']) or (not entry['redirects'] and entry['finalUrl'] != url):
            raise ValueError('Maven seed final URL is not its recorded redirect')
        if expected != entry.get('redirectPathSha256') and not self.pins.get(artifact):
            raise ValueError('Maven seed CDN receipt hash mismatch')
        if entry.get('publisherSha256') is not None and entry['publisherSha256'] != self.pins.get(artifact):
            raise ValueError('Maven seed publisher pin changed')
        if type(entry['bytes']) is not int or not 0 < entry['bytes'] <= MAX_BLOB_BYTES:
            raise ValueError('Maven seed artifact size exceeds policy')
        if not re.fullmatch('[0-9a-f]{64}', entry['sha256']): raise ValueError('Maven seed body hash invalid')
        if expected and expected != entry['sha256']: raise ValueError('Maven seed CDN/publisher body hash mismatch')
        publisher = self.pins.get(artifact)
        if publisher and publisher != entry['sha256']: raise ValueError('Maven seed independently pinned body mismatch')
        body = self.root/entry['file']
        info = regular(body)
        if info.st_size != entry['bytes'] or file_sha256(body) != entry['sha256']:
            raise ValueError('Maven seed body bytes changed')
        return body

    def lookup(self, url):
        entry = self.items.get(url)
        if entry is None: return None
        return self.verify_entry(entry), entry

    def verify_all(self):
        # Reconstructing checks source events, closed inventory and every body.
        fresh = type(self)(self.root,self.manifest,self.manifest_sha256,
                           self.path_url,self.check_upstream,self.pins)
        if fresh.value != self.value: raise ValueError('Maven seed changed after acquisition')
        return {'manifestSha256':self.manifest_sha256,'artifactCount':len(self.items),
                'artifactBytes':self.input_bytes,'nativeReadiness':False}


def admitted_host_seed():
    """Supervisor/sealer entrypoint with no caller-selected source or manifest."""
    from maven_proxy import path_url,check_upstream,REACT_NATIVE_ARTIFACTS
    regular(SOURCE_RECEIPT)
    seed=VerifiedMavenSeed(SOURCE_ROOT,MANIFEST,MANIFEST_SHA256,
                           path_url,check_upstream,REACT_NATIVE_ARTIFACTS)
    if file_sha256(SOURCE_RECEIPT) != seed.value['source']['sourceReceiptSha256']:
        raise ValueError('Fixed historical source receipt changed')
    source=json.loads(SOURCE_RECEIPT.read_bytes())
    if source['status']!='first-native-failure-retained' or source['cleanupFailures']:
        raise ValueError('Historical source failed/scoped-clean status changed')
    return seed


def resolve_reused_body(seed,receipt):
    """Sealer resolves only the fixed manifest, preserving original authority."""
    if receipt['seedManifestSha256'] != seed.manifest_sha256:
        raise ValueError('Unreviewed public Maven seed reference')
    original=seed.items.get(receipt['url'])
    if (original is None or receipt['sourceReceipt'] != original
            or receipt['seedFile'] != original['file'] or receipt['file'] is not None):
        raise ValueError('Public Maven reused source receipt/reference changed')
    for field in ('url','finalUrl','redirects','sha256','bytes','redirectPathSha256','authority'):
        if receipt[field] != original[field]:
            raise ValueError('Reused public body identity/authority laundering')
    prefix=next(p for p in ('https://dl.google.com/dl/android/maven2/',
        'https://repo.maven.apache.org/maven2/','https://plugins.gradle.org/m2/') if original['url'].startswith(p))
    pin=seed.pins.get(original['url'][len(prefix):])
    added=original.get('publisherSha256') is None and pin is not None
    if receipt['publisherSha256'] != pin or receipt['publisherPinAddedIndependently'] is not added:
        raise ValueError('Reused public publisher verification facts changed')
    return seed.verify_entry(original)


def verify_reuse_events(events):
    """Every fresh reuse must have exactly one correlated actual response proof."""
    pending,completed={},set()
    for event in events:
        action=event['action']
        if action=='artifact-reuse-failed':
            raise ValueError('Public Maven seed response failure retained')
        if action=='artifact-reused':
            use=event['useId']
            if not isinstance(use,str) or not re.fullmatch('[0-9a-f]{32}',use) or use in pending:
                raise ValueError('Public Maven reuse ID duplicate/invalid')
            if event['method'] not in ('GET','HEAD'):raise ValueError('Public Maven reuse method invalid')
            pending[use]=event
        elif action=='artifact-reuse-postchecked':
            use=event['useId'];original=pending.get(use)
            if original is None or use in completed:raise ValueError('Public Maven postcheck orphan/duplicate')
            for field in ('url','sha256','method','seedManifestSha256'):
                if event[field]!=original[field]:raise ValueError('Public Maven postcheck identity changed')
            if type(event['streamedBytes']) is not int:raise ValueError('Exact streamed byte count required')
            if original['method']=='GET':
                if (event['streamedBytes']!=original['bytes'] or event['streamedSha256']!=original['sha256']
                        or event['bodyProof']!='actual-stream-sha256'):
                    raise ValueError('Actual streamed public Maven GET body proof missing/mismatched')
            elif event['streamedBytes']!=0 or event['streamedSha256'] is not None or event['bodyProof']!='head-no-body':
                raise ValueError('HEAD cannot claim a streamed body proof')
            completed.add(use)
    if len(pending)>20000 or set(pending)!=completed:
        raise ValueError('Public Maven reuse response orphaned/unbounded')
    return {'reuseObservations':len(pending),'GET':sum(x['method']=='GET' for x in pending.values()),
            'HEAD':sum(x['method']=='HEAD' for x in pending.values()),'allResponsesPostchecked':True}
