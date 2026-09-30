export async function createLocalImagePreview(file:File,signal:AbortSignal):Promise<string>{
  if(!/\.tiff?$/i.test(file.name))return URL.createObjectURL(file);
  const body=new FormData();
  body.append('file',file);
  const response=await fetch('/api/local-image-preview',{method:'POST',body,signal});
  if(!response.ok){
    const detail=await response.json().catch(()=>null) as {detail?:string}|null;
    throw new Error(detail?.detail||`Could not prepare TIFF preview (HTTP ${response.status}).`);
  }
  return URL.createObjectURL(await response.blob());
}

export function downloadLocalImage(file:File,name=file.name):void{
  const url=URL.createObjectURL(file);
  const link=document.createElement('a');
  link.href=url;
  link.download=name;
  link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
