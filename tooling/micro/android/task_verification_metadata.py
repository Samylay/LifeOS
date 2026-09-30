"""Exact SHA256 verification XML for one independently sealed task cache.

Public rows remain TOFU unless their immutable use receipts bind a publisher hash.
No wildcard, ignored artifact, trusted-artifact or signature bypass is emitted.
"""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

from locked_local_maven import MANIFEST_SHA256

ROOTS = ('https://dl.google.com/dl/android/maven2/', 'https://dl.google.com/android/maven2/',
         'https://repo.maven.apache.org/maven2/', 'https://plugins.gradle.org/m2/')
LIMIT = 20 * 1024**2
EXTENSIONS = ('.pom', '.module', '.jar', '.aar', '.zip', '.xml')

def coordinate(parts):
    if len(parts) < 4 or any(not re.fullmatch(r'[A-Za-z0-9_.\-]+', x) or x in ('.','..') for x in parts):
        raise ValueError('Noncanonical Maven coordinate or filename')
    if any('.' in x for x in parts[:-3]):raise ValueError('Ambiguous dotted group path')
    group, module, version, name = '.'.join(parts[:-3]), *parts[-3:]
    if ('SNAPSHOT' in version.upper() or version.upper() in ('LATEST','RELEASE')) or not name.startswith(module+'-'+version) or not name.endswith(EXTENSIONS):
        raise ValueError('Mutable version or unreviewed artifact filename')
    # Version is exact; dotted extension boundaries cannot hide another version.
    suffix=name[len(module+'-'+version):]
    if not any(suffix==ext or (suffix.startswith('-') and suffix.endswith(ext) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.\-]*',suffix[1:-len(ext)])) for ext in EXTENSIONS):
        raise ValueError('Artifact version filename ambiguity')
    return group,module,version,name

def generate(cache_root, cache_manifest, artifact_events, local_manifest, output):
    root=Path(cache_root)
    local=Path(local_manifest).read_bytes()
    if hashlib.sha256(local).hexdigest()!=MANIFEST_SHA256: raise ValueError('Local Maven authority identity changed')
    document=json.loads(local)
    if document['sourceLockSha256']!='ae8bbc085fd039716dde9ba98c1039069b93455972f42659c8dccc5cb66fb282': raise ValueError('Local Maven source lock changed')
    authority={}
    def add(key, sha, size, provenance):
        if not re.fullmatch(r'[0-9a-f]{64}',sha) or not isinstance(size,int) or size<0: raise ValueError('Invalid artifact digest/size')
        prior=authority.setdefault(key,{'sha256':sha,'bytes':size,'authorities':[]})
        if prior['sha256']!=sha or prior['bytes']!=size: raise ValueError('Conflicting coordinate artifact authorities')
        if provenance not in prior['authorities']:prior['authorities'].append(provenance)
    for e in artifact_events:
        url=e['url'];prefix=next((p for p in ROOTS if url.startswith(p)),None)
        parsed=urlsplit(url)
        if not prefix or parsed.username or parsed.password or parsed.query or parsed.fragment or '%' in url or '\\' in url: raise ValueError('Unreviewed public artifact authority URL')
        suffix=url[len(prefix):]
        if suffix.endswith(('.sha256','.sha512','.sha1','.md5','.asc')):continue
        key=coordinate(suffix.split('/'))
        add(key,e['sha256'],e['bytes'],{'kind':'public-use-receipt','url':url,'action':e['action'],'useId':e.get('useId'),'sourceReceiptSha256':hashlib.sha256(json.dumps(e,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'publisherSha256':e.get('publisherSha256'),'redirectPathSha256':e.get('redirectPathSha256')})
    for repo in document['repositories']:
        for info in repo['files']:
            name=info['path']
            if name in repo['removeMetadata'] or name.endswith(('.sha256','.sha512','.sha1','.md5')):continue
            key=coordinate(name.split('/'))
            add(key,info['sha256'],info['bytes'],{'kind':'exact-locked-npm-local-maven','manifestSha256':MANIFEST_SHA256,'root':repo['root'],'path':name,'npmIntegrity':repo['npmIntegrity'],'npmUrl':repo['npmUrl'],'npmTarballSha256':repo['npmTarballSha256']})
    rows={};seen_paths=set()
    for info in cache_manifest['entries']:
        name=info['path'];parts=PurePosixPath(name).parts
        if name in seen_paths or str(PurePosixPath(name))!=name or name.startswith('/') or '..' in parts:raise ValueError('Duplicate/unsafe dependency cache path')
        seen_paths.add(name)
        if info['type']=='directory':continue
        if info['type']!='file':raise ValueError('Dependency cache links/special files forbidden')
        if parts[:2]!=('modules-2','files-2.1'):continue # Binary Gradle metadata is hashed in complete cache manifest.
        if len(parts)!=7 or not re.fullmatch(r'[0-9a-f]{40}',parts[5]):raise ValueError('Unknown Gradle artifact cache layout')
        key=coordinate([*parts[2].split('.'),parts[3],parts[4],parts[6]])
        path=root/name
        current=path
        while current!=root:
            if current.is_symlink():raise ValueError('Artifact cache ancestor link')
            current=current.parent
        if not path.resolve(strict=True).is_relative_to(root.resolve(strict=True)):raise ValueError('Artifact cache escape')
        h=hashlib.sha256();sha1=hashlib.sha1();size=0
        with path.open('rb') as source:
            while chunk:=source.read(256*1024):h.update(chunk);sha1.update(chunk);size+=len(chunk)
        expected=authority.get(key)
        if expected is None or size!=info['size'] or h.hexdigest()!=info['sha256'] or h.hexdigest()!=expected['sha256'] or size!=expected['bytes'] or sha1.hexdigest()!=parts[5]:raise ValueError('Artifact cache lacks matching independent authority/hash/path')
        row=rows.setdefault(key,{**expected,'cachePaths':[]})
        row['cachePaths'].append(name)
    if not rows:raise ValueError('No task-cache artifact rows')
    # Task-use metadata may be represented only by Gradle binary descriptors.
    # Preserve exact observed POM/module identities as strict checksum rows too.
    for key, value in authority.items():
        if key[3].endswith(('.pom','.module')) and any(a['kind']=='public-use-receipt' for a in value['authorities']):rows.setdefault(key,{**value,'cachePaths':[]})
    # Include all exact56 locked npm local Maven artifacts. They need not occur in
    # modules-2 because Gradle can consume file repositories directly.
    for key, value in authority.items():
        if any(a['kind']=='exact-locked-npm-local-maven' for a in value['authorities']):rows.setdefault(key,{**value,'cachePaths':[]})
    ns='https://schema.gradle.org/dependency-verification';ET.register_namespace('',ns)
    top=ET.Element('{'+ns+'}verification-metadata',{'{http://www.w3.org/2001/XMLSchema-instance}schemaLocation':ns+' https://schema.gradle.org/dependency-verification/dependency-verification-1.3.xsd'})
    conf=ET.SubElement(top,'configuration');ET.SubElement(conf,'verify-metadata').text='true';ET.SubElement(conf,'verify-signatures').text='false'
    components=ET.SubElement(top,'components');last=None;component=None
    evidence=[]
    for key,value in sorted(rows.items()):
        if key[:3]!=last:component=ET.SubElement(components,'component',dict(zip(('group','name','version'),key[:3])));last=key[:3]
        artifact=ET.SubElement(component,'artifact',{'name':key[3]});ET.SubElement(artifact,'sha256',{'value':value['sha256'],'origin':'Sealed trusted-fixture task input; authority receipt retained separately'})
        evidence.append({'group':key[0],'module':key[1],'version':key[2],'artifact':key[3],**value})
    ET.indent(top,space='   ');xml=ET.tostring(top,encoding='utf-8',xml_declaration=True)+b'\n'
    if len(xml)>LIMIT or len(json.dumps(evidence).encode())>LIMIT:raise ValueError('Verification metadata evidence exceeds20MiB')
    Path(output).write_bytes(xml)
    return {'schema':'task-cache-verification-metadata/1','scope':'one successful trusted fixture acquisition; final strict offline proof pending','generatorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'xmlSha256':hashlib.sha256(xml).hexdigest(),'xmlBytes':len(xml),'localMavenManifestSha256':MANIFEST_SHA256,'rows':evidence,'verifyMetadata':True,'verifySignatures':False,'authenticity':'Exact SHA256 rows from independently validated public-use receipts and locked npm repository manifest. TOFU unless separately publisher-bound; no publisher signatures claimed.'}
