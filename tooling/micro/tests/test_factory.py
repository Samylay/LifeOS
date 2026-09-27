import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('micro',Path(__file__).resolve().parents[1]/'micro.py')
micro=importlib.util.module_from_spec(spec); spec.loader.exec_module(micro)
def brief():
    return {'title':'Factory test','name':'Fixture','audience':'Test user','problem':'Exercise isolated checks','platform':'web','features':[{'id':'core','title':'Core flow','scope':'first','acceptance':'The behavior predicate passes'}],'vibe':'Plain fixture','references':'Synthetic test reference','business':'Not a product'}

class FactoryTests(unittest.TestCase):
    def test_path_escape_and_symlink_are_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'micro'; root.mkdir(); outside=Path(temp)/'outside'; outside.mkdir()
            for slug in ('../outside','/tmp/escape','two/levels','--flag'):
                with self.assertRaises(ValueError): micro.project_path(root,slug)
            (root/'linked').symlink_to(outside,target_is_directory=True)
            with self.assertRaises(ValueError): micro.project_path(root,'linked')
            with self.assertRaises(ValueError): micro.root_path(root/'linked')

    def test_initialization_preserves_existing_work(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); existing=root/'existing'; existing.mkdir(); (existing/'user.txt').write_text('keep')
            with self.assertRaises(FileExistsError): micro.initialize(root,'existing',brief())
            self.assertEqual((existing/'user.txt').read_text(),'keep')
            created=micro.initialize(root,'fresh',brief())
            self.assertEqual(json.loads((created/'brief.json').read_text())['name'],'Fixture')
            self.assertTrue((created/'AGENTS.md').is_file())
            result=subprocess.run(['git','-C',str(created),'status','--porcelain'],capture_output=True)
            self.assertEqual(result.stdout,b'')

    def test_incomplete_features_and_duplicate_ids_are_rejected(self):
        v=brief(); v['features'][0]['acceptance']=''
        with self.assertRaises(ValueError): micro.validate_brief(v)
        v=brief(); v['features'].append(v['features'][0])
        with self.assertRaises(ValueError): micro.validate_brief(v)

    def test_archive_cannot_read_links_write_outside_or_include_secrets(self):
        for name,link in [('../escape',None),('.env',None),('link','/etc/passwd')]:
            data=io.BytesIO()
            with tarfile.open(fileobj=data,mode='w') as tar:
                info=tarfile.TarInfo(name)
                if link: info.type=tarfile.SYMTYPE; info.linkname=link
                else: info.size=1
                tar.addfile(info,None if link else io.BytesIO(b'x'))
            with tempfile.TemporaryDirectory() as temp:
                with self.assertRaises(ValueError): micro.extract_source(data.getvalue(),Path(temp))

    def test_dirty_candidate_refused_before_docker_or_execution(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); project=micro.initialize(root,'dirty',brief())
            (project/'SPEC.md').write_text('uncommitted work')
            with self.assertRaisesRegex(ValueError,'Commit the intended candidate'):
                micro.verify(root,'dirty',root/'receipts',{'image':'invalid'})

if __name__=='__main__': unittest.main()
