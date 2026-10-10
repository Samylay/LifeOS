"""Private proposal: fixed operator source selection, no runtime authority."""
from dataclasses import dataclass
from pathlib import Path
import re
import stat
import os

if __package__:
    from . import admission as a, pipeline
else:
    import admission as a
    import pipeline

SOURCE_ROOT = pipeline.CONTROLLER_ROOT.parent / 'native-signing'
TEST_ONLY_SOURCE_ROOT = None
TEST_ONLY_BINDING_TYPE = None
ROLE = 'public-fixture-terminal-signer'


def source_root():
    # Explicit FAKE seam, unset in production. No path/env argument exists.
    root = TEST_ONLY_SOURCE_ROOT if TEST_ONLY_SOURCE_ROOT is not None else SOURCE_ROOT
    if not isinstance(root, Path) or not root.is_absolute():
        raise a.Rejected('Fixed absolute signer source required')
    a.Store._parents(root)
    info = root.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise a.Rejected('Fixed signer root must be owned private700')
    return root


@dataclass(frozen=True)
class AdministrativeSigner:
    label: str
    original_receipt: a.Evidence

    def json(self):
        return {'role': ROLE, 'label': self.label, 'originalReceipt': self.original_receipt.json()}


def bind_terminal_signer(label, original_receipt):
    if not isinstance(label, str) or not re.fullmatch('[a-z0-9-]{1,64}', label):
        raise a.Rejected('Exact fixed signer label required')
    if not isinstance(original_receipt, a.Evidence) or original_receipt.path != label + '/receipt.json':
        raise a.Rejected('Original reviewed signer receipt Evidence required')
    store = a.Store(source_root())
    store.read(original_receipt, 2 * 1024**2)
    run = store.path(label)
    info = run.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_mode & 0o077:
        raise a.Rejected('Original signer run must be private700')
    return AdministrativeSigner(label, original_receipt)


def validate_selector(selector):
    if not isinstance(selector, AdministrativeSigner):
        raise a.Rejected('Typed reviewed terminal signer selection required')
    checked = bind_terminal_signer(selector.label, selector.original_receipt)
    if checked != selector:
        raise a.Rejected('Original signer selector changed')
    return source_root() / selector.label


def parse_selector(value):
    a.exact(value, {'role', 'label', 'originalReceipt'}, 'administrative signer selection')
    if value['role'] != ROLE:
        raise a.Rejected('Foreign signer authority role')
    selector = AdministrativeSigner(value['label'], a.Evidence.parse(value['originalReceipt']))
    validate_selector(selector)
    return selector


def validate_authorization(reference, store, binding, builds, now, source_pins, normalizer_sha):
    if store.root != pipeline.CONTROLLER_ROOT or store.root.stat().st_mode & 0o077:
        raise a.Rejected('Signing authorization requires fixed protected operator Store')
    allowed = isinstance(binding, a.Binding)
    fake = TEST_ONLY_BINDING_TYPE is not None and isinstance(binding, TEST_ONLY_BINDING_TYPE)
    if not allowed and not fake:
        raise a.Rejected('Actual reviewed signing Binding required')
    binding.validate(store, now)
    if not isinstance(reference, a.Evidence) or not re.fullmatch('signing-authorizations/[0-9a-f]{32}/receipt.json',reference.path):
        raise a.Rejected('Original protected administrative authorization required')
    value=store.json(reference)
    a.exact(value,{'schema','context','authorizedAt','unsigned','builds','toolchain','toolAuthoritySha256','reviewedCode','normalizerSha256','scope'},'signing administrative authorization')
    a.context(value['context'],binding)
    when=a.number(value['authorizedAt'],'signing authorization time')
    if when>now or value['schema']!='micro.fixture-signing-authorization/1' or value['scope']!='public fixture local signing only':
        raise a.Rejected('Signing authorization time/schema/scope differs')
    if value['builds']!=[ref.json() for ref in builds]:
        raise a.Rejected('Signing authorization differs from both admitted builds')
    if value['toolchain']!=binding.identities['toolchain'].json() or value['reviewedCode']!=source_pins or value['normalizerSha256']!=normalizer_sha:
        raise a.Rejected('Signing authorization build/toolchain/source authority differs')
    pair=a.validate_build_pair(builds,binding,store,now,3600)
    unsigned=a.Evidence.parse(value['unsigned']);store.verify(unsigned,512*1024**2)
    if unsigned.sha256!=pair['unsignedApkSha256'][0]:
        raise a.Rejected('Signing authorization first unsigned build differs')
    if not fake and store.json(builds[0]).get('unsignedApk')!=unsigned.json():
        raise a.Rejected('Signing authorization requires exact first build APK Evidence')
    for ref in builds:
        if a.number(store.json(ref).get('finishedAt'),'authorized build finish')>when:
            raise a.Rejected('Signing authorized before complete actual build pair')
    if __package__:
        from . import signing_tools
    else:
        import signing_tools
    toolchain=store.json(binding.identities['toolchain'])
    signing_tools.validate_toolchain(toolchain,store,when)
    import hashlib
    if value['toolAuthoritySha256']!=hashlib.sha256(a.canonical(toolchain['signingTools'])).hexdigest():
        raise a.Rejected('Signing authorization measured tool authority differs')
    return value
