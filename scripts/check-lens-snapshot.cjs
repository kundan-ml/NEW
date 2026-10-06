// No production API calls: validate original four-camera bytes with Python's ZIP reader.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const {spawnSync}=require('node:child_process');
const ts=require('typescript');
const filename=path.resolve(__dirname,'../src/lib/lens-snapshot.ts');
const compiled=new Module(filename,module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,filename);
const {lensSnapshotArchive}=compiled.exports;
(async()=>{
  const channels=['h','d','n','p'];
  const sample={images:Object.fromEntries(channels.map(channel=>[channel,{filename:`lens ü.${channel}.tif`}])),base_name:'lens ü'};
  const called=[];
  const zip=await lensSnapshotArchive(sample,async channel=>{called.push(channel);return new Blob([`original ${channel}`]);});
  assert.deepEqual(called,channels);
  const verify=spawnSync(process.env.PYTHON||'python',['-c',`import sys,io,zipfile,json
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert z.testzip() is None
print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))`],{input:Buffer.from(await zip.arrayBuffer()),encoding:'utf8'});
  assert.equal(verify.status,0,verify.stderr);
  assert.deepEqual(JSON.parse(verify.stdout),Object.fromEntries(channels.map(channel=>[`${channel}/lens ü.${channel}.tif`,`original ${channel}`])));
  await assert.rejects(lensSnapshotArchive({images:{}},async()=>new Blob()),/no source images/);
  await assert.rejects(lensSnapshotArchive(sample,async()=>{throw new Error('Failed channel');}),/Failed channel/);
  console.log('Snapshot checks passed: four original channels, Unicode names, valid ZIP CRCs, and failed-download handling.');
})().catch(error=>{console.error(error);process.exitCode=1;});
