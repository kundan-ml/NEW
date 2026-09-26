const previewCache=new Map<string,string>();
const pendingPreviews=new Map<string,Promise<string>>();
const MAX_PREVIEWS=96;

export function resolvedPreviewUrl(url:string){return previewCache.get(url)||url}

export function primePreview(url:string):Promise<string>{
  const cached=previewCache.get(url);if(cached)return Promise.resolve(cached);
  const pending=pendingPreviews.get(url);if(pending)return pending;
  const request=fetch(url,{cache:'no-store'}).then(async response=>{
    if(!response.ok)throw new Error(`Preview request failed (${response.status})`);
    const objectUrl=URL.createObjectURL(await response.blob());
    previewCache.set(url,objectUrl);
    while(previewCache.size>MAX_PREVIEWS){const oldest=previewCache.entries().next().value as [string,string]|undefined;if(!oldest)break;previewCache.delete(oldest[0]);URL.revokeObjectURL(oldest[1])}
    return objectUrl;
  }).finally(()=>pendingPreviews.delete(url));
  pendingPreviews.set(url,request);return request;
}
