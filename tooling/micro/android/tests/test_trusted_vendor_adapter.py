import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import trusted_vendor_adapter as adapter

class VendorAdapterTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(); self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name); self.paths=[]; files=[]
        for name in ('one','two'):
            p=self.root/('node_modules/'+name+'/android/build.gradle');p.parent.mkdir(parents=True);p.write_text('repositories { mavenLocal() }\n');self.paths.append(p)
            before=p.read_bytes();after=b'repositories {  }\n';files.append({'path':str(p.relative_to(self.root)),'beforeSha256':hashlib.sha256(before).hexdigest(),'afterSha256':hashlib.sha256(after).hexdigest(),'edits':[{'before':'mavenLocal()','after':''}],'npmUrl':'https://registry.npmjs.org/'+name,'npmIntegrity':'test fixture only','npmTarballSha256':'test fixture only'})
        self.manifest=self.root/'reviewed.json';self.manifest.write_text(json.dumps({'files':files}));self.identity=hashlib.sha256(self.manifest.read_bytes()).hexdigest()
    def test_exact_once_and_postbuild_check(self):
        with patch.object(adapter,'MANIFEST_SHA256',self.identity):
            adapter.apply(self.root,self.manifest);adapter.verify_after(self.root,self.manifest)
            with self.assertRaises(ValueError):adapter.apply(self.root,self.manifest)
    def test_all_preimages_before_any_mutation(self):
        self.paths[1].write_bytes(b'changed')
        with patch.object(adapter,'MANIFEST_SHA256',self.identity):
            with self.assertRaises(ValueError):adapter.apply(self.root,self.manifest)
        self.assertIn('mavenLocal()',self.paths[0].read_text())
    def test_unreviewed_manifest_refused(self):
        with self.assertRaises(ValueError):adapter.apply(self.root,self.manifest)
    def test_postbuild_source_mutation_rejected(self):
        with patch.object(adapter,'MANIFEST_SHA256',self.identity):
            adapter.apply(self.root,self.manifest);self.paths[0].write_bytes(b'changed after build')
            with self.assertRaises(ValueError):adapter.verify_after(self.root,self.manifest)
    def test_linked_source_refused(self):
        original=self.paths[0];saved=self.root/'saved.gradle';original.rename(saved);original.symlink_to(saved)
        with patch.object(adapter,'MANIFEST_SHA256',self.identity):
            with self.assertRaises(ValueError):adapter.apply(self.root,self.manifest)
if __name__=='__main__':unittest.main()
