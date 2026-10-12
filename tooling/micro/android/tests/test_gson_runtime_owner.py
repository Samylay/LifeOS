"""Authored FAKE receipt/source tests only; no Gradle, archive, APK or SQL runs."""
import ast
import copy
import hashlib
import json
from pathlib import Path
import unittest

import admission as a

PROPOSAL = next(parent for parent in Path(__file__).resolve().parents if (parent / 'gson-runtime-owner.manifest.json').is_file())
MANIFEST_RAW = (PROPOSAL / 'gson-runtime-owner.manifest.json').read_bytes()
MANIFEST = json.loads(MANIFEST_RAW)
MANIFEST_SHA = hashlib.sha256(MANIFEST_RAW).hexdigest()
SUBJECT = {name:{'bytes':99,'sha256':hashlib.sha256(('FAKE-'+name).encode()).hexdigest()} for name in a.ROOT_POLICY_TOOL_NAMES}
CONSTRAINT = {'group':MANIFEST['group'],'module':MANIFEST['module'],'required':'2.8.9','preferred':'','strict':'','rejected':[],
              'reason':'Reviewed Gson owner floor '+MANIFEST_SHA+' :expo-log-box'}


def root_graph():
    manifest = a.rp_manifest()
    constraints = [{'group':row['group'],'module':row['module'],'required':row['candidate'],'preferred':'','strict':'','rejected':[],
                    'reason':'Reviewed root buildscript candidate '+a.ROOT_POLICY_MANIFEST_SHA256+' '+row['group']+':'+row['module']} for row in manifest['modules']]
    chosen = [{'group':row['group'],'module':row['module'],'version':row['candidate'],'constrained':True,'forced':False,
               'conflictResolution':False,'selectedByRule':False,'reasons':[{'cause':'CONSTRAINT','description':'FAKE root winner'}],
               'reasonCaptureComplete':True} for row in manifest['modules']]
    return {**dict(zip(('build','project','scope','configuration'),a.ROOT_POLICY_SCOPE)),
            'components':[{k:row[k] for k in ('group','module','version')} for row in chosen]+[{'group':MANIFEST['group'],'module':'gson','version':'2.11.0'}],
            'rootBuildscriptConstraintPolicy':{'schema':3,'failureSchema':1,'manifestSha256':a.ROOT_POLICY_MANIFEST_SHA256,
                'semantics':manifest['semantics'],'toolSubject':SUBJECT,'captureComplete':True,'installedConstraints':constraints,
                'allConstraints':copy.deepcopy(constraints),'chosen':chosen,'unresolved':[],'unresolvedCount':0,
                'unresolvedTruncated':False,'unresolvedComplete':True,'failures':[],'selectedVersionsAccepted':True}}


def scope_graph(row, version='2.8.9'):
    chosen = [{'group':MANIFEST['group'],'module':'gson','version':version,'constrained':True,'forced':False,
               'conflictResolution':False,'selectedByRule':False,'reasons':[{'cause':'CONSTRAINT','description':'FAKE owner winner'}],
               'reasonCaptureComplete':True}] if row['gsonRequired'] else []
    return {'build':MANIFEST['build'],'project':row['project'],'scope':'project','configuration':row['configuration'],
            'components':[{k:value[k] for k in ('group','module','version')} for value in chosen],
            'gsonRuntimeOwnerPolicy':{'schema':1,'manifestSha256':MANIFEST_SHA,'semantics':MANIFEST['semantics'],
                'toolSubject':SUBJECT,'ownerSource':copy.deepcopy(MANIFEST['source']),'ownerConstraint':copy.deepcopy(CONSTRAINT),
                'installationVerified':True,'allConstraints':[copy.deepcopy(CONSTRAINT)] if row['project']==':expo-log-box' else [],
                'chosen':chosen,'unresolvedCount':0,'unresolvedComplete':True,'captureComplete':True,'failures':[],
                'selectedVersionsAccepted':True}}


def documents(graphs):
    return [('graph-%d.json'%index,(json.dumps(value,separators=(',',':'))+'\n').encode()) for index,value in enumerate(graphs)]


def pipeline_validate(graphs):
    raw = documents(graphs)
    # Baseline's old gate accepts these scope gaps; the new gate must reject.
    a.rp_validate_documents(raw,SUBJECT)
    if hasattr(a,'gr_validate_documents'):
        return a.gr_validate_documents(raw,SUBJECT)
    return None


class GsonRuntimeOwnerTests(unittest.TestCase):
    def setUp(self):
        self.graphs = [root_graph()]+[scope_graph(row) for row in MANIFEST['requiredScopes']]

    def test_complete_six_scopes_preserve_truthful_two_compile_absences(self):
        result = pipeline_validate(self.graphs)
        self.assertIsInstance(result,dict)
        self.assertEqual(result['manifestSha256'],MANIFEST_SHA)
        self.assertEqual(len(result['graphs']),6)
        self.assertEqual([g['project'] for g in self.graphs[1:] if not g['components']],[':app',':expo'])
        self.assertTrue(all(row['sha256']==hashlib.sha256(documents(self.graphs)[int(row['path'].split('-')[1].split('.')[0])][1]).hexdigest() for row in result['graphs']))

    def test_required_scope_omission_and_foreign_scope_do_not_accept(self):
        for index in range(1,7):
            changed=copy.deepcopy(self.graphs);changed.pop(index)
            with self.subTest(missing=index),self.assertRaises(ValueError):pipeline_validate(changed)
        changed=copy.deepcopy(self.graphs);changed[1]['build']='/work/other/android'
        with self.assertRaises(ValueError):pipeline_validate(changed)
        with self.assertRaises(ValueError):pipeline_validate([self.graphs[0]]*128)

    def test_old_gson_in_each_release_scope_rejects_even_rehashed_summary(self):
        for index in range(1,7):
            changed=copy.deepcopy(self.graphs);g=changed[index]
            winner={'group':MANIFEST['group'],'module':'gson','version':'2.8.6'}
            g['components']=[winner]
            g['gsonRuntimeOwnerPolicy']['chosen']=[{**scope_graph(MANIFEST['requiredScopes'][1])['gsonRuntimeOwnerPolicy']['chosen'][0],**winner}]
            with self.subTest(scope=index),self.assertRaises(ValueError):pipeline_validate(changed)

    def test_newer_release_winners_accepted_without_downgrade_or_force(self):
        for version in ('2.8.9','2.9','2.10.1','2.11.0','2.13.2','3.0'):
            changed=[root_graph()]+[scope_graph(row,version) for row in MANIFEST['requiredScopes']]
            with self.subTest(version=version):
                result=pipeline_validate(changed)
                self.assertIsInstance(result,dict)
                self.assertTrue(a.gr_version_ok(version))
                self.assertEqual(changed[0]['components'][-1]['version'],'2.11.0')

    def test_unknown_mutable_prerelease_and_boolean_versions_reject(self):
        for version in ('2.8.8','2.8','2.8.9-SNAPSHOT','2.8.9-beta','latest.release','2.+','[2.8.9,)','02.8.9','2.8.9 ','2.8.9+metadata',None,True,2.11):
            changed=copy.deepcopy(self.graphs);changed[2]['components'][0]['version']=version
            changed[2]['gsonRuntimeOwnerPolicy']['chosen'][0]['version']=version
            with self.subTest(version=version),self.assertRaises(ValueError):pipeline_validate(changed)

    def test_missing_failed_unresolved_and_partial_policy_rejects(self):
        for field,value in (('captureComplete',False),('installationVerified',False),('unresolvedComplete',False),('unresolvedCount',True),('unresolvedCount',1),('selectedVersionsAccepted',False),('failures',[{'kind':'FAKE failure'}])):
            changed=copy.deepcopy(self.graphs);changed[2]['gsonRuntimeOwnerPolicy'][field]=value
            with self.subTest(field=field,value=value),self.assertRaises(ValueError):pipeline_validate(changed)
        changed=copy.deepcopy(self.graphs);del changed[2]['gsonRuntimeOwnerPolicy']
        with self.assertRaises(ValueError):pipeline_validate(changed)

    def test_owner_source_floor_tool_subject_and_inheritance_are_exact(self):
        variants=(lambda p:p['ownerSource'].update(sha256='f'*64),lambda p:p['ownerSource'].update(bytes=2515),
                  lambda p:p['ownerSource'].update(path='/arbitrary/script.gradle'),lambda p:p['ownerConstraint'].update(required='2.8.6'),
                  lambda p:p['toolSubject']['native_fixture_job.py'].update(sha256='f'*64),lambda p:p.update(manifestSha256='f'*64),
                  lambda p:p.update(allConstraints=[]),lambda p:p['allConstraints'].append(copy.deepcopy(CONSTRAINT)))
        for modify in variants:
            changed=copy.deepcopy(self.graphs);modify(changed[5]['gsonRuntimeOwnerPolicy'])
            with self.assertRaises(ValueError):pipeline_validate(changed)

    def test_chosen_reason_duplicate_winner_force_rule_and_missing_capture_reject(self):
        for field,value in (('forced',True),('selectedByRule',True),('constrained',False),('reasonCaptureComplete',False),('forced',0),('reasons',[]),('reasons',[{'cause':'CONSTRAINT','description':None}])):
            changed=copy.deepcopy(self.graphs);changed[5]['gsonRuntimeOwnerPolicy']['chosen'][0][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):pipeline_validate(changed)
        changed=copy.deepcopy(self.graphs);changed[5]['components']*=2;changed[5]['gsonRuntimeOwnerPolicy']['chosen']*=2
        with self.assertRaises(ValueError):pipeline_validate(changed)
        changed=copy.deepcopy(self.graphs);changed[5]['gsonRuntimeOwnerPolicy']['chosen'][0]['version']='2.11.0'
        with self.assertRaises(ValueError):pipeline_validate(changed)

    def test_no_old_gson_elsewhere_and_no_root_buildscript_downgrade(self):
        changed=copy.deepcopy(self.graphs);changed[0]['components'][-1]['version']='2.8.9'
        with self.assertRaises(ValueError):pipeline_validate(changed)
        changed=copy.deepcopy(self.graphs);changed.append({'build':'/work/included','project':':','scope':'project-buildscript','configuration':'classpath','components':[{'group':MANIFEST['group'],'module':'gson','version':'2.8.6'}]})
        with self.assertRaises(ValueError):pipeline_validate(changed)
        changed=copy.deepcopy(self.graphs);changed.append({'build':'/work/included','project':':','scope':'project-buildscript','configuration':'classpath','components':[{'group':MANIFEST['group'],'module':'gson','version':'2.11.0'}]*2})
        with self.assertRaises(ValueError):pipeline_validate(changed)
        changed=copy.deepcopy(self.graphs);changed[0]['gsonRuntimeOwnerPolicy']=changed[2]['gsonRuntimeOwnerPolicy']
        with self.assertRaises(ValueError):pipeline_validate(changed)

    def test_repeated_scopes_require_identical_complete_facts_and_cannot_fill_omissions(self):
        repeated=copy.deepcopy(self.graphs)+[copy.deepcopy(self.graphs[2])]
        self.assertIsInstance(pipeline_validate(repeated),dict)
        changed=copy.deepcopy(repeated);changed[-1]['components'][0]['version']='2.11.0'
        changed[-1]['gsonRuntimeOwnerPolicy']['chosen'][0]['version']='2.11.0'
        with self.assertRaises(ValueError):pipeline_validate(changed)
        changed=copy.deepcopy(repeated);changed[-1]['gsonRuntimeOwnerPolicy']['chosen'][0]['conflictResolution']=True
        with self.assertRaises(ValueError):pipeline_validate(changed)
        with self.assertRaises(ValueError):pipeline_validate([self.graphs[0]]+[self.graphs[2]]*128)

    def test_graph_names_json_duplicates_unknown_fields_and_count_bound_fail_closed(self):
        good=documents(self.graphs)
        for altered in ([('../escape.json',good[0][1])]+good[1:],good+[good[0]],good*300):
            with self.assertRaises(ValueError):a.gr_validate_documents(altered,SUBJECT)
        duplicate=good[2][1].replace(b'"schema":1',b'"schema":1,"schema":1')
        with self.assertRaises(ValueError):a.gr_validate_documents(good[:2]+[(good[2][0],duplicate)]+good[3:],SUBJECT)
        changed=copy.deepcopy(self.graphs);changed[2]['gsonRuntimeOwnerPolicy']['completionAssertion']='unreviewed'
        with self.assertRaises(ValueError):pipeline_validate(changed)

    def test_native_job_summary_is_mandatory_and_raw_scope_gaps_reject(self):
        from test_android_pipeline import SyntheticFixture
        import tempfile
        from dataclasses import replace
        with tempfile.TemporaryDirectory() as directory:
            fixture=SyntheticFixture(directory)
            build=fixture.store.json(fixture.builds[0]);job=fixture.store.json(a.Evidence.parse(build['job']))
            missing=copy.deepcopy(job);missing.pop('gsonRuntimePolicyValidation',None)
            changed={**build,'job':fixture.put(missing).json()}
            with self.assertRaises(a.Rejected):a.validate_build(fixture.put(changed),fixture.binding,fixture.store,fixture.now,3600)
            mapping=fixture.store.json(fixture.binding.native_mapping)
            closure=fixture.store.json(a.Evidence.parse(mapping['nativeClosure']))
            closure['mavenGraphs'].pop('fake-release-2.json',None)
            mapping['nativeClosure']=fixture.put(closure).json()
            binding=replace(fixture.binding,native_mapping=fixture.put(mapping))
            with self.assertRaises(a.Rejected):a.native_mapping_context(binding.native_mapping,binding,fixture.store)

    def test_untrusted_worker_summary_cannot_replace_actual_raw_gson_receipts(self):
        from test_android_pipeline import SyntheticFixture
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            fixture=SyntheticFixture(directory)
            build=fixture.store.json(fixture.builds[0]);job=fixture.store.json(a.Evidence.parse(build['job']))
            if 'gsonRuntimePolicyValidation' not in job:
                # Existing baseline's missing required field must reject too.
                with self.assertRaises(a.Rejected):a.validate_build(fixture.builds[0],fixture.binding,fixture.store,fixture.now,3600)
                return
            changed=copy.deepcopy(job);changed['gsonRuntimePolicyValidation']['graphs'][0]['sha256']='f'*64
            bad_build={**build,'job':fixture.put(changed).json()}
            with self.assertRaises(a.Rejected):a.validate_build(fixture.put(bad_build),fixture.binding,fixture.store,fixture.now,3600)
            output=Path(job['gsonRuntimePolicyValidation']['graphs'][0]['path'])
            parent=Path(build['job']['path']).parent
            path=fixture.store.path(str(parent/'graph'/output))
            graph=json.loads(path.read_bytes())
            graph['gsonRuntimeOwnerPolicy']['ownerSource']['sha256']='f'*64
            path.write_bytes(a.canonical(graph))
            with self.assertRaises(a.Rejected):a.validate_build(fixture.builds[0],fixture.binding,fixture.store,fixture.now,3600)

    def test_one_missing_raw_scope_rejects_without_deleting_other_scopes(self):
        from test_android_pipeline import SyntheticFixture
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            fixture=SyntheticFixture(directory)
            build=fixture.store.json(fixture.builds[0])
            root=fixture.store.path(str(Path(build['job']['path']).parent/'graph/root.json'))
            root.with_name('gson-2.json').unlink()
            self.assertTrue(root.exists())
            self.assertEqual(len(list(root.parent.iterdir())),6)
            with self.assertRaisesRegex(a.Rejected,'Gson|scope'):
                a.validate_build(fixture.builds[0],fixture.binding,fixture.store,fixture.now,3600)

    def test_authored_collection_helper_rejects_unknown_link_or_changed_file_before_delete(self):
        from test_android_pipeline import SyntheticFixture
        import tempfile
        for mutation in ('unknown','link','changed'):
            with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as directory:
                fixture=SyntheticFixture(directory)
                build=fixture.store.json(fixture.builds[0])
                root=fixture.store.path(str(Path(build['job']['path']).parent/'graph/root.json'))
                target=root.with_name('gson-0.json')
                if mutation=='unknown':root.with_name('unexpected.json').write_bytes(b'FAKE unknown')
                elif mutation=='link':
                    target.unlink();target.symlink_to(root.with_name('gson-1.json'))
                else:target.write_bytes(target.read_bytes()+b' ')
                with self.assertRaises(ValueError):root.unlink()
                self.assertTrue(root.exists());self.assertTrue(root.with_name('gson-5.json').exists())

    def test_root_policy_functions_remain_identical_and_new_validation_blocks_match(self):
        functions=[]
        for name in ('native_fixture_job.py','native_acquire.py','admission.py'):
            path=Path(a.__file__).with_name(name);current=ast.parse(path.read_bytes())
            original=ast.parse((PROPOSAL/'preimages/tooling/micro/android'/name).read_bytes())
            old={n.name:ast.dump(n,include_attributes=False) for n in original.body if isinstance(n,ast.FunctionDef) and n.name.startswith('rp_')}
            new={n.name:ast.dump(n,include_attributes=False) for n in current.body if isinstance(n,ast.FunctionDef) and n.name.startswith('rp_')}
            self.assertEqual(old,new)
            functions.append({n.name:ast.dump(n,include_attributes=False) for n in current.body if isinstance(n,ast.FunctionDef) and n.name.startswith('gr_')})
        self.assertEqual(functions[0],functions[1]);self.assertEqual(functions[1],functions[2]);self.assertGreater(len(functions[0]),0)

    def test_gradle_source_owner_guard_and_only_require_floor_are_fixed(self):
        source=Path(a.__file__).with_name('trusted_repositories.init.gradle').read_text()
        self.assertIn("project.plugins.withId('com.android.library')",source)
        self.assertIn("project.dependencies.constraints.add('implementation'",source)
        self.assertIn('version.require(gsonOwnerManifest.floor)',source)
        self.assertIn('Gson owner exact published preimage changed',source)
        self.assertIn('gsonReceipt.selectedVersionsAccepted',source)
        block=source.split('// Proposed fixed runtime owner floor.',1)[1].split('def guardConfigurations =',1)[0]
        for forbidden in ('.force(','.strictly(','.useVersion(',"constraints.add('classpath'",'newConfiguration','detachedConfiguration'):
            self.assertNotIn(forbidden,block)
        self.assertEqual(MANIFEST['source']['sha256'],'a0e049db9ff502a3cc786e249f575b8c399d9c4d5ebd1f433d41ca9710c33d37')
        self.assertEqual(MANIFEST['rootBuildscriptFloor'],'2.11.0')
