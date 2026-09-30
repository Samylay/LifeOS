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


def check_upstream(url: str, artifact_path: str) -> str | None:
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.port not in (None, 443):
        raise ValueError('Upstream URL contains unsupported authority')
    if '%' in parsed.path or '\\' in parsed.path or '..' in PurePosixPath(parsed.path).parts:
        raise ValueError('Unsafe upstream path')
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
    def __init__(self, artifact_path: str):
        self.artifact_path = artifact_path
        self.observed = []
        self.expected_sha256 = None

    def redirect_request(self, request, fp, code, message, headers, newurl):
        expected = check_upstream(newurl, self.artifact_path)
        if expected:
            if self.expected_sha256 and expected != self.expected_sha256:
                raise ValueError('Redirect content hash changed')
            self.expected_sha256 = expected
        self.observed.append({'status': code, 'url': newurl})
        return super().redirect_request(request, fp, code, message, headers, newurl)


class Cache:
    def __init__(self, directory: Path):
        if directory.is_symlink() or not directory.is_dir() or any(directory.iterdir()):
            raise ValueError('Acquisition cache must be a fresh owned directory')
        self.directory = directory
        self.lock = threading.Lock()
        self.slots = threading.BoundedSemaphore(4)
        self.downloaded = 0
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

    def fetch(self, request_path: str):
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
            return self.fetch_url(url, artifact_path)

    def fetch_url(self, url: str, artifact_path: str):
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
            redirects = Redirects(artifact_path)
            opener = build_opener(ProxyHandler({}), redirects)
            temporary = self.directory / (uuid4().hex + '.partial')
            count = 0; digest = hashlib.sha256()
            started = time.monotonic()
            try:
                with opener.open(Request(url, headers={'User-Agent': 'Micro-public-native-acquisition/1', 'Accept-Encoding': 'identity'}), timeout=30) as response:
                    final_hash = check_upstream(response.url, artifact_path)
                    if final_hash and redirects.expected_sha256 and final_hash != redirects.expected_sha256:
                        raise ValueError('Final redirect content hash changed')
                    expected_hash = final_hash or redirects.expected_sha256
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
                if expected_hash and identifier != expected_hash:
                    raise ValueError('Plugin CDN content hash mismatch')
                receipt = {'url': url, 'finalUrl': response.url, 'redirects': redirects.observed,
                           'sha256': identifier, 'bytes': count,
                           'redirectPathSha256': expected_hash,
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
            path, receipt = cache.fetch(self.path)
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
        self.send_response(200)
        self.send_header('Content-Type', 'application/octet-stream')
        self.send_header('Content-Length', str(receipt['bytes']))
        self.end_headers()
        if body:
            with path.open('rb') as source:
                while chunk := source.read(CHUNK_BYTES): self.wfile.write(chunk)


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
    args = parser.parse_args()
    address = ipaddress.ip_address(args.bind)
    if address.version != 4 or not address.is_private or address.is_unspecified or address.is_loopback:
        raise ValueError('Bind only to the owned internal container IPv4 address')
    server = Server((str(address), 8080), Handler)
    server.cache = Cache(args.cache)
    server.cache.record(action='acquisition-proxy-start', bind=str(address), port=8080,
                       scope='reviewed fixture only; candidate compilation forbidden')
    server.serve_forever()


if __name__ == '__main__': main()
