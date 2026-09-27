#!/usr/bin/env python3
"""Download pinned scanner assets, verify SHA256 before extracting a named binary."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import platform
import os
import subprocess
import tarfile
import urllib.request

def install(output, lock):
    if platform.machine() not in ('x86_64','amd64'): raise ValueError('Scanner lock targets Linux amd64; resolve verified assets for this architecture')
    output.mkdir(parents=True,exist_ok=True)
    for name, item in json.loads(lock.read_text()).items():
        if name not in ('gitleaks','syft','grype') or not item['url'].startswith('https://github.com/'):
            raise ValueError('Unrecognized scanner asset')
        req=urllib.request.Request(item['url'],headers={'User-Agent':'micro-factory'})
        with urllib.request.urlopen(req,timeout=60) as response: data=response.read(150_000_001)
        if len(data)>150_000_000 or hashlib.sha256(data).hexdigest()!=item['sha256']:
            raise ValueError('Scanner checksum mismatch: '+name)
        with tarfile.open(fileobj=io.BytesIO(data)) as tar:
            member=tar.getmember(name)
            if not member.isfile(): raise ValueError('Scanner asset is not a file')
            binary=tar.extractfile(member).read()
        dest=output/name; temp=output/(name+'.tmp'); temp.write_bytes(binary); temp.chmod(0o755); temp.replace(dest)
        print('Verified '+name+' '+item['version'])

def scan(source, binaries, reports):
    reports.mkdir(parents=True,exist_ok=True)
    commands=[
        [str(binaries/'gitleaks'),'dir',str(source),'--no-banner','--redact=100','--report-format=json','--report-path='+str(reports/'secrets.json')],
        [str(binaries/'syft'),'dir:'+str(source),'-o','cyclonedx-json='+str(reports/'sbom.cdx.json')],
        [str(binaries/'grype'),'sbom:'+str(reports/'sbom.cdx.json'),'--fail-on','high','-o','json','--file',str(reports/'vulnerabilities.json')],
    ]
    for command in commands: subprocess.run(command,check=True,timeout=300)

def refresh_database(cache, binary):
    cache.mkdir(parents=True,exist_ok=True)
    env=dict(os.environ); env['GRYPE_DB_CACHE_DIR']=str(cache)
    subprocess.run([str(binary),'db','update'],env=env,check=True,timeout=240)
    # This database is public advisory data. The unprivileged scanner reads it.
    cache.chmod(0o755)
    for entry in cache.rglob('*'): entry.chmod(0o755 if entry.is_dir() else 0o644)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__); sub=parser.add_subparsers(dest='mode',required=True)
    setup=sub.add_parser('install'); setup.add_argument('--output',type=Path,required=True); setup.add_argument('--lock',type=Path,default=Path(__file__).with_name('tools-lock.json'))
    check=sub.add_parser('scan'); check.add_argument('--source',type=Path,default=Path.cwd()); check.add_argument('--binaries',type=Path,required=True); check.add_argument('--reports',type=Path,required=True)
    refresh=sub.add_parser('refresh-db'); refresh.add_argument('--cache',type=Path,required=True); refresh.add_argument('--binary',type=Path,required=True)
    args=parser.parse_args()
    if args.mode=='install': install(args.output.resolve(),args.lock)
    elif args.mode=='scan': scan(args.source.resolve(),args.binaries.resolve(),args.reports.resolve())
    else: refresh_database(args.cache.resolve(),args.binary.resolve())
