import copy
import importlib.util
from pathlib import Path
import sqlite3
import shutil
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('recovery_store', Path(__file__).resolve().parents[1]/'recovery_store.py')
worker = importlib.util.module_from_spec(spec); spec.loader.exec_module(worker)


class RecoveryTests(unittest.TestCase):
    def fixture(self, directory):
        store = directory/worker.DATABASE
        db = sqlite3.connect(store)
        db.executescript("CREATE TABLE fixture_rows(id TEXT PRIMARY KEY NOT NULL,value INTEGER NOT NULL CHECK(value>=0)); INSERT INTO fixture_rows VALUES('counter-a',2),('counter-b',1); PRAGMA user_version=1;")
        db.close()
        return {'schema': 'micro.fixture-store/1', 'package': worker.PACKAGE, 'version': 1,
                'files': [{'name': store.name, 'bytes': store.stat().st_size, 'sha256': worker.digest(store)}]}

    def test_known_state_preserves_ids_and_excludes_later_sentinel(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary); manifest = self.fixture(directory)
            result = worker.validate(directory, manifest)
            self.assertEqual(result['rows'], [{'id': 'counter-a', 'value': 2}, {'id': 'counter-b', 'value': 1}])

    def test_complete_quiescent_wal_set_preserves_committed_wal_write(self):
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary); live = parent/'live'; live.mkdir(); self.fixture(live)
            snapshot = parent/'snapshot'; snapshot.mkdir()
            db = sqlite3.connect(live/worker.DATABASE)
            try:
                db.execute('PRAGMA journal_mode=WAL'); db.execute('PRAGMA wal_autocheckpoint=0')
                db.execute("UPDATE fixture_rows SET value=3 WHERE id='counter-a'"); db.commit()
                # No further writes occur until the complete committed set is
                # copied. Actual device collection must first force-stop it.
                files = []
                for name in sorted(worker.FILES):
                    path = live/name
                    if not path.exists(): continue
                    shutil.copyfile(path, snapshot/name)
                    files.append({'name': name, 'bytes': path.stat().st_size, 'sha256': worker.digest(path)})
                manifest = {'schema': 'micro.fixture-store/1', 'package': worker.PACKAGE, 'version': 1, 'files': files}
                result = worker.validate(snapshot, manifest)
                self.assertIn(worker.DATABASE+'-wal', [item['name'] for item in files])
                self.assertEqual(result['rows'], [{'id': 'counter-a', 'value': 3}, {'id': 'counter-b', 'value': 1}])
            finally: db.close()

    def test_wrong_product_version_and_extra_authority_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary); clean = self.fixture(directory)
            for key, value in [('package', 'app.other.fixture'), ('version', 2), ('version', True), ('command', 'synthetic')]:
                bad = copy.deepcopy(clean); bad[key] = value
                with self.subTest(key=key), self.assertRaises(ValueError): worker.validate(directory, bad)

    def test_changed_store_or_unrecorded_wal_cannot_validate(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary); manifest = self.fixture(directory)
            wal = directory/(worker.DATABASE+'-wal'); wal.write_bytes(b'not-recorded')
            with self.assertRaisesRegex(ValueError, 'Unrecorded'): worker.validate(directory, manifest)
            wal.unlink(); (directory/worker.DATABASE).write_bytes(b'corrupted')
            with self.assertRaisesRegex(ValueError, 'integrity'): worker.validate(directory, manifest)

    def test_sqlite_like_name_extra_objects_are_rejected_after_resealing(self):
        for sql in ['CREATE TABLE sqliteXextra(payload TEXT)',
                    'CREATE TRIGGER sqliteXextra AFTER UPDATE ON fixture_rows BEGIN SELECT 1; END']:
            with self.subTest(sql=sql), tempfile.TemporaryDirectory() as temporary:
                directory = Path(temporary); manifest = self.fixture(directory)
                path = directory/worker.DATABASE
                db = sqlite3.connect(path); db.execute(sql); db.commit(); db.close()
                manifest['files'][0] = {'name': path.name, 'bytes': path.stat().st_size, 'sha256': worker.digest(path)}
                with self.assertRaisesRegex(ValueError, 'schema objects'): worker.validate(directory, manifest)

    def test_generated_hidden_column_is_rejected_after_resealing(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary); manifest = self.fixture(directory)
            path = directory/worker.DATABASE
            db = sqlite3.connect(path)
            db.execute('ALTER TABLE fixture_rows ADD COLUMN hidden INTEGER GENERATED ALWAYS AS (value + 1) VIRTUAL')
            db.commit(); db.close()
            manifest['files'][0] = {'name': path.name, 'bytes': path.stat().st_size, 'sha256': worker.digest(path)}
            with self.assertRaisesRegex(ValueError, 'table columns'): worker.validate(directory, manifest)

    def test_same_hash_resealed_corruption_missing_identity_and_schema_fail(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary); manifest = self.fixture(directory)
            db = sqlite3.connect(directory/worker.DATABASE); db.execute("DELETE FROM fixture_rows WHERE id='counter-b'"); db.commit(); db.close()
            path = directory/worker.DATABASE
            manifest['files'][0] = {'name': path.name, 'bytes': path.stat().st_size, 'sha256': worker.digest(path)}
            with self.assertRaisesRegex(ValueError, 'identities'): worker.validate(directory, manifest)
            path.write_bytes(b'bad-database')
            manifest['files'][0] = {'name': path.name, 'bytes': path.stat().st_size, 'sha256': worker.digest(path)}
            with self.assertRaises(sqlite3.DatabaseError): worker.validate(directory, manifest)


if __name__ == '__main__': unittest.main()
