// Trusted entry point. Candidate inputs are data, never executable recipes.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {augment} from './security_inventory.mjs';
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const mode = process.argv[2];
const env = {
  PATH:'/usr/local/bin:/usr/bin:/bin', HOME:'/tmp', TMPDIR:'/tmp',
  GRYPE_DB_CACHE_DIR:'/db', GRYPE_DB_AUTO_UPDATE:'false',
  GRYPE_DB_VALIDATE_BY_HASH_ON_START:'true', GRYPE_DB_VALIDATE_AGE:'true',
  GRYPE_DB_MAX_ALLOWED_BUILT_AGE:'120h', GRYPE_CHECK_FOR_APP_UPDATE:'false',
  GRYPE_EXTERNAL_SOURCES_ENABLE:'false', SYFT_CHECK_FOR_APP_UPDATE:'false',
};
const result = {mode, commands:[], reports:{}};
function run(binary,args) {
  const started=Date.now();
  const r=spawnSync(binary,args,{env,cwd:'/tmp',encoding:'utf8',timeout:280000,maxBuffer:16*1024*1024});
  const item={binary,args,exitCode:r.status,signal:r.signal,error:r.error?.code,
    seconds:(Date.now()-started)/1000,stdout:r.stdout||'',stderr:r.stderr||''};
  result.commands.push(item); return item;
}
function tools() {
  return Object.fromEntries(['gitleaks','syft','grype'].map(n => {
    const p='/usr/local/bin/'+n; const r=run(p,['version']);
    return [n,{binarySha256:hash(p),versionOutput:r.stdout,exitCode:r.exitCode}];
  }));
}
function db() {
  const r=run('grype',['db','status','-o','json']);
  try {return JSON.parse(r.stdout);} catch {return {error:'status-not-json',exitCode:r.exitCode};}
}
function normalize(path) {
  for(const item of fs.readdirSync(path,{withFileTypes:true})) {
    const p=path+'/'+item.name;
    if(item.isDirectory()) {normalize(p);fs.chmodSync(p,0o755);}
    else if(item.isFile()) fs.chmodSync(p,0o644);
    else throw Error('special database file');
  }
}
function bytesUsed(path) {
  let count=0;
  for(const item of fs.readdirSync(path,{withFileTypes:true})) {
    const p=path+'/'+item.name;
    if(item.isDirectory()) count+=bytesUsed(p);
    else if(item.isFile()) count+=fs.statSync(p).size;
    else throw Error('special database file');
  }
  return count;
}
async function update() {
  const started=Date.now(); let stdout='',stderr='',peak=0,failed=false;
  const child=spawn('grype',['db','update'],{env,cwd:'/tmp'});
  child.stdout.on('data', chunk=>stdout+=chunk); child.stderr.on('data',chunk=>stderr+=chunk);
  const timer=setInterval(()=>{
    try {
      peak=Math.max(peak,bytesUsed('/db'));
      if(peak>4294967296 || Date.now()-started>280000 || stdout.length+stderr.length>16*1024*1024) {
        failed=true;child.kill('SIGKILL');
      }
    } catch(error) {failed=true;stderr+=String(error);child.kill('SIGKILL');}
  },50);
  const code=await new Promise(resolve=>child.on('close',resolve));clearInterval(timer);
  peak=Math.max(peak,bytesUsed('/db'));
  result.acquisition={peakBytes:peak,maximumBytes:4294967296,budgetFailed:failed||peak>4294967296};
  result.commands.push({binary:'grype',args:['db','update'],exitCode:code,seconds:(Date.now()-started)/1000,stdout,stderr});
}
if(mode==='probe') result.tools=tools();
else if(mode==='update') {
  // Only this trusted job has network. It has no source or host credentials.
  env.GRYPE_DB_UPDATE_URL='https://grype.anchore.io/databases';
  env.SSL_CERT_FILE='/public-ca.crt';
  await update(); result.database=db(); normalize('/db');
} else if(mode==='normalize-db') {
  normalize('/db'); result.database=db();
} else if(mode==='dbstatus') {
  result.database=db();result.databaseBytes=bytesUsed('/db');
  if(result.databaseBytes>4294967296) throw Error('database acquisition byte budget');
}
else if(mode==='crash') run('/missing-security-scanner',[]);
else if(mode==='scan') {
  result.tools=tools(); result.databaseBefore=db();
  const valid=result.commands.at(-1).exitCode===0;
  if(valid) {
    run('gitleaks',['dir','/source','--config=/config/gitleaks.toml','--no-banner','--redact=100','--report-format=json','--report-path=/tmp/secrets.json']);
    const sbom=run('syft',['dir:/source','--config=/config/syft.yaml','-o','cyclonedx-json=/tmp/syft.sbom.cdx.json']);
    if(sbom.exitCode===0) {
      const lockPath='/source/package-lock.json';
      if(!fs.lstatSync(lockPath).isFile()||fs.statSync(lockPath).size>16*1024*1024) throw Error('invalid bounded npm lock');
      const syftPath='/tmp/syft.sbom.cdx.json';
      if(fs.statSync(syftPath).size>48*1024*1024) throw Error('Syft report budget');
      const graphs=fs.existsSync('/maven')?fs.readdirSync('/maven').sort().map(name=>{
        const path='/maven/'+name;
        if(!/^[A-Za-z0-9_.-]+\.json$/.test(name)||!fs.lstatSync(path).isFile()||fs.statSync(path).size>8*1024*1024) throw Error('invalid Maven graph input');
        return {name,bytes:fs.readFileSync(path)};
      }):[];
      const augmented=augment(JSON.parse(fs.readFileSync(syftPath)),fs.readFileSync(lockPath),graphs);
      fs.writeFileSync('/tmp/sbom.cdx.json',JSON.stringify(augmented.bom));
      fs.writeFileSync('/tmp/trusted.inventory.json',JSON.stringify(augmented.inventory));
      run('grype',['sbom:/tmp/sbom.cdx.json','--config=/config/grype.yaml','--fail-on','high','-o','json','--file','/tmp/vulnerabilities.json']);
    }
    for(const n of ['secrets.json','syft.sbom.cdx.json','trusted.inventory.json','sbom.cdx.json','vulnerabilities.json']) {
      if(fs.existsSync('/tmp/'+n)) {
        if(fs.statSync('/tmp/'+n).size>48*1024*1024) throw Error('report-budget');
        result.reports[n]=JSON.parse(fs.readFileSync('/tmp/'+n));
      }
    }
  }
  result.databaseAfter=db();
} else throw Error('unknown trusted mode');
console.log(JSON.stringify(result));
