// Deterministic client transport tests. No real backend/inspection writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/lib/folder-upload.ts');
const compiled = new Module(filename, module);
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017,
} }).outputText, filename);
const { needsChunkUpload, uploadFolderInChunks } = compiled.exports;

function folder(sizes, purpose = 'inspection') {
  const form = new FormData();
  for (let index = 0; index < sizes.length; index++) {
    form.append('files', new Blob([Buffer.alloc(sizes[index], index + 1)]), `frame${index}.h.bmp`);
    form.append('relative_paths', `Camera + ${index}/frame${index}.h.bmp`);
  }
  form.append('name', 'Folder transport test');
  form.append('purpose', purpose);
  return form;
}

async function main() {
  assert(!needsChunkUpload(folder([1024])));
  assert(needsChunkUpload(folder([4 * 1024 * 1024])));
  const form = folder([3 * 1024 * 1024 + 17, 1024]);
  const calls = [];
  const stored = new Map();
  let lostChunkAck = true;
  let lostFinishAck = true;
  let published = 0;
  const progress = [];
  const id = 'a'.repeat(32);
  const send = async (route, init, timeout) => {
    calls.push({ route, method: init.method });
    if (route === '/datasets/uploads') {
      const payload = JSON.parse(init.body);
      assert.equal(payload.file_count, 2);
      assert.equal(payload.total_bytes, 3 * 1024 * 1024 + 17 + 1024);
      assert.equal(payload.include_samples, false);
      assert.equal(payload.name, 'Folder transport test');
      return { upload_id: id, chunk_bytes: 2 * 1024 * 1024 };
    }
    if (init.method === 'PUT') {
      assert.equal(timeout, 120000);
      assert.equal(init.headers['Content-Type'], 'application/octet-stream');
      assert(init.body.size <= 2 * 1024 * 1024, 'Every hosted body must remain below 4.5MB');
      const url = new URL(route, 'http://fixture');
      const index = Number(url.pathname.split('/').at(-1));
      assert.equal(url.searchParams.get('path'), `Camera + ${index}/frame${index}.h.bmp`);
      const offset = Number(url.searchParams.get('offset'));
      const bytes = Buffer.from(await init.body.arrayBuffer());
      const prior = stored.get(index) || Buffer.alloc(0);
      if (offset === prior.length) stored.set(index, Buffer.concat([prior, bytes]));
      else assert.deepEqual(prior.subarray(offset, offset + bytes.length), bytes, 'A replay must be byte-identical');
      if (lostChunkAck) { lostChunkAck = false; throw new TypeError('Network response lost'); }
      return { next_offset: offset + bytes.length };
    }
    if (route.endsWith('/finish')) {
      if (!published) published++;
      if (lostFinishAck) { lostFinishAck = false; throw new TypeError('Finish response lost'); }
      return { id: 'single-dataset', sample_count: 2 };
    }
    throw new Error(`Unexpected call: ${route}`);
  };
  const result = await uploadFolderInChunks(form, send, (done, total) => progress.push([done, total]));
  assert.equal(result.id, 'single-dataset');
  assert.equal(published, 1);
  for (const [index, file] of form.getAll('files').entries()) assert.deepEqual(stored.get(index), Buffer.from(await file.arrayBuffer()));
  assert.equal(progress.at(-1)[0], progress.at(-1)[1]);
  assert(progress.every((entry, index) => index === 0 || entry[0] > progress[index - 1][0]), 'Retries must not double-count progress');
  assert(!calls.some(call => call.route === '/datasets/upload-folder'), 'Never fall back to a giant multipart request');

  let setupPayload;
  await uploadFolderInChunks(folder([1, 1, 1, 1], 'setup'), async (route, init) => {
    if (route === '/datasets/uploads') { setupPayload = JSON.parse(init.body); return { upload_id: id, chunk_bytes: 2 * 1024 * 1024 }; }
    if (init.method === 'PUT') return { next_offset: 1 };
    return { id: 'setup-only', samples: [{}] };
  });
  assert.equal(setupPayload.purpose, 'setup');
  assert.equal(setupPayload.include_samples, true);

  await assert.rejects(uploadFolderInChunks(form, async () => { throw new Error('HTTP 404'); }), /requires the updated backend/);
  await assert.rejects(uploadFolderInChunks(form, async () => { throw new Error('Folder exceeds backend limit'); }), /backend limit/);
  const aborted = [];
  await assert.rejects(uploadFolderInChunks(form, async (route, init) => {
    if (route === '/datasets/uploads') return { upload_id: id, chunk_bytes: 1024 };
    if (init.method === 'PUT') return { next_offset: 3 }; // malformed acknowledgement
    aborted.push(init.method);
    return { ok: true };
  }), /acknowledge/);
  assert.deepEqual(aborted, ['DELETE']);
  await assert.rejects(uploadFolderInChunks(folder([0]), send), /empty image/);
  console.log('Folder upload checks passed: bounded bodies, exact byte reconstruction, portable paths, replay-safe retries, one dataset, progress, setup samples, actionable old-backend errors, and private abort cleanup.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
