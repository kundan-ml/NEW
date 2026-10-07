import {manualUrl} from './api';

/** Open the bundled manual, reporting a missing document instead of a blank tab. */
export async function openManual():Promise<void>{
  const viewer=window.open('about:blank','_blank');
  if(viewer)viewer.opener=null;
  try{
    const response=await fetch(manualUrl(),{signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error(response.status===404?'The English manual is not available on the backend. Ask the administrator to bundle it.':`Could not open the manual (HTTP ${response.status}).`);
    const blob=await response.blob();
    if(!response.headers.get('content-type')?.includes('application/pdf'))throw new Error('The backend did not return a PDF manual.');
    const url=URL.createObjectURL(blob);
    if(viewer)viewer.location.replace(url);
    else{const download=document.createElement('a');download.href=url;download.download='Inspection-manual.pdf';document.body.appendChild(download);download.click();download.remove()}
    window.setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(error){viewer?.close();throw error instanceof Error?error:new Error('The manual could not be loaded.')}
}
