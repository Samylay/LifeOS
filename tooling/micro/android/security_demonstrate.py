#!/usr/bin/env python3
"""Actual disposable security fixtures, first results retained without retries."""
import json
from pathlib import Path
import secrets
from security_native import Supervisor, source_coverage


def main():
    supervisor = Supervisor()
    fixture = supervisor.state / 'trusted-fixtures'; fixture.mkdir(exist_ok=False)
    cases = {}
    for name in ('clean', 'secret', 'known-finding'):
        path = fixture / name; path.mkdir(); cases[name] = path
        packages = {'': {'name': 'security-' + name, 'version': '1.0.0'}}
        if name == 'known-finding':
            packages['node_modules/lodash'] = {'version': '4.17.15', 'resolved': 'https://registry.npmjs.org/lodash/-/lodash-4.17.15.tgz'}
        (path / 'package.json').write_text(json.dumps({'name': 'security-' + name, 'version': '1.0.0'}))
        (path / 'package-lock.json').write_text(json.dumps({'name': 'security-' + name, 'version': '1.0.0', 'lockfileVersion': 3, 'packages': packages}))
    # Deliberately fake and generated locally. Scanner logs/reports must redact it.
    fake = 'ghp_' + ''.join(secrets.choice('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') for _ in range(36))
    (cases['secret'] / 'fake.js').write_text('const github_token = "' + fake + '";\n')
    results = {}
    for name, path in cases.items():
        results[name] = supervisor.scan('demonstration-' + name, path)
        if fake in (supervisor.state / ('demonstration-' + name) / 'stdout.json').read_text():
            raise ValueError('synthetic secret was not redacted')
    source = Path(__file__).resolve().parent / 'fixtures/native-smoke'
    results['native-source'] = supervisor.scan('native-source-first-scan', source)
    supervisor.write(supervisor.state / 'npm-input-coverage.json', source_coverage(source))
    supervisor.write(supervisor.state / 'demonstration-verdicts.json', results)
    expected = {'clean': 'pass', 'secret': 'blocked', 'known-finding': 'blocked'}
    if any(results[k]['verdict'] != value for k, value in expected.items()): raise ValueError('actual scanner fixture predicate failed')
    if results['secret'].get('secretCount', 0) < 1: raise ValueError('secret was not found')
    if results['known-finding'].get('highCriticalCount', 0) < 1: raise ValueError('known vulnerability was not found')
    print(json.dumps({k: {field: value for field, value in v.items() if field in ('verdict', 'reason', 'secretCount', 'highCriticalCount', 'componentCount')} for k, v in results.items()}))


if __name__ == '__main__': main()
