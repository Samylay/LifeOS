#!/usr/bin/env python3
"""Credential-free tarball mediation for one immutable reviewed npm lock only."""
import argparse
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
from pathlib import Path
import re
import threading
import time
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

LOCK_SHA256 = 'ae8bbc085fd039716dde9ba98c1039069b93455972f42659c8dccc5cb66fb282'
ARTIFACT_BYTES = 256 * 1024 * 1024
TOTAL_BYTES = 1024 * 1024 * 1024
LOG_BYTES = 10 * 1024 * 1024

def approved_inputs(lock_bytes):
    if hashlib.sha256(lock_bytes).hexdigest() != LOCK_SHA256:
        raise ValueError('Unapproved common lock bytes')
    lock = json.loads(lock_bytes)
    if lock.get('lockfileVersion') != 3:
        raise ValueError('Unexpected lock format')
    items = {}
    for name, package in lock['packages'].items():
        if not name:
            continue
        url = package.get('resolved', '')
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or parsed.netloc != 'registry.npmjs.org' or parsed.query or parsed.fragment or not re.fullmatch(r'/[A-Za-z0-9_@./+\-]+\.tgz', parsed.path) or '..' in parsed.path.split('/'):
            raise ValueError('Unapproved locked npm URL')
        integrity = package.get('integrity', '')
        if not integrity.startswith('sha512-'):
            raise ValueError('Missing locked strong integrity')
        expected = base64.b64decode(integrity[7:], validate=True)
        if len(expected) != 64:
            raise ValueError('Unexpected locked integrity')
        if parsed.path in items and items[parsed.path]['integrity'] != integrity:
            raise ValueError('Conflicting locked tarball')
        items[parsed.path] = {'url': url, 'integrity': integrity, 'version': package['version']}
    return items

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise ValueError('Locked npm tarball redirect requires review')

class Cache:
    def __init__(self, directory, items):
        if directory.is_symlink() or not directory.is_dir() or any(directory.iterdir()):
            raise ValueError('Require fresh owned npm acquisition cache')
        self.directory = directory
        self.items = items
        self.lock = threading.Lock()
        self.serial = threading.Lock()
        self.downloaded = 0
        self.logged = 0
        self.requests = 0
        self.complete = {}
    def record(self, **facts):
        line = json.dumps({'time': time.time(), **facts}) + '\n'
        with self.lock:
            self.logged += len(line.encode())
            if self.logged > LOG_BYTES:
                raise ValueError('Npm receipt budget exceeded')
            with (self.directory / 'events.jsonl').open('a') as out:
                out.write(line)
    def fetch(self, path):
        with self.lock:
            self.requests += 1
            if self.requests > 10000:
                raise ValueError('Npm request budget exceeded')
        if path not in self.items:
            raise ValueError('Tarball absent from immutable approved lock')
        with self.serial:
            item = self.items[path]
            destination = self.directory / (hashlib.sha256(path.encode()).hexdigest() + '.tgz')
            if path in self.complete:
                receipt = self.complete[path]
                if destination.is_symlink() or hashlib.sha256(destination.read_bytes()).hexdigest() != receipt['sha256']:
                    raise ValueError('Npm acquired cache tampered')
                return destination, receipt
            partial = destination.with_suffix('.partial')
            count = 0
            strong = hashlib.sha256()
            integrity = hashlib.sha512()
            start = time.monotonic()
            try:
                opener = build_opener(ProxyHandler({}), NoRedirect())
                with opener.open(Request(item['url'], headers={'Accept-Encoding': 'identity', 'User-Agent': 'Micro-locked-public-npm/1'}), timeout=30) as response:
                    length = response.headers.get('Content-Length')
                    if response.status != 200 or response.url != item['url'] or response.headers.get('Content-Encoding') not in (None, 'identity') or (length is not None and (not length.isdecimal() or int(length) > ARTIFACT_BYTES)):
                        raise ValueError('Unexpected npm response')
                    with partial.open('xb') as out:
                        while chunk := response.read(256 * 1024):
                            count += len(chunk)
                            self.downloaded += len(chunk)
                            if count > ARTIFACT_BYTES or self.downloaded > TOTAL_BYTES or time.monotonic() - start > 300:
                                raise ValueError('Npm acquisition bound exceeded')
                            out.write(chunk)
                            strong.update(chunk)
                            integrity.update(chunk)
                    if length is not None and count != int(length):
                        raise ValueError('Truncated npm tarball')
                if integrity.digest() != base64.b64decode(item['integrity'][7:], validate=True):
                    raise ValueError('Locked npm integrity mismatch')
                partial.rename(destination)
                receipt = dict(item, path=path, sha256=strong.hexdigest(), bytes=count, file=destination.name, authenticity='Lock-approved npm SHA512 integrity over official HTTPS; no independent publisher signature checked')
                self.record(action='npm-artifact-acquired', **receipt)
                self.complete[path] = receipt
                return destination, receipt
            except Exception as error:
                self.record(action='npm-artifact-failed', path=path, error=type(error).__name__, message=str(error)[:1000], partial=partial.name if partial.exists() else None)
                raise

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def do_GET(self):
        self.respond(True)
    def do_HEAD(self):
        self.respond(False)
    def respond(self, body):
        hosts = self.headers.get_all('Host') or []
        allowed = {str(self.server.server_address[0]) + ':8081', 'factory-acquisition-proxy:8081'}
        if any(name in self.headers for name in ('Authorization', 'Proxy-Authorization', 'Cookie')) or len(hosts) != 1 or hosts[0] not in allowed:
            self.send_error(403, 'Credential requests forbidden')
            return
        try:
            path, receipt = self.server.cache.fetch(self.path)
        except Exception as error:
            self.server.cache.record(action='npm-request-rejected', pathSha256=hashlib.sha256(self.path.encode()).hexdigest(), error=type(error).__name__)
            self.send_error(502, 'Locked npm acquisition policy failure')
            return
        self.send_response(200)
        self.send_header('Content-Length', str(receipt['bytes']))
        self.end_headers()
        if body:
            with path.open('rb') as source:
                while chunk := source.read(256 * 1024):
                    self.wfile.write(chunk)

class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8
    def __init__(self, *args):
        self.workers = threading.BoundedSemaphore(8)
        super().__init__(*args)
    def process_request(self, request, address):
        self.workers.acquire()
        try:
            super().process_request(request, address)
        except BaseException:
            self.workers.release()
            raise
    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.workers.release()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bind', required=True)
    parser.add_argument('--lock', type=Path, required=True)
    parser.add_argument('--cache', type=Path, required=True)
    args = parser.parse_args()
    address = ipaddress.ip_address(args.bind)
    if address.version != 4 or not address.is_private or address.is_unspecified or address.is_loopback:
        raise ValueError('Bind only to internal container IPv4')
    server = Server((str(address), 8081), Handler)
    server.cache = Cache(args.cache, approved_inputs(args.lock.read_bytes()))
    server.cache.record(action='locked-npm-proxy-start', lockSha256=LOCK_SHA256, tarballs=len(server.cache.items))
    server.serve_forever()

if __name__ == '__main__':
    main()
