"""Pure FAKE measured-tool/authorization bytes. No tools or keys are opened."""
import copy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from uuid import uuid4

import admission as a
import signing_authority as authority
import signing_tools as t
import signing_normalization as n


def measurement(store, root, now):
    label='tools-'+uuid4().hex;state=root/label;state.mkdir(mode=0o700)
    owner='c'*32;identifier='d'*64;started=now-100;finished=now-90
    iso=lambda when:datetime.fromtimestamp(when,timezone.utc).isoformat()
    worker=state/'tools/measure_signing_tools.py';worker.parent.mkdir(mode=0o700)
    worker.write_bytes((t.KIT/'measure_signing_tools.py').read_bytes());worker.chmod(0o400)
    before={'Id':identifier,'Name':'/micro-artifact-'+owner,'Image':a.IMAGE,
        'Path':'python3','Args':['/measurement_worker.py'],
        'Config':{'User':'1000:1000','Labels':{'micro.artifact.owner':owner},
                  'Entrypoint':['python3'],'Cmd':['/measurement_worker.py'],
                  'WorkingDir':'/tmp','Env':t.ENVIRONMENT},
        'HostConfig':{'NetworkMode':'none','ReadonlyRootfs':True,'Privileged':False,
            'CapDrop':['ALL'],'SecurityOpt':['no-new-privileges'],'CapAdd':None,
            'Binds':None,'VolumesFrom':None,'PidMode':'','IpcMode':'private','UsernsMode':'',
            'CgroupnsMode':'private','Runtime':'runc','Memory':1073741824,'MemorySwap':1073741824,
            'NanoCpus':1000000000,'PidsLimit':128,'Devices':[],'PortBindings':{},'ExtraHosts':[],
            'LogConfig':{'Type':'none','Config':{}},
            'Tmpfs':{'/tmp':'rw,nosuid,nodev,noexec,size=67108864,mode=1777'},
            'Ulimits':[{'Name':name,'Soft':value,'Hard':value} for name,value in
                {'fsize':536870912,'nofile':256,'core':0}.items()]},
        'Mounts':[{'Source':str(worker),'Destination':'/measurement_worker.py','Type':'bind','RW':False}],
        'State':{'Status':'created','Running':False,'OOMKilled':False,'ExitCode':0,'Error':''}}
    after=copy.deepcopy(before)
    after['State']={'Status':'exited','Running':False,'OOMKilled':False,'ExitCode':0,'Error':'',
                    'StartedAt':iso(started+1),'FinishedAt':iso(finished-1)}
    result={'schema':'micro.fixture-signing-tool-worker/1','scope':t.SCOPE,
            'tools':{name:{'path':t.TOOL_PATHS[name],**t.EXPECTED_TOOLS[name]} for name in t.NAMES}}
    raw={'schema':'micro.fixture-signing-tool-supervisor/1','owner':owner,'image':a.IMAGE,
         'supervisorSha256':t.MEASUREMENT_PINS['signing_measurement_supervisor.py'],
         'workerSha256':t.MEASUREMENT_PINS['measure_signing_tools.py'],
         'commandHelperSha256':t.MEASUREMENT_PINS['artifact_supervisor.py'],
         'startedAt':iso(started),'finishedAt':iso(finished),'commands':[],
         'status':'measured','cleanup':{'absent':True},'scope':t.SCOPE,
         'runtimePolicy':t.runtime(before,identifier,owner,worker),'state':after['State'],'worker':result}
    name='micro-artifact-'+owner
    argvs=[t.argv(owner,worker),['docker','inspect',identifier],['docker','start','--attach',identifier],
           ['docker','inspect',identifier],['docker','inspect',identifier],['docker','rm','--force',identifier],
           ['docker','inspect',identifier],['docker','ps','--all','--quiet','--no-trunc',
            '--filter','name=^/'+name+'$','--filter','label=micro.artifact.owner='+owner]]
    outputs=[identifier+'\n',json.dumps([before]),json.dumps(result)+'\n',json.dumps([after]),
             json.dumps([after]),identifier+'\n','Error: No such object: '+identifier+'\n','']
    for command,data,recipe in zip(t.COMMANDS,outputs,argvs):
        encoded=data.encode();path=state/(command+'.log');path.write_bytes(encoded);path.chmod(0o400)
        raw['commands'].append({'argv':recipe,'exitCode':1 if command=='cleanup-absent' else 0,
            'seconds':0.1,'capturedBytes':len(encoded),'sha256':hashlib.sha256(encoded).hexdigest(),
            'limitFailure':None})
    path=state/'receipt.json';path.write_bytes(a.canonical(raw)+b'\n');path.chmod(0o400)
    selection=t.bind_measurement(label,a.Store(root).describe(label+'/receipt.json'))
    return t.copy_measurement(store,selection,'FAKE-tool-measurement-'+uuid4().hex)


def authorization(store,binding,builds,unsigned,when):
    directory='signing-authorizations/'+uuid4().hex
    store.path(directory).mkdir(mode=0o700,parents=True)
    toolchain=store.json(binding.identities['toolchain'])
    return store.write(directory+'/receipt.json',{'schema':'micro.fixture-signing-authorization/1',
        'context':binding.context(),'authorizedAt':when,'unsigned':unsigned.json(),
        'builds':[ref.json() for ref in builds],'toolchain':binding.identities['toolchain'].json(),
        'toolAuthoritySha256':hashlib.sha256(a.canonical(toolchain.get('signingTools'))).hexdigest(),
        'reviewedCode':n.PINS,'normalizerSha256':n.code_evidence(Path(n.__file__),'signing_normalization.py').sha256,
        'scope':'public fixture local signing only'})
