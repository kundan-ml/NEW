import {api,previewUrl} from './api';

const previews=new WeakMap<File,Blob>();
export async function createLocalImagePreview(file:File,signal:AbortSignal):Promise<string>{
  if(signal.aborted)throw new DOMException('Preview cancelled','AbortError');
  if(!/\.tiff?$/i.test(file.name))return URL.createObjectURL(file);
  const cached=previews.get(file);
  if(cached)return URL.createObjectURL(cached);
  // TIFFs can exceed a hosted frontend's single-request body limit. Reuse
  // the bounded setup upload path; setup images never enter WT history.
  if(file.size>3*1024*1024)return backendPreview(file,signal);
  const body=new FormData();
  body.append('file',file);
  const response=await fetch('/api/local-image-preview',{method:'POST',body,signal});
  if(!response.ok){
    const detail=await response.json().catch(()=>null) as {detail?:string}|null;
    if([413,415,422].includes(response.status))return backendPreview(file,signal);
    throw new Error(detail?.detail||`Could not prepare TIFF preview (HTTP ${response.status}).`);
  }
  const blob=await response.blob();previews.set(file,blob);
  return URL.createObjectURL(blob);
}

async function backendPreview(file:File,signal:AbortSignal):Promise<string>{
  const dataset=await api.uploadSetupPreview(file,signal);
  const sample=dataset.samples?.[0];
  if(!sample?.images.h)throw new Error('The backend could not prepare this TIFF preview.');
  const response=await fetch(previewUrl(dataset.id,sample.id,'h'),{signal});
  if(!response.ok)throw new Error(`Could not load TIFF preview (HTTP ${response.status}).`);
  const blob=await response.blob();previews.set(file,blob);
  return URL.createObjectURL(blob);
}

export function downloadLocalImage(file:File,name=file.name):void{
  const url=URL.createObjectURL(file);
  const link=document.createElement('a');
  link.href=url;
  link.download=name;
  link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
