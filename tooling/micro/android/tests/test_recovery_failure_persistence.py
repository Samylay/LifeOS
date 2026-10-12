"""FAKE bound health and temporary Store faults, no native operations."""
from dataclasses import replace
import unittest
from unittest.mock import patch
import admission as a
import test_fixture_recovery as fixture_cases


class FailurePersistenceTests(unittest.TestCase):
    def setUp(self):
        # Compose the frozen FAKE harness without inheriting/repeating its tests.
        self.case = fixture_cases.RecoveryTests('test_observed_sequence_preserves_snapshot_and_never_admits_recovery_or_counts')
        self.addCleanup(self.case.doCleanups)
        self.case.setUp()

    def earlier_operation_failure(self):
        case = self.case
        original = case.source.backend.transport
        self.operation_error = a.Rejected('FAKE earlier operational stop remains primary')
        def transport(argv, timeout, maximum):
            if argv[7:10] == ('shell', 'am', 'force-stop'):
                raise self.operation_error
            return original(argv, timeout, maximum)
        case.source.backend = replace(case.source.backend, transport=transport)

    def adverse_health(self, kind):
        case = self.case
        original = case.health_finish
        refs = {}
        cause = {'type': 'Rejected', 'reason': 'FAKE bound stream.finish cleanup failed'}
        def finish(adapter, ticket):
            reference = original(adapter, ticket)
            facts = case.fixture.store.json(reference)
            self.assertIsNone(facts['failure'])
            if kind == 'stream-cleanup':
                facts['stream'].update(cleanup=None, cleanupFailure=cause['reason'])
            elif kind == 'facts-cleanup':
                facts.update(stream=None, summary=None, cleanupFailure=cause)
            elif kind == 'crash':
                facts['summary'].update(status='failed', observedMatchingCrashEvents=1)
            elif kind == 'negative-cleanup':
                facts['stream'].update(cleanup={'absent':False}, cleanupFailure=cause['reason'])
            else:
                raise AssertionError('Unknown authored FAKE health fault')
            reference = case.replace_synthetic_receipt(reference, facts)
            refs.update(window=reference, baseline=ticket.baseline, final=a.Evidence.parse(facts['final']))
            return reference
        case.health_finish = finish
        return refs, cause

    def health_event_write_fault(self, kind, *, earlier=False):
        case = self.case
        refs, cause = self.adverse_health(kind)
        if earlier:
            self.earlier_operation_failure()
        original = case.fixture.store.write
        failed = []
        def write(relative, value, *args, **kwargs):
            if (value.get('schema') == 'micro.android.fixture-recovery-event/1'
                    and value.get('step') == 'source-snapshot-health-finish' and not failed):
                failed.append(relative)
                raise OSError('FAKE later health event write failed')
            return original(relative, value, *args, **kwargs)
        with patch.object(case.fixture.store, 'write', side_effect=write):
            _, report, raw = case.run_proposal()
        self.assertEqual(len(failed), 1)
        self.assertEqual(report['status'], 'failed')
        self.assertEqual(report['details']['firstFailure'], raw['firstFailure'])
        expected = ('FAKE earlier operational stop remains primary' if earlier else
            'Matching crash/ANR signal observed during recovery UI window' if kind == 'crash' else
            'Recovery owned-stream cleanup failed or unknown')
        self.assertEqual(raw['firstFailure']['reason'], expected)
        if kind == 'crash':
            self.assertEqual(raw['healthFindings'][0]['receipt'], refs['window'].json())
        else:
            cleanup = next(item for item in raw['cleanupFailures'] if item.get('kind') == 'owned-stream-cleanup')
            self.assertEqual(cleanup['receipt'], refs['window'].json())
            if kind == 'facts-cleanup':
                self.assertEqual(cleanup['failure'], cause)
            else:
                self.assertEqual(cleanup['streamCleanupFailure'], cause['reason'])
            if kind == 'negative-cleanup':
                self.assertEqual(report['cleanup'], {'absent':False})
            else:
                self.assertIsNone(report['cleanup'])
        diagnostic = next(item for item in raw['cleanupFailures'] if item.get('kind') == 'diagnostic-retention')
        self.assertEqual(diagnostic['reason'], 'FAKE later health event write failed')
        self.assertFalse(any(item['path'] == failed[0] for item in raw['events']))
        for ref in refs.values():
            self.assertIn(ref.json(), raw['verifiedEvidence'])
        self.assertFalse(case.target_calls)
        self.assertFalse(case.committed)

    def test_stream_cleanup_unknown_precedes_one_shot_event_write_error(self):
        self.health_event_write_fault('stream-cleanup')

    def test_bound_facts_cleanup_failure_precedes_one_shot_event_write_error(self):
        self.health_event_write_fault('facts-cleanup')

    def test_crash_summary_precedes_one_shot_event_write_error(self):
        self.health_event_write_fault('crash')

    def test_negative_stream_cleanup_survives_one_shot_event_write_error(self):
        self.health_event_write_fault('negative-cleanup')

    def test_earlier_operational_failure_survives_health_and_event_errors(self):
        self.health_event_write_fault('stream-cleanup', earlier=True)

    def final_write_fault(self, phase, *, earlier=False, health_kind=None):
        case = self.case
        if earlier:
            self.earlier_operation_failure()
        refs = None
        if health_kind:
            refs, _ = self.adverse_health(health_kind)
        original = case.fixture.store.write
        writes = []
        persistence_errors = []
        def write(relative, value, *args, **kwargs):
            if relative.endswith('/'+phase):
                writes.append(relative)
                error = OSError('FAKE final '+phase+' persistence failed')
                persistence_errors.append(error)
                raise error
            return original(relative, value, *args, **kwargs)
        with patch.object(case.fixture.store, 'write', side_effect=write):
            with self.assertRaises(OSError) as caught:
                case.run_proposal()
        error = caught.exception
        self.assertEqual(len(writes), 1)
        self.assertIs(error, persistence_errors[0])
        self.assertEqual(str(error), 'FAKE final '+phase+' persistence failed')
        diagnostic = getattr(error, 'recovery_failure', None)
        self.assertIsInstance(diagnostic, dict, 'Final persistence must expose captured recovery diagnostics')
        self.assertEqual(diagnostic['schema'], 'micro.android.fixture-recovery-persistence-failure/1')
        self.assertEqual(diagnostic['persistencePhase'], phase)
        self.assertFalse(diagnostic['stageObservationProduced'])
        self.assertEqual(diagnostic['persistenceFailure']['reason'], str(error))
        self.assertEqual(diagnostic['cleanup'], diagnostic['diagnostics']['cleanupAggregate'])
        first = diagnostic['firstFailure']
        if earlier:
            self.assertEqual(first['reason'], 'FAKE earlier operational stop remains primary')
            self.assertIsInstance(error.__cause__, a.Rejected)
            self.assertEqual(str(error.__cause__), first['reason'])
            self.assertIs(error.__cause__, self.operation_error)
        elif health_kind:
            expected = ('Matching crash/ANR signal observed during recovery UI window' if health_kind == 'crash'
                else 'Recovery owned-stream cleanup failed or unknown')
            self.assertEqual(first['reason'], expected)
            self.assertEqual(str(error.__cause__), first['reason'])
        else:
            self.assertIsNone(first)
            self.assertIsNone(error.__cause__)
            self.assertEqual(diagnostic['cleanup'], {'absent':True})
        if health_kind:
            array = (diagnostic['diagnostics']['healthFindings'] if health_kind == 'crash' else
                     diagnostic['diagnostics']['cleanupFailures'])
            self.assertTrue(any(item.get('receipt') == refs['window'].json() for item in array))
        if phase == 'recovery.json':
            self.assertIsNone(diagnostic['rawObservation'])
        else:
            raw = diagnostic['rawObservation']
            self.assertTrue(raw['verified'])
            case.fixture.store.verify(a.Evidence.parse(raw['reference']))
            self.assertEqual(case.fixture.store.json(a.Evidence.parse(raw['reference']))['firstFailure'], first)
        self.assertFalse(case.fixture.store.path(writes[0]).exists())

    def test_final_raw_write_preserves_earlier_operational_failure(self):
        self.final_write_fault('recovery.json', earlier=True, health_kind='negative-cleanup')

    def test_final_stage_write_preserves_earlier_operational_failure(self):
        self.final_write_fault('stage-observation.json', earlier=True, health_kind='negative-cleanup')

    def test_final_raw_write_preserves_bound_health_failure(self):
        self.final_write_fault('recovery.json', health_kind='crash')

    def test_final_stage_write_preserves_bound_health_failure(self):
        self.final_write_fault('stage-observation.json', health_kind='stream-cleanup')

    def test_healthy_final_raw_write_failure_still_throws_with_diagnostics(self):
        self.final_write_fault('recovery.json')

    def test_healthy_final_stage_write_failure_still_throws_with_diagnostics(self):
        self.final_write_fault('stage-observation.json')
