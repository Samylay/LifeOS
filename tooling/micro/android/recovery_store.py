#!/usr/bin/env python3
"""Validate a complete quiescent synthetic fixture store inside a sandbox.

This is a fixture-specific SQLite adapter, not a customer backup format. The
supervisor must bind the manifest hash to its own collection receipt before
using this worker, and must reject failure before changing any device target.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import time

PACKAGE = 'app.micro.factory.fixture'
DATABASE = 'factory-fixture.db'
FILES = {DATABASE, DATABASE+'-wal', DATABASE+'-shm'}
TOTAL_BYTES = 8 * 1024 * 1024
MAX_INTEGER = 9007199254740991


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        while chunk := source.read(65536): value.update(chunk)
    return value.hexdigest()


def validate(directory, manifest):
    if set(manifest) != {'schema', 'package', 'version', 'files'}:
        raise ValueError('Unknown or missing fixture backup authority')
    if manifest['schema'] != 'micro.fixture-store/1' or manifest['package'] != PACKAGE or type(manifest['version']) is not int or manifest['version'] != 1:
        raise ValueError('Wrong product or incompatible fixture backup')
    files = manifest['files']
    if not isinstance(files, list) or not 1 <= len(files) <= 3:
        raise ValueError('Incomplete fixture backup files')
    names = set(); total = 0
    for item in files:
        if not isinstance(item, dict) or set(item) != {'name', 'bytes', 'sha256'}:
            raise ValueError('Invalid backup file record')
        name = item['name']
        if not isinstance(name, str) or name not in FILES or name in names: raise ValueError('Unexpected or duplicate store file')
        if not isinstance(item['sha256'], str) or not re.fullmatch(r'[0-9a-f]{64}', item['sha256']):
            raise ValueError('Invalid backup file hash')
        names.add(name)
        size = item['bytes']
        if type(size) is not int or not 0 < size <= TOTAL_BYTES:
            raise ValueError('Store file size exceeds policy')
        total += size
        if total > TOTAL_BYTES: raise ValueError('Complete store size exceeds policy')
        path = directory/name
        if path.is_symlink() or not path.is_file() or path.stat().st_size != size or digest(path) != item['sha256']:
            raise ValueError('Fixture backup file integrity failed')
    if DATABASE not in names: raise ValueError('Main fixture database missing')
    if {path.name for path in directory.iterdir()} != names:
        raise ValueError('Unrecorded backup file')

    with tempfile.TemporaryDirectory(prefix='fixture-store-') as temporary:
        working = Path(temporary)
        for name in names: shutil.copyfile(directory/name, working/name)
        database = sqlite3.connect((working/DATABASE).as_uri()+'?mode=ro', uri=True, timeout=1)
        deadline = time.monotonic()+5
        database.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
        try:
            database.execute('PRAGMA trusted_schema=OFF')
            database.execute('PRAGMA query_only=ON')
            if database.execute('PRAGMA integrity_check').fetchmany(2) != [('ok',)]:
                raise ValueError('Fixture SQLite integrity failed')
            if database.execute('PRAGMA user_version').fetchone() != (1,):
                raise ValueError('Incompatible fixture schema')
            objects = database.execute('SELECT type,name,tbl_name FROM sqlite_master ORDER BY name').fetchall()
            if objects != [('table', 'fixture_rows', 'fixture_rows'),
                           ('index', 'sqlite_autoindex_fixture_rows_1', 'fixture_rows')]:
                raise ValueError('Unexpected fixture schema objects')
            columns = database.execute('PRAGMA table_xinfo(fixture_rows)').fetchall()
            if [(column[1], column[2], column[3], column[5], column[6]) for column in columns] != [('id', 'TEXT', 1, 1, 0), ('value', 'INTEGER', 1, 0, 0)]:
                raise ValueError('Unexpected fixture table columns')
            rows = database.execute('SELECT id,value FROM fixture_rows ORDER BY id LIMIT 4').fetchall()
            if not 2 <= len(rows) <= 3 or {row[0] for row in rows} not in ({'counter-a', 'counter-b'}, {'counter-a', 'counter-b', 'sentinel'}):
                raise ValueError('Required fixture identities missing')
            if any(type(value) is not int or not 0 <= value <= MAX_INTEGER for _, value in rows):
                raise ValueError('Invalid fixture counter value')
            return {'schema': 'micro.fixture-store-validation/1', 'status': 'validated',
                    'package': PACKAGE, 'userVersion': 1,
                    'rows': [{'id': name, 'value': value} for name, value in rows],
                    'files': files, 'completeStoreBytes': total,
                    'scope': 'synthetic quiescent SQLite store only; device restore remains untested'}
        finally: database.close()


def main():
    try:
        if len(sys.argv) != 1: raise ValueError('Worker accepts no candidate arguments')
        manifest_path = Path('/input/manifest.json')
        if manifest_path.is_symlink() or not manifest_path.is_file() or not 0 < manifest_path.stat().st_size <= 16384:
            raise ValueError('Invalid fixture backup manifest')
        manifest = json.loads(manifest_path.read_text())
        result = validate(Path('/input/store'), manifest)
        result['manifestSha256'] = digest(manifest_path)
        print(json.dumps(result, sort_keys=True)); return 0
    except Exception as error:
        print(json.dumps({'schema': 'micro.fixture-store-validation/1', 'status': 'failed',
                          'error': {'type': type(error).__name__, 'message': str(error)[:1000]}}))
        return 1


if __name__ == '__main__': raise SystemExit(main())
