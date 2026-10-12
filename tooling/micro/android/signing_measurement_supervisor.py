"""Uninstalled fixed tool measurement proposal. Review gate deliberately unset."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
from uuid import uuid4

if __package__:
    from . import admission as a, signing_tools as t, signing_authority as authority
    from .artifact_supervisor import bounded, cleanup_owned, digest, require_command
else:
    import admission as a
    import signing_tools as t
    import signing_authority as authority
    from artifact_supervisor import bounded, cleanup_owned, digest, require_command

REVIEWED_RECIPE_SHA256 = None


def recipe_sha256():
    # Literal template marker identifies a policy recipe, never a source selector.
    return hashlib.sha256(a.canonical({'image':a.IMAGE,'argv':t.argv('0'*32,Path('/measurement-worker-template')),
                                      'sources':t.MEASUREMENT_PINS,'tools':t.TOOL_PATHS})).hexdigest()


def measure():
    if REVIEWED_RECIPE_SHA256 is None or REVIEWED_RECIPE_SHA256!=recipe_sha256():
        raise a.Rejected('Actual measurement recipe review pending')
    for name in t.MEASUREMENT_PINS:t._code(name)
    owner=uuid4().hex;label='tools-'+uuid4().hex
    output=authority.source_root()/label;output.mkdir(mode=0o700,exist_ok=False)
    tools=output/'tools';tools.mkdir(mode=0o700)
    worker=tools/'measure_signing_tools.py'
    shutil.copyfile(t.KIT/'measure_signing_tools.py',worker);worker.chmod(0o400)
    identifier=None;attempted=False;first=None
    receipt={'schema':'micro.fixture-signing-tool-supervisor/1','owner':owner,'image':a.IMAGE,
             'supervisorSha256':digest(Path(__file__)),'workerSha256':digest(worker),
             'commandHelperSha256':digest(t.KIT/'artifact_supervisor.py'),
             'startedAt':datetime.now(timezone.utc).isoformat(),'commands':[],
             'status':'started','cleanup':None,'scope':t.SCOPE}
    def command(argv,label):
        result=bounded(argv,output/(label+'.log'),30)
        (output/(label+'.log')).chmod(0o400)
        receipt['commands'].append(result);return result
    try:
        attempted=True;created=command(t.argv(owner,worker),'create');require_command(created)
        import re
        identifier=(output/'create.log').read_text().strip()
        if not re.fullmatch('[0-9a-f]{64}',identifier):
            identifier=None;raise a.Rejected('Full measurement container identity required')
        before=command(['docker','inspect',identifier],'inspect-before');require_command(before)
        observed=json.loads((output/'inspect-before.log').read_text())[0]
        receipt['runtimePolicy']=t.runtime(observed,identifier,owner,worker)
        require_command(command(['docker','start','--attach',identifier],'measurement'))
        require_command(command(['docker','inspect',identifier],'inspect-after'))
        after=json.loads((output/'inspect-after.log').read_text())[0]
        t.runtime(after,identifier,owner,worker);a.state_success(after['State'])
        receipt['state']=after['State']
        rows=[a.decode(line.encode()) for line in (output/'measurement.log').read_text().splitlines() if line.startswith('{')]
        if len(rows)!=1:raise a.Rejected('One measurement output required')
        receipt['worker']=rows[0];receipt['status']='measured'
    except Exception as error:
        first=error;receipt['status']='failed';receipt['failure']={'type':type(error).__name__,'reason':str(error)[:800]}
    finally:
        try:receipt['cleanup']=cleanup_owned(command,output,identifier,a.IMAGE,owner) if attempted else {'absent':True}
        except Exception as error:
            receipt['cleanup']={'absent':False};receipt['cleanupFailure']={'type':type(error).__name__,'reason':str(error)[:800]}
            first=first or error;receipt['status']='failed'
        receipt['finishedAt']=datetime.now(timezone.utc).isoformat()
        try:
            with (output/'receipt.json').open('x') as target:target.write(json.dumps(receipt)+'\n')
            (output/'receipt.json').chmod(0o400)
        except Exception as error:
            if first is not None:
                first.add_note('Measurement receipt persistence failed: '+type(error).__name__)
                raise first from error
            raise
    if first is not None:raise first
    return t.bind_measurement(label,a.Store(authority.source_root()).describe(label+'/receipt.json'))
