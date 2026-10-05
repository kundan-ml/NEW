const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Exercise the production TypeScript module in Node with isolated downloads.
// No browser, backend, HALCON, filesystem writes, or network access is needed.
const filename = path.resolve(__dirname, '../src/lib/preview-cache.ts');
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
}).outputText;
const originalFetch = global.fetch;
const originalNow = Date.now;
let now = originalNow();
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const response = (blob = new Blob(['preview'])) => ({ ok: true, status: 200, blob: async () => blob });

function harness(handler = async () => response()) {
  const calls = [];
  global.fetch = (url, options) => {
    calls.push({ url, options });
    assert.equal(options.cache, 'default', 'Preview requests should reuse the browser HTTP cache.');
    assert(options.signal instanceof AbortSignal, 'Shared downloads must still have a timeout signal.');
    return handler(url, options);
  };
  const compiled = new Module(filename, module);
  compiled._compile(source, filename);
  return { ...compiled.exports, calls };
}

async function checkCoalescingAndIdentity() {
  const gate = deferred();
  const cache = harness(() => gate.promise);
  const url = '/api/image?datasetId=lot-1&sampleId=lens-1&channel=h';
  const pending = Array.from({ length: 16 }, () => cache.fetchPreviewBlob(url));
  assert.equal(cache.calls.length, 1, 'Sixteen concurrent consumers must share one download.');
  const blob = new Blob(['one shared frame']);
  gate.resolve(response(blob));
  const results = await Promise.all(pending);
  assert(results.every(value => value === blob), 'Every consumer must receive the same cached Blob.');
  assert.equal(await cache.fetchPreviewBlob(url), blob);
  assert.equal(await cache.primePreview(url), url, 'Priming must not replace stable frame identity with a blob URL.');
  assert.equal(cache.resolvedPreviewUrl(url), url);
  assert.equal(cache.calls.length, 1, 'Cached reads and priming must not redownload the frame.');
}

async function checkIndependentCancellation() {
  const gate = deferred();
  const cache = harness(() => gate.promise);
  const controller = new AbortController();
  const cancelled = assert.rejects(cache.fetchPreviewBlob('shared', controller.signal), { name: 'AbortError' });
  const survivor = cache.fetchPreviewBlob('shared');
  controller.abort();
  await cancelled;
  assert.equal(cache.calls.length, 1);
  assert.equal(cache.calls[0].options.signal.aborted, false, 'Cancelling one consumer must not abort another consumer\'s download.');
  const blob = new Blob(['surviving consumer']);
  gate.resolve(response(blob));
  assert.equal(await survivor, blob);
  assert.equal(await cache.fetchPreviewBlob('shared'), blob);
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  await assert.rejects(cache.fetchPreviewBlob('never-start', alreadyAborted.signal), { name: 'AbortError' });
  assert.equal(cache.calls.length, 1, 'Already-cancelled consumers must not initiate network work.');
}

async function checkLastConsumerCancellation() {
  const gates = [];
  const cache = harness((_url, options) => {
    const gate = deferred();
    gates.push(gate);
    options.signal.addEventListener('abort', () => {
      gate.reject(new DOMException('Download cancelled', 'AbortError'));
    }, { once: true });
    return gate.promise;
  });
  const controller = new AbortController();
  const cancelled = assert.rejects(cache.fetchPreviewBlob('obsolete-frame', controller.signal), { name: 'AbortError' });
  controller.abort();
  assert.equal(cache.calls[0].options.signal.aborted, true, 'The last cancelled consumer must release its obsolete download.');
  // Retry immediately, before the cancelled download has settled its promises.
  const retried = cache.fetchPreviewBlob('obsolete-frame');
  assert.equal(cache.calls.length, 2, 'New consumers must not attach to an already-aborted download.');
  await cancelled;
  const blob = new Blob(['fresh retry']);
  gates[1].resolve(response(blob));
  assert.equal(await retried, blob);
  assert.equal(await cache.fetchPreviewBlob('obsolete-frame'), blob);
  assert.equal(cache.calls.length, 2);
}

async function checkErrorRetries() {
  let attempt = 0;
  const cache = harness(async () => {
    attempt++;
    if (attempt === 1) return { ok: false, status: 503 };
    if (attempt === 2) throw new Error('temporary network error');
    return response();
  });
  await assert.rejects(cache.fetchPreviewBlob('retry'), /503/);
  await assert.rejects(cache.fetchPreviewBlob('retry'), /temporary network error/);
  await cache.fetchPreviewBlob('retry');
  await cache.fetchPreviewBlob('retry');
  assert.equal(cache.calls.length, 3, 'Failures must clear in-flight state without poisoning the cache.');
}

async function checkWarmingConcurrency() {
  const gates = [];
  let active = 0;
  let maximum = 0;
  const cache = harness(() => {
    active++;
    maximum = Math.max(maximum, active);
    const gate = deferred();
    gates.push(gate);
    return gate.promise.finally(() => { active--; });
  });
  const urls = Array.from({ length: 15 }, (_, index) => `thumbnail-${index}`);
  const controller = new AbortController();
  const warming = cache.warmPreviews([...urls, urls[0], urls[3]], controller.signal, 3);
  await flush();
  assert.equal(cache.calls.length, 3, 'Background warming must not launch the entire tray at once.');
  while (gates.length) {
    gates.shift().resolve(response());
    await flush();
  }
  await warming;
  assert.equal(cache.calls.length, urls.length, 'Duplicate URLs must not duplicate warming work.');
  assert(maximum <= 3, 'Warming must respect its concurrency limit.');
  assert.equal(active, 0);
  await cache.warmPreviews([], controller.signal, 3);
  assert.equal(cache.calls.length, urls.length);
}

async function checkWarmingCancellation() {
  const gates = [];
  const cache = harness((_url, options) => {
    const gate = deferred();
    gates.push(gate);
    options.signal.addEventListener('abort', () => {
      gate.reject(new DOMException('Download cancelled', 'AbortError'));
    }, { once: true });
    return gate.promise;
  });
  const controller = new AbortController();
  const urls = Array.from({ length: 20 }, (_, index) => `cancel-thumbnail-${index}`);
  const warming = cache.warmPreviews(urls, controller.signal, 3);
  await flush();
  assert.equal(cache.calls.length, 3);
  controller.abort();
  await warming;
  assert.equal(cache.calls.length, 3, 'Cancelling a scope must stop dequeueing later thumbnails.');
  assert(cache.calls.every(call => call.options.signal.aborted), 'Obsolete warm downloads must release their network connections.');
  for (const gate of gates) gate.resolve(response());
  await flush();
  assert.equal(cache.calls.length, 3, 'Shared downloads completing after cancellation must not restart the queue.');
  await cache.warmPreviews(['never-warm'], controller.signal);
  assert.equal(cache.calls.length, 3);
}

async function checkTtlAndEntryLimit() {
  const cache = harness();
  await cache.fetchPreviewBlob('ttl');
  now += 5 * 60 * 1000 - 1;
  await cache.fetchPreviewBlob('ttl');
  assert.equal(cache.calls.length, 1, 'A frame remains cached before expiry.');
  now += 1;
  await cache.fetchPreviewBlob('ttl');
  assert.equal(cache.calls.length, 2, 'Expired frames must be fetched again.');

  const entries = harness();
  for (let index = 0; index < 160; index++) await entries.fetchPreviewBlob(`entry-${index}`);
  await entries.fetchPreviewBlob('entry-0'); // Touch the oldest entry.
  await entries.fetchPreviewBlob('entry-160');
  await entries.fetchPreviewBlob('entry-0');
  assert.equal(entries.calls.length, 161, 'Recently used entries must survive eviction.');
  await entries.fetchPreviewBlob('entry-1');
  assert.equal(entries.calls.length, 162, 'Entry limits must evict the least recently used frame.');
}

async function checkByteLimit() {
  // Only Blob.size is used by this cache. Synthetic size-bearing blobs test
  // memory accounting without allocating hundreds of megabytes for the test.
  const cache = harness(async url => response(Object.freeze({ size: 12 * 1024 * 1024, tag: url })));
  for (let index = 0; index < 4; index++) await cache.fetchPreviewBlob(`large-${index}`);
  await cache.fetchPreviewBlob('large-0');
  await cache.fetchPreviewBlob('large-4');
  await cache.fetchPreviewBlob('large-0');
  assert.equal(cache.calls.length, 5, 'Byte-bound eviction must retain recently used frames.');
  await cache.fetchPreviewBlob('large-1');
  assert.equal(cache.calls.length, 6, 'Byte limits must evict even below the entry-count limit.');

  const oversized = harness(async () => response(Object.freeze({ size: 49 * 1024 * 1024 })));
  await oversized.fetchPreviewBlob('oversized');
  await oversized.fetchPreviewBlob('oversized');
  assert.equal(oversized.calls.length, 2, 'Oversized frames may be served but must not remain in memory.');
}

async function main() {
  Date.now = () => now;
  await checkCoalescingAndIdentity();
  await checkIndependentCancellation();
  await checkLastConsumerCancellation();
  await checkErrorRetries();
  await checkWarmingConcurrency();
  await checkWarmingCancellation();
  await checkTtlAndEntryLimit();
  await checkByteLimit();
  await flush(); // Let consumer-cleanup promises settle before exiting.
  console.log('Preview cache checks passed: concurrent coalescing, canonical URLs, shared/last-consumer cancellation, immediate retries, bounded warming, queue cancellation, TTL, and entry/byte LRU limits.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch;
  Date.now = originalNow;
});
