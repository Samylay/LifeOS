#!/usr/bin/env python3
"""Run inside acquisition client before any fixture execution."""
import argparse
import hashlib
import http.client
import json
from pathlib import Path
import socket

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--proxy', required=True)
    parser.add_argument('--maven', action='store_true')
    args = parser.parse_args()
    if socket.gethostbyname('factory-acquisition-proxy') != args.proxy:
        raise ValueError('Owned proxy hostname mapping mismatch')
    routes = Path('/proc/net/route').read_text()
    rows = [line.split() for line in routes.splitlines()[1:]]
    if any(row[1] == '00000000' for row in rows):
        raise ValueError('Acquisition client has a default IPv4 route')
    v6 = Path('/proc/net/ipv6_route').read_text()
    if any(row.split()[0] == '0' * 32 and row.split()[1] == '00' and row.split()[-1] != 'lo' for row in v6.splitlines()):
        raise ValueError('Acquisition client has default IPv6 route')
    blocked = []
    for target in ('1.1.1.1', '169.254.169.254', args.proxy.rsplit('.', 1)[0] + '.1'):
        try:
            with socket.create_connection((target, 443), timeout=2):
                raise ValueError('Arbitrary or gateway route reachable: ' + target)
        except OSError as error:
            blocked.append({'target': target, 'exception': type(error).__name__})
    domain = 'example.com'
    try:
        with socket.create_connection((domain, 443), timeout=2):
            raise ValueError('Arbitrary external domain reachable')
    except OSError as error:
        blocked.append({'target': domain, 'exception': type(error).__name__})
    port = 8080 if args.maven else 8081
    credential_rejection = (502,) if args.maven else (403,)
    approved = '/central/org/jetbrains/kotlin/kotlin-gradle-plugin/2.1.20/kotlin-gradle-plugin-2.1.20.pom' if args.maven else '/expo/-/expo-57.0.25.tgz'
    responses = []
    print(json.dumps({'status': 'network-route-policy-proved', 'routes': routes, 'ipv6Routes': v6, 'blockedConnections': blocked}), flush=True)
    for method, path, headers, expected in (
        ('GET', 'https://example.com/private.jar', {}, (403, 502)),
        ('GET', approved + '?credential=forbidden', {}, (502,)),
        ('GET', approved, {'Authorization': 'Bearer synthetic-test-only'}, credential_rejection),
        ('HEAD', approved, {'Proxy-Authorization': 'Basic synthetic-test-only'}, credential_rejection),
        ('GET', approved, {'Cookie': 'synthetic-test-only'}, credential_rejection),
        ('GET', approved, {'Host': 'synthetic@' + args.proxy + ':' + str(port)}, credential_rejection),
        ('CONNECT', 'example.com:443', {}, (501,)),
        ('GET', approved, {}, (200,)),
    ):
        connection = http.client.HTTPConnection(args.proxy, port, timeout=60)
        connection.request(method, path, headers=headers)
        response = connection.getresponse()
        digest = hashlib.sha256()
        count = 0
        while chunk := response.read(256 * 1024):
            count += len(chunk)
            if count > 10 * 1024 * 1024:
                raise ValueError('Network proof response size exceeded')
            digest.update(chunk)
        responses.append({'method': method, 'pathSha256': hashlib.sha256(path.encode()).hexdigest(), 'status': response.status, 'bytes': count, 'sha256': digest.hexdigest(), 'credentialTest': bool(headers)})
        connection.close()
        if response.status not in expected:
            print(json.dumps({'status': 'first-network-policy-failure', 'responses': responses}), flush=True)
            raise ValueError('Proxy policy predicate failed: ' + json.dumps(responses[-1]))
    print(json.dumps({'status': 'network-policy-proved', 'routes': routes, 'ipv6Routes': v6, 'blockedConnections': blocked, 'proxyResponses': responses}, sort_keys=True))

if __name__ == '__main__':
    main()
