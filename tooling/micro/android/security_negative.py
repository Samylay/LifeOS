#!/usr/bin/env python3
"""Retain actual database/scanner failures plus trusted age-clock injection."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import shutil
from security_native import Supervisor, authority, digest, tree_manifest, validate_database, validate_scan


def main():
    s = Supervisor(); base = s.state / 'database-negatives'; base.mkdir(exist_ok=False)
    accepted = json.loads((s.state / 'database-receipt.json').read_text())
    summary = {}
    for name in ('missing', 'corrupt', 'checksum'):
        cache = base / name; cache.mkdir()
        if name != 'missing':
            (cache / '6').mkdir()
            if name == 'corrupt': (cache / '6/vulnerability.db').write_bytes(b'not a SQLite advisory database')
            else:
                # Copy only the owned public DB, never a candidate or host database.
                original = Path(accepted['cachePath']) / '6/vulnerability.db'
                shutil.copyfile(original, cache / '6/vulnerability.db')
                if digest(cache / '6/vulnerability.db') != accepted['sha256']: raise ValueError('fixture copy hash mismatch')
            imported = dict(accepted['importMetadata'], digest='xxh64:0000000000000000')
            (cache / '6/import.json').write_text(json.dumps(imported))
        receipt = s.run('negative-database-' + name, 'dbstatus', cache=cache)
        status = receipt['worker']['database']
        if status.get('valid') is True: raise ValueError('negative database was accepted')
        if receipt['worker']['commands'][0]['exitCode'] == 0: raise ValueError('negative scanner status returned success')
        summary[name] = {'verdict': 'blocked', 'actualScannerStatus': status,
                         'receiptSha256': digest(s.state / ('negative-database-' + name) / 'receipt.json')}
    # Test the frozen 120h controller age predicate with the real database bytes
    # and actual creation time. This does not claim a changed scanner clock.
    files = tree_manifest(Path(accepted['cachePath']))
    future = datetime.now(timezone.utc) + timedelta(days=6)
    try:
        validate_database(accepted['metadata'], files, now=future, imported=accepted['importMetadata'])
    except ValueError as error:
        summary['stale'] = {'verdict': 'blocked', 'reason': str(error), 'trustedClock': future.isoformat(),
                            'kind': 'controller age predicate using actual DB; scanner clock unchanged',
                            'actualDatabaseSha256': accepted['sha256'], 'maximumAgeSeconds': 432000}
    else: raise ValueError('stale database passed')
    crash = s.run('negative-scanner-crash', 'crash')
    command = crash['worker']['commands'][0]
    if command.get('error') != 'ENOENT' or command['exitCode'] is not None: raise ValueError('crash fixture did not crash')
    try: validate_scan(crash['worker'], accepted)
    except ValueError as error:
        summary['scanner-crash'] = {'verdict': 'blocked', 'reason': str(error), 'actualError': command,
                                    'receiptSha256': digest(s.state / 'negative-scanner-crash/receipt.json')}
    else: raise ValueError('crashed scanner accepted')
    summary['authority'] = authority();s.write(s.state / 'negative-verdicts.json', summary)
    print(json.dumps({name: value.get('verdict') for name, value in summary.items() if name != 'authority'}))


if __name__ == '__main__': main()
