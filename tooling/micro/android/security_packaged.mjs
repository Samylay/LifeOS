// Parse APK bytes only inside the admitted scanner sandbox.
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const apk = '/source/app.apk';
if(fs.statSync(apk).size > 512*1024*1024) throw Error('APK byte budget');
const bytes = fs.readFileSync(apk);
let end = -1;
for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) {
  if(bytes.readUInt32LE(i)===0x06054b50 && i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
}
if(end<0 || bytes.readUInt16LE(end+4) || bytes.readUInt16LE(end+6)) throw Error('ZIP end/disk invalid');
const count=bytes.readUInt16LE(end+10), size=bytes.readUInt32LE(end+12), start=bytes.readUInt32LE(end+16);
if(!count || count>30000 || count!==bytes.readUInt16LE(end+8) || start+size!==end) throw Error('ZIP directory budget');
let cursor=start, expanded=0; const seen=new Set(), files=[];
for(let i=0;i<count;i++) {
  if(cursor+46>end || bytes.readUInt32LE(cursor)!==0x02014b50) throw Error('ZIP directory header');
  const flags=bytes.readUInt16LE(cursor+8), method=bytes.readUInt16LE(cursor+10);
  const compressed=bytes.readUInt32LE(cursor+20), length=bytes.readUInt32LE(cursor+24);
  const namesize=bytes.readUInt16LE(cursor+28), extra=bytes.readUInt16LE(cursor+30), comment=bytes.readUInt16LE(cursor+32);
  const mode=bytes.readUInt32LE(cursor+38)>>>16, offset=bytes.readUInt32LE(cursor+42);
  const name=bytes.subarray(cursor+46,cursor+46+namesize).toString('utf8');
  if(!name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || seen.has(name) || name.includes('\0')) throw Error('ZIP unsafe path');
  if((flags&1) || ![0,8].includes(method) || ![0,0o100000,0o040000].includes(mode&0o170000)) throw Error('ZIP unsupported file');
  seen.add(name); expanded+=length;
  if(expanded>1024*1024*1024 || cursor+46+namesize+extra+comment>end || offset+30>start) throw Error('ZIP expansion/header budget');
  if(bytes.readUInt32LE(offset)!==0x04034b50) throw Error('ZIP local header');
  const localNameSize=bytes.readUInt16LE(offset+26), localExtra=bytes.readUInt16LE(offset+28);
  const data=offset+30+localNameSize+localExtra;
  if(data+compressed>start || bytes.subarray(offset+30,offset+30+localNameSize).toString('utf8')!==name) throw Error('ZIP local metadata mismatch');
  const native=/^lib\/[^/]+\/[^/]+\.so$/.test(name);
  const bundle=name==='assets/index.android.bundle';
  const entry={path:name,bytes:length,compressedBytes:compressed,kind:native?'native-library':bundle?'javascript-bundle':'packaged-file'};
  if(native||bundle) {
    if(length>128*1024*1024) throw Error('native/bundle expansion budget');
    const input=bytes.subarray(data,data+compressed);
    const content=method===0?input:zlib.inflateRawSync(input,{maxOutputLength:128*1024*1024});
    if(content.length!==length) throw Error('ZIP declared size mismatch');
    entry.sha256=hash(content);
    entry.componentIdentity='unknown, requires resolved input mapping';
  }
  files.push(entry); cursor+=46+namesize+extra+comment;
}
if(cursor!==end) throw Error('ZIP trailing directory mismatch');
console.log(JSON.stringify({kind:'packaged-APK-files',apkSha256:hash(bytes),apkBytes:bytes.length,
  files,expandedBytes:expanded,limits:['Native-library bytes are not a vulnerability component identity',
    'Hermes bytecode does not recover complete npm inventory','Resolved Maven and source inventories remain separate']}));
