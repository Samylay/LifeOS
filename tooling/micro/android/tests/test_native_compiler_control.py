"""Native compiler controls, tested with explicitly authored FAKE inputs only.

No Gradle, CMake, Ninja, network, package archive, database, or Docker executes.
The worker main replay reaches the actual Gradle command seam with fake runners.
Shell-wrapper behavior is asserted statically; actual execution needs a fresh job.
"""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import os
import shutil
import socket
import ssl
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import types
import unittest
from unittest.mock import patch
import zipfile

TOOLS = Path(__file__).resolve().parents[1]

class CapturedGradle(BaseException):
    pass

class SafeCompilerCase(unittest.TestCase):
    def setUp(self):
        self.forbidden_effects = {}
        self.guards = contextlib.ExitStack()
        self.addCleanup(self.guards.close)
        def deny(name):
            def blocked(*args, **kwargs):
                self.forbidden_effects[name] = self.forbidden_effects.get(name, 0)+1
                raise AssertionError('Forbidden external effect: '+name)
            return blocked
        original_socket = socket.socket
        blocked_socket = deny('socket.socket')
        class DeniedSocket(original_socket):
            def __new__(cls, *args, **kwargs):
                return blocked_socket(*args, **kwargs)
        for target,name,replacement in (
            (subprocess,'Popen',deny('Popen')),
            (subprocess,'run',deny('subprocess.run-unadmitted')),
            (socket,'socket',DeniedSocket),
            (socket,'create_connection',deny('socket.create_connection')),
            (os,'system',deny('os.system')),
            (sqlite3,'connect',deny('sqlite3.connect')),
            (zipfile,'ZipFile',deny('ZipFile')),
            (tarfile,'open',deny('tarfile.open')),
            (tarfile.TarFile,'__init__',deny('TarFile.__init__'))):
            self.guards.enter_context(patch.object(target,name,replacement))
        sandbox = tempfile.TemporaryDirectory(prefix='FAKE-compiler-tests-',dir=TOOLS/'tests')
        self.addCleanup(sandbox.cleanup)
        self.sandbox_root = Path(sandbox.name)
        # Dependency substitutes exist only during this worker import. They
        # cannot execute commands or inspect tarballs/vendor/local Maven inputs.
        fake_modules = {}
        for name,values in {
            'npm_fixture_job': {'archive':deny('archive')},
            'native_failure_diagnostics': {'collect':deny('diagnostics')},
            'locked_local_maven': {'verify_all':lambda *a, **kw: [{'FAKE':True}]},
            'trusted_vendor_adapter': {'apply':lambda *a, **kw: {'FAKE':True},
                                      'verify_after':lambda *a, **kw: {'FAKE':True}},
        }.items():
            module = types.ModuleType(name)
            vars(module).update(values)
            fake_modules[name] = module
        with patch.dict(sys.modules,fake_modules):
            spec = importlib.util.spec_from_file_location('_native_compiler_guarded_worker',TOOLS/'native_fixture_job.py')
            self.worker = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.worker)
        spec = importlib.util.spec_from_file_location('_native_compiler_guarded_admission',TOOLS/'admission.py')
        self.admission = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules,{'_native_compiler_guarded_admission':self.admission}):
            spec.loader.exec_module(self.admission)

    def tearDown(self):
        self.assertEqual(self.forbidden_effects,{})

class GeneratedNativeCompilerSeam(SafeCompilerCase):
    def replay(self, offline, corrupt_preimage=False, occupy_wrapper=False):
        with tempfile.TemporaryDirectory(prefix='FAKE-native-',dir=self.sandbox_root) as directory:
            sandbox = Path(directory)
            for name in ('work','out','seed/fixture','seed/npm-cache','seed/gradle-caches'):
                (sandbox/name).mkdir(parents=True, exist_ok=True)
            (sandbox/'seed/fixture/FAKE.txt').write_text('Explicitly authored FAKE fixture, no real inputs.\n')
            root_gradle = "// Explicitly authored FAKE Gradle fixture\nallprojects {\n  repositories {\n    maven { url 'https://www.jitpack.io' }\n  }\n}\n"
            signing = "            // Caution! In production, you need to generate your own keystore file.\n            // see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug\n"
            app_gradle = '// Explicitly authored FAKE app\nreact {\n    bundleCommand = "export:embed"\n}\nandroid { buildTypes { release {\n'+signing+'} } }\n'
            preimages = {name:hashlib.sha256(raw.encode()).hexdigest()
                         for name,raw in [('build.gradle',root_gradle),('app/build.gradle',app_gradle)]}
            if corrupt_preimage: preimages['build.gradle'] = '0'*64
            (sandbox/'seed/patch-preimages.json').write_text(json.dumps(preimages))
            (sandbox/'seed/verification-metadata.xml').write_text('<FAKE/>\n')
            if occupy_wrapper: (sandbox/'work/native-ninja').write_text('FAKE occupied wrapper\n')
            captured = []
            def mapped_path(value='.'):
                value = str(value)
                if value == '/work' or value.startswith('/work/'):
                    return sandbox/value.lstrip('/')
                if value == '/seed' or value.startswith('/seed/') or value == '/out' or value.startswith('/out/'):
                    return sandbox/value.lstrip('/')
                return Path(value)
            def fake_run(argv, **kw):
                if argv == ['npm','ci','--offline','--ignore-scripts','--no-audit','--no-fund']:
                    return types.SimpleNamespace(returncode=0)
                if argv == ['node','./node_modules/expo/bin/cli','prebuild','--platform','android','--no-install']:
                    generated = sandbox/'work/fixture/android'
                    (generated/'app').mkdir(parents=True)
                    (generated/'build.gradle').write_text(root_gradle)
                    (generated/'app/build.gradle').write_text(app_gradle)
                    (generated/'gradle').mkdir()
                    return types.SimpleNamespace(returncode=0)
                if argv[0] == '/opt/gradle/bin/gradle':
                    wrapper = sandbox/'work/native-ninja'
                    captured.append({'argv':argv, 'env':dict(kw['env']),
                        'root':(sandbox/'work/fixture/android/build.gradle').read_text(),
                        'app':(sandbox/'work/fixture/android/app/build.gradle').read_text(),
                        'wrapper':wrapper.read_text() if wrapper.exists() else None,
                        'wrapperMode':wrapper.stat().st_mode & 0o777 if wrapper.exists() else None,
                        'properties':(sandbox/'work/gradle-home/gradle.properties').read_text()})
                    raise CapturedGradle()
                raise AssertionError('Unadmitted FAKE command')
            previous_path,previous_run,previous_argv,previous_facts = self.worker.Path,subprocess.run,sys.argv,self.worker.facts
            previous_shutil = self.worker.shutil
            self.worker.shutil = types.SimpleNamespace(copytree=lambda src,dst: shutil.copytree(mapped_path(src),mapped_path(dst)),
                copyfile=lambda src,dst: shutil.copyfile(mapped_path(src),mapped_path(dst)))
            self.worker.Path = mapped_path
            self.worker.facts = lambda: {'FAKE':True}
            subprocess.run = fake_run
            sys.argv = ['guarded_worker']+(['--offline'] if offline else [])
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    try: self.worker.main()
                    except CapturedGradle: pass
                self.assertEqual(len(captured), 1)
                captured[0]['receipt'] = json.loads((sandbox/'out/native-job.json').read_text())
                return captured[0]
            finally:
                self.worker.Path,subprocess.run,sys.argv,self.worker.facts = previous_path,previous_run,previous_argv,previous_facts
                self.worker.shutil = previous_shutil

    def assert_controls(self, captured, offline):
        self.assertIn('subprojects { nativeProject ->',captured['root'])
        self.assertIn('["com.android.application", "com.android.library"]',captured['root'])
        self.assertIn('nativeProject.plugins.withId(nativePlugin)',captured['root'])
        self.assertIn('defaultConfig.externalNativeBuild.cmake.arguments',captured['root'])
        self.assertIn('-DCMAKE_MAKE_PROGRAM=/work/native-ninja',captured['root'])
        self.assertIn('afterEvaluate',captured['root'])
        self.assertIn('throw new GradleException',captured['root'])
        self.assertIsNotNone(captured['wrapper'])
        self.assertEqual(captured['wrapperMode'],0o500)
        self.assertIn('exec /opt/android-sdk/cmake/3.22.1/bin/ninja -j2 "$@"',captured['wrapper'])
        self.assertIn('--|-*j*|--jobs*)',captured['wrapper'])
        self.assertNotIn('https://www.jitpack.io',captured['root'])
        self.assertNotIn('signingConfig signingConfigs.debug',captured['app'])
        self.assertIn('extraPackagerArgs = ["--max-workers", "1"]',captured['app'])
        props = dict(line.split('=',1) for line in captured['properties'].splitlines())
        self.assertEqual(props['org.gradle.workers.max'],'1')
        self.assertEqual(props['org.gradle.parallel'],'false')
        self.assertEqual(props['org.gradle.jvmargs'],'-Duser.home=/work/home -Xmx1024m -XX:MaxMetaspaceSize=512m -XX:ActiveProcessorCount=2')
        for key,value in {'CMAKE_BUILD_PARALLEL_LEVEL':'1','OMP_NUM_THREADS':'1','MAKEFLAGS':'-j1',
            'JAVA_TOOL_OPTIONS':'-Duser.home=/work/home -XX:ActiveProcessorCount=2 -Xmx512m -XX:MaxMetaspaceSize=256m',
            'NODE_OPTIONS':'--max-old-space-size=768'}.items(): self.assertEqual(captured['env'][key],value)
        wanted = ['/opt/gradle/bin/gradle','-p','android','--no-daemon','--max-workers=1','--no-build-cache',
            '--no-configuration-cache','--console=plain','--stacktrace','--info','--init-script=/seed/tools/trusted_repositories.init.gradle']
        if offline: wanted += ['--offline','--dependency-verification=strict']
        wanted += ['app:assembleRelease']
        self.assertEqual(captured['argv'],wanted)
        patches = captured['receipt']['patches']
        self.assertEqual(len(patches),4)
        self.assertEqual(patches[3]['beforeSha256'],patches[0]['afterSha256'])
        self.assertEqual(patches[3]['wrapper']['sha256'],hashlib.sha256(captured['wrapper'].encode()).hexdigest())

    def test_acquisition_generated_gradle_seam(self): self.assert_controls(self.replay(False),False)
    def test_offline_generated_gradle_seam(self): self.assert_controls(self.replay(True),True)

class NativeCompilerGuards(SafeCompilerCase):
    def setUp(self):
        super().setUp()
        self.temporary = tempfile.TemporaryDirectory(prefix='FAKE-control-',dir=self.sandbox_root)
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.fixture = self.base/'fixture'
        self.work = self.base/'work'
        (self.fixture/'android').mkdir(parents=True)
        self.work.mkdir()
        self.root = self.fixture/'android/build.gradle'
        self.root.write_text('// Explicitly authored FAKE generated Gradle root\n')
        self.receipt = {'patches':[{'afterSha256':hashlib.sha256(self.root.read_bytes()).hexdigest()},
                                   {'FAKE':True},{'FAKE':True}]}

    def install(self): self.worker.install_native_compiler_control(self.fixture,self.work,self.receipt)

    def test_wrong_generated_preimage_rejected_before_wrapper_write(self):
        self.root.write_text('FAKE changed generated input\n')
        with self.assertRaisesRegex(ValueError,'preimage'): self.install()
        self.assertFalse((self.work/'native-ninja').exists())

    def test_existing_wrapper_rejected_without_overwrite(self):
        wrapper=self.work/'native-ninja';wrapper.write_text('FAKE existing wrapper\n')
        with self.assertRaises(FileExistsError): self.install()
        self.assertEqual(wrapper.read_text(),'FAKE existing wrapper\n')
        self.assertEqual(len(self.receipt['patches']),3)

    def test_conflicting_generated_control_rejected(self):
        self.root.write_text('// FAKE CMAKE_MAKE_PROGRAM conflict\n')
        self.receipt['patches'][0]['afterSha256']=hashlib.sha256(self.root.read_bytes()).hexdigest()
        with self.assertRaisesRegex(ValueError,'preimage'): self.install()
        self.assertFalse((self.work/'native-ninja').exists())

    def test_postbuild_wrapper_and_generated_root_bytes_required(self):
        self.install();self.worker.verify_native_compiler_control(self.fixture,self.work,self.receipt)
        wrapper=self.work/'native-ninja';wrapper.chmod(0o600);wrapper.write_text('FAKE modified wrapper\n');wrapper.chmod(0o500)
        with self.assertRaisesRegex(ValueError,'changed'):
            self.worker.verify_native_compiler_control(self.fixture,self.work,self.receipt)

    def test_postbuild_wrapper_mode_required(self):
        self.install();(self.work/'native-ninja').chmod(0o700)
        with self.assertRaisesRegex(ValueError,'changed'):
            self.worker.verify_native_compiler_control(self.fixture,self.work,self.receipt)

    def test_postbuild_generated_root_unchanged_required(self):
        self.install();self.root.write_text('// FAKE changed generated root\n')
        with self.assertRaisesRegex(ValueError,'changed'):
            self.worker.verify_native_compiler_control(self.fixture,self.work,self.receipt)

    def test_schema_fourth_receipt_authority(self):
        import copy
        import jsonschema
        self.install()
        policy=copy.deepcopy(self.receipt['patches'][3]);policy['path']='/work/fixture/android/build.gradle'
        patches=[{'path':'/work/fixture/android/build.gradle','beforeSha256':'a'*64,'afterSha256':'b'*64,
                  'oldSha256':'c'*64,'newSha256':'d'*64},
                 {'path':'/work/fixture/android/app/build.gradle','beforeSha256':'a'*64,'afterSha256':'b'*64,
                  'oldSha256':'c'*64,'newSha256':'d'*64},
                 {'path':'/work/fixture/android/app/build.gradle','beforeSha256':'a'*64,'afterSha256':'b'*64,
                  'purpose':'Metro worker ceiling1'},policy]
        schema=json.loads((TOOLS/'adapter.schema.json').read_text())['$defs']['nativeJob']['properties']['patches']
        validator=jsonschema.Draft202012Validator(schema)
        self.assertEqual(list(validator.iter_errors(patches)),[])
        bad_values=[patches[:3],patches+[copy.deepcopy(policy)]]
        for field,value in [('path','/tmp/build.gradle'),('cmakeArguments',[]),('appendSha256','0'*64)]:
            bad=copy.deepcopy(patches);bad[3][field]=value;bad_values.append(bad)
        for field,value in [('bytes',True),('jobs',True),('jobs',3),('realNinja','/bin/false'),('sha256','0'*64)]:
            bad=copy.deepcopy(patches);bad[3]['wrapper'][field]=value;bad_values.append(bad)
        bad=copy.deepcopy(patches);bad[3]['unreviewedField']=True;bad_values.append(bad)
        bad=copy.deepcopy(patches);del bad[3]['wrapper'];bad_values.append(bad)
        for index,bad in enumerate(bad_values):
            with self.subTest(schemaMutation=index):self.assertTrue(list(validator.iter_errors(bad)))

    def test_admission_binds_every_control_field(self):
        import copy
        self.install()
        policy=copy.deepcopy(self.receipt['patches'][3]);policy['path']='/work/fixture/android/build.gradle'
        self.admission.native_compiler_patch(policy,self.receipt['patches'][0])
        mutations=[('path','/work/fixture/node_modules/vendor/build.gradle'),
                   ('beforeSha256','0'*64),('afterSha256','not-a-digest'),
                   ('purpose','FAKE'),('appendSha256','0'*64),
                   ('cmakeArguments',[]),('cmakeArguments',['-DCMAKE_MAKE_PROGRAM=/bin/false'])]
        for field,value in mutations:
            with self.subTest(field=field,value=value):
                bad=copy.deepcopy(policy);bad[field]=value
                with self.assertRaises(self.admission.Rejected):self.admission.native_compiler_patch(bad,self.receipt['patches'][0])
        for field,value in [('path','/tmp/ninja'),('bytes',False),('bytes',0),('sha256','0'*64),
                            ('mode','0700'),('realNinja','/usr/bin/ninja'),('jobs',1),('jobs',3),('jobs',True)]:
            with self.subTest(wrapperField=field,value=value):
                bad=copy.deepcopy(policy);bad['wrapper'][field]=value
                with self.assertRaises(self.admission.Rejected):self.admission.native_compiler_patch(bad,self.receipt['patches'][0])
        for field in policy:
            with self.subTest(missingField=field):
                bad=copy.deepcopy(policy);del bad[field]
                with self.assertRaises(self.admission.Rejected):self.admission.native_compiler_patch(bad,self.receipt['patches'][0])

if __name__ == '__main__':
    unittest.main()
