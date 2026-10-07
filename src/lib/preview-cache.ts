type CachedPreview = { blob: Blob; expiresAt: number };
type PendingPreview = { promise: Promise<Blob>; controller: AbortController; consumers: number };

const previewCache = new Map<string, CachedPreview>();
const pendingPreviews = new Map<string, PendingPreview>();
const decodedPreviews = new Map<string, HTMLImageElement>();
const decodingPreviews = new Map<string, Promise<HTMLImageElement>>();
export function decodedPreview(url: string): HTMLImageElement | undefined { return decodedPreviews.get(url); }
export async function prepareDecodedPreview(url: string): Promise<HTMLImageElement> {
  const cached = decodedPreviews.get(url);
  if (cached) return cached;
  const pending = decodingPreviews.get(url);
  if (pending) return pending;
  const decoding = decodePreview(url);
  decodingPreviews.set(url, decoding);
  try { return await decoding; }
  finally { if(decodingPreviews.get(url)===decoding)decodingPreviews.delete(url); }
}
async function decodePreview(url: string): Promise<HTMLImageElement> {
  const blob = await fetchPreviewBlob(url, undefined, 'high');
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.dataset.previewUrl = url;
    image.src = objectUrl;
    await image.decode();
    decodedPreviews.set(url, image);
    while (decodedPreviews.size > 32) decodedPreviews.delete(decodedPreviews.keys().next().value!);
    return image;
  } finally { URL.revokeObjectURL(objectUrl); }
}
const MAX_PREVIEWS = 160;
const MAX_PREVIEW_BYTES = 48 * 1024 * 1024;
const PREVIEW_TTL_MS = 5 * 60 * 1000;
let cacheBytes = 0;

function removePreview(url: string): void {
  const entry = previewCache.get(url);
  if (entry) cacheBytes -= entry.blob.size;
  previewCache.delete(url);
}

function observeRequest(request: PendingPreview, signal?: AbortSignal): Promise<Blob> {
  if (signal?.aborted) return Promise.reject(new DOMException('Preview request cancelled', 'AbortError'));
  request.consumers += 1;
  return new Promise((resolve, reject) => {
    let settled = false;
    const release = () => {
      if (settled) return false;
      settled = true;
      request.consumers -= 1;
      signal?.removeEventListener('abort', abort);
      return true;
    };
    const abort = () => {
      if (!release()) return;
      reject(new DOMException('Preview request cancelled', 'AbortError'));
      if (request.consumers === 0) request.controller.abort();
    };
    signal?.addEventListener('abort', abort, { once: true });
    request.promise.then(
      blob => { if (release()) resolve(blob); },
      error => { if (release()) reject(error); },
    );
  });
}

// Canvas view persistence must use a stable frame identity, never a blob URL.
export function resolvedPreviewUrl(url: string): string { return url; }

export function fetchPreviewBlob(url: string, signal?: AbortSignal, priority: 'high'|'low'|'auto' = 'auto'): Promise<Blob> {
  if (signal?.aborted) return Promise.reject(new DOMException('Preview request cancelled', 'AbortError'));
  const cached = previewCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    previewCache.delete(url);
    previewCache.set(url, cached);
    return Promise.resolve(cached.blob);
  }
  if (cached) removePreview(url);
  const pending = pendingPreviews.get(url);
  if (pending && !pending.controller.signal.aborted) return observeRequest(pending, signal);
  const controller = new AbortController();
  // Cancel obsolete tray work only when no canvas/preloader still needs it.
  const request: PendingPreview = { controller, consumers: 0, promise: Promise.resolve(new Blob()) };
  request.promise = fetch(url, { cache: 'default', priority, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
    .then(async response => {
      if (!response.ok) throw new Error(`Preview request failed (${response.status})`);
      const blob = await response.blob();
      if (blob.size <= MAX_PREVIEW_BYTES) {
        removePreview(url);
        previewCache.set(url, { blob, expiresAt: Date.now() + PREVIEW_TTL_MS });
        cacheBytes += blob.size;
        while (previewCache.size > MAX_PREVIEWS || cacheBytes > MAX_PREVIEW_BYTES) {
          const oldest = previewCache.keys().next().value;
          if (!oldest) break;
          removePreview(oldest);
        }
      }
      return blob;
    }).finally(() => { if (pendingPreviews.get(url) === request) pendingPreviews.delete(url); });
  pendingPreviews.set(url, request);
  return observeRequest(request, signal);
}

export async function primePreview(url: string): Promise<string> {
  await fetchPreviewBlob(url);
  return url;
}

// Bounded background work leaves connections available for the main canvas.
export async function warmPreviews(urls: readonly string[], signal: AbortSignal, concurrency = 3): Promise<void> {
  const queue = [...new Set(urls)];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), queue.length) }, async () => {
    while (!signal.aborted && next < queue.length) {
      const url = queue[next++];
      try { await fetchPreviewBlob(url, signal, 'low'); } catch { /* Visible images can retry normally. */ }
    }
  }));
}
