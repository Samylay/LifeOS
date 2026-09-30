import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {augment,lockedInventory,mavenInventory} from '../security_inventory.mjs';
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
