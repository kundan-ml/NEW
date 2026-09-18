import type {DatasetSummary,InspectionResult,Job,LogRow,Sample,SystemInfo,StorageRuntime} from '@/types';
export const API=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000/api/v1';
export const WS_API=API.replace(/^http/,'ws');
async function request<T>(path:string,init?:RequestInit):Promise<T>{
  const controller=new AbortController();
  const isUpload=typeof FormData!=='undefined'&&init?.body instanceof FormData;
  const timeout=window.setTimeout(()=>controller.abort(),isUpload?120000:20000);
  try{
    const r=await fetch(`${API}${path}`,{...init,signal:init?.signal||controller.signal,headers:{...(isUpload?{}:{'Content-Type':'application/json'}),...(init?.headers||{})},cache:'no-store'});
    if(!r.ok){let msg=`HTTP ${r.status}`;try{const j=await r.json();msg=j.detail||j.message||JSON.stringify(j)}catch{}throw new Error(msg)}
    const ct=r.headers.get('content-type')||'';return (ct.includes('application/json')?await r.json():await r.text()) as T;
  }catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw new Error('Request timed out. Check the FastAPI backend connection.');throw error}
  finally{window.clearTimeout(timeout)}
}
export const api={
 system:()=>request<SystemInfo>('/system/info'),capabilities:()=>request<any[]>('/system/capabilities'),setMode:(mode:'AUTO'|'SETUP')=>request<any>('/system/mode',{method:'POST',body:JSON.stringify({mode})}),
 login:(username:string,role:string)=>request<any>('/auth/login',{method:'POST',body:JSON.stringify({username,role,password:''})}),logout:()=>request<any>('/auth/logout',{method:'POST'}),
 version:()=>request<any>('/system/version'),timeoutTable:()=>request<any>('/system/timeout-table'),folderStructure:()=>request<any>('/system/folder-structure'),
 datasets:()=>request<DatasetSummary[]>('/datasets'),samples:(id:string)=>request<{total:number;items:Sample[]}>(`/datasets/${id}/samples?limit=1000`),results:(id:string)=>request<{items:InspectionResult[]}>(`/results/${id}?limit=1000`),
 loadPath:(path:string,name?:string)=>request<any>('/datasets/from-path',{method:'POST',body:JSON.stringify({path,name})}),uploadFolder:async(files:FileList,name:string)=>{const fd=new FormData();Array.from(files).forEach(f=>{fd.append('files',f);fd.append('relative_paths',(f as File&{webkitRelativePath?:string}).webkitRelativePath||f.name)});fd.append('name',name);return request<any>('/datasets/upload-folder',{method:'POST',body:fd})},
 inspectOne:(did:string,sid:string,channels?:string[])=>request<InspectionResult>(`/inspect/${did}/sample/${sid}`,{method:'POST',body:JSON.stringify({channels,lens_type:'AUTO'})}),run:(did:string,channels?:string[],lensType='AUTO',script?:string)=>request<Job>(`/inspect/${did}/run`,{method:'POST',body:JSON.stringify({channels,delay_ms:100,lens_type:lensType,script})}),job:(id:string)=>request<Job>(`/jobs/${id}`),cancel:(id:string)=>request<Job>(`/jobs/${id}/cancel`,{method:'POST'}),
 logs:()=>request<{items:LogRow[]}>('/logs?limit=250'),snapshot:(did:string,sid:string,channel:string)=>request<any>('/actions/snapshot',{method:'POST',body:JSON.stringify({dataset_id:did,sample_id:sid,channel})}),archiveRing:(did:string,wt:number)=>request<any>('/history/archive-ring-buffer',{method:'POST',body:JSON.stringify({dataset_id:did,wt_index:wt})}),
 getCamera:()=>request<any>('/setup/camera'),saveCamera:(v:any)=>request<any>('/setup/camera',{method:'PUT',body:JSON.stringify(v)}),getCameraSystem:()=>request<any>('/setup/camera-system'),saveCameraSystem:(v:any)=>request<any>('/setup/camera-system',{method:'PUT',body:JSON.stringify(v)}),
 getSettings:()=>request<any>('/system/settings'),saveSettings:(v:any)=>request<any>('/system/settings',{method:'PUT',body:JSON.stringify(v)}),getFilters:()=>request<any>('/config/image-filters'),saveFilters:(v:any)=>request<any>('/config/image-filters',{method:'PUT',body:JSON.stringify(v)}),errorMap:()=>request<any>('/config/error-map'),
 storageState:()=>request<StorageRuntime>('/storage/state'),storageStart:()=>request<StorageRuntime>('/storage/start',{method:'POST'}),storageStop:()=>request<StorageRuntime>('/storage/stop',{method:'POST'}),
 focus:(did:string,sid:string,channel:string,tab='general')=>request<any>('/setup/focus-check',{method:'POST',body:JSON.stringify({dataset_id:did,sample_id:sid,channel,tab})}),getFocusConfig:()=>request<any>('/setup/focus-config'),saveFocusConfig:(v:any)=>request<any>('/setup/focus-config',{method:'PUT',body:JSON.stringify(v)}),
 registrationRun:(did:string,sid:string,head=1)=>request<any>('/registration/run',{method:'POST',body:JSON.stringify({dataset_id:did,sample_id:sid,camera_head:head})}),registrationCurrent:()=>request<any>('/registration/current'),registrationOutbox:()=>request<any>('/registration/save-outbox',{method:'POST'}),registrationInbox:()=>request<any>('/registration/direct-inbox',{method:'POST'}),
 bvScripts:()=>request<any>('/bv/scripts')
};
export const previewUrl=(did:string,sid:string,ch:string)=>`/api/image?datasetId=${encodeURIComponent(did)}&sampleId=${encodeURIComponent(sid)}&channel=${encodeURIComponent(ch)}`;
export const samplePreviewUrl=(did:string,sample:Sample,ch:string)=>sample.images[ch]?.relative_path?.startsWith('demo:')?sample.images[ch].relative_path:previewUrl(did,sample.id,ch);
export const archiveUrl=(did:string)=>`${API}/actions/archive/${did}`;
export const manualUrl=()=>`${API}/system/manual`;
export const focusValuesUrl=(did:string,sid:string,ch:string,tab:string)=>`${API}/setup/focus/save-values`; // POST endpoint; use api helper if needed
export const dataPackageUrl=()=>`${API}/setup/data-package`;
