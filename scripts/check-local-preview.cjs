// Isolated fixtures: no uploads or configuration changes reach the real backend.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const calls=[];
const api={uploadSetupPreview:async(file,signal)=>{
  assert(!signal.aborted);calls.push({upload:file.name,size:file.size});
  return {id:'setup-preview',samples:[{id:'one',images:{h:{}}}]};
}};
const filename=path.resolve(__dirname,'../src/lib/local-image-preview.ts');
const compiled=new Module(filename,module);
compiled.require=name=>{assert.equal(name,'./api');return {api,previewUrl:()=>'/fixture-preview'};};
compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,filename);
const {createLocalImagePreview}=compiled.exports;
const oldFetch=global.fetch;
global.fetch=async(url)=>{calls.push({url});return new Response(new Blob(['decoded PNG']),{headers:{'Content-Type':'image/png'}});};
(async()=>{
  const signal=new AbortController().signal;
  const large=new File([Buffer.alloc(6*1024*1024)],'frame#2.tiff');
  const preview=await createLocalImagePreview(large,signal);
  assert.deepEqual(calls,[{upload:large.name,size:large.size},{url:'/fixture-preview'}]);
  const reused=await createLocalImagePreview(large,signal);
  assert.equal(calls.length,2,'Unchanged files must reuse decoded TIFF previews');
  URL.revokeObjectURL(preview);URL.revokeObjectURL(reused);
  const bmp=new File(['bmp'],'frame.h.bmp');
  URL.revokeObjectURL(await createLocalImagePreview(bmp,signal));
  assert.equal(calls.length,2,'BMP remains a fast local preview');
  const aborted=new AbortController();aborted.abort();
  await assert.rejects(createLocalImagePreview(large,aborted.signal),{name:'AbortError'});
  console.log('Local preview checks passed: large TIFF setup transport, cached previews, direct BMP, and cancellation.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=oldFetch;});
