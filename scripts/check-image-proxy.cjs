const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const sharp = require('sharp');
const { NextRequest } = require('next/server');

// Test the route directly with isolated, valid image data; no backend, HALCON,
// dataset writes, or network requests are needed.
const filename = path.resolve(__dirname, '../src/app/api/image/route.ts');
const compiled = new Module(filename, module);
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true },
}).outputText + '\nexports.testImageCache = ImageCache;\n', filename);
const { GET, testImageCache: ImageCache } = compiled.exports;
const originalFetch = global.fetch;
const originalBase = process.env.BACKEND_API_URL;
const originalNow = Date.now;
let now = originalNow();
let calls = 0;
let handler;
const urls = [];
const request = (sample = 'sample-1', extra = '', headers) => new NextRequest(
  `http://localhost/api/image?datasetId=dataset-1&sampleId=${sample}&channel=h${extra}`, { headers },
);

async function main() {
  const png = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#7697ac' } }).png().toBuffer();
  const smallWebp = await sharp(png).resize({ width: 384 }).webp({ quality: 80 }).toBuffer();
  handler = async () => new Response(png, { headers: { 'Content-Type': 'image/png' } });
  global.fetch = async (url, options) => {
    calls++;
    urls.push(String(url));
    assert.equal(options.cache, 'no-store');
    return handler(String(url));
  };
  process.env.BACKEND_API_URL = 'http://mock-image-backend/api/v1';
  Date.now = () => now;

  const full = await GET(request());
  assert.equal(full.status, 200);
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), png, 'Canvas bytes must remain unchanged.');
  assert.equal(full.headers.get('content-type'), 'image/png');
  assert.equal(full.headers.get('cache-control'), 'private, max-age=300, must-revalidate');
  assert.equal(calls, 1);
  const fullEtag = full.headers.get('etag');
  assert.match(fullEtag, /^"[A-Za-z0-9_-]+"$/);
  assert.equal((await GET(request())).status, 200);
  assert.equal(calls, 1, 'Repeated canvas requests must reuse the process cache.');
  for (const etag of [fullEtag, `W/${fullEtag}`, `"other", ${fullEtag}`, '*']) {
    const response = await GET(request('sample-1', '', { 'If-None-Match': etag }));
    assert.equal(response.status, 304);
    assert.equal((await response.arrayBuffer()).byteLength, 0);
  }
  assert.equal(calls, 1);

  const thumbnail = await GET(request('sample-1', '&thumbnail=1'));
  const thumbnailBytes = Buffer.from(await thumbnail.arrayBuffer());
  const metadata = await sharp(thumbnailBytes).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 384);
  assert.equal(metadata.height, 256);
  assert.equal(thumbnail.headers.get('content-type'), 'image/webp');
  assert.equal(calls, 2, 'Full and thumbnail variants must never share their byte cache.');
  assert.match(urls.at(-1), /\.png\?width=384&format=webp$/);
  assert.equal((await GET(request('sample-1', '&thumbnail=1'))).status, 200);
  assert.equal(calls, 2);
  assert.equal((await GET(request('sample-1', '&thumbnail=0'))).status, 200);
  assert.equal(calls, 2);

  handler = async () => new Response(smallWebp, { headers: { 'Content-Type': 'image/webp' } });
  const optimized = await GET(request('optimized', '&thumbnail=1'));
  assert.deepEqual(Buffer.from(await optimized.arrayBuffer()), smallWebp, 'Already optimized backend thumbnails must not be encoded again.');

  const portrait = await sharp({ create: { width: 600, height: 1200, channels: 3, background: '#333333' } }).png().toBuffer();
  handler = async () => new Response(portrait, { headers: { 'Content-Type': 'image/png' } });
  const portraitResponse = await GET(request('portrait', '&thumbnail=1'));
  const portraitMetadata = await sharp(Buffer.from(await portraitResponse.arrayBuffer())).metadata();
  assert.equal(portraitMetadata.width, 192);
  assert.equal(portraitMetadata.height, 384);

  handler = async () => {
    await new Promise(resolve => setTimeout(resolve, 15));
    return new Response(png, { headers: { 'Content-Type': 'image/png' } });
  };
  const beforeConcurrent = calls;
  const concurrent = await Promise.all(Array.from({ length: 16 }, () => GET(request('concurrent', '&thumbnail=1'))));
  assert.equal(calls, beforeConcurrent + 1, 'Concurrent requests must share one upstream download and encode.');
  const concurrentBodies = await Promise.all(concurrent.map(response => response.arrayBuffer()));
  assert(concurrentBodies.every(body => Buffer.from(body).equals(Buffer.from(concurrentBodies[0]))));

  handler = async () => new Response('missing', { status: 404 });
  const beforeErrors = calls;
  for (let i = 0; i < 2; i++) {
    const missing = await GET(request('missing', '&thumbnail=1'));
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('cache-control'), 'no-store');
  }
  assert.equal(calls, beforeErrors + 2, 'Upstream errors must not become cached images.');
  handler = async () => { throw new Error('/private/filesystem/secret'); };
  const networkError = await GET(request('network-error'));
  assert.equal(networkError.status, 502);
  assert(!(await networkError.text()).includes('/private'));
  handler = async () => new Response('not an image', { headers: { 'Content-Type': 'image/png' } });
  const beforeInvalidImages = calls;
  assert.equal((await GET(request('invalid-image', '&thumbnail=1'))).status, 502);
  assert.equal((await GET(request('invalid-image', '&thumbnail=1'))).status, 502);
  assert.equal(calls, beforeInvalidImages + 2);

  const beforeInvalidParams = calls;
  for (const query of [
    'sampleId=sample&channel=h',
    'datasetId=..&sampleId=sample&channel=h',
    'datasetId=test%2Fchild&sampleId=sample&channel=h',
    'datasetId=test%5Cchild&sampleId=sample&channel=h',
    'datasetId=test%00&sampleId=sample&channel=h',
    'datasetId=test&sampleId=sample&channel=h&thumbnail=yes',
    'datasetId=test&sampleId=sample&channel=h&channel=d',
    `datasetId=${'x'.repeat(257)}&sampleId=sample&channel=h`,
  ]) assert.equal((await GET(new NextRequest(`http://localhost/api/image?${query}`))).status, 400, query);
  assert.equal(calls, beforeInvalidParams, 'Invalid parameters must not reach the backend.');

  handler = async () => new Response(png, { headers: { 'Content-Type': 'image/png' } });
  process.env.BACKEND_API_URL = 'http://different-image-backend/api/v1';
  const beforeBackendChange = calls;
  assert.equal((await GET(request())).status, 200);
  assert.equal(calls, beforeBackendChange + 1, 'Changing backend must isolate cached images.');
  now += 5 * 60 * 1000 + 1;
  assert.equal((await GET(request())).status, 200);
  assert.equal(calls, beforeBackendChange + 2, 'Expired images must be revalidated upstream.');

  // Exercise the same production cache with tiny bounds rather than filling RAM.
  const cache = new ImageCache(16, 2);
  const entry = size => ({ body: new Uint8Array(size), contentType: 'image/png', etag: '"test"', expiresAt: now + 1000 });
  cache.set('a', entry(4));
  cache.set('b', entry(4));
  assert(cache.get('a'));
  cache.set('c', entry(4));
  assert.equal(cache.get('b'), undefined, 'Least recently used entries must be evicted.');
  cache.set('oversized', entry(5));
  assert.equal(cache.get('oversized'), undefined, 'Oversized entries must not be retained.');
  now += 1001;
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('c'), undefined);
  const byteCache = new ImageCache(16, 20);
  for (let i = 0; i < 5; i++) byteCache.set(String(i), entry(4));
  assert.equal(byteCache.get('0'), undefined, 'Byte limits must evict even below the entry-count limit.');
  assert(byteCache.get('4'));

  console.log('Image proxy checks passed: exact canvas bytes, WebP/portrait thumbnails, coalescing, ETag/304, bounded LRU, TTL, errors, and parameter validation.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch;
  Date.now = originalNow;
  if (originalBase === undefined) delete process.env.BACKEND_API_URL;
  else process.env.BACKEND_API_URL = originalBase;
});
