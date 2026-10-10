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
MODULE_LIMIT = 8 * 1024**2
EXTENSIONS = ('.pom', '.module', '.jar', '.aar', '.zip', '.xml')
# Independently inspected marker POM bodies have the same exact dependency.
# These origin-bound observations remain TOFU, not publisher signature proof.
KOTLIN_MARKER = ('org.jetbrains.kotlin.jvm', 'org.jetbrains.kotlin.jvm.gradle.plugin',
                 '2.1.20', 'org.jetbrains.kotlin.jvm.gradle.plugin-2.1.20.pom')
KOTLIN_MARKER_PATH = 'org/jetbrains/kotlin/jvm/' + '/'.join(KOTLIN_MARKER[1:])
KOTLIN_MARKER_VARIANTS = {
    'https://repo.maven.apache.org/maven2/' + KOTLIN_MARKER_PATH:
        ('5ccb905a796717218c1bb4eed8bb31fc674c5803cdd54c23753ead380f7a11b5', 1397),
    'https://plugins.gradle.org/m2/' + KOTLIN_MARKER_PATH:
        ('abc4c3875e3f97553a176a90f51788ec0f5eae8e1d26423ea8ebdbf8aa6a1786', 673),
}

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

def module_document(body):
    # Reject duplicate JSON keys before interpreting any published declaration.
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result: raise ValueError('Ambiguous Gradle module JSON key')
            result[key] = value
        return result
    if len(body) > MODULE_LIMIT: raise ValueError('Gradle module metadata exceeds8MiB')
    document = json.loads(body, object_pairs_hook=unique)
    if not isinstance(document, dict) or not isinstance(document.get('variants', []), list):
        raise ValueError('Invalid Gradle module metadata')
    return document

def safe_basename(name):
    return isinstance(name, str) and name not in ('.', '..') and re.fullmatch(r'[A-Za-z0-9_.\-]+', name) and name.endswith(EXTENSIONS)

def generate(cache_root, cache_manifest, artifact_events, local_manifest, output):
    root=Path(cache_root)
    local=Path(local_manifest).read_bytes()
    if hashlib.sha256(local).hexdigest()!=MANIFEST_SHA256: raise ValueError('Local Maven authority identity changed')
    document=json.loads(local)
    if document['sourceLockSha256']!='ae8bbc085fd039716dde9ba98c1039069b93455972f42659c8dccc5cb66fb282': raise ValueError('Local Maven source lock changed')
    authority={}
    def add(key, sha, size, provenance):
        if not re.fullmatch(r'[0-9a-f]{64}',sha) or not isinstance(size,int) or size<0: raise ValueError('Invalid artifact digest/size')
        if key == KOTLIN_MARKER:
            if provenance['kind'] != 'public-use-receipt' or KOTLIN_MARKER_VARIANTS.get(provenance.get('url')) != (sha, size):
                raise ValueError('Conflicting coordinate artifact authorities: unreviewed Kotlin marker variant/origin')
            prior = authority.setdefault(key, {'sha256':sha, 'bytes':size, 'authorities':[], 'variants':[]})
            variant = next((v for v in prior['variants'] if v['sha256'] == sha), None)
            if variant is None:
                variant = {'sha256':sha, 'bytes':size, 'authorities':[]}
                prior['variants'].append(variant)
            if provenance not in variant['authorities']: variant['authorities'].append(provenance)
            if provenance not in prior['authorities']: prior['authorities'].append(provenance)
            return
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
    for value in authority.values():
        if 'variants' in value:
            value['variants'].sort(key=lambda v: v['sha256'])
            value.update({field:value['variants'][0][field] for field in ('sha256','bytes')})
    def cache_row(value):
        row = {**value, 'cachePaths':[]}
        if 'variants' in value: row['variants'] = [{**v, 'cachePaths':[]} for v in value['variants']]
        return row
    rows={};seen_paths=set();aliases={}
    wanted = {tuple(e['path'].split('/')[2:5]) + (e['path'].split('/')[6],)
              for e in cache_manifest['entries'] if e['type']=='file' and e['path'].startswith('modules-2/files-2.1/') and len(e['path'].split('/'))==7}
    def declarations(source_key, expected, body, cache_path):
        document = module_document(body)
        for variant in document.get('variants', []):
            if not isinstance(variant, dict) or not isinstance(variant.get('files', []), list): raise ValueError('Invalid Gradle module files')
            for file in variant.get('files', []):
                if not isinstance(file, dict): raise ValueError('Invalid Gradle module file declaration')
                name, url = file.get('name'), file.get('url')
                if not isinstance(name, str): raise ValueError('Invalid Gradle module file name')
                alias_key = (*source_key[:3], name)
                # Unused external locations grant no authority and are not followed.
                if name == url or alias_key not in wanted: continue
                if not safe_basename(name) or not safe_basename(url): raise ValueError('Unsafe Gradle module alias/URL')
                target = coordinate([*source_key[0].split('.'), source_key[1], source_key[2], url])
                artifact = authority.get(target)
                bindings = []
                for receipt in expected['authorities']:
                    if receipt['kind'] != 'public-use-receipt': continue
                    fetched = receipt['url'].rsplit('/', 1)[0] + '/' + url
                    public = [a for a in (artifact or {}).get('authorities', []) if a['kind']=='public-use-receipt' and a['url']==fetched]
                    if public:
                        bindings.append({'name':name, 'url':url, 'publishedFile':file, 'variant':variant.get('name'),
                                         'moduleSha256':expected['sha256'], 'moduleBytes':expected['bytes'],
                                         'moduleArtifact':source_key[3], 'moduleCachePath':cache_path,
                                         'moduleAuthorities':[receipt], 'artifactAuthorities':public})
                if not bindings: raise ValueError('Gradle module alias lacks exact independent public authority')
                signature = (target, json.dumps(file, sort_keys=True, separators=(',', ':')))
                prior = aliases.setdefault(alias_key, {'target':target, 'signature':signature, 'bindings':[]})
                if prior['signature'] != signature: raise ValueError('Ambiguous Gradle module alias')
                for binding in bindings:
                    if binding not in prior['bindings']: prior['bindings'].append(binding)
    # Authenticate all plain module bodies before their file declarations can bind aliases.
    for info in sorted(cache_manifest['entries'], key=lambda e:not e['path'].endswith('.module')):
        name=info['path'];parts=PurePosixPath(name).parts
        if name in seen_paths or str(PurePosixPath(name))!=name or name.startswith('/') or '..' in parts:raise ValueError('Duplicate/unsafe dependency cache path')
        seen_paths.add(name)
        if info['type']=='directory':continue
        if info['type']!='file':raise ValueError('Dependency cache links/special files forbidden')
        if parts[:2]!=('modules-2','files-2.1'):continue # Binary Gradle metadata is hashed in complete cache manifest.
        if len(parts)!=7 or not re.fullmatch(r'[0-9a-f]{1,40}',parts[5]):raise ValueError('Unknown Gradle artifact cache layout')
        cache_key = (*parts[2:5], parts[6])
        alias = aliases.get(cache_key)
        key = alias['target'] if alias else coordinate([*parts[2].split('.'),parts[3],parts[4],parts[6]])
        path=root/name
        current=path
        while current!=root:
            if current.is_symlink():raise ValueError('Artifact cache ancestor link')
            current=current.parent
        if not path.resolve(strict=True).is_relative_to(root.resolve(strict=True)):raise ValueError('Artifact cache escape')
        h=hashlib.sha256();sha1=hashlib.sha1();size=0
        extra = {algorithm:hashlib.new(algorithm) for algorithm in ('sha512','md5') if alias and any(algorithm in b['publishedFile'] for b in alias['bindings'])}
        module_body = bytearray() if parts[6].endswith('.module') else None
        with path.open('rb') as source:
            while chunk:=source.read(256*1024):
                h.update(chunk);sha1.update(chunk);size+=len(chunk)
                for digest in extra.values(): digest.update(chunk)
                if module_body is not None:
                    if size > MODULE_LIMIT: raise ValueError('Gradle module metadata exceeds8MiB')
                    module_body.extend(chunk)
        expected=authority.get(key)
        variants = expected.get('variants', [expected]) if expected else []
        matched = next((v for v in variants if v['sha256']==h.hexdigest() and v['bytes']==size), None)
        if matched is None or size!=info['size'] or h.hexdigest()!=info['sha256'] or parts[5] not in (sha1.hexdigest(), format(int(sha1.hexdigest(),16),'x')):raise ValueError('Artifact cache lacks matching independent authority/hash/path')
        if alias:
            actual = {'size':size, 'sha256':h.hexdigest(), 'sha1':sha1.hexdigest(), **{a:d.hexdigest() for a,d in extra.items()}}
            for binding in alias['bindings']:
                published = binding['publishedFile']
                if any(field in published and (type(published[field]) is not type(value) or published[field]!=value) for field,value in actual.items()):
                    raise ValueError('Gradle module published alias hash/size mismatch')
            direct = authority.get(cache_key)
            if direct and (direct['sha256'],direct['bytes']) != (expected['sha256'],expected['bytes']):raise ValueError('Conflicting coordinate artifact authorities for alias')
        if module_body is not None: declarations(key, expected, bytes(module_body), name)
        row=rows.setdefault(key,cache_row(expected))
        row['cachePaths'].append(name)
        if 'variants' in row:
            next(v for v in row['variants'] if v['sha256']==matched['sha256'])['cachePaths'].append(name)
        if alias:
            for row_key in (key, cache_key):
                alias_row = rows.setdefault(row_key, cache_row(expected))
                if (alias_row['sha256'],alias_row['bytes']) != (expected['sha256'],expected['bytes']):raise ValueError('Conflicting coordinate artifact authorities for alias row')
                if name not in alias_row['cachePaths']: alias_row['cachePaths'].append(name)
                bindings = alias_row.setdefault('moduleFileAliases', [])
                for binding in alias['bindings']:
                    if binding not in bindings: bindings.append(binding)
    if not rows:raise ValueError('No task-cache artifact rows')
    # Task-use metadata may be represented only by Gradle binary descriptors.
    # Preserve exact observed POM/module identities as strict checksum rows too.
    for key, value in authority.items():
        if key[3].endswith(('.pom','.module')) and any(a['kind']=='public-use-receipt' for a in value['authorities']):rows.setdefault(key,cache_row(value))
    # Include all exact56 locked npm local Maven artifacts. They need not occur in
    # modules-2 because Gradle can consume file repositories directly.
    for key, value in authority.items():
        if any(a['kind']=='exact-locked-npm-local-maven' for a in value['authorities']):rows.setdefault(key,cache_row(value))
    ns='https://schema.gradle.org/dependency-verification';ET.register_namespace('',ns)
    top=ET.Element('{'+ns+'}verification-metadata',{'{http://www.w3.org/2001/XMLSchema-instance}schemaLocation':ns+' https://schema.gradle.org/dependency-verification/dependency-verification-1.3.xsd'})
    conf=ET.SubElement(top,'configuration');ET.SubElement(conf,'verify-metadata').text='true';ET.SubElement(conf,'verify-signatures').text='false'
    components=ET.SubElement(top,'components');last=None;component=None
    evidence=[]
    for key,value in sorted(rows.items()):
        if key[:3]!=last:component=ET.SubElement(components,'component',dict(zip(('group','name','version'),key[:3])));last=key[:3]
        artifact=ET.SubElement(component,'artifact',{'name':key[3]});checksum=ET.SubElement(artifact,'sha256',{'value':value['sha256'],'origin':'Sealed trusted-fixture task input; authority receipt retained separately'})
        for variant in value.get('variants', [])[1:]: ET.SubElement(checksum,'also-trust',{'value':variant['sha256']})
        evidence.append({'group':key[0],'module':key[1],'version':key[2],'artifact':key[3],**value})
    ET.indent(top,space='   ');xml=ET.tostring(top,encoding='utf-8',xml_declaration=True)+b'\n'
    if len(xml)>LIMIT or len(json.dumps(evidence).encode())>LIMIT:raise ValueError('Verification metadata evidence exceeds20MiB')
    Path(output).write_bytes(xml)
    return {'schema':'task-cache-verification-metadata/1','scope':'one successful trusted fixture acquisition; final strict offline proof pending','generatorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'xmlSha256':hashlib.sha256(xml).hexdigest(),'xmlBytes':len(xml),'localMavenManifestSha256':MANIFEST_SHA256,'rows':evidence,'verifyMetadata':True,'verifySignatures':False,'authenticity':'Exact SHA256 rows from independently validated public-use receipts and locked npm repository manifest. TOFU unless separately publisher-bound; no publisher signatures claimed.'}
