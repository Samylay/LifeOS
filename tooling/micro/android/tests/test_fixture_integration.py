"""Temp synthetic input bytes only. These are not native/offline proof."""
import hashlib
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import admission as a
import fixture_integration as f


class CopyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root/'store').mkdir(mode=0o700)
        self.store = a.Store(self.root/'store')
        # /tmp may be a small tmpfs. Mock only this host resource observation;
        # all copy bytes/manifests/read errors remain real synthetic files.
        real_budget = self.store.budget
        self.headroom = patch.object(self.store,'budget',side_effect=lambda: {**real_budget(),'freeDiskBytes':100*1024**3})
        self.headroom.start(); self.addCleanup(self.headroom.stop)
        self.source = self.root/'source'; self.source.mkdir()
        (self.source/'alpha').write_bytes(b'FAKE sealed component alpha')
        (self.source/'nested').mkdir()
        (self.source/'nested/beta').write_bytes(b'FAKE sealed component beta')
        self.expected = f.inventory(self.source,1024)

    def tearDown(self):
        # Independent readonly copies must also survive ordinary cleanup.
        for p in self.root.rglob('*'):
            if p.is_dir() and not p.is_symlink(): p.chmod(0o700)
        self.temporary.cleanup()

    def test_complete_copy_and_retained_manifest_are_independent(self):
        tree = f._copy_tree(self.store,self.source,'copied',self.expected,1024)
        self.assertEqual(a.validate_tree(tree,self.store),self.expected['files'])
        self.assertNotEqual((self.source/'alpha').stat().st_ino,self.store.path('copied/alpha').stat().st_ino)
        self.assertEqual(self.store.path('copied').stat().st_mode & 0o777,0o555)
        (self.source/'alpha').write_bytes(b'FAKE different upstream bytes')
        self.assertEqual(a.validate_tree(tree,self.store),self.expected['files'])

    def test_single_file_copy_retains_bytes_when_authority_basename_changes(self):
        expected = f.inventory(self.source/'alpha',1024)
        tree = f._copy_tree(self.store,self.source/'alpha','renamed-public-input',expected,1024)
        rows = a.validate_tree(tree,self.store)
        self.assertEqual(rows,[{**expected['files'][0],'path':'renamed-public-input'}])
        self.assertEqual(self.store.path('renamed-public-input').read_bytes(),(self.source/'alpha').read_bytes())
        self.assertNotEqual(self.store.path('renamed-public-input').stat().st_ino,(self.source/'alpha').stat().st_ino)

    def test_extra_omitted_or_changed_file_blocks_before_copy(self):
        for change in ('extra','omit','changed'):
            with self.subTest(change=change):
                expected = dict(self.expected)
                if change == 'extra': (self.source/'unreviewed').write_bytes(b'FAKE extra')
                elif change == 'omit': expected['files'] = expected['files'][:-1]
                else: (self.source/'alpha').write_bytes(b'FAKE tampered')
                with self.assertRaises(a.Rejected): f._copy_tree(self.store,self.source,'copy-'+change,expected,1024)
                self.assertFalse(self.store.path('copy-'+change).exists())
                if change == 'extra': (self.source/'unreviewed').unlink()

    def test_symlink_and_hardlink_not_accepted(self):
        (self.source/'link').symlink_to(self.source/'alpha')
        with self.assertRaises(a.Rejected): f.inventory(self.source,1024)
        (self.source/'link').unlink()
        os.link(self.source/'alpha',self.source/'hardlink')
        with self.assertRaises(a.Rejected): f.inventory(self.source,1024)

    def test_parent_symlink_refused(self):
        (self.root/'alias').symlink_to(self.source,target_is_directory=True)
        with self.assertRaises(a.Rejected): f.inventory(self.root/'alias',1024)

    def test_source_change_during_copy_preserves_failure_and_never_seals(self):
        real_copy = f._copy_file
        def changed(source,destination,expected):
            real_copy(source,destination,expected)
            (self.source/'alpha').write_bytes(b'FAKE changed during copy')
        with patch.object(f,'_copy_file',side_effect=changed):
            with self.assertRaises(a.Rejected): f._copy_tree(self.store,self.source,'failed',self.expected,1024)
        self.assertTrue(self.store.path('failed').exists())
        self.assertFalse(self.store.path('failed').stat().st_mode & 0o222 == 0)

    def test_size_budget_cannot_be_widened_by_manifest(self):
        with self.assertRaises(a.Rejected): f.inventory(self.source,1)

    def test_read_error_not_accepted(self):
        with patch.object(f.os,'read',side_effect=OSError('FAKE ordinary input read error')):
            with self.assertRaises(OSError): f.inventory(self.source,1024)

    def test_existing_copy_cannot_be_replaced(self):
        f._copy_tree(self.store,self.source,'once',self.expected,1024)
        with self.assertRaises(a.Rejected): f._copy_tree(self.store,self.source,'once',self.expected,1024)

    def test_aggregate_budget_and_free_headroom_reject_before_write(self):
        before = self.store.budget()
        for changes in ({'regularBytes':a.STORE_BYTES-1},{'allocatedBytes':a.STORE_BYTES-1},
                        {'freeDiskBytes':30*1024**3}):
            with self.subTest(changes=changes), patch.object(self.store,'budget',return_value={**before,**changes}):
                with self.assertRaises(a.Rejected): f._copy_tree(self.store,self.source,'too-big',self.expected,1024)
                self.assertFalse(self.store.path('too-big').exists())

    def test_fixed_role_rejects_unknown_slot_owner_and_wrong_tree(self):
        with patch.object(f,'CONTROLLER_ROOT',self.store.root):
            for slot,owner in (('candidate-cache',None),('gradle-caches','../other'),('npm-cache','f'*32)):
                with self.subTest(slot=slot), self.assertRaises(a.Rejected):
                    f.copy_seed(self.store,slot,owner,self.expected,'a'*32)
            seal = self.store.path('sealed-native/'+'b'*32+'/gradle-caches')
            seal.mkdir(parents=True)
            (seal/'different').write_bytes(b'FAKE other bytes')
            with self.assertRaises(a.Rejected): f.copy_seed(self.store,'gradle-caches','b'*32,self.expected,'a'*32)

    def test_existing_store_seal_reuse_still_verifies_complete_bytes(self):
        relative = 'sealed-native/'+'b'*32+'/gradle-caches'
        self.store.path('sealed-native/'+'b'*32).mkdir(parents=True)
        sealed = f._copy_tree(self.store,self.source,relative,self.expected,1024)
        before = self.store.budget()['regularBytes']
        with patch.object(f,'CONTROLLER_ROOT',self.store.root):
            observed = f.copy_seed(self.store,'gradle-caches','b'*32,self.expected,'a'*32)
        self.assertEqual(observed,sealed)
        self.assertEqual(before,self.store.budget()['regularBytes'])

    def test_tools_never_accept_extra_or_missing_names(self):
        with patch.object(f,'CONTROLLER_ROOT',self.store.root):
            with self.assertRaisesRegex(a.Rejected,'eight'): f.copy_tools(self.store,'a'*32,{})
            refs = {name:a.Evidence(name,'a'*64,1) for name in f.TOOLS}
            refs['candidate.py'] = a.Evidence('candidate.py','b'*64,1)
            with self.assertRaisesRegex(a.Rejected,'eight'): f.copy_tools(self.store,'a'*32,refs)

    def test_seven_file_seed_missing_imported_diagnostics_is_rejected(self):
        refs={name:a.Evidence(name,'a'*64,1) for name in f.TOOLS if name!='native_failure_diagnostics.py'}
        with patch.object(f,'CONTROLLER_ROOT',self.store.root):
            with self.assertRaisesRegex(a.Rejected,'eight'): f.copy_tools(self.store,'a'*32,refs)
        tree={'kind':'directory','files':[{'path':name,'sha256':ref.sha256,'bytes':ref.bytes} for name,ref in refs.items()]}
        with self.assertRaisesRegex(a.Rejected,'eight-file'): f.require_toolset(tree)
        tree['files'].append({'path':'native_failure_diagnostics.py','sha256':'b'*64,'bytes':1})
        with self.assertRaisesRegex(a.Rejected,'differs'): f.require_toolset(tree)

    def test_typed_acquisition_never_accepts_missing_or_failed_current_attempt(self):
        with patch.object(f,'CONTROLLER',self.root):
            attempt='maven-attempt1';prefix='native-acquisition/'+attempt
            refs=[a.Evidence(prefix+'/receipts/maven-acquisition.json','a'*64,1),a.Evidence(prefix+'/output/native-job.json','a'*64,1)]
            with self.assertRaises(FileNotFoundError): f.bind_acquisition(attempt,*refs)
            source=self.root/prefix; (source/'receipts').mkdir(parents=True); (source/'output').mkdir()
            values=[{'status':'first-native-failure-retained','cleanupFailures':[],'image':a.IMAGE,'clientState':{'OOMKilled':True}}, {'status':'first-native-failure-retained','offline':False}]
            refs=[]
            for relative,value in zip(('receipts/maven-acquisition.json','output/native-job.json'),values):
                data=a.canonical(value);(source/relative).write_bytes(data)
                refs.append(a.Evidence(prefix+'/'+relative,hashlib.sha256(data).hexdigest(),len(data)))
            with self.assertRaisesRegex(a.Rejected,'no successful'): f.bind_acquisition(attempt,*refs)
            for invalid in ('../maven-attempt1','other-attempt1'):
                with self.assertRaises(a.Rejected): f.bind_acquisition(invalid,*refs)

    def test_draft_binding_never_grants_admission(self):
        binding = a.Binding('fixture-'+'a'*32,'expo-android',f.SOURCE_SHA,{},None,9999999999)
        with self.assertRaisesRegex(a.Rejected,'pending trusted signing'): binding.validate(self.store,0)

    def test_raw_copy_manifest_has_exact_identity(self):
        self.assertEqual(hashlib.sha256(a.canonical(self.expected['files'])).hexdigest(),self.expected['manifestSha256'])
        corrupt = {**self.expected,'manifestSha256':'a'*64}
        with self.assertRaises(a.Rejected): f._copy_tree(self.store,self.source,'corrupt',corrupt,1024)

    def test_cache_bytes_bound_to_sealer_archive_manifest(self):
        rows = [{'mode':292,'type':'file','path':row['path'],'size':row['bytes'],'sha256':row['sha256']} for row in self.expected['files']]
        archive = {'schema':1,'entries':rows,'entryCount':len(rows),'fileBytes':sum(row['size'] for row in rows)}
        component = {'canonicalTreeSha256':hashlib.sha256(a.canonical(archive)).hexdigest()}
        f.bind_sealed_cache(self.expected,archive,component)
        changed = {**self.expected,'files':[{**row,'sha256':'c'*64} for row in self.expected['files']]}
        with self.assertRaises(a.Rejected): f.bind_sealed_cache(changed,archive,component)
        tampered = {**archive,'fileBytes':archive['fileBytes']+1}
        with self.assertRaises(a.Rejected): f.bind_sealed_cache(self.expected,tampered,component)


if __name__ == '__main__': unittest.main()
