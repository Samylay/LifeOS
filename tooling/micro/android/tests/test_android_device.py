"""Mocked controller/device logic only. No ADB, process or emulator is launched.

The shared artifact fixture is deliberately synthetic, including fake APKs and
scanner observations. These tests make no actual native-journey claim.
"""
import copy
from dataclasses import replace
from io import BytesIO
import os
from pathlib import Path
import sys
import tempfile
import unittest

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_android_pipeline import SyntheticFixture
import admission
import device


class MockDevice:
    def __init__(self, fixture, role='factory-source'):
        self.fixture=fixture; self.role=role;self.spec=device.ROLES[role];self.now=fixture.now
        lease={'role':role,'serial':self.spec.serial,'pid':101,'startTicks':1234,'uid':1000,
               'executable':device.EXECUTABLE,'avd':self.spec.avd,'port':self.spec.port,'name':self.spec.avd,
               'expectedApi':'36','expectedAbi':'x86_64','status':'leased','busy':False}
        self.leases={'schema':'micro.android.device-leases/1','ownerUid':1000,'hostBootId':'FAKE-boot', 'devices':{role:lease}}
        self.process={'pid':101,'startTicks':1234,'uid':1000,'executable':device.EXECUTABLE,
                      'argv':[device.EXECUTABLE,'-avd',self.spec.avd,'-port',self.spec.port]}
        self.properties={'ro.kernel.qemu':'1','ro.build.version.sdk':'36','ro.product.cpu.abi':'x86_64','sys.boot_completed':'1'}
        self.calls=[];self.mutations=[];self.installed=None;self.version_code=1;self.version_name='1.0.0';self.package=self.spec.package
        self.dump_ok=True;self.cleanup_ok=True;self.offline=True;self.lease_change_on_mutation=False
        self.path='/data/app/~~FAKE/app.micro.factory.fixture-FAKE/base.apk'
        self.xml=self.hierarchy()
        png=BytesIO();Image.new('RGB',(128,256),'white').save(png,format='PNG');self.png=png.getvalue()

    def hierarchy(self, resource='write-counter-a', description='Write counter-a', bounds='[10,20][110,70]', enabled='true'):
        return ('<hierarchy><node package="'+self.spec.package+'" resource-id="'+resource+'" content-desc="'+description+'" text="Write counter-a" class="android.view.View" clickable="true" enabled="'+enabled+'" bounds="'+bounds+'"/></hierarchy>').encode()

    def backend(self):
        return device.Backend(leases=lambda:copy.deepcopy(self.leases),process=lambda _:copy.deepcopy(self.process),
                              boot_id=lambda:'FAKE-boot',uid=lambda:1000,transport=self.transport,clock=lambda:self.now)

    def transport(self, argv, timeout, maximum):
        self.calls.append(argv)
        if argv[:7]!=(device.ADB,'-H','127.0.0.1','-P','5037','-s',self.spec.serial):
            raise AssertionError('Unbound or foreign ADB call')
        args=argv[7:]
        if args==('get-state',):return b'device'
        if args[:2]==('shell','getprop'):return self.properties[args[2]].encode()+b'\n'
        if args==('emu','avd','name'):return (self.spec.avd+'\nOK\n').encode()
        if args==('shell','pm','path',self.spec.package):return b'' if self.installed is None else ('package:'+self.path+'\n').encode()
        if args==('shell','dumpsys','package',self.spec.package):return (f'  Package [{self.package}] (FAKE):\n    versionCode={self.version_code} minSdk=24 targetSdk=36\n    versionName={self.version_name}\n').encode()
        if args[:1]==('install',):
            self.mutations.append(args);self.installed=Path(args[-1]).read_bytes();return b'Success\n'
        if args==('exec-out','cat',self.path):return self.installed
        if args[:2]==('exec-out','cat') and args[2].startswith('/sdcard/micro-native-controller-'):return self.xml
        if args==('exec-out','screencap','-p'):return self.png
        if args[:3]==('shell','rm','-f'):
            self.mutations.append(args)
            if not self.cleanup_ok:raise admission.Rejected('FAKE cleanup error')
            return b''
        if args[:3]==('shell','uiautomator','dump'):
            self.mutations.append(args)
            return ('UI hierarchy dumped to: '+args[3]+'\n').encode() if self.dump_ok else b'old dump, no success marker\n'
        if args==('shell','settings','get','global','airplane_mode_on'):return b'1\n' if self.offline else b'0\n'
        if args==('shell','settings','get','global','wifi_on'):return b'0\n'
        if args==('shell','ip','route'):return b''
        if args==('shell','am','force-stop',self.spec.package):self.mutations.append(args);return b''
        if args==('shell','am','start','-W','-n',self.spec.package+'/.MainActivity'):self.mutations.append(args);return b'Status: ok\n'
        if args[:3]==('shell','input','tap'):self.mutations.append(args);return b''
        raise AssertionError('Not an allowlisted fixed operation: '+str(args))


class DeviceTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.fixture=SyntheticFixture(self.temp.name)
        operations,_=self.fixture.run()
        observation=self.fixture.store.json(admission.Evidence.parse(operations['stages'][4]['receipt']))
        self.record=admission.Evidence.parse(observation['details']['artifactRecord'])
        self.security=admission.Evidence.parse(operations['stages'][5]['receipt'])
        self.mock=MockDevice(self.fixture)
        self.adapter=device.Device('factory-source',backend=self.mock.backend(),registry=self.fixture.registry,store=self.fixture.store,artifact_security=self.security)

    def installed(self):
        result=self.adapter.install(self.record)
        self.assertEqual(result['installed']['apkSha256'],self.fixture.signed.sha256)
        self.mock.calls.clear();self.mock.mutations.clear()
        return result

    def test_fixed_roles_no_generic_passthrough_or_unbound_construction(self):
        self.assertEqual(device.ROLES['factory-source'].serial,'emulator-5584')
        self.assertEqual(device.ROLES['factory-target'].serial,'emulator-5586')
        self.assertEqual(device.ROLES['budget-v3'].serial,'emulator-5588')
        for role in ('v1','v2','Sparely','emulator-5580','../outside'):
            with self.assertRaises(admission.Rejected):device.Device(role)
        self.assertFalse(hasattr(self.adapter,'adb'))
        self.assertEqual(self.mock.calls,[])

    def test_wrong_serial_pid_uid_start_ticks_boot_executable_avd_port_busy_refused_before_mutation(self):
        lease=self.mock.leases['devices']['factory-source']
        for kind in ('serial','pid','uid','start','boot','executable','avd','port','busy','missing','unknown'):
            with self.subTest(kind=kind):
                original=copy.deepcopy(self.mock.leases);process=copy.deepcopy(self.mock.process)
                if kind=='serial':lease['serial']='emulator-5580'
                elif kind=='pid':lease['pid']=999
                elif kind=='uid':lease['uid']=0
                elif kind=='start':lease['startTicks']=999
                elif kind=='boot':self.mock.leases['hostBootId']='old-host-boot'
                elif kind=='executable':self.mock.process['executable']='/untrusted/qemu'
                elif kind=='avd':lease['avd']='Micro_Benchmark_V1'
                elif kind=='port':lease['port']='5580'
                elif kind=='busy':lease['busy']=True
                elif kind=='missing':self.mock.leases['devices']={}
                else:lease['commands']=['untrusted']
                adapter=device.Device('factory-source',backend=self.mock.backend(),registry=self.fixture.registry,store=self.fixture.store,artifact_security=self.security)
                with self.assertRaises(admission.Rejected):adapter.install(self.record)
                self.assertEqual(self.mock.mutations,[])
                self.mock.leases=original;self.mock.process=process;lease=self.mock.leases['devices']['factory-source'];self.mock.calls.clear()

    def test_wrong_actual_api_abi_boot_or_avd_blocks_before_mutation(self):
        for key,value in [('ro.build.version.sdk','35'),('ro.product.cpu.abi','arm64-v8a'),('sys.boot_completed','0'),('ro.kernel.qemu','0')]:
            original=self.mock.properties[key];self.mock.properties[key]=value
            with self.assertRaises(admission.Rejected):self.adapter.install(self.record)
            self.assertEqual(self.mock.mutations,[]);self.mock.properties[key]=original
        original=self.mock.spec;self.mock.spec=replace(self.mock.spec,avd='Wrong_AVD')
        with self.assertRaises(admission.Rejected):self.adapter.install(self.record)
        self.assertEqual(self.mock.mutations,[]);self.mock.spec=original

    def test_lease_revalidated_for_every_mutation_and_superseded_lease_blocks(self):
        self.installed();self.mock.process['startTicks']+=1
        with self.assertRaises(admission.Rejected):self.adapter.force_stop()
        self.assertEqual(self.mock.mutations,[])
        self.mock.process['startTicks']-=1
        self.mock.leases['devices']['factory-source']['pid']=102;self.mock.process['pid']=102
        with self.assertRaises(admission.Rejected):self.adapter.force_stop()
        self.assertEqual(self.mock.mutations,[])

    def test_process_changed_between_facts_and_mutation_refused(self):
        self.installed()
        original=self.mock.transport
        def transport(argv,timeout,maximum):
            result=original(argv,timeout,maximum)
            if argv[7:]==('emu','avd','name'):self.mock.process['startTicks']+=1
            return result
        adapter_backend=replace(self.mock.backend(),transport=transport)
        self.adapter.backend=adapter_backend
        with self.assertRaises(admission.Rejected):self.adapter.force_stop()
        self.assertEqual(self.mock.mutations,[])

    def test_tampered_apk_and_missing_operator_admission_block_install(self):
        original=self.fixture.store.path(self.fixture.signed.path).read_bytes()
        self.fixture.store.path(self.fixture.signed.path).write_bytes(b'tampered APK')
        with self.assertRaises(admission.Rejected):self.adapter.install(self.record)
        self.assertEqual(self.mock.mutations,[])
        self.fixture.store.path(self.fixture.signed.path).write_bytes(original)
        fake=self.fixture.put({'context':self.fixture.binding.context(),'apk':self.fixture.signed.json()})
        with self.assertRaises(admission.Rejected):self.adapter.install(fake)
        self.assertEqual(self.mock.mutations,[])

    def test_wrong_package_or_pending_v3_policy_cannot_install(self):
        mock=MockDevice(self.fixture,'budget-v3')
        adapter=device.Device('budget-v3',backend=mock.backend(),registry=self.fixture.registry,store=self.fixture.store,artifact_security=self.security)
        with self.assertRaises(admission.Rejected):adapter.install(self.record)
        self.assertEqual(mock.mutations,[])

    def test_install_readback_compares_actual_bytes_and_version(self):
        original=self.mock.transport
        def transport(argv,timeout,maximum):
            output=original(argv,timeout,maximum)
            if argv[7:3+7]==('exec-out','cat',self.mock.path):return b'wrong installed APK'
            return output
        self.adapter.backend=replace(self.mock.backend(),transport=transport)
        with self.assertRaises(admission.Rejected):self.adapter.install(self.record)
        self.assertIsNone(self.adapter._installed)

    def test_existing_unadmitted_package_is_busy_and_not_replaced(self):
        self.mock.installed=b'foreign APK'
        with self.assertRaises(admission.Rejected):self.adapter.install(self.record)
        self.assertEqual(self.mock.mutations,[])

    def test_force_stop_launch_and_capture_are_scoped_observations_only(self):
        self.installed()
        self.assertEqual(self.adapter.force_stop()['package'],'app.micro.factory.fixture')
        launch=self.adapter.launch_offline();self.assertEqual(launch['journey'],'not-evaluated');self.assertIsNone(launch['crashCount'])
        capture=self.adapter.capture('synthetic-observation')
        receipt=self.fixture.store.json(capture.receipt)
        self.assertEqual(receipt['acceptanceVerdict'],'not-evaluated');self.assertEqual(receipt['dimensions'],[128,256])
        self.assertTrue(receipt['scratchCleanup']['absent'])
        self.assertTrue(all(call[6]=='emulator-5584' for call in self.mock.calls))

    def test_online_settings_or_default_route_cannot_launch_offline(self):
        self.installed();self.mock.offline=False
        with self.assertRaises(admission.Rejected):self.adapter.launch_offline()
        self.assertFalse(any(args[:3]==('shell','am','start') for args in self.mock.mutations))
        self.mock.offline=True;original=self.mock.transport
        def transport(argv,timeout,maximum):
            if argv[7:]==('shell','ip','route'):return b'default via 10.0.2.2\n'
            return original(argv,timeout,maximum)
        self.adapter.backend=replace(self.mock.backend(),transport=transport)
        with self.assertRaises(admission.Rejected):self.adapter.launch_offline()

    def test_tap_derives_bounds_from_fresh_hierarchy_and_consumes_capture(self):
        self.installed();capture=self.adapter.capture('fresh')
        result=self.adapter.tap(capture,'counter-a')
        self.assertIn(('shell','input','tap','60','45'),self.mock.mutations)
        self.assertEqual(result['acceptanceVerdict'],'not-evaluated')
        with self.assertRaises(admission.Rejected):self.adapter.tap(capture,'counter-a')

    def test_stale_changed_disabled_ambiguous_or_tampered_capture_cannot_tap(self):
        for kind in ('stale','changed','disabled','ambiguous','tampered','forged'):
            with self.subTest(kind=kind):
                self.mock.xml=self.mock.hierarchy();self.mock.now=self.fixture.now
                if self.adapter._installed is None:self.installed()
                capture=self.adapter.capture('fresh-'+kind)
                self.mock.mutations.clear()
                if kind=='stale':self.mock.now+=device.MAX_FRESH_SECONDS+1
                elif kind=='changed':self.mock.xml=self.mock.hierarchy(bounds='[20,20][120,70]')
                elif kind=='disabled':
                    self.mock.xml=self.mock.hierarchy(enabled='false');capture=self.adapter.capture('disabled');self.mock.mutations.clear()
                elif kind=='ambiguous':
                    text=self.mock.xml.decode();self.mock.xml=text.replace('</hierarchy>',text[text.index('<node'):text.index('</hierarchy>')]+'</hierarchy>').encode()
                    capture=self.adapter.capture('ambiguous');self.mock.mutations.clear()
                elif kind=='tampered':self.fixture.store.path(capture.xml.path).chmod(0o600);self.fixture.store.path(capture.xml.path).write_bytes(b'<hierarchy/>')
                else:capture=replace(capture,observed_at=capture.observed_at-1)
                with self.assertRaises(admission.Rejected):self.adapter.tap(capture,'counter-a')
                self.assertFalse(any(args[:3]==('shell','input','tap') for args in self.mock.mutations))

    def test_failed_dump_cannot_reuse_stale_xml_and_cleanup_failure_blocks_capture(self):
        self.installed();self.mock.dump_ok=False
        with self.assertRaises(admission.Rejected):self.adapter.capture('failed-dump')
        self.mock.dump_ok=True;self.mock.cleanup_ok=False
        with self.assertRaises(admission.Rejected):self.adapter.capture('cleanup-failure')
        self.assertEqual(self.adapter._captures,{})

    def test_wrong_installed_version_unbound_package_or_expired_admission_refused(self):
        self.installed();self.mock.version_code=2
        with self.assertRaises(admission.Rejected):self.adapter.force_stop()
        self.assertEqual(self.mock.mutations,[])
        self.mock.version_code=1;self.mock.package='app.wrong.fixture'
        with self.assertRaises(admission.Rejected):self.adapter.force_stop()
        self.assertEqual(self.mock.mutations,[])
        self.mock.package=self.mock.spec.package;self.mock.now+=3601
        with self.assertRaises(admission.Rejected):self.adapter.force_stop()
        self.assertEqual(self.mock.mutations,[])

    def test_review_replaced_same_path_version_apk_bytes_refused_before_every_operation(self):
        self.installed()
        capture = self.adapter.capture('fake-before-replacement')
        self.mock.installed = b'FAKE replaced APK, same package path and version'
        self.mock.mutations.clear()
        for operation in (self.adapter.force_stop, self.adapter.launch_offline,
                          lambda: self.adapter.capture('fake-replaced'),
                          lambda: self.adapter.tap(capture, 'counter-a')):
            with self.subTest(operation=operation), self.assertRaisesRegex(admission.Rejected, 'Installed APK bytes differ'):
                operation()
            self.assertEqual(self.mock.mutations, [])
        # A replacement between initial identity check and mutation is refused.
        self.mock.installed = self.fixture.store.read(self.fixture.signed)
        original = self.adapter._ensure_installed
        calls = [0]
        def changed_after_check():
            original(); calls[0] += 1
            if calls[0] == 1: self.mock.installed = b'FAKE changed between readback and mutation'
        self.adapter._ensure_installed = changed_after_check
        with self.assertRaisesRegex(admission.Rejected, 'Installed APK bytes differ'):
            self.adapter.force_stop()
        self.assertEqual(self.mock.mutations, [])

    def test_missing_final_security_or_native_operator_map_cannot_install(self):
        adapter = device.Device('factory-source', backend=self.mock.backend(), registry=self.fixture.registry,
                                store=self.fixture.store)
        with self.assertRaises(admission.Rejected): adapter.install(self.record)
        self.assertEqual(self.mock.mutations, [])
        binding = replace(self.fixture.binding, native_mapping=None)
        registry = __import__('pipeline').Registry(self.fixture.store, {(binding.project_id, binding.adapter_id): binding})
        adapter = device.Device('factory-source', backend=self.mock.backend(), registry=registry,
                                store=self.fixture.store, artifact_security=self.security)
        with self.assertRaises(admission.Rejected): adapter.install(self.record)
        self.assertEqual(self.mock.mutations, [])

    def test_host_parsers_only_use_bounded_trusted_synthetic_test_images_and_xml(self):
        self.assertEqual(device.validate_png(self.mock.png),(128,256))
        for data in (b'not PNG',self.mock.png[:30]):
            with self.assertRaises(admission.Rejected):device.validate_png(data)
        for data in (b'<!DOCTYPE hierarchy [<!ENTITY x "unsafe">]><hierarchy/>',b'<hierarchy/>',self.mock.hierarchy(bounds='[110,70][10,20]'),self.mock.hierarchy(bounds='[10,20][4097,70]')):
            with self.assertRaises(admission.Rejected):device.hierarchy(data,self.mock.spec.package,(128,256))
        with self.assertRaises(admission.Rejected):self.adapter.capture('../outside')
        with self.assertRaises(admission.Rejected):self.adapter.tap(None,'arbitrary-selector')


if __name__=='__main__':unittest.main()
