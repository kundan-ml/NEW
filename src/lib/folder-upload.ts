/** Keep binary requests below Vercel's 4.5 MB and Cloudflare's body limits. */
export type UploadProgress = (uploadedBytes: number, totalBytes: number) => void;
export type UploadRequest = <T>(path: string, init?: RequestInit, timeoutMs?: number) => Promise<T>;
export const FOLDER_MULTIPART_THRESHOLD = 3 * 1024 * 1024;
const MAX_CHUNK_BYTES = 2 * 1024 * 1024;
const statusOf = (error: unknown) => error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 0;

export function needsChunkUpload(form: FormData): boolean {
  const files = form.getAll('files');
  const paths = form.getAll('relative_paths');
  const estimated = files.reduce<number>((total, file, index) => total
    + (typeof file === 'string' ? file.length * 4 : file.size + file.name.length * 4)
    + String(paths[index] || '').length * 4 + 1024, 0);
  return estimated > FOLDER_MULTIPART_THRESHOLD;
}

export async function uploadFolderInChunks<T>(form: FormData, send: UploadRequest, progress?: UploadProgress): Promise<T> {
  const entries = form.getAll('files');
  const paths = form.getAll('relative_paths');
  if (!entries.length || entries.length !== paths.length || entries.some(file => typeof file === 'string')) {
    throw new Error('The selected folder has invalid image paths. Select the folder again.');
  }
  const files = entries as File[];
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (files.some(file => !file.size)) throw new Error('The selected folder contains an empty image file.');
  const purpose = String(form.get('purpose') || 'inspection');
  progress?.(0, totalBytes);
  let session: { upload_id: string; chunk_bytes: number };
  try {
    session = await send('/datasets/uploads', { method: 'POST', body: JSON.stringify({
      name: String(form.get('name') || 'Inspection lot'), purpose,
      file_count: files.length, total_bytes: totalBytes, include_samples: purpose === 'setup' && files.length <= 4,
    }) });
  } catch (error) {
    if ([404,405].includes(statusOf(error)) || (error instanceof Error && /HTTP (404|405)|Not Found|Method Not Allowed/i.test(error.message))) {
      throw new Error('Large-folder upload requires the updated backend. Copy app/api/chunk_uploads.py and app/api/routes.py to the backend PC, then restart it when inspection is idle.');
    }
    throw error;
  }
  if (!/^[a-f0-9]{32}$/.test(session.upload_id) || !Number.isSafeInteger(session.chunk_bytes) || session.chunk_bytes <= 0) {
    throw new Error('The backend returned an invalid upload session.');
  }
  const chunkBytes = Math.min(MAX_CHUNK_BYTES, session.chunk_bytes);
  let uploaded = 0;
  // Retry only replay-safe chunk/finish requests. The server verifies duplicate
  // byte ranges; retrying finish returns the same dataset, never a second lot.
  async function retry<R>(path: string, init: RequestInit): Promise<R> {
    for (let attempt = 0; ; attempt++) {
      try { return await send<R>(path, init, 120000); }
      catch (error) {
        const message = error instanceof Error ? error.message : '';
        const status = statusOf(error);
        if (attempt >= 2 || (status >= 400 && status < 500 && status !== 408 && status !== 429)
          || /HTTP 4\d\d|too large|incomplete|unknown upload|no longer exists|offset|conflict/i.test(message)) throw error;
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      for (let offset = 0; offset < file.size; offset += chunkBytes) {
        const chunk = file.slice(offset, Math.min(file.size, offset + chunkBytes));
        const query = new URLSearchParams({ path: String(paths[index]), size: String(file.size), offset: String(offset) });
        const reply = await retry<{ next_offset: number }>(`/datasets/uploads/${session.upload_id}/files/${index}?${query}`, {
          method: 'PUT', body: chunk, headers: { 'Content-Type': 'application/octet-stream' },
        });
        if (reply.next_offset !== offset + chunk.size) throw new Error('The backend did not acknowledge the complete image chunk. Please select the folder again.');
        uploaded += chunk.size;
        progress?.(uploaded, totalBytes);
      }
    }
    return await retry<T>(`/datasets/uploads/${session.upload_id}/finish`, { method: 'POST' });
  } catch (error) {
    // Only abandon this private upload, never published history. The backend
    // also protects a completed dataset if its finish response was lost.
    await send(`/datasets/uploads/${session.upload_id}`, { method: 'DELETE' }, 10000).catch(() => {});
    throw error;
  }
}
