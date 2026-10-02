"""Authored synthetic diagnostics and pure process mocks. No ADB/children run."""
import copy
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import admission
import device
import fixture_health as health
from test_android_device import MockDevice
from test_android_pipeline import SyntheticFixture
import test_native_fixture_journey as journey_tests

STAMP = '2026-09-30 12:00:00.000'
EPOCH = int(datetime(2026, 9, 30, 12, tzinfo=timezone.utc).timestamp())
EMPTY = (health.HEADER+'\nLast Timestamp of Persistence Into Persistent Storage: '+STAMP+'\n').encode()


def exit_dump(reason=4, text='APP CRASH(EXCEPTION)', subreason=0, subtext='UNKNOWN', pid=321):
    return EMPTY + (f' package: {health.PACKAGE}\n Historical Process Exit for uid=10123\n'
        f'  ApplicationExitInfo #0:\n  timestamp={STAMP} pid={pid} realUid=10123 packageUid=10123 definingUid=10123 user=0\n'
        f'  process={health.PACKAGE} reason={reason} ({text}) subreason={subreason} ({subtext}) status=0\n'
        '  importance=100 pss=1.0MB rss=2.0MB description=FAKE diagnostic, commas (nested) state=empty trace=null\n').encode()


def event(tag='am_anr', process=health.PACKAGE, stamp=EPOCH, tail='FAKE private message, comma'):
    return f'{stamp}.000000  1000  1001 I {tag}: [0,321,{process},0,{tail}]'.encode()


def stream_facts(events=()):
    return {'events': list(events), 'failure': None, 'cleanupFailure': None,
            'cleanup': {'absent': True}, 'exitCode': -9, 'readiness': 'image-calibration-pending'}


class ParserTests(unittest.TestCase):
    def test_exact_role_fixed_argv_and_no_extra_arguments(self):
        for role, serial in health.SERIALS.items():
            argv = health.stream_argv(role, EPOCH)
            self.assertEqual(argv[6], serial); self.assertEqual(argv[-3:], ('-s','am_anr:I','am_crash:I'))
            self.assertEqual(argv[7:11], ('shell','logcat','-b','events'))
        for role, stamp in [('budget-v3', EPOCH), ('factory-source', True), ('factory-source', '../path')]:
            with self.assertRaises(admission.Rejected): health.stream_argv(role, stamp)

    def test_actual_grouped_fields_nested_reason_and_stops(self):
        crash = health.parse_exit_info(exit_dump(), 10123, 'UTC')[0]
        self.assertEqual(crash['reason'], 4); self.assertEqual(crash['timestamp'], EPOCH)
        self.assertNotIn('description', crash)
        stop = health.parse_exit_info(exit_dump(10,'USER REQUESTED',21,'FORCE STOP'),10123,'UTC')[0]
        self.assertEqual(stop['subreasonText'], 'FORCE STOP')
        self.assertEqual(health.parse_exit_info(EMPTY,10123,'UTC'), [])

    def test_corrupt_partial_wrong_uid_package_duplicate_and_unknown_reason_reject(self):
        source = exit_dump()
        for data in (b'', b'permission denied\n', source+b'DUMP TIMEOUT\n', source[:-20],
                     source.replace(b'uid=10123',b'uid=99999'),source.replace(b'user=0',b'user=1'),
                     source.replace(health.PACKAGE.encode(),b'app.other'),
                     source.replace(b'reason=4',b'reason=17'), source+b' ApplicationExitInfo #1:\n',
                     source+source.split(b'  ApplicationExitInfo')[0], b'x'*(health.DUMP_LIMIT+1)):
            with self.subTest(data=data[:80]), self.assertRaises(admission.Rejected):
                health.parse_exit_info(data,10123,'UTC')

    def test_dst_invalid_clock_and_unknown_timezone_reject(self):
        for stamp, zone in [('2026-10-25 02:30:00.000','Europe/Paris'),
                            ('2026-03-29 02:30:00.000','Europe/Paris'),
                            ('2026-02-30 01:00:00.000','UTC'),(STAMP,'Other/Unknown')]:
            with self.assertRaises(admission.Rejected): health.wall_timestamp(stamp, zone)

    def test_live_recovered_anr_and_crash_names_discard_messages(self):
        for tag in ('am_anr','am_crash'):
            result = health.parse_event(event(tag, tail='FAKE diagnostic, [brackets], secret-text'))
            self.assertEqual(result['tag'], tag);self.assertNotIn('secret-text',str(result))
        self.assertIsNone(health.parse_event(event(process='other.'+health.PACKAGE)))
        self.assertIsNone(health.parse_event(event(process=health.PACKAGE+'.other')))
        self.assertEqual(health.parse_event(event(process=health.PACKAGE+':worker'))['process'],health.PACKAGE+':worker')
        for data in (b'logcat read failed',b'--------- beginning of main', event().replace(b'[0,',b'[1,'),
                     event()[:-1], b'x'*(health.LINE_LIMIT+1), event().replace(b'am_anr',b'unknown_tag')):
            with self.assertRaises(admission.Rejected): health.parse_event(data)

    def test_counts_keep_unknown_calibration_and_recovered_anr_blocks(self):
        before = dict(epochSeconds=EPOCH, timezone='UTC', records=[])
        stop = health.parse_exit_info(exit_dump(10,'USER REQUESTED',21,'FORCE STOP'),10123,'UTC')[0]
        after = dict(epochSeconds=EPOCH+3, timezone='UTC', records=[stop])
        stops = [dict(startEpochSeconds=EPOCH,endEpochSeconds=EPOCH+1)]
        result=health.summarize(before,after,stream_facts(),stops)
        self.assertEqual(result['transportCoverage'],'complete');self.assertEqual(result['status'],'unknown')
        self.assertIsNone(result['anrCount'])
        adverse=health.summarize(before,after,stream_facts([health.parse_event(event())]),stops)
        self.assertEqual(adverse['status'],'failed');self.assertEqual(adverse['observedMatchingAnrEvents'],1)

    def test_eviction_changed_reasons_clock_window_and_unexpected_stop(self):
        record=health.parse_exit_info(exit_dump(),10123,'UTC')[0]
        before=dict(epochSeconds=EPOCH,timezone='UTC',records=[record])
        for after in (dict(before, records=[]),dict(before,timezone='Europe/Paris'),
                      dict(before,epochSeconds=EPOCH-1),dict(before,epochSeconds=EPOCH+181),
                      dict(before,records=[dict(record,reason=6)])):
            with self.assertRaises(admission.Rejected):health.summarize(before,after,stream_facts(),[])
        stop=health.parse_exit_info(exit_dump(10,'USER REQUESTED',21,'FORCE STOP'),10123,'UTC')[0]
        before['records']=[];after=dict(before,epochSeconds=EPOCH+2,records=[stop])
        self.assertEqual(len(health.summarize(before,after,stream_facts(),[])['unknownExits']),1)
        self.assertEqual(health.summarize(before,after,stream_facts(),[dict(startEpochSeconds=EPOCH,endEpochSeconds=EPOCH+1)])['unknownExits'],[])
        before['hostMonotonicStartedAt']=100;after['hostMonotonicStartedAt']=120
        with self.assertRaisesRegex(admission.Rejected,'monotonic'):health.summarize(before,after,stream_facts(),[])


class FakeProcess:
    def __init__(self):
        self.stdout=Mock();self.stdout.fileno.return_value=10
        self.stderr=Mock();self.stderr.fileno.return_value=11
        self.returncode=None;self.pid=1234
    def poll(self): return self.returncode
    def kill(self): self.returncode=-9
    def wait(self,timeout=None): return self.returncode


class FakeSelector:
    def __init__(self):self.mapping={}
    def __enter__(self): return self
    def __exit__(self,*args):pass
    def register(self, file, events, name):self.mapping[file.fileno()]=Mock(fileobj=file,data=name)
    def unregister(self,file):del self.mapping[file.fileno()]
    def get_map(self):return self.mapping
    def select(self,timeout):return [(next(iter(self.mapping.values())),1)]


class StreamLifecycleTests(unittest.TestCase):
    def drain(self,chunks,*,stopping=True):
        stream=object.__new__(health.EventStream)
        stream.argv=health.stream_argv('factory-source',EPOCH);stream.started=time.monotonic()
        stream.events=[];stream.failure=None;stream.stdout_bytes=stream.stderr_bytes=stream.lines=0
        stream.stop=threading.Event();stream.process=FakeProcess();stream.cleanup_failure=None;stream.finished=False
        if stopping:stream.stop.set()
        queue=list(chunks)+[b'',b'']
        with patch.object(health.selectors,'DefaultSelector',FakeSelector),patch.object(health.os,'set_blocking'),patch.object(health.os,'read',side_effect=lambda *_:queue.pop(0)):
            stream._drain()
        return stream

    def test_chunk_split_events_and_intentional_end_are_sanitized(self):
        line=event()+b'\n';stream=self.drain([line[:15],line[15:]])
        self.assertIsNone(stream.failure);self.assertEqual(len(stream.events),1)
        self.assertEqual(stream.process.poll(),-9)
        self.assertNotIn('private message',str(stream.events))

    def test_eof_partial_line_output_overflow_and_wall_bound_persist_first_failure(self):
        stream=self.drain([],stopping=False);self.assertIn('unexpected EOF',stream.failure)
        self.assertIn('truncated',self.drain([event()]).failure)
        with patch.object(health,'STREAM_LIMIT',4):self.assertIn('byte bound',self.drain([b'12345']).failure)
        with patch.object(health,'WINDOW_SECONDS',-1):self.assertIn('wall bound',self.drain([]).failure)
        self.assertEqual(stream.process.poll(),-9)

    def test_create_failure_never_launches_a_second_client(self):
        with patch.object(health.socket,'create_connection'),patch.object(health.subprocess,'Popen',side_effect=OSError('FAKE create failure')) as launch:
            with self.assertRaises(OSError):health.EventStream('factory-source',EPOCH)
        self.assertEqual(launch.call_count,1)

    def test_stop_failure_is_separate_and_does_not_discard_capture(self):
        stream=self.drain([event()+b'\n'])
        stream.stop.clear();stream.failure='FAKE prior parse failure';stream.process.returncode=None
        stream.process.kill=Mock(side_effect=OSError('FAKE stop failure'))
        stream.thread=Mock();stream.thread.is_alive.return_value=False
        stream.pid=1234;stream.start_ticks=42
        result=stream.finish()
        self.assertEqual(result['failure'],'FAKE prior parse failure')
        self.assertIsNotNone(result['cleanupFailure']);self.assertFalse(result['cleanup']['absent'])
        self.assertEqual(len(result['events']),1)


class FakeStream:
    def __init__(self,events=()):self.value=stream_facts(events);self.finished=False
    def finish(self):self.finished=True;return copy.deepcopy(self.value)


class DeviceHealthTests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup)
        self.fixture=SyntheticFixture(tmp.name)
        self.checks_scope=self.fixture.checks_test_scope()
        self.checks_scope.__enter__()
        self.addCleanup(self.checks_scope.__exit__,None,None,None)
        operations,_=self.fixture.run()
        inspected=self.fixture.store.json(admission.Evidence.parse(operations['stages'][4]['receipt']))
        self.record=admission.Evidence.parse(inspected['details']['artifactRecord'])
        self.security=admission.Evidence.parse(operations['stages'][5]['receipt'])
        self.mock=MockDevice(self.fixture);self.dump=EMPTY;self.stream=FakeStream()
        original=self.mock.transport
        def transport(argv,timeout,maximum):
            args=argv[7:]
            if args==('shell','date','+%s'):return str(EPOCH).encode()+b'\n'
            if args==('shell','getprop','persist.sys.timezone'):return b'UTC\n'
            if args==('shell','pm','list','packages','-U',health.PACKAGE):return b'package:app.micro.factory.fixture uid:10123\n'
            if args==('shell','dumpsys','-t','5','activity','exit-info',health.PACKAGE):return self.dump
            return original(argv,timeout,maximum)
        backend=replace(self.mock.backend(),transport=transport,health_stream=lambda role,stamp:self.stream)
        self.adapter=device.Device('factory-source',backend=backend,registry=self.fixture.registry,store=self.fixture.store,artifact_security=self.security)
        self.adapter.install(self.record)

    def test_observation_rehashes_and_raw_dump_is_retained_before_parser_failure(self):
        self.dump=b'DUMP TIMEOUT\n';reference=self.adapter.observe_fixture_exit_info();facts=self.fixture.store.json(reference)
        self.assertIsNotNone(facts['failure']);self.assertEqual(self.fixture.store.read(admission.Evidence.parse(facts['raw'])),self.dump)
        self.mock.installed=b'changed FAKE APK';facts=self.fixture.store.json(self.adapter.observe_fixture_exit_info())
        self.assertIsNone(facts['raw']);self.assertEqual(facts['failure']['reason'],'Installed APK bytes differ from independently inspected admission')

    def test_ticket_guards_and_changed_identity_still_cleanup_and_retain_failure(self):
        ticket=self.adapter.start_fixture_health_window()
        with self.assertRaises(admission.Rejected):self.adapter.start_fixture_health_window()
        with self.assertRaises(admission.Rejected):self.adapter.finish_fixture_health_window(replace(ticket,apk_sha256='0'*64))
        self.mock.process['startTicks']+=1
        result=self.fixture.store.json(self.adapter.finish_fixture_health_window(ticket))
        self.assertIsNotNone(result['failure']);self.assertTrue(self.stream.finished)
        self.assertEqual(self.adapter._health_windows,{})
        with self.assertRaises(admission.Rejected):self.adapter.finish_fixture_health_window(ticket)

    def test_matching_event_is_retained_without_description_and_never_uncalibrated_pass(self):
        self.stream.value['events']=[health.parse_event(event('am_crash'))]
        ticket=self.adapter.start_fixture_health_window()
        result=self.fixture.store.json(self.adapter.finish_fixture_health_window(ticket))
        self.assertEqual(result['summary']['status'],'failed');self.assertEqual(result['summary']['observedMatchingCrashEvents'],1)
        self.assertNotIn('private message',str(result['stream']))
        self.assertIsNone(result['imageCalibration'])

    def test_fixed_other_role_rejected_before_health_commands(self):
        self.adapter.role='budget-v3';self.mock.calls.clear()
        with self.assertRaises(admission.Rejected):self.adapter.observe_fixture_exit_info()
        self.assertEqual(self.mock.calls,[])

    def test_changed_role_or_final_store_budget_does_not_skip_owned_stream_cleanup(self):
        for kind in ('role','store'):
            self.adapter.role='factory-source';self.stream=FakeStream()
            ticket=self.adapter.start_fixture_health_window()
            if kind=='role':self.adapter.role='budget-v3'
            if kind=='role':
                result=self.fixture.store.json(self.adapter.finish_fixture_health_window(ticket))
                self.assertIsNotNone(result['failure'])
            else:
                with patch.object(self.fixture.store,'budget',side_effect=admission.Rejected('FAKE storage bound')):
                    with self.assertRaises(admission.Rejected):self.adapter.finish_fixture_health_window(ticket)
            self.assertTrue(self.stream.finished)

    def test_start_failure_retains_baseline_receipt_and_no_live_window(self):
        self.adapter.backend=replace(self.adapter.backend,health_stream=Mock(side_effect=OSError('FAKE create failed')))
        with self.assertRaises(OSError) as caught:self.adapter.start_fixture_health_window()
        self.assertEqual(len(caught.exception.health_evidence),2)
        for record in caught.exception.health_evidence:self.fixture.store.verify(admission.Evidence.parse(record))
        self.assertEqual(self.adapter._health_windows,{})


class JourneyHealthTests(unittest.TestCase):
    make_adapter=journey_tests.FixtureJourneyTests.make_adapter
    run_ui=journey_tests.FixtureJourneyTests.run_ui
    setUp=journey_tests.FixtureJourneyTests.setUp

    def wire(self, adverse=False, fail_final=False):
        baseline=self.fixture.put({'FAKE':'baseline'})
        ticket=health.Ticket('a'*32,'factory-source','b'*64,self.job.artifact_sha256,'c'*64,baseline)
        summary={'status':'failed' if adverse else 'unknown','crashCount':None,'anrCount':None,
                 'observedMatchingAnrEvents':1 if adverse else 0}
        reference=self.fixture.put({'summary':summary,'failure':{'reason':'FAKE final failed'} if fail_final else None,
                                    'cleanupFailure':None})
        def begin():
            self.assertEqual(self.mock.launches,0);return ticket
        def finish(actual):
            self.assertEqual(actual,ticket);return reference
        return patch.object(self.adapter,'start_fixture_health_window',side_effect=begin),patch.object(self.adapter,'finish_fixture_health_window',side_effect=finish)

    def test_anr_blocks_even_successful_ui_and_quiet_window_cannot_pass(self):
        start,finish=self.wire(adverse=True)
        with start,finish as finished:
            _,report,raw=self.run_ui()
        finished.assert_called_once();self.assertEqual(report['status'],'failed')
        self.assertEqual(raw['firstFailure']['step'],'health-observation')
        self.assertEqual(raw['journey'],'passed');self.assertEqual(raw['health']['observedMatchingAnrEvents'],1)

    def test_first_ui_failure_kept_and_stream_finalized_separately(self):
        self.mock.after_taps[1]=journey_tests.fake_screen('99','0')
        start,finish=self.wire(fail_final=True)
        with start,finish as finished:
            _,report,raw=self.run_ui()
        finished.assert_called_once();self.assertEqual(report['status'],'failed')
        self.assertEqual(raw['firstFailure']['step'],'counter-a-second-write')
        self.assertEqual(raw['healthFailure']['reason'],'FAKE final failed')

    def test_failed_stream_cleanup_cannot_claim_child_absence_after_successful_ui(self):
        baseline=self.fixture.put({'FAKE':'baseline'})
        ticket=health.Ticket('a'*32,'factory-source','b'*64,self.job.artifact_sha256,'c'*64,baseline)
        receipt=self.fixture.put({'summary':None,'failure':None,
            'cleanupFailure':{'reason':'FAKE child cleanup failed'},'stream':{'cleanup':{'absent':False}}})
        with patch.object(self.adapter,'start_fixture_health_window',return_value=ticket),patch.object(self.adapter,'finish_fixture_health_window',return_value=receipt):
            _,report,raw=self.run_ui()
        self.assertEqual(raw['journey'],'passed')
        self.assertEqual(report['cleanup'],{'absent':False})
        self.assertEqual(raw['healthFailure']['reason'],'FAKE child cleanup failed')


if __name__=='__main__':unittest.main()
