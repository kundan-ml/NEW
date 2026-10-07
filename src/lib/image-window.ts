'use client';

// Called directly from a user gesture so popup blocking remains predictable.
export function openImageWindow(src:string|undefined,title:string):boolean{
  if(!src)return false;
  const popup=window.open('','_blank','popup,width=1100,height=850');
  if(!popup)return false;
  popup.opener=null;
  const document=popup.document;
  document.title=title;
  document.body.style.cssText='margin:0;background:#000;color:#fff;font:14px system-ui;height:100vh;display:flex;flex-direction:column';
  const caption=document.createElement('header');caption.textContent=title;
  caption.style.cssText='padding:14px 18px;background:#17191d;flex:none';
  const image=document.createElement('img');image.alt=title;image.src=src;
  image.style.cssText='width:100%;min-height:0;flex:1;object-fit:contain';
  document.body.replaceChildren(caption,image);
  return true;
}

export function downloadBlob(blob:Blob,filename:string){
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=filename;link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),30000);
}
