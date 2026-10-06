// Full client -> Next streaming proxy -> isolated FastAPI upload smoke test.
// Uses temporary storage and a dedicated port; never touches live datasets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const Module = require('node:module');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function load(relative) {
  const filename = path.resolve(__dirname, '..', relative);
  const compiled = new Module(filename, module);
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017,
  } }).outputText, filename);
  return compiled.exports;
}
const route = load('src/app/api/backend/[...path]/route.ts');
const { uploadFolderInChunks } = load('src/lib/folder-upload.ts');
const backend = process.env.UPLOAD_TEST_BACKEND || path.resolve(__dirname, '../../../BACKEND');
const temporary = fs.mkdtempSync('/tmp/folder-upload-proxy-');
const oldBase = process.env.BACKEND_API_URL;
let child;
async function main() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const source = `from fastapi import FastAPI
from app.api.chunk_uploads import create_chunk_upload_router
from app.services import tray_layout
import uvicorn
tray_layout.get_tray_layout=lambda:{'images_per_tray':16}
app=FastAPI()
app.include_router(create_chunk_upload_router(lambda root:root),prefix='/api/v1')
@app.get('/ready')
def ready():return {'ready':True}
uvicorn.run(app,host='127.0.0.1',port=${port},log_level='error')`;
  child = spawn(process.env.PYTHON || 'python', ['-c', source], { cwd: backend,
    env: { ...process.env, STORAGE_ROOT: temporary, TMPDIR: '/tmp' }, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', data => { stderr += String(data); });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { ready = (await fetch(`http://127.0.0.1:${port}/ready`)).ok; if (ready) break; } catch {}
    if (child.exitCode !== null) throw new Error(`Isolated server failed: ${stderr}`);
    await pause(100);
  }
  assert(ready, `Isolated server did not start: ${stderr}`);
  process.env.BACKEND_API_URL = `http://127.0.0.1:${port}/api/v1`;
  const form = new FormData();
  const original = new Map();
  for (const [index, channel] of ['h','d','n','p'].entries()) {
    const name = `Camera folder/lens.${channel}.bmp`;
    const bytes = Buffer.alloc(index ? 300 : 5*1024*1024+17, index+1);
    original.set(name, bytes);
    form.append('files', new Blob([bytes]), `lens.${channel}.bmp`);
    form.append('relative_paths', name);
  }
  form.append('name', 'Isolated hosted upload');
  let requests = 0;
  let maximumBody = 0;
  let uploadId;
  const send = async (uri, init) => {
    requests++;
    const url = new URL(`/api/backend${uri}`, 'http://fixture');
    const headers = { 'Content-Type': 'application/json', ...init.headers };
    const bodyBytes = init.body instanceof Blob ? init.body.size : Buffer.byteLength(init.body || '');
    maximumBody = Math.max(maximumBody, bodyBytes);
    assert(bodyBytes < 4_500_000, 'No request may hit Vercel body limit');
    const request = new NextRequest(url, { ...init, headers });
    const context = { params: Promise.resolve({ path: url.pathname.slice('/api/backend/'.length).split('/') }) };
    const response = await route[init.method](request, context);
    const result = await response.json();
    assert(response.ok, JSON.stringify(result));
    if (result.upload_id) uploadId = result.upload_id;
    return result;
  };
  const result = await uploadFolderInChunks(form, send);
  assert.equal(result.sample_count, 1);
  assert.equal(result.image_count, 4);
  assert.deepEqual(Object.keys(result.channels).sort(), ['d','h','n','p']);
  for (const [name, bytes] of original) assert.deepEqual(fs.readFileSync(path.join(temporary, 'uploads', uploadId, name)), bytes);
  assert.equal(fs.readdirSync(path.join(temporary,'catalogs')).length, 1);
  assert.equal(maximumBody, 2*1024*1024);
  console.log(`Hosted upload proxy smoke passed: ${requests} bounded requests, exact 5MiB+ image and four camera files reconstructed, one dataset, no production mutations.`);
}
main().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => {
  if (oldBase===undefined) delete process.env.BACKEND_API_URL; else process.env.BACKEND_API_URL=oldBase;
  if (child && child.exitCode===null) { const ended=new Promise(resolve=>child.once('exit',resolve)); child.kill('SIGTERM'); await ended; }
  fs.rmSync(temporary,{recursive:true,force:true});
});
