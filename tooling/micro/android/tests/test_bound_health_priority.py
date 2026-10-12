"""FAKE bound producer evidence versus later temporary read/integrity faults."""
import unittest
from unittest.mock import patch
import admission as a
import test_recovery_failure_persistence as prior


class BoundHealthPriorityTests(unittest.TestCase):
    def setUp(self):
        self.harness = prior.FailurePersistenceTests('test_stream_cleanup_unknown_precedes_one_shot_event_write_error')
        self.addCleanup(self.harness.doCleanups)
        self.harness.setUp()
        self.case = self.harness.case

    def later_sibling_fault(self, kind, fault, *, earlier=False):
        case = self.case
        if earlier:
            self.harness.earlier_operation_failure()
        if kind in ('none', 'negative-only'):
            refs = {}
        else:
            refs, _ = self.harness.adverse_health('crash' if kind == 'combined' else kind)
        original_finish = case.health_finish
        original_json = case.fixture.store.json
        failed_reads = []
        def finish(adapter, ticket):
            reference = original_finish(adapter, ticket)
            facts = original_json(reference)
            self.assertIsNone(facts['failure'])
            if kind in ('combined', 'negative-only'):
                facts['stream'].update(cleanup={'absent':False},
                    cleanupFailure='FAKE explicit stream cleanup failure' if kind == 'combined' else None)
                reference = case.replace_synthetic_receipt(reference, facts)
            final = a.Evidence.parse(facts['final'])
            final_facts = original_json(final)
            raw = a.Evidence.parse(final_facts['raw'])
            refs.update(window=reference, baseline=ticket.baseline, final=final, raw=raw)
            if fault == 'hash':
                path = case.fixture.store.path(raw.path)
                data = path.read_bytes()
                path.chmod(0o600)
                path.write_bytes(b'!'+data[1:])
                path.chmod(0o400)
            return reference
        def json_read(reference, *args, **kwargs):
            if reference == refs.get('final') and fault == 'read' and not failed_reads:
                failed_reads.append(reference)
                raise OSError('FAKE later nested final observation read failed')
            return original_json(reference, *args, **kwargs)
        case.health_finish = finish
        with patch.object(case.fixture.store, 'json', side_effect=json_read):
            _, report, raw = case.run_proposal()
        self.assertEqual(report['status'], 'failed')
        self.assertEqual(report['details']['firstFailure'], raw['firstFailure'])
        if earlier:
            self.assertEqual(raw['firstFailure']['reason'], 'FAKE earlier operational stop remains primary')
        elif kind in ('crash', 'combined'):
            self.assertEqual(raw['firstFailure']['reason'],
                'Matching crash/ANR signal observed during recovery UI window')
            self.assertEqual(raw['firstFailure']['healthCauseFailure']['kind'], 'matching-crash-anr')
            self.assertEqual(raw['firstFailure']['healthCauseReceipt'], refs['window'].json())
        elif kind != 'none':
            self.assertEqual(raw['firstFailure']['reason'], 'Recovery owned-stream cleanup failed or unknown')
            self.assertEqual(raw['firstFailure']['healthCauseFailure']['kind'], 'owned-stream-cleanup')
            self.assertEqual(raw['firstFailure']['healthCauseReceipt'], refs['window'].json())
        elif fault == 'read':
            self.assertEqual(raw['firstFailure']['reason'], 'FAKE later nested final observation read failed')
            self.assertEqual(raw['firstFailure']['type'], 'OSError')
            self.assertNotIn('healthCauseFailure', raw['firstFailure'])
        else:
            self.assertIn('Evidence hash', raw['firstFailure']['reason'])
            self.assertNotIn('healthCauseFailure', raw['firstFailure'])
        failures = raw['healthEvidenceRetentionFailures']
        self.assertTrue(any(item['reference'] == refs['final'].json() for item in failures))
        for name in ('baseline', 'final', 'window'):
            self.assertIn(refs[name].json(), raw['verifiedEvidence'])
        if fault == 'hash':
            self.assertIn(refs['raw'].json(), raw['unverifiedEvidence'])
            self.assertNotIn(refs['raw'].json(), report['details']['evidence'])
            self.assertTrue(any(item['reference'] == refs['raw'].json() for item in raw['integrityFailures']))
        else:
            self.assertEqual(failed_reads, [refs['final']])
        if kind in ('negative-only', 'combined'):
            self.assertEqual(report['cleanup'], {'absent':False})
            self.assertIn({'absent':False}, raw['cleanupObservations'])
        else:
            self.assertIsNone(report['cleanup'], 'Untrusted sibling cannot supply affirmative cleanup')
        if kind in ('crash', 'combined'):
            self.assertEqual(raw['healthFindings'][0]['receipt'], refs['window'].json())
        self.assertFalse(case.target_calls)
        self.assertFalse(case.committed)

    def test_bound_facts_cleanup_precedes_later_nested_final_read_error(self):
        self.later_sibling_fault('facts-cleanup', 'read')

    def test_bound_stream_cleanup_precedes_later_nested_raw_hash_failure(self):
        self.later_sibling_fault('stream-cleanup', 'hash')

    def test_bound_crash_precedes_later_nested_final_read_error(self):
        self.later_sibling_fault('crash', 'read')

    def test_bound_crash_precedes_later_nested_raw_hash_failure(self):
        self.later_sibling_fault('crash', 'hash')

    def test_bound_crash_keeps_priority_over_cleanup_and_later_integrity(self):
        self.later_sibling_fault('combined', 'hash')

    def test_bound_negative_cleanup_without_error_string_precedes_later_integrity(self):
        self.later_sibling_fault('negative-only', 'hash')

    def test_earlier_operational_failure_survives_bound_cleanup_and_later_read(self):
        self.later_sibling_fault('facts-cleanup', 'read', earlier=True)

    def test_no_explicit_adverse_cause_keeps_later_read_or_hash_failure_primary(self):
        for fault in ('read', 'hash'):
            with self.subTest(fault=fault):
                # Independent harness/store per subcase, no stale prior receipts.
                case = type(self)('test_bound_facts_cleanup_precedes_later_nested_final_read_error')
                try:
                    case.setUp()
                    case.later_sibling_fault('none', fault)
                finally:
                    case.doCleanups()
