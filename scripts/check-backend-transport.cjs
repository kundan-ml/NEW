const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { NextRequest } = require('next/server');

// Exercise transport without backend requests, inference jobs, or dataset writes.
function loadTypeScript(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const compiled = new Module(filename, module);
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  const requireOriginal = compiled.require.bind(compiled);
  compiled.require = name => Object.hasOwn(stubs, name) ? stubs[name] : requireOriginal(name);
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true },
  }).outputText, filename);
  return compiled.exports;
}

const originals = {
  fetch: global.fetch,
  window: global.window,
  backend: process.env.BACKEND_API_URL,
  publicApi: process.env.NEXT_PUBLIC_API_URL,
  publicWs: process.env.NEXT_PUBLIC_WS_URL,
};
const route = loadTypeScript('src/app/api/backend/[...path]/route.ts');
const context = segments => ({ params: Promise.resolve({ path: segments }) });
const request = (segments, init, query = '') => new NextRequest(`http://inspection-server:3000/api/backend/${segments.join('/')}${query}`, init);
const restoreEnv = (name, value) => value === undefined ? delete process.env[name] : process.env[name] = value;

async function main() {
  process.env.BACKEND_API_URL = 'http://mock-inspection:8000/api/v1/';
  process.env.NEXT_PUBLIC_API_URL = 'http://public-ignored/api/v1';
  let calls = 0;
  let upstreamRequest;
  let handler = () => new Response('{"items":[]}', { headers: { 'Content-Type': 'application/json' } });
  global.fetch = async (url, options) => {
    calls++;
    upstreamRequest = { url: String(url), options };
    return handler(url, options);
  };

  const live = await route.GET(request(['inspection', 'live'], undefined, '?after=12&url=https%3A%2F%2Funtrusted.example'), context(['inspection', 'live']));
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), { items: [] });
  assert.equal(upstreamRequest.url, 'http://mock-inspection:8000/api/v1/inspection/live?after=12&url=https%3A%2F%2Funtrusted.example');
  assert.equal(upstreamRequest.options.cache, 'no-store');
  assert.equal(upstreamRequest.options.redirect, 'manual');
  assert.equal(live.headers.get('cache-control'), 'no-store');
  assert.equal(live.headers.get('x-content-type-options'), 'nosniff');

  const upload = request(['datasets', 'upload-folder'], {
    method: 'POST', body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('multipart-test')); controller.close(); } }), duplex: 'half',
    headers: { 'Content-Type': 'multipart/form-data; boundary=fixture', 'Authorization': 'Bearer test-token', 'Cookie': 'session=test', 'Host': 'untrusted.example', 'Content-Length': '14' },
  });
  upload.formData = upload.arrayBuffer = upload.text = () => { throw new Error('Proxy must not buffer uploads'); };
  handler = (_url, options) => {
    assert.equal(options.body, upload.body, 'Multipart request stream must be forwarded unchanged.');
    assert.equal(options.duplex, 'half');
    assert.equal(options.signal, upload.signal);
    assert.equal(options.headers.get('content-type'), 'multipart/form-data; boundary=fixture');
    assert.equal(options.headers.get('authorization'), 'Bearer test-token');
    assert.equal(options.headers.get('cookie'), 'session=test');
    assert.equal(options.headers.get('host'), null);
    assert.equal(options.headers.get('content-length'), null);
    return new Response('{"id":"fixture"}', { headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'session=updated; HttpOnly' } });
  };
  const uploaded = await route.POST(upload, context(['datasets', 'upload-folder']));
  assert.equal(uploaded.status, 200);
  assert.deepEqual(await uploaded.json(), { id: 'fixture' });
  assert.deepEqual(uploaded.headers.getSetCookie(), ['session=updated; HttpOnly']);

  let downloadStream;
  handler = (_url, options) => {
    assert.equal(options.headers.get('range'), 'bytes=0-3');
    downloadStream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.enqueue(new Uint8Array([3, 4])); controller.close(); } });
    return new Response(downloadStream, { status: 206, headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="inspection.zip"', 'Content-Range': 'bytes 0-3/4', 'Content-Encoding': 'gzip', 'Content-Length': '100', 'Connection': 'keep-alive' } });
  };
  const download = await route.GET(request(['actions', 'archive', 'dataset-1'], { headers: { Range: 'bytes=0-3' } }), context(['actions', 'archive', 'dataset-1']));
  assert.equal(download.status, 206);
  assert.equal(download.body, downloadStream, 'Downloads must remain streamed.');
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), new Uint8Array([1, 2, 3, 4]));
  assert.equal(download.headers.get('content-disposition'), 'attachment; filename="inspection.zip"');
  assert.equal(download.headers.get('content-range'), 'bytes 0-3/4');
  for (const name of ['content-length', 'content-encoding', 'connection']) assert.equal(download.headers.get(name), null);

  handler = () => new Response('{"detail":"Missing illumination"}', { status: 400, headers: { 'Content-Type': 'application/json' } });
  const backendError = await route.GET(request(['datasets']), context(['datasets']));
  assert.equal(backendError.status, 400);
  assert.deepEqual(await backendError.json(), { detail: 'Missing illumination' });
  handler = () => new Response(null, { status: 204 });
  assert.equal((await route.DELETE(request(['history'], { method: 'DELETE' }), context(['history']))).status, 204);
  handler = () => new Response('body', { headers: { 'Content-Type': 'application/pdf' } });
  assert.equal((await route.HEAD(request(['system', 'manual'], { method: 'HEAD' }), context(['system', 'manual']))).body, null);

  const beforeInvalid = calls;
  for (const segments of [[], ['..'], ['.'], ['a/b'], ['a\\b'], ['%2f'], ['bad\0'], ['x'.repeat(513)], Array(33).fill('x')]) {
    assert.equal((await route.GET(request(['ignored']), context(segments))).status, 400);
  }
  assert.equal(calls, beforeInvalid, 'Untrusted path segments must never reach fetch.');
  assert.equal((await route.POST(request(['history', 'clear'], { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } }), context(['history', 'clear']))).status, 403);
  assert.equal(calls, beforeInvalid);

  handler = () => new Response(null, { status: 307, headers: { Location: '/api/v1/system/manual/' } });
  const redirect = await route.GET(request(['system', 'manual']), context(['system', 'manual']));
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.get('location'), '/api/backend/system/manual/');
  handler = () => new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/private' } });
  assert.equal((await route.GET(request(['system', 'manual']), context(['system', 'manual']))).status, 502);
  handler = () => { throw new Error('/private/backend/path http://private-backend'); };
  const unavailable = await route.GET(request(['system', 'info']), context(['system', 'info']));
  assert.equal(unavailable.status, 502);
  assert(!(await unavailable.text()).includes('private'));
  process.env.BACKEND_API_URL = 'file:///private/backend';
  assert.equal((await route.GET(request(['system']), context(['system']))).status, 502);

  // Client URLs remain same-origin on another PC, while HTTP LAN sockets point
  // at the inspection server and HTTPS never opens an insecure WebSocket.
  function client(apiUrl, location, wsUrl) {
    process.env.NEXT_PUBLIC_API_URL = apiUrl;
    restoreEnv('NEXT_PUBLIC_WS_URL', wsUrl);
    global.window = { location: new URL(location), setTimeout, clearTimeout };
    return loadTypeScript('src/lib/api.ts', { './preview-cache': { resolvedPreviewUrl: value => value } });
  }
  let api = client('http://127.0.0.1:8000/api/v1', 'http://192.168.1.50:3000');
  assert.equal(api.API, '/api/backend');
  assert.equal(api.sharedInspectionSocketUrl(), 'ws://192.168.1.50:8000/api/v1/ws/inspection');
  assert.equal(api.WS_API, 'ws://192.168.1.50:8000/api/v1');
  handler = () => new Response('{"items":[]}');
  global.fetch = async (url, options) => { upstreamRequest = { url, options }; return new Response('{"id":"dataset-1"}', { headers: { 'Content-Type': 'application/json' } }); };
  await api.api.system();
  assert.equal(upstreamRequest.url, '/api/backend/system/info');
  assert.equal(upstreamRequest.options.headers['Content-Type'], 'application/json');
  await api.api.uploadFolder([new File(['fixture'], 'lens.h.bmp')], 'Fixture');
  assert.equal(upstreamRequest.url, '/api/backend/datasets/upload-folder');
  assert(upstreamRequest.options.body instanceof FormData);
  assert.equal(upstreamRequest.options.headers['Content-Type'], undefined, 'Browser must choose the multipart boundary.');
  assert.equal(api.manualUrl(), '/api/backend/system/manual');
  assert.equal(api.archiveUrl('dataset-1'), '/api/backend/actions/archive/dataset-1');

  api = client('http://localhost:8000/api/v1', 'https://inspection.example');
  assert.equal(api.sharedInspectionSocketUrl(), null);
  api = client('https://backend.example/api/v1', 'https://inspection.example');
  assert.equal(api.sharedInspectionSocketUrl(), 'wss://backend.example/api/v1/ws/inspection');
  api = client('http://localhost:8000/api/v1', 'https://inspection.example', 'wss://socket.example/api/v1');
  assert.equal(api.sharedInspectionSocketUrl(), 'wss://socket.example/api/v1/ws/inspection');
  api = client('http://localhost:8000/api/v1', 'http://localhost:3000');
  assert.equal(api.sharedInspectionSocketUrl(), 'ws://localhost:8000/api/v1/ws/inspection');
  api = client('http://127.0.0.1:8000/api/v1', 'http://[2001:db8::2]:3000');
  assert.equal(api.sharedInspectionSocketUrl(), 'ws://[2001:db8::2]:8000/api/v1/ws/inspection');
  api = client('ftp://untrusted.example', 'http://inspection.example');
  assert.equal(api.sharedInspectionSocketUrl(), null);

  console.log('Backend transport checks passed: fixed-origin proxy, streaming uploads/downloads, auth/header/query/error preservation, path/redirect safety, cross-site protection, LAN sockets, and HTTPS fallback.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originals.fetch;
  if (originals.window === undefined) delete global.window; else global.window = originals.window;
  restoreEnv('BACKEND_API_URL', originals.backend);
  restoreEnv('NEXT_PUBLIC_API_URL', originals.publicApi);
  restoreEnv('NEXT_PUBLIC_WS_URL', originals.publicWs);
});
