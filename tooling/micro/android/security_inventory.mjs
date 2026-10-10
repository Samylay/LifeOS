// Trusted inventory augmentation. Callers supply data, never scanner recipes.
import crypto from 'node:crypto';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const property = (name, value) => ({name:'micro:'+name, value:typeof value==='string'?value:JSON.stringify(value)});
const key = (name, version) => JSON.stringify([name, version]);
const purl = (kind, name, version) => 'pkg:'+kind+'/'+name.split('/').map(encodeURIComponent).join('/')+'@'+encodeURIComponent(version);
const npmName = /^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i;
const exactVersion = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/;
export const MAVEN_LIMITS=Object.freeze({graphCount:2048,graphBytes:8*1024*1024,
  totalBytes:64*1024*1024,componentCount:100000,projectBytes:1024});

export function lockedInventory(lockBytes) {
  if(lockBytes.length>16*1024*1024) throw Error('lock inventory byte budget');
  const lock=JSON.parse(lockBytes.toString());
  if(![2,3].includes(lock.lockfileVersion)||!lock.packages||typeof lock.packages!=='object'||Array.isArray(lock.packages)) throw Error('unsupported lock inventory');
  const entries=[];
  for(const [path,item] of Object.entries(lock.packages)) {
    if(path==='') continue;
    if(entries.length>=30000) throw Error('lock inventory entry budget');
    if(!item||typeof item!=='object'||item.link||!path.startsWith('node_modules/')||path.split('/').includes('..')) throw Error('unresolved/unsupported lock entry: '+path);
    const name=item.name||path.split('node_modules/').at(-1), version=item.version;
    if(typeof name!=='string'||!npmName.test(name)||typeof version!=='string'||!exactVersion.test(version)) throw Error('lock entry lacks exact npm identity: '+path);
    for(const flag of ['dev','optional','devOptional']) if(item[flag]!==undefined&&typeof item[flag]!=='boolean') throw Error('invalid lock classification');
    entries.push({name,version,lockPath:path,integrity:item.integrity??null,
      dev:item.dev===true,optional:item.optional===true,devOptional:item.devOptional===true,
      classification:item.dev===true?'build-only':'runtime-input',packagedPresence:'unknown'});
  }
  return {lockSha256:sha(lockBytes),entries,root:lock.packages['']??{}};
}

export function mavenInventory(graphs) {
  if(graphs.length>MAVEN_LIMITS.graphCount) throw Error('Maven graph count budget');
  if(graphs.reduce((n,g)=>n+g.bytes.length,0)>MAVEN_LIMITS.totalBytes) throw Error('Maven graph total byte budget');
  const entries=[],files=[],names=new Set();
  for(const graph of graphs) {
    if(typeof graph.name!=='string'||!/^[A-Za-z0-9_.-]+\.json$/.test(graph.name)||graph.bytes.length>MAVEN_LIMITS.graphBytes) throw Error('Maven graph input invalid');
    if(names.has(graph.name)) throw Error('duplicate Maven graph name');
    names.add(graph.name);
    const value=JSON.parse(graph.bytes.toString());
    if(!value||!Array.isArray(value.components)||typeof value.configuration!=='string'||typeof value.build!=='string'||typeof value.scope!=='string') throw Error('Maven graph schema invalid');
    // Older retained graphs lack project.path. Absence is unknown, never inferred.
    const project=Object.hasOwn(value,'project')?value.project:'unknown';
    if(typeof project!=='string'||!project.trim()||Buffer.byteLength(project,'utf8')>MAVEN_LIMITS.projectBytes||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(project)) throw Error('Maven project identity invalid');
    const graphSha256=sha(graph.bytes);files.push({path:graph.name,bytes:graph.bytes.length,sha256:graphSha256});
    for(const item of value.components) {
      if(entries.length>=MAVEN_LIMITS.componentCount) throw Error('Maven component count budget');
      if(!item||!['group','module','version'].every(k=>typeof item[k]==='string'&&/^[A-Za-z0-9_.+:-]{1,256}$/.test(item[k]))||/^(?:unspecified|latest(?:\..*)?)$/.test(item.version)||item.version.endsWith('+')) throw Error('Maven coordinate invalid');
      // Buildscript scopes override classpath suffixes. Optional packaging stays unknown.
      const buildOnly=value.scope.includes('buildscript');
      const classification=buildOnly?'build-only':value.configuration.toLowerCase().endsWith('runtimeclasspath')?'runtime-input':'unknown';
      entries.push({group:item.group,module:item.module,version:item.version,build:value.build,project,
        scope:value.scope,configuration:value.configuration,classification,packagedPresence:'unknown',
        graphPath:graph.name,graphSha256,purl:purl('maven',item.group+'/'+item.module,item.version)});
    }
  }
  return {status:graphs.length?'resolved-inputs-scanned':'pending',files,entries,
    scope:'reported resolved configurations only; closure completeness and packaged mapping require independent authority'};
}

export function augment(syft, lockBytes, graphs=[]) {
  if(!syft||syft.bomFormat!=='CycloneDX'||!Array.isArray(syft.components)) throw Error('invalid actual Syft report');
  const locked=lockedInventory(lockBytes),maven=mavenInventory(graphs);
  const bom=structuredClone(syft),npm=new Map(),java=new Map();
  for(const entry of locked.entries) {
    const id=key(entry.name,entry.version);if(!npm.has(id)) npm.set(id,[]);npm.get(id).push(entry);
  }
  for(const entry of maven.entries) {
    if(!java.has(entry.purl)) java.set(entry.purl,[]);java.get(entry.purl).push(entry);
  }
  const initial=new Set(),unmatched=[];
  for(const component of bom.components) {
    component.properties??=[];
    const id=key(component.name,component.version),origins=npm.get(id);
    const native=java.get(component.purl?.split('?')[0]);
    if(origins&&component.purl?.split('?')[0]===purl('npm',component.name,component.version)) {
      initial.add(id);component.properties.push(property('locked-npm-entries',origins),property('lock-sha256',locked.lockSha256));
    } else if(native) {
      component.properties.push(property('resolved-maven-entries',native));
    } else {
      const kind=component.name===locked.root.name&&component.version===locked.root.version?'source-product':component.type==='file'?'source-file-metadata':'unknown-source-component';
      unmatched.push({name:component.name,version:component.version??null,purl:component.purl??null,classification:kind});
      component.properties.push(property('classification',kind));
    }
    component.properties.push(property('inventory-provenance','actual-syft-report'),property('packaged-presence','unknown'));
  }
  const missingBefore=[];
  for(const [id,origins] of npm) {
    if(initial.has(id)) continue;
    const {name,version}=origins[0];missingBefore.push({name,version,entries:origins});
    const url=purl('npm',name,version);
    bom.components.push({type:'library',name,version,purl:url,'bom-ref':'micro-locked-npm-'+sha(url),
      properties:[property('inventory-provenance','trusted-complete-npm-lock'),property('lock-sha256',locked.lockSha256),
        property('locked-npm-entries',origins),property('packaged-presence','unknown')]});
  }
  const existing=new Set(bom.components.map(c=>c.purl?.split('?')[0]));
  for(const [url,origins] of java) {
    if(existing.has(url)) continue;
    const {group,module,version}=origins[0];
    bom.components.push({type:'library',group,name:module,version,purl:url,'bom-ref':'micro-resolved-maven-'+sha(url),
      properties:[property('inventory-provenance','trusted-resolved-maven-graph'),property('resolved-maven-entries',origins),property('packaged-presence','unknown')]});
  }
  const covered=new Set(bom.components.filter(c=>c.purl?.startsWith('pkg:npm/')).map(c=>key(c.name,c.version)));
  const missingAfter=[...npm].filter(([id])=>!covered.has(id)).map(([,entries])=>entries[0]);
  if(missingAfter.length) throw Error('locked npm inventory omission');
  return {bom,inventory:{schema:'micro.native-build-input-inventory/1',scope:'build inputs only; not final APK coverage',
    lockSha256:locked.lockSha256,lockEntries:locked.entries,lockedEntryCount:locked.entries.length,
    lockedUniqueComponentCount:npm.size,syftMatchedLockedComponentCount:initial.size,
    missingBefore,missingAfter,unmatchedSyftComponents:unmatched,maven,
    finalArtifactCoverage:'pending-closure-and-consequential-native-component-mapping'}};
}
