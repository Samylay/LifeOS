import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

HERE=Path(__file__).resolve().parent
KIT=Path('/home/quorky/apps/lifeos/.scratch/software-factory-upgrade/tooling/micro/android')
sys.path[:0]=[str(HERE),str(KIT)]
import task_verification_metadata as metadata

class MetadataTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        self.body=b'synthetic exact public artifact';self.sha=hashlib.sha256(self.body).hexdigest()
        self.relative='modules-2/files-2.1/org.example/module/1.0/'+hashlib.sha1(self.body).hexdigest()+'/module-1.0.jar'
        p=self.root/self.relative;p.parent.mkdir(parents=True);p.write_bytes(self.body)
        self.manifest={'entries':[{'path':self.relative,'type':'file','size':len(self.body),'sha256':self.sha}]}
        self.events=[{'url':'https://repo.maven.apache.org/maven2/org/example/module/1.0/module-1.0.jar','action':'artifact-acquired','bytes':len(self.body),'sha256':self.sha}]
        self.local=KIT/'locked-local-maven-manifest.json';self.output=self.root/'verification.xml'
    def generate(self):return metadata.generate(self.root,self.manifest,self.events,self.local,self.output)
    def test_exact_public_and_locked_local_rows_without_wildcards(self):
        result=self.generate();top=ET.fromstring(self.output.read_bytes());ns={'v':'https://schema.gradle.org/dependency-verification'}
        self.assertEqual(top.find('v:configuration/v:verify-metadata',ns).text,'true')
        self.assertEqual(top.find('v:configuration/v:verify-signatures',ns).text,'false')
        rows=result['rows'];public=[r for r in rows if r['group']=='org.example'];self.assertEqual(len(public),1)
        self.assertEqual(public[0]['cachePaths'],[self.relative]);self.assertEqual(public[0]['sha256'],self.sha)
        self.assertTrue(all(len(a.findall('v:sha256',ns))==1 for a in top.findall('v:components/v:component/v:artifact',ns)))
        self.assertFalse(top.findall('.//v:trusted-artifacts',ns));self.assertFalse(top.findall('.//v:ignored-keys',ns))
        self.assertGreater(len(rows),40)
    def test_exact_task_used_plugin_pom_row_retained_without_binary_cache_path(self):
        self.events.append({**self.events[0],'url':self.events[0]['url'].replace('.jar','.pom'),'sha256':'b'*64,'bytes':33})
        result=self.generate();pom=[r for r in result['rows'] if r['artifact']=='module-1.0.pom']
        self.assertEqual(len(pom),1);self.assertEqual(pom[0]['cachePaths'],[]);self.assertEqual(pom[0]['sha256'],'b'*64)
    def test_different_dotted_version_filename_rejected(self):
        self.events[0]['url']=self.events[0]['url'].replace('module-1.0.jar','module-1.0.1.jar')
        with self.assertRaisesRegex(ValueError,'ambiguity'):self.generate()
    def test_dotted_group_path_rejected(self):
        self.events[0]['url']=self.events[0]['url'].replace('org/example/','org.example/')
        with self.assertRaisesRegex(ValueError,'dotted group'):self.generate()
    def test_exact_version_classifier_allowed(self):
        self.events.append({**self.events[0],'url':self.events[0]['url'].replace('.jar','-sources.jar')})
        # Sources are unused public body observations, not invented cache rows.
        result=self.generate();self.assertTrue(result['rows'])
    def test_cache_bytes_changed_rejected(self):
        (self.root/self.relative).write_bytes(b'x'*len(self.body))
        with self.assertRaisesRegex(ValueError,'matching independent'):self.generate()
    def test_missing_public_authority_rejected(self):
        self.events=[]
        with self.assertRaisesRegex(ValueError,'matching independent'):self.generate()
    def test_conflicting_same_coordinate_hash_rejected(self):
        self.events.append({**self.events[0],'sha256':'a'*64})
        with self.assertRaisesRegex(ValueError,'Conflicting'):self.generate()
    def test_unknown_filename_rejected(self):
        self.events[0]['url']=self.events[0]['url'].replace('module-1.0.jar','unrelated.jar')
        with self.assertRaisesRegex(ValueError,'filename'):self.generate()
    def test_sha1_directory_must_match_actual_body(self):
        new=self.relative.replace(hashlib.sha1(self.body).hexdigest(),'0'*40);target=self.root/new;target.parent.mkdir(parents=True);(self.root/self.relative).rename(target);self.manifest['entries'][0]['path']=new
        with self.assertRaisesRegex(ValueError,'matching independent'):self.generate()
    def test_unknown_cache_artifact_layout_rejected(self):
        self.manifest['entries'][0]['path']='modules-2/files-2.1/unknown.jar'
        with self.assertRaisesRegex(ValueError,'layout'):self.generate()
    def test_local_manifest_identity_changed_rejected(self):
        self.local=self.root/'local.json';self.local.write_text('{}')
        with self.assertRaisesRegex(ValueError,'identity'):self.generate()
    def test_unapproved_origin_and_credentials_rejected(self):
        for url in ('https://example.com/module.jar','https://user@repo.maven.apache.org/maven2/org/example/module/1.0/module-1.0.jar'):
            self.events[0]['url']=url
            with self.assertRaisesRegex(ValueError,'authority URL'):self.generate()
    def test_duplicate_cache_entry_rejected(self):
        self.manifest['entries'].append(self.manifest['entries'][0].copy())
        with self.assertRaisesRegex(ValueError,'Duplicate'):self.generate()

if __name__=='__main__':unittest.main()
