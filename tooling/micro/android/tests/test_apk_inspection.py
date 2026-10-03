import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile

spec = importlib.util.spec_from_file_location('inspect_apk', Path(__file__).resolve().parents[1]/'inspect_apk.py')
apk = importlib.util.module_from_spec(spec); spec.loader.exec_module(apk)
BADGING = """package: name='app.micro.factory.fixture' versionCode='1' versionName='1.0.0' platformBuildVersionName='16'
sdkVersion:'24'
targetSdkVersion:'36'
uses-permission: name='app.micro.factory.fixture.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
native-code: 'x86_64'
"""


class InspectionTests(unittest.TestCase):
    def test_package_sdk_permissions_and_abi_parse_without_product_verdict(self):
        value = apk.parse_badging(BADGING)
        self.assertEqual(value['package'], 'app.micro.factory.fixture')
        self.assertEqual(value['targetSdk'], 36)
        self.assertEqual(value['abis'], ['x86_64'])
        self.assertFalse(value['debuggable'])
        self.assertNotIn('accepted', value)

    def test_missing_and_ambiguous_identity_fields_are_rejected(self):
        for text in (BADGING+BADGING, BADGING.replace("targetSdkVersion:'36'\n", ''), BADGING.replace("native-code: 'x86_64'", "native-code: 'unknown'"), BADGING.replace("versionCode='1'", "versionCode='0'")):
            with self.subTest(text=text), self.assertRaises(ValueError): apk.parse_badging(text)

    def test_signature_requires_one_current_verified_certificate(self):
        text = 'Signer #1 certificate SHA-256 digest: '+ 'a'*64
        self.assertEqual(apk.parse_signature(text), 'a'*64)
        for invalid in ('', text+'\n'+text, text.replace('a'*64, 'invalid')):
            with self.assertRaises(ValueError): apk.parse_signature(invalid)

    def test_bundle_limits_duplicates_and_traversal_fail_without_extracting(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'fixture.zip'
            for entries in ([('missing', b'fixture')], [('assets/index.android.bundle', b'')], [('assets/index.android.bundle', b'fixture'), ('../escape', b'bad')], [('assets/index.android.bundle', b'fixture'), ('assets/index.android.bundle', b'changed')]):
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore', UserWarning)
                    with zipfile.ZipFile(path, 'w') as output:
                        for name,data in entries: output.writestr(name, data)
                with self.assertRaises(ValueError): apk.bundle_info(path)
            with zipfile.ZipFile(path, 'w') as output: output.writestr('assets/index.android.bundle', b'fixture')
            with patch.object(apk, 'BUNDLE_BYTES', 3), self.assertRaises(ValueError): apk.bundle_info(path)
            self.assertEqual([p.name for p in Path(temp).iterdir()], ['fixture.zip'])


if __name__ == '__main__': unittest.main()
