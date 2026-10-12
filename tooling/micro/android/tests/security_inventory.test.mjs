import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {augment,lockedInventory,mavenInventory,MAVEN_LIMITS} from '../security_inventory.mjs';
const bytes=value=>Buffer.from(JSON.stringify(value));
const lock=()=>bytes({lockfileVersion:3,packages:{'':{name:'fixture-app',version:'1.0.0'},
  'node_modules/@scope/optional':{version:'2.0.0',optional:true},
  'node_modules/tool':{version:'1.2.3',dev:true},
  'node_modules/nested/node_modules/tool':{version:'1.2.3',optional:true,devOptional:true}}});
const syft=()=>({bomFormat:'CycloneDX',specVersion:'1.7',version:1,components:[
  {type:'library',name:'@scope/optional',version:'2.0.0',purl:'pkg:npm/%40scope/optional@2.0.0','bom-ref':'syft-optional'},
  {type:'library',name:'fixture-app',version:'1.0.0',purl:'pkg:npm/fixture-app@1.0.0'},
  {type:'file',name:'/source/package-lock.json'}]});
const graph=(configuration,scope,version='1.2.3')=>({name:'graph-'+configuration+'.json',bytes:bytes({build:'trusted-native-build',configuration,scope,
  components:[{group:'org.example',module:'library',version}]})});

test('augmentation covers every exact lock entry and retains dev/optional duplicate provenance',()=>{
  const actual=syft(),before=structuredClone(actual),input=lock();
  const {bom,inventory}=augment(actual,input);
  assert.deepEqual(actual,before);
  assert.equal(inventory.lockSha256,crypto.createHash('sha256').update(input).digest('hex'));
  assert.equal(inventory.lockedEntryCount,3);assert.equal(inventory.lockedUniqueComponentCount,2);
  assert.equal(inventory.missingBefore.length,1);assert.deepEqual(inventory.missingAfter,[]);
  const component=bom.components.find(c=>c.name==='tool');
  assert.equal(component.purl,'pkg:npm/tool@1.2.3');
  const provenance=JSON.parse(component.properties.find(p=>p.name==='micro:locked-npm-entries').value);
  assert.deepEqual(provenance.map(p=>p.classification),['build-only','runtime-input']);
  assert.equal(provenance[1].optional,true);assert.equal(provenance[1].devOptional,true);
  assert.deepEqual(inventory.unmatchedSyftComponents.map(c=>c.classification),['source-product','source-file-metadata']);
  assert.equal(inventory.maven.status,'pending');
  assert.match(inventory.finalArtifactCoverage,/pending/);
  assert.ok(bom.components.every(c=>c.properties.some(p=>p.name==='micro:inventory-provenance')));
});

test('same name/version with wrong scanner PURL does not stand in for locked identity',()=>{
  const actual=syft();actual.components[0].purl='pkg:npm/wrong@2.0.0';
  const {bom,inventory}=augment(actual,lock());
  assert.equal(inventory.missingBefore.length,2);
  assert.equal(bom.components.filter(c=>c.purl==='pkg:npm/%40scope/optional@2.0.0').length,1);
  assert.deepEqual(inventory.missingAfter,[]);
});

test('Maven exact PURLs cover runtime, buildscript and unknown configurations without artifact claims',()=>{
  const graphs=[graph('releaseRuntimeClasspath','project'),graph('pluginRuntimeClasspath','project-buildscript'),graph('unusual','project','2.0.0')];
  const {bom,inventory}=augment(syft(),lock(),graphs);
  assert.equal(inventory.maven.status,'resolved-inputs-scanned');
  assert.deepEqual(inventory.maven.entries.map(e=>e.classification),['runtime-input','build-only','unknown']);
  assert.equal(inventory.maven.files.length,3);
  assert.equal(bom.components.filter(c=>c.purl?.startsWith('pkg:maven/')).length,2);
  assert.ok(bom.components.some(c=>c.purl==='pkg:maven/org.example/library@1.2.3'));
  assert.ok(inventory.maven.entries.every(e=>e.packagedPresence==='unknown'&&e.graphSha256.length===64));
});

test('unsupported lock entries fail rather than silently disappear',()=>{
  for(const entry of [{link:true,version:'1.0.0'}, {version:'^1.0.0'}, {version:'latest'}, {}, {version:'1.0.0',optional:'false'}]) {
    assert.throws(()=>lockedInventory(bytes({lockfileVersion:3,packages:{'node_modules/bad':entry}})));
  }
  assert.throws(()=>lockedInventory(bytes({lockfileVersion:1,dependencies:{}})));
  assert.throws(()=>lockedInventory(bytes({lockfileVersion:3,packages:{'workspaces/local':{version:'1.0.0'}}})));
});

test('Maven unsafe/unresolved coordinates, omitted scope and oversized graphs fail',()=>{
  for(const version of ['latest.release','unspecified','1.+','../escape']) assert.throws(()=>mavenInventory([graph('runtime','project',version)]));
  assert.throws(()=>mavenInventory([{name:'bad.json',bytes:bytes({build:'x',configuration:'runtime',components:[]})}]));
  assert.throws(()=>mavenInventory([{name:'../graph.json',bytes:bytes({})}]));
  assert.throws(()=>mavenInventory([{name:'huge.json',bytes:Buffer.alloc(8*1024*1024+1)}]));
  assert.throws(()=>augment({components:[]},lock()));
});

// All following raw graphs are FAKE observations, never native closure evidence.
const fakeCoordinate={group:'org.fake',module:'fixture',version:'1.0.0'};
const fakeGraph=(name,changes={})=>({name,bytes:bytes({build:'/FAKE/fixture/android',project:':app',
  scope:'project',configuration:'releaseRuntimeClasspath',components:[fakeCoordinate],...changes})});

test('1528 distinct FAKE raw graphs retain all 23870 rows and hash/scope/project provenance',()=>{
  const graphs=Array.from({length:1528},(_,i)=>fakeGraph('graph-'+String(i).padStart(4,'0')+'.json',{
    project:i%4===0?'<settings>':':FAKE-module-'+i,scope:i%4===0?'settings-buildscript':'project',
    components:Array(i<950?16:15).fill(fakeCoordinate)}));
  const {bom,inventory}=augment(syft(),lock(),graphs),maven=inventory.maven;
  assert.equal(maven.files.length,1528);assert.equal(maven.entries.length,23870);
  assert.deepEqual(maven.files,graphs.map(g=>({path:g.name,bytes:g.bytes.length,sha256:crypto.createHash('sha256').update(g.bytes).digest('hex')})));
  const expected=new Map(graphs.map(g=>[g.name,{...JSON.parse(g.bytes),sha:crypto.createHash('sha256').update(g.bytes).digest('hex')}]))
  for(const entry of maven.entries) {
    const original=expected.get(entry.graphPath);
    assert.equal(entry.project,original.project);assert.equal(entry.scope,original.scope);
    assert.equal(entry.graphSha256,original.sha);assert.equal(entry.packagedPresence,'unknown');
    assert.equal(entry.classification,original.scope.includes('buildscript')?'build-only':'runtime-input');
  }
  const component=bom.components.find(c=>c.purl==='pkg:maven/org.fake/fixture@1.0.0');
  assert.deepEqual(JSON.parse(component.properties.find(p=>p.name==='micro:resolved-maven-entries').value),maven.entries);
  assert.match(inventory.finalArtifactCoverage,/pending/);
});

test('2048 graph boundary passes and 2049 graphs fail without truncation',()=>{
  const graphs=Array.from({length:2048},(_,i)=>fakeGraph('graph-'+i+'.json'));
  assert.equal(mavenInventory(graphs).files.length,2048);
  assert.throws(()=>mavenInventory([...graphs,fakeGraph('graph-2048.json')]),/count budget/);
});

test('project identities distinguish same configuration, preserve settings and legacy absence is unknown',()=>{
  const legacy=JSON.parse(fakeGraph('legacy.json').bytes);delete legacy.project;
  const graphs=[fakeGraph('one.json',{project:':one'}),fakeGraph('two.json',{project:':two'}),
    fakeGraph('settings.json',{project:'<settings>',scope:'settings-buildscript'}),{name:'legacy.json',bytes:bytes(legacy)},
    fakeGraph('buildscript.json',{scope:'project-buildscript',configuration:'buildscriptRuntimeClasspath'}),
    fakeGraph('nonruntime.json',{configuration:'compileClasspath'})];
  const rows=mavenInventory(graphs).entries;
  assert.deepEqual(rows.map(e=>e.project),[':one',':two','<settings>','unknown',':app',':app']);
  assert.deepEqual(rows.map(e=>e.classification),['runtime-input','runtime-input','build-only','runtime-input','build-only','unknown']);
});

test('malformed supplied project, duplicate graph names and missing schema fail',()=>{
  for(const project of [null,7,{},[],'','   ','x'.repeat(1025),'é'.repeat(513),'\uD800'])
    assert.throws(()=>mavenInventory([fakeGraph('bad.json',{project})]),/project identity/);
  assert.equal(mavenInventory([fakeGraph('valid.json',{project:'é'.repeat(512)})]).entries[0].project,'é'.repeat(512));
  const first=fakeGraph('duplicate.json');
  assert.throws(()=>mavenInventory([first,fakeGraph('duplicate.json',{project:':other'})]),/duplicate/);
  for(const key of ['build','scope','configuration','components']) {
    const value=JSON.parse(first.bytes);delete value[key];
    assert.throws(()=>mavenInventory([{name:'missing.json',bytes:bytes(value)}]),/schema/);
  }
});

test('8 MiB graph and 64 MiB total byte boundaries remain inclusive and enforced',()=>{
  assert.equal(MAVEN_LIMITS.graphBytes,8*1024*1024);assert.equal(MAVEN_LIMITS.totalBytes,64*1024*1024);
  const raw=fakeGraph('single.json',{components:[]}).bytes;
  const padded=Buffer.concat([raw,Buffer.alloc(MAVEN_LIMITS.graphBytes-raw.length,32)]);
  assert.equal(mavenInventory([{name:'single.json',bytes:padded}]).files[0].bytes,MAVEN_LIMITS.graphBytes);
  assert.throws(()=>mavenInventory([{name:'overflow.json',bytes:Buffer.concat([padded,Buffer.from(' ')])}]),/input invalid/);
  const graphs=Array.from({length:8},(_,i)=>({name:'graph-'+i+'.json',bytes:padded}));
  assert.equal(mavenInventory(graphs).files.reduce((n,f)=>n+f.bytes,0),MAVEN_LIMITS.totalBytes);
  assert.throws(()=>mavenInventory([...graphs,fakeGraph('overflow.json',{components:[]})]),/total byte budget/);
});

test('100000 component boundary passes and overflow fails without deduplication',()=>{
  assert.equal(MAVEN_LIMITS.componentCount,100000);
  assert.equal(mavenInventory([fakeGraph('max.json',{components:Array(100000).fill(fakeCoordinate)})]).entries.length,100000);
  assert.throws(()=>mavenInventory([fakeGraph('overflow.json',{components:Array(100001).fill(fakeCoordinate)})]),/component count budget/);
});
