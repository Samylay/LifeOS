"""Private FAKE integration checks. No actual signing or device admission."""
import tempfile
import unittest
import admission as a
import signing_normalization as signing
from test_android_pipeline import SyntheticFixture


class IntegrationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.fixture = SyntheticFixture(temporary.name)

    def test_fake_source_authority_pin_is_scoped_and_restored(self):
        reviewed = '8cfb316455a451d2781bfd4dc589acb91bb7ef52'
        self.assertEqual(signing.FIXTURE_SOURCE, reviewed)
        self.assertEqual(self.fixture.binding.source_sha, '1'*40)
        with self.fixture.checks_test_scope():
            self.assertEqual(signing.FIXTURE_SOURCE, self.fixture.binding.source_sha)
        self.assertEqual(signing.FIXTURE_SOURCE, reviewed)

    def test_fake_source_root_and_certificate_seams_restore_after_error(self):
        before = (signing.FIXTURE_SOURCE, signing.SOURCE_ROOT, signing.public_certificate)
        with self.assertRaisesRegex(RuntimeError, 'FAKE injected scope error'):
            with self.fixture.checks_test_scope():
                self.assertEqual(signing.FIXTURE_SOURCE, self.fixture.binding.source_sha)
                self.assertEqual(signing.SOURCE_ROOT, self.fixture.fake_signer_root)
                raise RuntimeError('FAKE injected scope error')
        self.assertEqual((signing.FIXTURE_SOURCE, signing.SOURCE_ROOT, signing.public_certificate), before)

    def test_real_pipeline_replays_complete_snapshot_and_current_build_closure(self):
        f = self.fixture
        normalized = f.store.json(f.signing)
        self.assertIn('rawReceipt', normalized)
        self.assertIn('snapshot', normalized)
        snapshot = f.store.json(a.Evidence.parse(normalized['snapshot']))
        self.assertEqual(snapshot['sourceRoot'], str(f.fake_signer_root/'synthetic'))
        with f.checks_test_scope():
            a.validate_build_pair(f.builds, f.binding, f.store, f.now, 3600)
        result, _ = f.run()
        self.assertEqual(result['status'], 'passed', result['firstFailure'])
        self.assertFalse(result['publishAuthorized'])

    def test_changed_original_signer_bytes_block_artifact_stage(self):
        f = self.fixture
        original = f.fake_signer_root/'synthetic/signing.log'
        original.write_bytes(original.read_bytes()+b'FAKE later mutation\n')
        result, _ = f.run()
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['firstFailure']['stage'], 'artifact-inspection')
        self.assertIn('lineage', result['firstFailure']['reason'])

    def test_missing_raw_or_snapshot_cannot_enter_device_stages(self):
        for missing in ('rawReceipt', 'snapshot'):
            with self.subTest(missing=missing), tempfile.TemporaryDirectory() as directory:
                f = SyntheticFixture(directory)
                normalized = f.store.json(f.signing)
                normalized.pop(missing)
                f.signing = f.put(normalized)
                result, _ = f.run()
                self.assertEqual(result['status'], 'failed')
                self.assertEqual(result['firstFailure']['stage'], 'artifact-inspection')
                self.assertIn('missing or unknown fields', result['firstFailure']['reason'])
