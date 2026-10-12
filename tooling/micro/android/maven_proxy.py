#!/usr/bin/env python3
"""Public Maven acquisition for a reviewed fixture on an internal network.

Candidate compilation must use network:none instead. This proxy accepts fixed
repository paths, never CONNECT, arbitrary URLs, credentials or request headers.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import os
from pathlib import Path, PurePosixPath
import re
import threading
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from uuid import uuid4

REPOSITORIES = {
    'google': 'https://dl.google.com/dl/android/maven2/',
    'central': 'https://repo.maven.apache.org/maven2/',
    'plugins': 'https://plugins.gradle.org/m2/',
}
UPSTREAM_PREFIXES = tuple(REPOSITORIES.values()) + (
    'https://dl.google.com/android/maven2/',
    'https://plugins-artifacts.gradle.org/',
)
ARTIFACT_BYTES = 256 * 1024 * 1024
TOTAL_BYTES = 4 * 1024 * 1024 * 1024
REQUESTS = 20_000
CHUNK_BYTES = 256 * 1024
LOG_BYTES = 20 * 1024 * 1024
# Publisher cache documented in React Native commit3bfb277fec221e88d4ec1b918c664d675edf616b.
# It is a redirect destination for these locked native inputs, not a new client repository.
REACT_NATIVE_MIRROR = 'https://repo.reactnative.dev/maven2/'
REACT_NATIVE_ARTIFACTS = {
    'com/facebook/react/react-android/0.86.3/react-android-0.86.3-release.aar':
        '59b66e453d8775a54df66a321c0d5002b98716d68c4bd9edb8e64d7110ff8d28',
    'com/facebook/hermes/hermes-android/250829098.0.17/hermes-android-250829098.0.17-release.aar':
        '6fb440b29aadb5925bed1109338da61623c54c3508020bb2cecebcaaa80e53b8',
}


def react_native_redirect(url: str, artifact_path: str, source_url: str | None) -> bool:
    return (artifact_path in REACT_NATIVE_ARTIFACTS
            and source_url == REPOSITORIES['central'] + artifact_path
            and url == REACT_NATIVE_MIRROR + artifact_path)


def path_url(path: str) -> str:
    if len(path) > 2048 or '?' in path or '#' in path or '%' in path or '\\' in path:
        raise ValueError('Unsupported Maven request path')
    parts = path.split('/')
    if len(parts) < 4 or parts[0] != '' or parts[1] not in REPOSITORIES:
        raise ValueError('Unknown Maven repository')
    artifact = parts[2:]
    if any(not re.fullmatch(r'[A-Za-z0-9_.+\-]+', part) or part in ('.', '..') or part.upper() in ('LATEST', 'RELEASE') or 'SNAPSHOT' in part.upper() for part in artifact):
        raise ValueError('Unsafe or changing Maven coordinate')
    if artifact[-1].lower().startswith('maven-metadata.xml'):
        raise ValueError('Changing Maven metadata is forbidden')
    if not re.search(r'\.(?:pom|module|jar|aar|zip|xml|sha256|sha512|sha1|md5|asc)$', artifact[-1]):
        raise ValueError('Unsupported Maven artifact type')
    return REPOSITORIES[parts[1]] + '/'.join(artifact)


def check_upstream(url: str, artifact_path: str, source_url: str | None = None) -> str | None:
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.port not in (None, 443):
        raise ValueError('Upstream URL contains unsupported authority')
    if '%' in parsed.path or '\\' in parsed.path or '..' in PurePosixPath(parsed.path).parts:
        raise ValueError('Unsafe upstream path')
    if artifact_path in REACT_NATIVE_ARTIFACTS:
        if url == REPOSITORIES['central'] + artifact_path:
            return REACT_NATIVE_ARTIFACTS[artifact_path]
        if not react_native_redirect(url, artifact_path, source_url):
            raise ValueError('Pinned native artifact destination is not its publisher')
    if react_native_redirect(url, artifact_path, source_url): return REACT_NATIVE_ARTIFACTS[artifact_path]
    prefix = next((prefix for prefix in UPSTREAM_PREFIXES if url.startswith(prefix)), None)
    if prefix is None:
        raise ValueError('Unreviewed upstream host or coordinate redirect')
    suffix = url[len(prefix):]
    if suffix == artifact_path: return None
    # The official Plugin Portal CDN uses a dotted group and content hash.
    # Preserve the logical coordinate and require the hash to match the bytes.
    if prefix == 'https://plugins-artifacts.gradle.org/':
        parts = artifact_path.split('/')
        if len(parts) >= 4:
            group, module, version, filename = '.'.join(parts[:-3]), *parts[-3:]
            match = re.fullmatch(re.escape(group+'/'+module+'/'+version+'/') + r'([0-9a-f]{64})/' + re.escape(filename), suffix)
            if match: return match.group(1)
    raise ValueError('Unreviewed upstream host or coordinate redirect')


class Redirects(HTTPRedirectHandler):
    def __init__(self, artifact_path: str, source_url: str):
        self.artifact_path = artifact_path
        self.source_url = source_url
        self.observed = []
        self.expected_sha256 = None

    def redirect_request(self, request, fp, code, message, headers, newurl):
        expected = check_upstream(newurl, self.artifact_path, self.source_url)
        if expected:
            if self.expected_sha256 and expected != self.expected_sha256:
                raise ValueError('Redirect content hash changed')
            self.expected_sha256 = expected
        self.observed.append({'status': code, 'url': newurl})
        return super().redirect_request(request, fp, code, message, headers, newurl)


class Cache:
    def __init__(self, directory: Path, seed=None):
        if directory.is_symlink() or not directory.is_dir() or any(directory.iterdir()):
            raise ValueError('Acquisition cache must be a fresh owned directory')
        self.directory = directory
        self.lock = threading.Lock()
        self.slots = threading.BoundedSemaphore(4)
        self.seed = seed
        # Reserve every independently verified seed body in the4GiB input budget.
        self.downloaded = seed.input_bytes if seed is not None else 0
        self.requests = 0
        self.items = {}
        self.item_locks = {}
        self.logged = 0
        self.failed = None

    def record(self, **facts):
        with self.lock:
            line = json.dumps({'time': datetime.now(timezone.utc).isoformat(), **facts}) + '\n'
            self.logged += len(line.encode())
            if self.logged > LOG_BYTES:
                self.failed = 'Acquisition log budget exceeded'
                raise ValueError('Acquisition log budget exceeded')
            try:
                with (self.directory / 'events.jsonl').open('a') as output:
                    output.write(line)
                    output.flush()
            except OSError:
                self.failed = 'Acquisition log write failed'
                raise

    def fetch(self, request_path: str, method='GET'):
        if method not in ('GET','HEAD'): raise ValueError('Only GET/HEAD public inputs are admitted')
        with self.lock:
            if self.failed: raise ValueError(self.failed)
            self.requests += 1
            if self.requests > REQUESTS:
                raise ValueError('Acquisition request budget exceeded')
        url = path_url(request_path)
        artifact_path = request_path.split('/', 2)[2]
        check_upstream(url, artifact_path)
        with self.lock:
            item_lock = self.item_locks.setdefault(url, threading.Lock())
        with item_lock:
            return self.fetch_url(url, artifact_path, method)

    def fetch_url(self, url: str, artifact_path: str, method='GET'):
        if self.seed is not None:
            with self.lock:
                if self.failed: raise ValueError(self.failed)
            try:
                reused = self.seed.lookup(url)
            except Exception as failure:
                self.poison_seed({'useId':uuid4().hex,'method':method,'url':url},failure,'precheck',0,None)
                raise
            if reused is not None:
                body, original = reused
                # Preserve old authority verbatim; new checks never relabel history.
                receipt = {k:v for k,v in original.items() if k not in ('time','action','file')}
                receipt.update(file=None,seedFile=original['file'],
                    useId=uuid4().hex,method=method,
                    seedManifestSha256=self.seed.manifest_sha256,
                    sourceReceipt=original,
                    publisherSha256=REACT_NATIVE_ARTIFACTS.get(artifact_path),
                    publisherPinAddedIndependently=(original.get('publisherSha256') is None
                        and artifact_path in REACT_NATIVE_ARTIFACTS))
                self.record(action='artifact-reused',**receipt)
                return body,receipt
        with self.lock:
            if self.failed: raise ValueError(self.failed)
            cached = self.items.get(url)
        if cached:
            path, receipt = cached
            digest = hashlib.sha256()
            if path.is_symlink():
                raise ValueError('Acquisition cache integrity failed')
            with path.open('rb') as source:
                while chunk := source.read(CHUNK_BYTES): digest.update(chunk)
            if digest.hexdigest() != receipt['sha256']:
                raise ValueError('Acquisition cache integrity failed')
            return path, receipt
        with self.slots:
            redirects = Redirects(artifact_path, url)
            opener = build_opener(ProxyHandler({}), redirects)
            temporary = self.directory / (uuid4().hex + '.partial')
            count = 0; digest = hashlib.sha256()
            started = time.monotonic()
            try:
                with opener.open(Request(url, headers={'User-Agent': 'Micro-public-native-acquisition/1', 'Accept-Encoding': 'identity'}), timeout=30) as response:
                    final_hash = check_upstream(response.url, artifact_path, url)
                    if final_hash and redirects.expected_sha256 and final_hash != redirects.expected_sha256:
                        raise ValueError('Final redirect content hash changed')
                    publisher_hash = REACT_NATIVE_ARTIFACTS.get(artifact_path)
                    expected_hash = final_hash or redirects.expected_sha256 or publisher_hash
                    if response.status != 200 or response.headers.get('Content-Encoding') not in (None, 'identity'):
                        raise ValueError('Unsupported upstream response')
                    length = response.headers.get('Content-Length')
                    if length is not None and (not length.isdecimal() or int(length) > ARTIFACT_BYTES):
                        raise ValueError('Artifact declared size exceeds policy')
                    with temporary.open('xb') as output:
                        # read1 returns after at most one buffered/socket read.
                        # The outer acquisition job enforces its absolute wall
                        # bound, including DNS, TLS and response headers.
                        while chunk := response.read1(CHUNK_BYTES):
                            if time.monotonic() - started > 300:
                                raise ValueError('Artifact acquisition time exceeded policy')
                            count += len(chunk)
                            with self.lock:
                                self.downloaded += len(chunk)
                                if self.downloaded > TOTAL_BYTES:
                                    raise ValueError('Acquisition total byte budget exceeded')
                            if count > ARTIFACT_BYTES:
                                raise ValueError('Artifact expanded response exceeds policy')
                            output.write(chunk); digest.update(chunk)
                    if length is not None and count != int(length):
                        raise ValueError('Truncated upstream artifact')
                identifier = digest.hexdigest()
                if publisher_hash and identifier != publisher_hash:
                    raise ValueError('Independently pinned publisher content hash mismatch')
                if expected_hash and identifier != expected_hash:
                    raise ValueError('Publisher content hash mismatch')
                receipt = {'url': url, 'finalUrl': response.url, 'redirects': redirects.observed,
                           'sha256': identifier, 'bytes': count,
                           'redirectPathSha256': expected_hash if not publisher_hash else None,
                           'publisherSha256': publisher_hash,
                           'authority': 'observed public download hash, not independent publisher authenticity'}
                destination = self.directory / (uuid4().hex + '.blob')
                temporary.rename(destination)
                self.record(action='artifact-acquired', **receipt, file=destination.name)
                with self.lock:
                    if self.failed: raise ValueError(self.failed)
                    self.items[url] = (destination, receipt)
                return destination, receipt
            except Exception as error:
                self.record(action='artifact-failed', url=url, error=type(error).__name__, message=str(error)[:1000], retainedPartial=temporary.name if temporary.exists() else None)
                raise


    def poison_seed(self, receipt, failure, phase, streamed_bytes, streamed_sha256):
        with self.lock: self.failed='Public Maven seed response integrity failed'
        marker={'schema':'public-maven-seed-first-failure/1','useId':receipt['useId'],
                'method':receipt['method'],'phase':phase,'urlSha256':hashlib.sha256(receipt['url'].encode()).hexdigest(),
                'error':type(failure).__name__,'message':str(failure)[:200]}
        data=(json.dumps(marker)+'\n').encode()
        if len(data)>4096: data=b'{"error":"Public Maven seed integrity failed"}\n'
        try:
            with (self.directory/'seed-integrity-failure.json').open('xb') as output:
                output.write(data);output.flush();os.fsync(output.fileno())
        except FileExistsError: pass
        except OSError:
            # No durable rejection means this trusted acquisition cannot continue.
            # Supervisor requires a still-running proxy before claiming closure.
            os._exit(70)
        try:
            self.record(action='artifact-reuse-failed',useId=receipt['useId'],method=receipt['method'],
                url=receipt['url'],phase=phase,streamedBytes=streamed_bytes,streamedSha256=streamed_sha256,
                error=type(failure).__name__,message=str(failure)[:1000])
        except Exception: pass

    def verify_reuse_after(self, receipt, method, streamed_bytes, streamed_sha256, error=None):
        if receipt.get('seedManifestSha256'):
            try:
                if error is not None: raise ValueError('Public seed response failed: '+str(error)[:1000])
                if self.seed is None or receipt['seedManifestSha256'] != self.seed.manifest_sha256 or method != receipt['method']:
                    raise ValueError('Maven seed receipt identity/method changed')
                if method=='GET' and (streamed_bytes != receipt['bytes'] or streamed_sha256 != receipt['sha256']):
                    raise ValueError('Actual streamed public seed body hash/count mismatch')
                if method=='HEAD' and (streamed_bytes != 0 or streamed_sha256 is not None):
                    raise ValueError('HEAD must have zero body and no streamed proof')
                self.seed.verify_entry(self.seed.items[receipt['url']])
                self.record(action='artifact-reuse-postchecked',useId=receipt['useId'],method=method,
                    url=receipt['url'],sha256=receipt['sha256'],streamedBytes=streamed_bytes,
                    streamedSha256=streamed_sha256,bodyProof='actual-stream-sha256' if method=='GET' else 'head-no-body',
                    seedManifestSha256=self.seed.manifest_sha256)
            except Exception as failure:
                self.poison_seed(receipt,failure,'response',streamed_bytes,streamed_sha256)
                raise


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, *args):
        pass

    def do_GET(self):
        self.respond(body=True)

    def do_HEAD(self):
        self.respond(body=False)

    def respond(self, *, body: bool):
        cache = self.server.cache
        try:
            if any(self.headers.get_all(name) for name in ('Authorization', 'Proxy-Authorization', 'Cookie')):
                raise ValueError('Credential-bearing requests are forbidden')
            hosts = self.headers.get_all('Host') or []
            if len(hosts) != 1 or not re.fullmatch(r'[0-9.]+(?::[0-9]{1,5})?', hosts[0]):
                raise ValueError('Request authority must be the owned proxy IPv4 address')
            authority = urlsplit('http://' + hosts[0])
            if authority.hostname != self.server.server_address[0] or authority.port != self.server.server_address[1]:
                raise ValueError('Unexpected request authority')
            path, receipt = cache.fetch(self.path,method=self.command)
        except HTTPError as error:
            self.send_error(404 if error.code == 404 else 502, 'Public artifact unavailable')
            return
        except Exception as error:
            try:
                cache.record(action='request-rejected', pathSha256=hashlib.sha256(self.path.encode()).hexdigest(), error=type(error).__name__, message=str(error)[:1000])
            except Exception:
                pass
            self.send_error(502, 'Acquisition policy or upstream failure')
            return
        streamed_bytes=0
        streamed_sha256=hashlib.sha256()
        stream_error=None
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Length', str(receipt['bytes']))
            self.end_headers()
            if body:
                with path.open('rb') as source:
                    while chunk := source.read(CHUNK_BYTES):
                        if streamed_bytes+len(chunk)>receipt['bytes']:
                            raise ValueError('Public response stream exceeds receipt size')
                        written=self.wfile.write(chunk)
                        if written != len(chunk): raise ValueError('Public response short write')
                        streamed_bytes+=written;streamed_sha256.update(chunk)
        except Exception as error:
            stream_error=error
            raise
        finally:
            cache.verify_reuse_after(receipt,self.command,streamed_bytes,
                                     streamed_sha256.hexdigest() if body else None,stream_error)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8

    def __init__(self, *args):
        self.workers = threading.BoundedSemaphore(8)
        super().__init__(*args)

    def process_request(self, request, client_address):
        self.workers.acquire()
        try: super().process_request(request, client_address)
        except BaseException:
            self.workers.release()
            raise

    def process_request_thread(self, request, client_address):
        try: super().process_request_thread(request, client_address)
        finally: self.workers.release()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bind', required=True)
    parser.add_argument('--cache', required=True, type=Path)
    parser.add_argument('--seed-root', type=Path)
    parser.add_argument('--seed-manifest', type=Path)
    parser.add_argument('--seed-sha256')
    args = parser.parse_args()
    address = ipaddress.ip_address(args.bind)
    if address.version != 4 or not address.is_private or address.is_unspecified or address.is_loopback:
        raise ValueError('Bind only to the owned internal container IPv4 address')
    seed = None
    if any(x is not None for x in (args.seed_root,args.seed_manifest,args.seed_sha256)):
        if args.seed_root != Path('/seed/maven-bodies') or args.seed_manifest != Path('/seed/tools/verified-maven-seed.json') or args.seed_sha256 != '1f3f0bfbb2c0b9275ba736deea1b71654e6f9909057f3f4de519e6916d9e0140':
            raise ValueError('Only the fixed reviewed public Maven seed is admitted')
        from verified_maven_seed import VerifiedMavenSeed
        seed = VerifiedMavenSeed(args.seed_root,args.seed_manifest,args.seed_sha256,
                                 path_url,check_upstream,REACT_NATIVE_ARTIFACTS)
    server = Server((str(address), 8080), Handler)
    server.cache = Cache(args.cache,seed=seed)
    server.cache.record(action='acquisition-proxy-start', bind=str(address), port=8080,
                       scope='reviewed fixture only; candidate compilation forbidden')
    server.serve_forever()


if __name__ == '__main__': main()
