"""Guarded pure FAKE authority checks, never actual tool/key/runtime proof."""
import copy
from contextlib import ExitStack
from dataclasses import replace
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import admission as a
import pipeline
import sign_fixture as signer
import signing_authority as authority
import signing_tools as tools
import signing_normalization as n
import signing_measurement_supervisor as measurement
from test_android_pipeline import SyntheticFixture


class AuthorityTests(unittest.TestCase):
    def setUp(self):
        temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup)
        self.f=SyntheticFixture(temporary.name)
        scope=self.f.checks_test_scope();scope.__enter__();self.addCleanup(scope.__exit__,None,None,None)
        self.block=self.f.store.json(self.f.binding.identities['toolchain'])['signingTools']

    def selected(self):
        return authority.bind_terminal_signer('synthetic',
            a.Store(self.f.fake_signer_root).describe('synthetic/receipt.json'))

    def test_complete_measurement_and_authorized_raw_receipt_replay(self):
        self.assertEqual(tools.validate(self.block,self.f.store),n.TOOLS)
        value=self.f.store.json(self.f.signing)
        raw=self.f.store.json(a.Evidence.parse(value['rawReceipt']))
        self.assertIn('authorization',raw)
        auth=self.f.store.json(a.Evidence.parse(raw['authorization']))
        self.assertEqual(auth['builds'],[ref.json() for ref in self.f.builds])
        self.assertEqual(n.validate_normalized(value,self.f.store,self.f.binding,self.f.builds,self.f.now),value)

    def factory_scope(self):
        scope=ExitStack()
        scope.enter_context(patch.object(authority,'TEST_ONLY_SOURCE_ROOT',None))
        scope.enter_context(patch.object(authority,'SOURCE_ROOT',self.f.fake_signer_root))
        scope.enter_context(patch.object(signer,'STATE',self.f.fake_signer_root))
        return scope

    def test_selector_requires_typed_original_receipt_and_fixed_label(self):
        self.assertEqual(authority.validate_selector(self.selected()),self.f.fake_signer_root/'synthetic')
        for label,ref in [('../synthetic',self.selected().original_receipt),('synthetic',self.f.signing),
                          ('synthetic',self.selected().original_receipt.json())]:
            with self.subTest(label=label),self.assertRaises(a.Rejected):authority.bind_terminal_signer(label,ref)
        with self.assertRaises(a.Rejected):n.copy_terminal(self.f.store,'synthetic','untyped')

    def test_original_receipt_replacement_is_rejected_after_selection(self):
        selected=self.selected();path=self.f.fake_signer_root/'synthetic/receipt.json'
        path.chmod(0o600);path.write_bytes(path.read_bytes()+b' ')
        with self.assertRaises(a.Rejected):authority.validate_selector(selected)

    def test_selector_root_alias_and_unprotected_root_reject(self):
        alias=self.f.store.path('FAKE-linked-root');alias.symlink_to(self.f.fake_signer_root)
        with patch.object(authority,'TEST_ONLY_SOURCE_ROOT',alias),self.assertRaises(a.Rejected):authority.source_root()
        alias.unlink()
        self.f.fake_signer_root.chmod(0o755)
        try:
            with self.assertRaises(a.Rejected):authority.source_root()
        finally:self.f.fake_signer_root.chmod(0o700)

    def test_all_three_fixed_tool_facts_required(self):
        for mutate in [lambda v:v['tools'].pop('zipalign'),
                       lambda v:v['tools'].update(extra=v['tools']['aapt']),
                       lambda v:v['tools']['zipalign'].update(path='/host/tool'),
                       lambda v:v['tools']['zipalign'].update(sha256='a'*64),
                       lambda v:v['tools']['zipalign'].update(bytes=True),
                       lambda v:v.update(image='sha256:'+'f'*64),
                       lambda v:v.pop('originalReceipt')]:
            value=copy.deepcopy(self.block);mutate(value)
            with self.subTest(value=value),self.assertRaises(a.Rejected):tools.validate(value,self.f.store)

    def recopy_with_mutation(self,mutate):
        label=self.block['label'];root=self.f.fake_signer_root/label;original=a.Store(root)
        raw=original.json(original.describe('receipt.json'));mutate(raw,root)
        path=root/'receipt.json';path.chmod(0o600);path.write_bytes(a.canonical(raw)+b'\n');path.chmod(0o400)
        selected=tools.bind_measurement(label,a.Store(self.f.fake_signer_root).describe(label+'/receipt.json'))
        return tools.copy_measurement(self.f.store,selected,'FAKE-recopy-'+__import__('uuid').uuid4().hex)

    def test_actual_measurement_runtime_mutations_reject_with_rebound_bytes(self):
        def mutate(raw,root):
            import json
            path=root/'inspect-after.log';rows=json.loads(path.read_bytes())
            rows[0]['HostConfig']['SecurityOpt'].append('seccomp=unconfined')
            data=a.canonical(rows);path.chmod(0o600);path.write_bytes(data);path.chmod(0o400)
            raw['commands'][3].update(capturedBytes=len(data),sha256=hashlib.sha256(data).hexdigest())
        with self.assertRaisesRegex(a.Rejected,'isolation'):self.recopy_with_mutation(mutate)

    def test_worker_claim_cannot_replace_original_measurement_log(self):
        with self.assertRaisesRegex(a.Rejected,'worker/output'):
            self.recopy_with_mutation(lambda raw,root:raw['worker']['tools']['zipalign'].update(sha256='e'*64))

    def test_measurement_failed_state_and_cleanup_cannot_bind_authority(self):
        original=self.f.fake_signer_root/self.block['label']/'receipt.json';before=original.read_bytes()
        for key,value in [('status','failed'),('cleanup',{'absent':False}),('workerSha256','a'*64)]:
            with self.subTest(key=key),self.assertRaises(a.Rejected):
                self.recopy_with_mutation(lambda raw,root:raw.update({key:value}))
            original.chmod(0o600);original.write_bytes(before);original.chmod(0o400)

    def test_original_measurement_deleted_or_changed_rejects_context(self):
        path=self.f.fake_signer_root/self.block['label']/'measurement.log'
        path.chmod(0o600);path.write_bytes(path.read_bytes()+b'FAKE mutation\n')
        with self.assertRaises(a.Rejected):tools.validate_toolchain(self.f.store.json(self.f.binding.identities['toolchain']),self.f.store)

    def test_measurement_copied_reference_alias_rejects(self):
        value=copy.deepcopy(self.block);value['worker']=value['measurement']
        with self.assertRaises(a.Rejected):tools.validate(value,self.f.store)

    def test_two_tool_inspector_map_remains_exact(self):
        value=self.f.store.json(self.f.binding.identities['toolchain'])
        self.assertEqual(set(value['artifactToolsSha256']),{'aapt','apksigner'})
        value['artifactToolsSha256']['zipalign']=n.TOOLS['zipalign']
        with self.assertRaises(a.Rejected):tools.validate_toolchain(value,self.f.store)

    def test_low_level_only_raw_receipt_cannot_normalize(self):
        original=a.Store(self.f.fake_signer_root/'synthetic');raw=original.json(original.describe('receipt.json'))
        raw.pop('authorization');path=original.path('receipt.json');path.chmod(0o600)
        path.write_bytes(a.canonical(raw)+b'\n');path.chmod(0o400)
        selected=self.selected();snapshot=n.copy_terminal(self.f.store,selected,'FAKE-lowlevel-only')
        with self.assertRaisesRegex(a.Rejected,'missing or unknown fields'):
            n.replay(snapshot,self.f.store,self.f.binding,self.f.builds,self.f.now)

    def test_authorization_changed_build_context_source_or_time_rejects(self):
        normalized=self.f.store.json(self.f.signing);raw=self.f.store.json(a.Evidence.parse(normalized['rawReceipt']))
        reference=a.Evidence.parse(raw['authorization']);authorization=self.f.store.json(reference)
        for key,value in [('builds',[]),('toolchain',self.f.signing.json()),('authorizedAt',self.f.now+1),
                          ('reviewedCode',{}),('normalizerSha256','f'*64),('toolAuthoritySha256','f'*64)]:
            modified={**authorization,key:value};directory='signing-authorizations/'+'e'*32
            self.f.store.path(directory).mkdir(mode=0o700,parents=True,exist_ok=True)
            path=self.f.store.path(directory+'/receipt.json')
            if path.exists():path.unlink()
            receipt=self.f.store.write(directory+'/receipt.json',modified)
            with self.subTest(key=key),self.assertRaises(a.Rejected):
                authority.validate_authorization(receipt,self.f.store,self.f.binding,self.f.builds,self.f.now,n.PINS,
                    n.code_evidence(Path(n.__file__),'signing_normalization.py').sha256)

    def test_pending_draft_rejects_before_any_primitive_call(self):
        with self.factory_scope(),patch.object(signer,'sign') as primitive:
            pending=replace(self.f.binding,admitted=False,certificate_sha256=None,permissions=())
            registry=pipeline.Registry(self.f.store,{(pending.project_id,pending.adapter_id):pending})
            with self.assertRaises(a.Rejected):signer.sign_administratively(registry,pending,self.f.unsigned,self.f.builds,'synthetic',self.f.now)
            primitive.assert_not_called()

    def test_foreign_store_source_or_unsigned_never_reaches_primitive(self):
        with self.factory_scope(),patch.object(signer,'sign') as primitive:
            for unsigned,pair in [(self.f.signed,self.f.builds),(self.f.unsigned,self.f.builds[:1])]:
                with self.subTest(unsigned=unsigned),self.assertRaises(a.Rejected):
                    signer.sign_administratively(self.f.registry,self.f.binding,unsigned,pair,'synthetic',self.f.now)
            primitive.assert_not_called()

    def test_reviewed_fake_boundary_retains_authorization_before_primitive(self):
        # Actual pinned primitive is reached. The scoped fake copy throws before
        # any key read, APK parse or sandbox operation can occur.
        with self.factory_scope(),patch.object(signer,'admit_apk',side_effect=RuntimeError('FAKE boundary reached unsigned copy')):
            with self.assertRaisesRegex(RuntimeError,'FAKE boundary reached unsigned copy'):
                signer.sign_administratively(self.f.registry,self.f.binding,self.f.unsigned,self.f.builds,'factory-fake',self.f.now)
            raw=a.Store(self.f.fake_signer_root/'factory-fake').json(
                a.Store(self.f.fake_signer_root/'factory-fake').describe('receipt.json'))
            reference=a.Evidence.parse(raw['authorization'])
            facts=self.f.store.json(reference)
            self.assertEqual(facts['unsigned'],self.f.unsigned.json())
            self.assertEqual(facts['builds'],[ref.json() for ref in self.f.builds])

    def test_substituted_primitive_callable_rejects_before_authorization(self):
        with self.factory_scope(),patch.object(signer,'sign') as primitive:
            with self.assertRaisesRegex(a.Rejected,'callable'):
                signer.sign_administratively(self.f.registry,self.f.binding,self.f.unsigned,self.f.builds,'not-created',self.f.now)
            primitive.assert_not_called()
            self.assertFalse((self.f.fake_signer_root/'not-created').exists())

    def test_pending_binding_reason_before_real_primitive_or_key(self):
        pending=replace(self.f.binding,admitted=False)
        registry=pipeline.Registry(self.f.store,{(pending.project_id,pending.adapter_id):pending})
        with self.factory_scope(),patch.object(signer,'admit_apk',side_effect=RuntimeError('FAKE downstream forbidden')) as apk,patch.object(signer,'digest',side_effect=RuntimeError('FAKE downstream forbidden')) as digest,patch.object(signer,'bounded',side_effect=RuntimeError('FAKE downstream forbidden')) as bounded,patch.object(signer.shutil,'copyfile',side_effect=RuntimeError('FAKE downstream forbidden')) as copyfile:
            self.assertIs(signer.sign,signer.REVIEWED_SIGN_PRIMITIVE)
            with self.assertRaisesRegex(a.Rejected,'Adapter pending trusted signing/input admission'):
                signer.sign_administratively(registry,pending,self.f.unsigned,self.f.builds,'negative-pending',self.f.now)
            for downstream in (apk,digest,bounded,copyfile):downstream.assert_not_called()
            self.assertFalse((self.f.fake_signer_root/'negative-pending').exists())

    def test_foreign_registry_store_reason_before_real_primitive_or_key(self):
        with tempfile.TemporaryDirectory() as foreign:
            store=a.Store(Path(foreign));registry=pipeline.Registry(store,{(self.f.binding.project_id,self.f.binding.adapter_id):self.f.binding})
            self.assertNotEqual(registry.store.root,pipeline.CONTROLLER_ROOT)
            with self.factory_scope(),patch.object(signer,'admit_apk',side_effect=RuntimeError('FAKE downstream forbidden')) as apk,patch.object(signer,'digest',side_effect=RuntimeError('FAKE downstream forbidden')) as digest,patch.object(signer,'bounded',side_effect=RuntimeError('FAKE downstream forbidden')) as bounded,patch.object(signer.shutil,'copyfile',side_effect=RuntimeError('FAKE downstream forbidden')) as copyfile:
                self.assertIs(signer.sign,signer.REVIEWED_SIGN_PRIMITIVE)
                with self.assertRaisesRegex(a.Rejected,'Exact protected operator registry/signing source required'):
                    signer.sign_administratively(registry,self.f.binding,self.f.unsigned,self.f.builds,'negative-store',self.f.now)
                for downstream in (apk,digest,bounded,copyfile):downstream.assert_not_called()
                self.assertFalse((self.f.fake_signer_root/'negative-store').exists())

    def test_foreign_fixture_source_reason_before_real_primitive_or_key(self):
        foreign=replace(self.f.binding,source_sha='f'*40)
        registry=pipeline.Registry(self.f.store,{(foreign.project_id,foreign.adapter_id):foreign})
        self.assertEqual(registry.select(foreign.project_id,foreign.adapter_id),foreign)
        with self.factory_scope(),patch.object(signer,'admit_apk',side_effect=RuntimeError('FAKE downstream forbidden')) as apk,patch.object(signer,'digest',side_effect=RuntimeError('FAKE downstream forbidden')) as digest,patch.object(signer,'bounded',side_effect=RuntimeError('FAKE downstream forbidden')) as bounded,patch.object(signer.shutil,'copyfile',side_effect=RuntimeError('FAKE downstream forbidden')) as copyfile:
            self.assertIs(signer.sign,signer.REVIEWED_SIGN_PRIMITIVE)
            foreign.validate(self.f.store,self.f.now)
            with self.assertRaisesRegex(a.Rejected,'Explicit reviewed public fixture signing admission required'):
                signer.sign_administratively(registry,foreign,self.f.unsigned,self.f.builds,'negative-source',self.f.now)
            for downstream in (apk,digest,bounded,copyfile):downstream.assert_not_called()
            self.assertFalse((self.f.fake_signer_root/'negative-source').exists())

    def test_signed_unsigned_evidence_reason_before_real_primitive_or_key(self):
        self.assertNotEqual(self.f.signed,self.f.unsigned)
        with self.factory_scope(),patch.object(signer,'admit_apk',side_effect=RuntimeError('FAKE downstream forbidden')) as apk,patch.object(signer,'digest',side_effect=RuntimeError('FAKE downstream forbidden')) as digest,patch.object(signer,'bounded',side_effect=RuntimeError('FAKE downstream forbidden')) as bounded,patch.object(signer.shutil,'copyfile',side_effect=RuntimeError('FAKE downstream forbidden')) as copyfile:
            self.assertIs(signer.sign,signer.REVIEWED_SIGN_PRIMITIVE)
            with self.assertRaisesRegex(a.Rejected,'First actual unsigned build differs'):
                signer.sign_administratively(self.f.registry,self.f.binding,self.f.signed,self.f.builds,'negative-unsigned',self.f.now)
            for downstream in (apk,digest,bounded,copyfile):downstream.assert_not_called()
            self.assertFalse((self.f.fake_signer_root/'negative-unsigned').exists())

    def test_incomplete_build_pair_reason_before_real_primitive_or_key(self):
        self.assertEqual(len(self.f.builds),2)
        with self.factory_scope(),patch.object(signer,'admit_apk',side_effect=RuntimeError('FAKE downstream forbidden')) as apk,patch.object(signer,'digest',side_effect=RuntimeError('FAKE downstream forbidden')) as digest,patch.object(signer,'bounded',side_effect=RuntimeError('FAKE downstream forbidden')) as bounded,patch.object(signer.shutil,'copyfile',side_effect=RuntimeError('FAKE downstream forbidden')) as copyfile:
            self.assertIs(signer.sign,signer.REVIEWED_SIGN_PRIMITIVE)
            with self.assertRaisesRegex(a.Rejected,'First unsigned build Evidence and full pair required'):
                signer.sign_administratively(self.f.registry,self.f.binding,self.f.unsigned,self.f.builds[:1],'negative-pair',self.f.now)
            for downstream in (apk,digest,bounded,copyfile):downstream.assert_not_called()
            self.assertFalse((self.f.fake_signer_root/'negative-pair').exists())

    def test_measurement_invocation_review_gate_is_unset(self):
        self.assertIsNone(measurement.REVIEWED_RECIPE_SHA256)
        with self.assertRaisesRegex(a.Rejected,'review pending'):measurement.measure()


if __name__=='__main__':unittest.main()
