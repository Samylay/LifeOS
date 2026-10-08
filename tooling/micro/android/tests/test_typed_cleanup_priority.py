"""FAKE malformed cleanup cannot claim explicit negative producer authority."""
import unittest
import test_bound_health_priority as prior


class TypedCleanupPriorityTests(unittest.TestCase):
    def test_invalid_cleanup_never_precedes_later_nested_read_or_hash_failure(self):
        for invalid in ({'absent':0}, {'absent':False,'extra':True}):
            for fault in ('read', 'hash'):
                with self.subTest(cleanup=invalid, fault=fault):
                    harness = prior.BoundHealthPriorityTests(
                        'test_no_explicit_adverse_cause_keeps_later_read_or_hash_failure_primary')
                    try:
                        harness.setUp()
                        case = harness.case
                        original_finish = case.health_finish
                        original_json = case.fixture.store.json
                        original_run = case.run_proposal
                        produced = []
                        receipts = []
                        def malformed_finish(adapter, ticket):
                            reference = original_finish(adapter, ticket)
                            facts = original_json(reference)
                            self.assertIsNone(facts['failure'])
                            self.assertNotEqual(facts['summary']['status'], 'failed')
                            self.assertFalse(facts.get('cleanupFailure'))
                            self.assertFalse(facts['stream'].get('cleanupFailure'))
                            facts['stream']['cleanup'] = dict(invalid)
                            reference = case.replace_synthetic_receipt(reference, facts)
                            receipts.append((reference, facts))
                            return reference
                        def capture_run():
                            result = original_run()
                            produced.append(result)
                            return result
                        case.health_finish = malformed_finish
                        case.run_proposal = capture_run
                        harness.later_sibling_fault('none', fault)
                        self.assertEqual(len(receipts), 1)
                        self.assertEqual(receipts[0][1]['stream']['cleanup'], invalid)
                        _, report, raw = produced[0]
                        self.assertIsNone(report['cleanup'])
                        self.assertNotIn(invalid, raw['cleanupObservations'])
                        self.assertIn(receipts[0][0].json(), raw['verifiedEvidence'])
                        self.assertTrue(any(item['kind'] == 'owned-stream-cleanup'
                            and item['cleanup'] is None for item in raw['cleanupFailures']))
                        self.assertNotIn('healthCauseFailure', raw['firstFailure'])
                    finally:
                        harness.doCleanups()
