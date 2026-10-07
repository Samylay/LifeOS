"""FAKE root policy plumbing only, no Gradle or native execution."""
import copy
from dataclasses import replace
import json
from pathlib import Path
import tempfile
import unittest

from jsonschema import Draft202012Validator, ValidationError
import admission as a
from test_android_pipeline import SyntheticFixture


class Constraint4IntegrationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.fixture = SyntheticFixture(temporary.name)
        self.build = self.fixture.store.json(self.fixture.builds[0])
        self.job = self.fixture.store.json(a.Evidence.parse(self.build['job']))
        self.schema = json.loads(Path(a.__file__).with_name('adapter.schema.json').read_bytes())

    def validator(self):
        document = {**self.schema, '$ref': '#/$defs/nativeJob'}
        for key in ('type', 'properties', 'required', 'additionalProperties', 'allOf'):
            document.pop(key, None)
        Draft202012Validator.check_schema(document)
        return Draft202012Validator(document)

    def test_schema_accepts_complete_fake_summary_and_requires_every_nested_field(self):
        validator = self.validator()
        validator.validate(self.job)
        for target in ((), ('rootPolicyValidation',), ('rootPolicyValidation', 'toolSubject'),
                       ('rootPolicyValidation', 'toolSubject', 'native_fixture_job.py'),
                       ('rootPolicyValidation', 'graphs', 0)):
            original = self.job
            for key in target:
                original = original[key]
            keys = ('rootPolicyValidation',) if not target else tuple(original)
            for missing in keys:
                with self.subTest(target=target, missing=missing):
                    changed = copy.deepcopy(self.job)
                    subject = changed
                    for key in target:
                        subject = subject[key]
                    del subject[missing]
                    with self.assertRaises(ValidationError):
                        validator.validate(changed)

    def test_schema_rejects_extra_authority_at_every_summary_level(self):
        validator = self.validator()
        for target in (('rootPolicyValidation',), ('rootPolicyValidation', 'toolSubject'),
                       ('rootPolicyValidation', 'toolSubject', 'native_fixture_job.py'),
                       ('rootPolicyValidation', 'graphs', 0)):
            with self.subTest(target=target):
                changed = copy.deepcopy(self.job)
                subject = changed
                for key in target:
                    subject = subject[key]
                subject['unknownAuthority'] = True
                with self.assertRaises(ValidationError):
                    validator.validate(changed)

    def test_schema_rejects_foreign_identity_invalid_hashes_and_existing_bound_overflow(self):
        validator = self.validator()
        variants = [({'schema': 'unknown'}), ({'status': 'pending'}),
                    ({'manifestSha256': 'a'*64}), ({'graphs': []})]
        for mutation in variants:
            with self.subTest(mutation=mutation):
                changed = copy.deepcopy(self.job)
                changed['rootPolicyValidation'].update(mutation)
                with self.assertRaises(ValidationError):
                    validator.validate(changed)
        for field, value in (('path', '../root.json'), ('sha256', 'x'*64),
                             ('bytes', True), ('bytes', 0), ('bytes', 8*1024**2+1)):
            with self.subTest(field=field, value=value):
                changed = copy.deepcopy(self.job)
                changed['rootPolicyValidation']['graphs'][0][field] = value
                with self.assertRaises(ValidationError):
                    validator.validate(changed)
        changed = copy.deepcopy(self.job)
        changed['rootPolicyValidation']['toolSubject']['native_fixture_job.py']['bytes'] = 2*1024**2+1
        with self.assertRaises(ValidationError):
            validator.validate(changed)

    def test_root_graph_rejects_absent_incomplete_failed_and_foreign_scope_receipts(self):
        graph = self.fixture.fake_root_graph()
        subject = graph['rootBuildscriptConstraintPolicy']['toolSubject']
        a.rp_validate_documents([('root.json', a.canonical(graph))], subject)
        for kind in ('absent', 'incomplete', 'failure', 'unresolved', 'foreign-scope', 'wrong-selected', 'constraint'):
            with self.subTest(kind=kind):
                changed = copy.deepcopy(graph)
                policy = changed['rootBuildscriptConstraintPolicy']
                if kind == 'absent': del changed['rootBuildscriptConstraintPolicy']
                elif kind == 'incomplete': policy['captureComplete'] = False
                elif kind == 'failure': policy['failures'] = [{'message': 'FAKE failure'}]
                elif kind == 'unresolved': policy['unresolvedCount'] = 1
                elif kind == 'foreign-scope': changed['project'] = ':app'
                elif kind == 'wrong-selected': changed['components'][0]['version'] = '0.0.0'
                else: policy['installedConstraints'][0]['required'] = '0.0.0'
                with self.assertRaises(ValueError):
                    a.rp_validate_documents([('root.json', a.canonical(changed))], subject)

    def test_build_rejects_missing_graph_directory_before_accepting_worker_summary(self):
        parent = Path(self.build['job']['path']).parent
        graph = self.fixture.store.path(str(parent/'graph/root.json'))
        graph.unlink()
        graph.parent.rmdir()
        with self.assertRaisesRegex(a.Rejected, 'Mandatory native root policy validation failed'):
            a.validate_build(self.fixture.builds[0], self.fixture.binding, self.fixture.store, self.fixture.now, 3600)

    def test_build_rejects_summary_disagreement_and_nonfixed_job_location(self):
        changed = copy.deepcopy(self.job)
        changed['rootPolicyValidation']['graphs'][0]['sha256'] = 'a'*64
        build = {**self.build, 'job': self.fixture.put(changed).json()}
        with self.assertRaisesRegex(a.Rejected, 'Worker summary differs'):
            a.validate_build(self.fixture.put(build), self.fixture.binding, self.fixture.store, self.fixture.now, 3600)
        misplaced = self.fixture.put(self.job, name='FAKE-misplaced-job.json')
        build = {**self.build, 'job': misplaced.json()}
        with self.assertRaisesRegex(a.Rejected, 'Exact fixed native output job reference required'):
            a.validate_build(self.fixture.put(build), self.fixture.binding, self.fixture.store, self.fixture.now, 3600)

    def test_closure_rejects_changed_fake_root_policy_even_with_rehashed_references(self):
        mapping = self.fixture.store.json(self.fixture.binding.native_mapping)
        closure = self.fixture.store.json(a.Evidence.parse(mapping['nativeClosure']))
        graph = self.fixture.fake_root_graph()
        graph['rootBuildscriptConstraintPolicy']['selectedVersionsAccepted'] = False
        closure['mavenGraphs']['fake-runtime.json'] = self.fixture.put(graph).json()
        mapping['nativeClosure'] = self.fixture.put(closure).json()
        binding = replace(self.fixture.binding, native_mapping=self.fixture.put(mapping))
        with self.assertRaisesRegex(a.Rejected, 'Reviewed closure lacks valid mandatory root policy receipts'):
            a.native_mapping_context(binding.native_mapping, binding, self.fixture.store)
