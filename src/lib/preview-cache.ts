type CachedPreview = { blob: Blob; expiresAt: number };

const previewCache = new Map<string, CachedPreview>();
const pendingPreviews = new Map<string, Promise<Blob>>();
const MAX_PREVIEWS = 160;
const MAX_PREVIEW_BYTES = 48 * 1024 * 1024;
const PREVIEW_TTL_MS = 5 * 60 * 1000;
let cacheBytes = 0;

function removePreview(url: string): void {
  const entry = previewCache.get(url);
  if (entry) cacheBytes -= entry.blob.size;
  previewCache.delete(url);
}

function observeRequest(request: Promise<Blob>, signal?: AbortSignal): Promise<Blob> {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(new DOMException('Preview request cancelled', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Preview request cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    request.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

// Canvas view persistence must use a stable frame identity, never a blob URL.
export function resolvedPreviewUrl(url: string): string { return url; }

export function fetchPreviewBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  if (signal?.aborted) return Promise.reject(new DOMException('Preview request cancelled', 'AbortError'));
  const cached = previewCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    previewCache.delete(url);
    previewCache.set(url, cached);
    return Promise.resolve(cached.blob);
  }
  if (cached) removePreview(url);
  const pending = pendingPreviews.get(url);
  if (pending) return observeRequest(pending, signal);
  // Cancel consumers independently; another canvas may share this download.
  const request = fetch(url, { cache: 'default', signal: AbortSignal.timeout(15000) })
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
    }).finally(() => pendingPreviews.delete(url));
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
      try { await fetchPreviewBlob(url, signal); } catch { /* Visible images can retry normally. */ }
    }
  }));
}
