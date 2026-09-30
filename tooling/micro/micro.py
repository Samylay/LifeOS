#!/usr/bin/env python3
"""Micro project creation and bounded verification. No model-authored host commands."""
import argparse
import fcntl
import hashlib
import fnmatch
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid

KIT = Path(__file__).resolve().parent
DEFAULT_ROOT = Path.home() / 'apps/micro'
DEFAULT_STATE = Path.home() / '.local/state/micro-factory'
IMAGE_PATTERN = r'(?:[a-z0-9./:_-]+@)?sha256:[a-f0-9]{64}'
SOURCE_BYTES = 100_000_000
SOURCE_ENTRIES = 20_000
PROTECTED_PATTERNS = ('package.json','package-lock.json','AGENTS.md','Dockerfile*',
    '.factory/*','.github/*','scripts/*','ci/*','tests/*','test/*','*.test.*','*.spec.*',
    '*config*','.*','*/.*',
    'fixtures/*','__fixtures__/*','__mocks__/*','.node-version','.nvmrc')

def run(argv, **kwargs):
    return subprocess.run(argv, check=True, capture_output=True, timeout=30, **kwargs)

def root_path(root):
    root = Path(root).absolute()
    if root.is_symlink():
        raise ValueError('Micro root must not be a symlink')
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()

def project_path(root, slug):
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,79}', slug):
        raise ValueError('Use a lowercase project ID, letters, digits and hyphens')
    candidate = root / slug
    if candidate.is_symlink() or candidate.exists() and candidate.resolve().parent != root:
        raise ValueError('Project path leaves the Micro root')
    return candidate

def validate_brief(v):
    if not isinstance(v, dict): raise ValueError('Supply a brief object')
    for key in ('title', 'name', 'audience', 'problem', 'vibe', 'references', 'business'):
        if not isinstance(v.get(key), str) or len(v[key]) > 18000:
            raise ValueError('Invalid brief field: ' + key)
    if v.get('platform') not in ('web', 'ios', 'android', 'ios-android'):
        raise ValueError('Choose a platform')
    if not isinstance(v.get('features'), list) or not 1 <= len(v['features']) <= 60:
        raise ValueError('Supply 1 to 60 features')
    ids = set(); first = 0
    for feature in v['features']:
        if not isinstance(feature, dict): raise ValueError('Invalid feature')
        for key in ('id', 'title', 'acceptance'):
            if not isinstance(feature.get(key), str): raise ValueError('Invalid feature ' + key)
        if feature['id'] in ids: raise ValueError('Duplicate feature ID')
        ids.add(feature['id'])
        if feature.get('scope') not in ('first', 'later'): raise ValueError('Invalid feature scope')
        if feature['scope'] == 'first':
            first += 1
            if not feature['title'].strip() or not feature['acceptance'].strip():
                raise ValueError('First-release features need acceptance criteria')
    if not first or any(not v[key].strip() for key in ('name', 'audience', 'problem', 'vibe', 'references')):
        raise ValueError('Finish audience, problem, first release, name, vibe and references')
    # Whitelist product data; never copy session IDs, arbitrary files or commands.
    return {key: v[key] for key in ('title', 'name', 'audience', 'problem', 'platform', 'vibe', 'references', 'business', 'features')}

def markdown(v):
    sections = [f"# {v['name']}", f"Working title: {v['title']}\nPlatform: {v['platform']}"]
    for heading, key in [('Audience','audience'),('Problem','problem')]:
        sections.append(f'## {heading}\n{v[key]}')
    for scope, heading in [('first','First release'),('later','Later')]:
        sections.append('## '+heading+'\n'+'\n'.join('- '+f['title']+'\n  Acceptance: '+f['acceptance'] for f in v['features'] if f['scope']==scope))
    for heading,key in [('Visual direction','vibe'),('References','references'),('Business model','business')]:
        sections.append('## '+heading+'\n'+v[key])
    return '\n\n'.join(sections)+'\n'

def initialize(root, slug, brief):
    root = root_path(root); destination = project_path(root, slug)
    brief = validate_brief(brief)
    # Atomic directory reservation prevents concurrent requests from overwriting a project.
    destination.mkdir(mode=0o700)
    try:
        shutil.copytree(KIT/'templates', destination, dirs_exist_ok=True)
        for source in ('security.py','tools-lock.json'):
            shutil.copyfile(KIT/source,destination/'.factory'/source)
        shutil.copytree(KIT/'scanner-config',destination/'.factory/scanner-config')
        (destination/'brief.json').write_text(json.dumps(brief, indent=2)+'\n')
        (destination/'BRIEF.md').write_text(markdown(brief))
        (destination/'DESIGN.md').write_text('# Design direction\n\n'+brief['vibe']+'\n\n## Reference decisions\n'+brief['references']+'\n\n## Required states\nRecord loading, empty, error, offline, permission and recovery behavior for each applicable flow.\n')
        (destination/'SPEC.md').write_text('# Product specification\n\nStatus: draft\n\nRead BRIEF.md and DESIGN.md. Resolve flows, data rules, excluded scope and measurable acceptance before implementation. The brief does not authorize domain purchases, external publishing or a production data migration.\n')
        run(['git','init','-b','main',str(destination)])
        # Inherit the existing configured personal identity, never a work identity.
        for key in ('user.name','user.email'):
            value = run(['git','config','--global','--get',key]).stdout.decode().strip()
            if key == 'user.email' and value.endswith('@ouidou.fr'):
                raise ValueError('Micro cannot inherit the work Git identity')
            run(['git','-C',str(destination),'config',key,value])
        run(['git','-C',str(destination),'add','.'])
        run(['git','-C',str(destination),'commit','-m','Initialize Micro product brief and factory gates'])
    except Exception:
        # Preserve partial evidence, do not recursively delete a directory after failure.
        raise RuntimeError('Initialization failed; inspect the reserved workspace: '+str(destination))
    return destination

def read_policy():
    v = json.loads((KIT/'runtime.json').read_text())
    if not re.fullmatch(IMAGE_PATTERN, v.get('image','')):
        raise ValueError('Configure a digest-pinned verifier image')
    return v

def extract_source(archive, directory):
    """Validate the whole export before writing into a fresh owned directory."""
    if not isinstance(archive, bytes) or len(archive) > SOURCE_BYTES:
        raise ValueError('Source archive exceeds 100 MB')
    directory = Path(directory)
    if directory.is_symlink() or not directory.is_dir() or any(directory.iterdir()):
        raise ValueError('Source destination must be a fresh empty directory')
    total = 0; entries = []; seen = {}; required_dirs = set()
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:') as tar:
        for member in tar:
            path = PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or not path.parts or not (member.isfile() or member.isdir()):
                raise ValueError('Verification rejects links and unsafe archive paths')
            normalized = path.as_posix()
            if normalized in seen or len(entries) >= SOURCE_ENTRIES:
                raise ValueError('Source archive has duplicate or excessive entries')
            if any(part in ('.git', 'node_modules') for part in path.parts):
                raise ValueError('Source export must exclude Git and dependency directories')
            if member.isfile() and normalized in required_dirs or any(seen.get(parent.as_posix()) == 'file' for parent in path.parents):
                raise ValueError('Source archive has a file/directory collision')
            seen[normalized] = 'file' if member.isfile() else 'directory'
            required_dirs.update(parent.as_posix() for parent in path.parents)
            total += member.size
            if member.size < 0 or total > SOURCE_BYTES:
                raise ValueError('Expanded source exceeds 100 MB')
            base = path.name.lower()
            if base == '.env' or base.startswith('.env.') and base != '.env.example' or path.suffix.lower() in ('.pem', '.key', '.jks', '.keystore', '.p12') or base == '.npmrc':
                raise ValueError('Remove credential files from tracked source')
            entries.append((member, path))
        for member, path in entries:
            target = directory / path.as_posix()
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(member) as incoming, target.open('xb') as output:
                    shutil.copyfileobj(incoming, output, length=1024 * 1024)
                target.chmod(0o755 if member.mode & 0o111 else 0o644)

def policy_snapshot(project, sha):
    files=run(['git','-C',str(project),'ls-tree','-r','--name-only',sha]).stdout.decode().splitlines()
    protected={}
    for file in files:
        if any(fnmatch.fnmatch(file,pattern) for pattern in PROTECTED_PATTERNS):
            data=run(['git','-C',str(project),'show',sha+':'+file]).stdout
            protected[file]=hashlib.sha256(data).hexdigest()
    return protected

def approve_policy(root, slug, review_file, state=DEFAULT_STATE):
    project=project_path(root_path(root),slug)
    if run(['git','-C',str(project),'status','--porcelain']).stdout.strip(): raise ValueError('Commit the reviewed candidate first')
    sha=run(['git','-C',str(project),'rev-parse','HEAD']).stdout.decode().strip()
    review=json.loads(Path(review_file).read_text())
    if review.get('source_sha')!=sha or review.get('verdict')!='accepted' or not isinstance(review.get('reviewer'),str) or not review['reviewer'].strip() or not isinstance(review.get('evidence'),str) or not review['evidence'].strip():
        raise ValueError('Supply an accepted independent review tied to this exact source SHA, with reviewer and evidence')
    policies=Path(state)/'policies'; policies.mkdir(parents=True,exist_ok=True,mode=0o700)
    data={'project':str(project.resolve()),'source_sha':sha,'protected_files':policy_snapshot(project,sha),'review':review,'accepted_at':time.time()}
    destination=policies/(slug+'.json'); temporary=policies/(slug+'.'+uuid.uuid4().hex+'.tmp')
    temporary.write_text(json.dumps(data,indent=2)+'\n'); temporary.chmod(0o600); temporary.replace(destination)
    return destination

def check_policy(project, slug, sha, state):
    destination=Path(state)/'policies'/(slug+'.json')
    if not destination.is_file(): raise ValueError('Checks have no reviewed baseline. Obtain an independent review and run micro approve-checks with that review receipt')
    accepted=json.loads(destination.read_text())
    if accepted.get('project')!=str(project.resolve()) or accepted.get('protected_files')!=policy_snapshot(project,sha):
        raise ValueError('Protected checks or policy changed. Independent review is required before accepting this candidate')
    return hashlib.sha256(destination.read_bytes()).hexdigest()

def verify(root, slug, state=DEFAULT_STATE, policy=None):
    root = root_path(root); project = project_path(root, slug)
    if not (project/'.git').is_dir(): raise ValueError('Micro project must be a standalone Git repository')
    if run(['git','-C',str(project),'status','--porcelain']).stdout.strip():
        raise ValueError('Commit the intended candidate first; verification never includes uncommitted changes')
    policy = policy or read_policy()
    image = policy['image']
    if not re.fullmatch(IMAGE_PATTERN, image): raise ValueError('Verifier image needs a digest')
    # Docker must already have the trusted image. No candidate-controlled pull/build occurs here.
    run(['docker','image','inspect',image])
    state = Path(state); state.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (state/'worker.lock').open('a') as lock:
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: raise ValueError('The Micro verifier is busy; one candidate runs at a time')
        sha = run(['git','-C',str(project),'rev-parse','HEAD']).stdout.decode().strip()
        policy_hash=check_policy(project,slug,sha,state)
        archive = run(['git','-C',str(project),'archive','--format=tar',sha]).stdout
        job = uuid.uuid4().hex; name = 'micro-verify-'+job
        directory = state/job; directory.mkdir(mode=0o700)
        receipt = {'id':job,'project':slug,'source_sha':sha,'image':image,'reviewed_policy_sha256':policy_hash,'source_archive_sha256':hashlib.sha256(archive).hexdigest(),'status':'running','started_at':time.time(),'automatic_retries':0}
        def save():
            temp = directory/'receipt.tmp'; temp.write_text(json.dumps(receipt,indent=2)+'\n'); temp.replace(directory/'receipt.json')
        save()
        try:
            with tempfile.TemporaryDirectory(prefix='micro-source-') as temporary:
                source = Path(temporary); extract_source(archive, source)
                # Rootless app user, immutable source, no network, no host home, credentials, socket or live data.
                command = ['docker','run','--rm','--name',name,'--pull=never','--network=none',
                    '--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
                    '--pids-limit=128','--memory=1g','--cpus=1','--user=65534:65534',
                    '--tmpfs=/tmp:rw,nosuid,nodev,size=384m,mode=1777',
                    '--mount','type=bind,src='+str(source)+',dst=/source,readonly',
                    '--mount','type=bind,src='+str(KIT/'verify.mjs')+',dst=/verifier.mjs,readonly',
                    '--workdir=/tmp',image,'node','/verifier.mjs']
                # TemporaryDirectory defaults to 700; allow the unprivileged container to read only this export.
                source.chmod(0o755)
                reports=directory/'reports'; reports.mkdir(mode=0o777); reports.chmod(0o777)
                # Scanner and candidate execution are separate containers. Candidate code
                # cannot rewrite the retained reports or vulnerability database.
                scanner=command[:-2]
                scanner=scanner[:-1]+[
                    '--mount','type=bind,src='+str(KIT/'scan.mjs')+',dst=/scanner.mjs,readonly',
                    '--mount','type=bind,src='+str(KIT/'scanner-config')+',dst=/scanner-config,readonly',
                    '--mount','type=bind,src='+str(reports)+',dst=/evidence',
                    '--mount','type=bind,src='+str(DEFAULT_STATE/'grype-db')+',dst=/db,readonly',
                    '--env','GRYPE_DB_AUTO_UPDATE=false','--env','GRYPE_DB_CACHE_DIR=/db',
                    image,'node','/scanner.mjs']
                with (directory/'security.log').open('wb') as log:
                    secured=subprocess.run(scanner,stdout=log,stderr=subprocess.STDOUT,timeout=300)
                receipt['security_exit_code']=secured.returncode
                receipt['report_sha256']={file.name:hashlib.sha256(file.read_bytes()).hexdigest() for file in reports.iterdir() if file.is_file()}
                if secured.returncode: raise ValueError('Secret/SBOM/vulnerability gate failed; inspect retained security evidence')
                with (directory/'checks.log').open('wb') as log:
                    result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=600)
                receipt.update(status='passed' if result.returncode == 0 else 'failed',exit_code=result.returncode)
        except subprocess.TimeoutExpired:
            receipt.update(status='failed',reason='Verification exceeded 600 seconds')
        except Exception as exc:
            receipt.update(status='failed',reason=str(exc))
        finally:
            # A disconnected client or timeout must not leave a verifier running.
            try:
                cleanup = subprocess.run(['docker','rm','-f',name],capture_output=True,timeout=15)
                if cleanup.returncode and b'No such container' not in cleanup.stderr:
                    receipt.update(status='failed',cleanup_error='Could not confirm verifier cleanup')
            except Exception:
                receipt.update(status='failed',cleanup_error='Could not confirm verifier cleanup')
            receipt['ended_at']=time.time(); save()
        return receipt, directory

def doctor(root=DEFAULT_ROOT):
    root = root_path(root)
    checks = {'root':str(root),'root_instructions':(root/'AGENTS.md').is_file(),
              'skill':(Path.home()/'.codex/skills/micro-studio/SKILL.md').is_file(),
              'docker':shutil.which('docker') is not None,'codex':(Path.home()/'.local/bin/codex').is_file() or shutil.which('codex') is not None}
    try:
        policy=read_policy(); run(['docker','image','inspect',policy['image']]); checks['verifier_image']=policy['image']
    except Exception: checks['verifier_image']=False
    print(json.dumps(checks,indent=2))
    return all(checks.values())

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='command',required=True)
    init=sub.add_parser('init'); init.add_argument('slug'); init.add_argument('--brief',type=Path,required=True)
    check=sub.add_parser('verify'); check.add_argument('slug')
    admission=sub.add_parser('approve-checks'); admission.add_argument('slug'); admission.add_argument('--review',type=Path,required=True)
    sub.add_parser('doctor')
    args=parser.parse_args()
    try:
        if args.command=='init':
            if args.brief.stat().st_size>64000: raise ValueError('Brief exceeds 64 KB')
            print(initialize(DEFAULT_ROOT,args.slug,json.loads(args.brief.read_text()))); return 0
        if args.command=='doctor': return 0 if doctor(DEFAULT_ROOT) else 1
        if args.command=='approve-checks': print(approve_policy(DEFAULT_ROOT,args.slug,args.review)); return 0
        receipt,directory=verify(DEFAULT_ROOT,args.slug)
        print(json.dumps({'receipt':receipt,'evidence':str(directory)},indent=2))
        return 0 if receipt['status']=='passed' else 1
    except Exception as exc:
        print(str(exc),file=sys.stderr); return 1

if __name__=='__main__': sys.exit(main())
