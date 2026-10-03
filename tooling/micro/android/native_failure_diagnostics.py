"""Retain bounded generated Worklets CXX diagnostics; never execute them."""
import hashlib
import json
from pathlib import Path
import re

TOTAL=8*1024**2
SINGLE=256*1024
FILES=64
NAMES={'prefab_command','prefab_stdout','prefab_stderr','prefab_config.json','prefab_command.bat',
       'configure_command','configure_command.bat','configure_stdout','configure_stderr',
       'configure_stdout.txt','configure_stderr.txt','metadata_generation_command',
       'metadata_generation_stdout','metadata_generation_stderr','android_gradle_build.json'}

def collect(fixture, destination):
    fixture=Path(fixture);destination=Path(destination)
    base=fixture/'node_modules/react-native-worklets/android/build/intermediates/cxx'
    destination.mkdir(mode=0o700)
    result={'scope':'generated Worklets CXX fixed diagnostics only; never executed','files':[],
            'limits':{'files':FILES,'bytes':TOTAL,'singleBytes':SINGLE},'workMountInfo':[], 'missing':not base.exists()}
    mountinfo=Path('/proc/self/mountinfo')
    if mountinfo.exists():
        result['workMountInfo']=[x for x in mountinfo.read_text().splitlines() if ' /work ' in x]
    total=0
    current=base
    while current!=fixture:
        if current.is_symlink():raise ValueError('Diagnostic ancestor link forbidden')
        current=current.parent
    if base.exists():
        for path in sorted(base.rglob('*')):
            if path.is_symlink():raise ValueError('Diagnostic link forbidden')
            if not (path.is_file() or path.is_dir()):raise ValueError('Diagnostic special file forbidden')
            if not path.is_file() or path.name not in NAMES:continue
            relative=path.relative_to(base);parts=relative.parts
            if len(parts)!=5 or parts[0] not in ('RelWithDebInfo','Release') or not re.fullmatch(r'[A-Za-z0-9_-]+',parts[1]) or parts[2:4]!=('logs','x86_64'):continue
            if len(result['files'])>=FILES:result['fileLimitReached']=True;break
            with path.open('rb') as source:data=source.read(min(SINGLE,TOTAL-total)+1)
            cap=min(SINGLE,TOTAL-total);truncated=len(data)>cap;data=data[:cap]
            name=str(len(result['files'])).zfill(2)+'-'+path.name
            target=destination/name;target.write_bytes(data);target.chmod(0o600);total+=len(data)
            result['files'].append({'sourceRelative':str(path.relative_to(fixture)),'file':name,'capturedBytes':len(data),'capturedSha256':hashlib.sha256(data).hexdigest(),'truncated':truncated,'fullFileDigestClaimed':not truncated})
            if total==TOTAL:result['byteLimitReached']=True;break
    result['capturedBytes']=total
    (destination/'receipt.json').write_text(json.dumps(result,indent=2)+'\n')
    return result
