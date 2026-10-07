import type {DatasetSummary,InspectionResult,InspectionHeartbeat,InspectionStreamCursor,LiveInspectionSnapshot,Job,LogRow,RegistrationResult,Sample,StatusSymbolLegend,SystemInfo,StorageRuntime} from '@/types';
import {resolvedPreviewUrl} from './preview-cache';
import {needsChunkUpload, uploadFolderInChunks, type UploadProgress} from './folder-upload';
/** Complete machine settings are preserved when PUT replaces the backend object. */
export interface MachineSettings extends Record<string,unknown>{
 plc_ams_net_id:string;plc_port:number;triggerbox_ip:string;autologoff_minutes:number;
 spc_image_path:string;csv_memory_interval_minutes:number;csv_memory_enabled:boolean;
 csv_retention_minutes:number;image_format:'BMP'|'TIF';camera_trigger_pulse_distance_ms:number;
 image_processing_timeout_ms:number;
}
const backendApi=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000/api/v1';
// The web server, not each operator's PC, resolves the inspection backend.
// This also keeps HTTPS deployments free of mixed-content HTTP API calls.
export const API=typeof window==='undefined'?backendApi:'/api/backend';

export function sharedInspectionSocketUrl():string|null{
  if(typeof window==='undefined')return null;
  try{
    const url=new URL(process.env.NEXT_PUBLIC_WS_URL||backendApi,window.location.origin);
    if(!['http:','https:','ws:','wss:'].includes(url.protocol)||url.username||url.password)return null;
    const loopback=(hostname:string)=>hostname==='localhost'||hostname==='127.0.0.1'||hostname==='[::1]'||hostname==='::1';
    // A LAN browser must never connect to its own localhost:8000. For local
    // installations the frontend and inspection service share the server host.
    if(loopback(url.hostname)&&!loopback(window.location.hostname))url.hostname=window.location.hostname;
    url.protocol=url.protocol==='https:'||url.protocol==='wss:'?'wss:':'ws:';
    // Next's HTTP proxy cannot tunnel WebSocket upgrades. On HTTPS with a plain
    // HTTP backend callers use the same-origin snapshot fallback instead.
    if(window.location.protocol==='https:'&&url.protocol!=='wss:')return null;
    url.search='';url.hash='';
    return `${url.toString().replace(/\/+$/,'')}/ws/inspection`;
  }catch{return null}
}

const socketUrl=sharedInspectionSocketUrl();
export const WS_API=socketUrl?socketUrl.replace(/\/ws\/inspection$/,''):'';
class ApiRequestError extends Error{
  constructor(message:string,readonly status:number){super(message);this.name='ApiRequestError'}
}
async function request<T>(path:string,init?:RequestInit,timeoutMs?:number):Promise<T>{
  if(path==='/datasets/upload-folder'&&init?.body instanceof FormData&&needsChunkUpload(init.body))return uploadFolderInChunks<T>(init.body,(chunkPath,chunkInit,chunkTimeout)=>request(chunkPath,{...chunkInit,signal:chunkInit?.method==='DELETE'?undefined:init.signal || chunkInit?.signal},chunkTimeout));
  const controller=new AbortController();
  const isUpload=typeof FormData!=='undefined'&&init?.body instanceof FormData;
  const timeout=window.setTimeout(()=>controller.abort(),timeoutMs??(isUpload?120000:20000));
  try{
    const r=await fetch(`${API}${path}`,{...init,signal:init?.signal||controller.signal,headers:{...(isUpload?{}:{'Content-Type':'application/json'}),...(init?.headers||{})},cache:'no-store'});
    if(!r.ok){let msg=`HTTP ${r.status}`;try{const j=await r.json();const detail=j.detail||j.message||j;msg=typeof detail==='string'?detail:JSON.stringify(detail)}catch{}if(r.status===413)msg='Upload rejected: a request exceeded the hosting or backend size limit. Redeploy the updated frontend/backend for chunked folder uploads, or check MAX_UPLOAD_MB on the backend.';throw new ApiRequestError(msg,r.status)}
    const ct=r.headers.get('content-type')||'';return (ct.includes('application/json')?await r.json():await r.text()) as T;
  }catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw new Error('Request timed out. Check the FastAPI backend connection.');throw error}
  finally{window.clearTimeout(timeout)}
}
export const api={
 uploadSetupPreview:(file:File,signal:AbortSignal)=>{
   const form=new FormData();const extension=file.name.split('.').pop()?.toLowerCase() || 'tif';
   const name=`SetupPreview#1.${extension}`;
   form.append('files',file,name);form.append('relative_paths',name);
   form.append('purpose','setup');form.append('name','Setup image preview');
   return request<{id:string;samples:Sample[]}>('/datasets/upload-folder',{method:'POST',body:form,signal});
 },
 liveInspection:(cursor?:InspectionStreamCursor,signal?:AbortSignal)=>request<LiveInspectionSnapshot|InspectionHeartbeat>(`/inspection/live${cursor?`?stream_id=${encodeURIComponent(cursor.stream_id)}&after_sequence=${cursor.sequence}`:''}`,{signal}),
 system:()=>request<SystemInfo>('/system/info'),capabilities:()=>request<any[]>('/system/capabilities'),setMode:async(mode:'AUTO'|'SETUP')=>{const result=await request<{mode:'AUTO'|'SETUP'}>('/system/mode',{method:'POST',body:JSON.stringify({mode})});window.dispatchEvent(new Event('lens-system-changed'));return result},
 login:(username:string,password:string)=>request<any>('/auth/login',{method:'POST',body:JSON.stringify({username,password})}),logout:()=>request<any>('/auth/logout',{method:'POST'}),
 createUser:(username:string,password:string,role:'Operator'|'Tester')=>request<{username:string;role:string}>('/auth/users',{method:'POST',body:JSON.stringify({username,password,role})}),
 version:()=>request<any>('/system/version'),timeoutTable:()=>request<any>('/system/timeout-table'),folderStructure:()=>request<any>('/system/folder-structure'),
 trayLayout:()=>request<{images_per_tray:number;supported_images_per_tray:number[]}>('/system/tray-layout'),setWtCapacity:(capacity:number)=>request<{capacity:number;supported:number[]}>('/system/wt-capacity',{method:'PUT',body:JSON.stringify({capacity})}),
 datasets:async()=>{const rows=await request<DatasetSummary[]>('/datasets');return rows.filter(row=>row.source_type!=='setup-upload'&&!(row.source_type==='upload'&&/^(?:Registration|Focus Check) · Camera Head [1-4]$/.test(row.name)))},samples:(id:string,limit=1000)=>request<{total:number;items:Sample[]}>(`/datasets/${id}/samples?limit=${limit}`),results:(id:string)=>request<{items:InspectionResult[]}>(`/results/${id}?limit=1000`),
 loadPath:(path:string,name?:string)=>request<any>('/datasets/from-path',{method:'POST',body:JSON.stringify({path,name})}),
 uploadFolder:async(files:FileList,name:string,progress?:UploadProgress)=>{
   const images=Array.from(files).filter(file=>/\.(?:bmp|tiff?)$/i.test(file.name));
   if(!images.length)throw new Error('This folder contains no supported inspection images. Choose a folder with BMP, TIF, or TIFF files.');
   const fd=new FormData();
   for(const file of images){fd.append('files',file);fd.append('relative_paths',(file as File&{webkitRelativePath?:string}).webkitRelativePath||file.name)}
   fd.append('name',name);
   if(needsChunkUpload(fd))return uploadFolderInChunks<DatasetSummary>(fd,request,progress);
   const result=await request<DatasetSummary>('/datasets/upload-folder',{method:'POST',body:fd});
   progress?.(images.reduce((total,file)=>total+file.size,0),images.reduce((total,file)=>total+file.size,0));
   return result;
 },
 uploadBvTestFiles:(files:{file:File;relativePath:string}[],name:string)=>{const fd=new FormData();for(const item of files){fd.append('files',item.file,item.relativePath);fd.append('relative_paths',item.relativePath)}fd.append('name',name);fd.append('purpose','setup');return request<{id:string;name:string;sample_count:number;image_count:number}>('/datasets/upload-folder',{method:'POST',body:fd})},
 inspectOne:(did:string,sid:string,channels?:string[],lensType='AUTO',script?:string)=>request<InspectionResult>(`/inspect/${did}/sample/${sid}`,{method:'POST',body:JSON.stringify({channels,lens_type:lensType,script})}),run:(did:string,channels?:string[],lensType='AUTO',script?:string)=>request<Job>(`/inspect/${did}/run`,{method:'POST',body:JSON.stringify({channels,delay_ms:100,lens_type:lensType,script})}),job:(id:string)=>request<Job>(`/jobs/${id}`),cancel:(id:string)=>request<Job>(`/jobs/${id}/cancel`,{method:'POST'}),
 inspectFrame:(frames:{bright_field:File;dark_field:File;spot:File;phase_contrast:File})=>{const fd=new FormData();Object.entries(frames).forEach(([key,file])=>fd.append(key,file));return request<any>('/inspect/frame',{method:'POST',body:fd})},
 logs:()=>request<{items:LogRow[]}>('/logs?limit=250'),snapshot:(did:string,sid:string,channel:string)=>request<any>('/actions/snapshot',{method:'POST',body:JSON.stringify({dataset_id:did,sample_id:sid,channel})}),archiveRing:(did:string,wt:number)=>request<any>('/history/archive-ring-buffer',{method:'POST',body:JSON.stringify({dataset_id:did,wt_index:wt})}),clearHistory:()=>request<{ok:boolean;removed:Record<string,number>}>('/history/clear',{method:'POST'}),
 getCamera:()=>request<any>('/setup/camera'),saveCamera:(v:any)=>request<any>('/setup/camera',{method:'PUT',body:JSON.stringify(v)}),getCameraSystem:()=>request<any>('/setup/camera-system'),saveCameraSystem:(v:any)=>request<any>('/setup/camera-system',{method:'PUT',body:JSON.stringify(v)}),
 getSettings:()=>request<MachineSettings>('/system/settings'),saveSettings:(v:MachineSettings)=>request<MachineSettings>('/system/settings',{method:'PUT',body:JSON.stringify(v)}),getFilters:()=>request<any>('/config/image-filters'),saveFilters:(v:any)=>request<any>('/config/image-filters',{method:'PUT',body:JSON.stringify(v)}),errorMap:()=>request<any>('/config/error-map'),statusSymbolLegend:()=>request<StatusSymbolLegend>('/config/status-symbol-legend'),saveStatusSymbolLegend:(legend:StatusSymbolLegend)=>request<StatusSymbolLegend>('/config/status-symbol-legend',{method:'PUT',body:JSON.stringify(legend)}),
 storageState:()=>request<StorageRuntime>('/storage/state'),storageStart:()=>request<StorageRuntime>('/storage/start',{method:'POST'}),storageStop:()=>request<StorageRuntime>('/storage/stop',{method:'POST'}),
 focus:(did:string,sid:string,channel:string,tab='general')=>request<any>('/setup/focus-check',{method:'POST',body:JSON.stringify({dataset_id:did,sample_id:sid,channel,tab})}),getFocusConfig:()=>request<any>('/setup/focus-config'),saveFocusConfig:(v:any)=>request<any>('/setup/focus-config',{method:'PUT',body:JSON.stringify(v)}),
 uploadRegistrationImages:(images:Record<'h'|'d'|'p'|'n',File>,head:number)=>{const fd=new FormData();const base=`RegistrationHead${head}_${Date.now()}`;const cameraIndex:{h:number;d:number;n:number;p:number}={h:1,d:2,n:3,p:4};for(const channel of ['h','d','n','p'] as const){const source=images[channel];const extension=source.name.split('.').pop()?.toLowerCase();const normalized=extension==='bmp'?`${base}.${channel}.bmp`:`${base}#${cameraIndex[channel]}.${extension==='tiff'?'tiff':'tif'}`;fd.append('files',source,normalized);fd.append('relative_paths',normalized)}fd.append('name',`Registration · Camera Head ${head}`);fd.append('purpose','setup');return request<{id:string;sample_count:number;samples:Sample[]}>('/datasets/upload-folder',{method:'POST',body:fd})},
 uploadFocusImages:(images:Record<'h'|'d'|'p'|'n',File>,head:number)=>{const fd=new FormData();const base=`FocusHead${head}_${Date.now()}`;const cameraIndex:{h:number;d:number;n:number;p:number}={h:1,d:2,n:3,p:4};for(const channel of ['h','d','n','p'] as const){const source=images[channel];const extension=source.name.split('.').pop()?.toLowerCase();const normalized=extension==='bmp'?`${base}.${channel}.bmp`:`${base}#${cameraIndex[channel]}.${extension==='tiff'?'tiff':'tif'}`;fd.append('files',source,normalized);fd.append('relative_paths',normalized)}fd.append('name',`Focus Check · Camera Head ${head}`);fd.append('purpose','setup');return request<{id:string;sample_count:number;samples:Sample[]}>('/datasets/upload-folder',{method:'POST',body:fd})},
 registrationRun:(did:string,sid:string,head=1)=>request<RegistrationResult>('/registration/run',{method:'POST',body:JSON.stringify({dataset_id:did,sample_id:sid,camera_head:head})}),registrationCurrent:(head=1)=>request<Partial<RegistrationResult>>(`/registration/current?camera_head=${head}`),registrationOutbox:(head=1)=>request<{saved:string}>(`/registration/save-outbox?camera_head=${head}`,{method:'POST'}),registrationInbox:(head=1)=>request<{saved:string}>(`/registration/direct-inbox?camera_head=${head}&confirmed=true`,{method:'POST'}),
 bvScripts:()=>request<any>('/bv/scripts')
};
export const previewUrl=(did:string,sid:string,ch:string)=>`/api/image?datasetId=${encodeURIComponent(did)}&sampleId=${encodeURIComponent(sid)}&channel=${encodeURIComponent(ch)}`;
export const thumbnailUrl=(did:string,sid:string,ch:string)=>`${previewUrl(did,sid,ch)}&thumbnail=1`;
export const samplePreviewUrl=(did:string,sample:Sample,ch:string)=>sample.images[ch]?.relative_path?.startsWith('demo:')?sample.images[ch].relative_path:resolvedPreviewUrl(previewUrl(did,sample.id,ch));
export const sampleThumbnailUrl=(did:string,sample:Sample,ch:string)=>sample.images[ch]?.relative_path?.startsWith('demo:')?sample.images[ch].relative_path:thumbnailUrl(did,sample.id,ch);
export const archiveUrl=(did:string)=>`${API}/actions/archive/${did}`;
export const manualUrl=()=>`${API}/system/manual`;
export const focusValuesUrl=(did:string,sid:string,ch:string,tab:string)=>`${API}/setup/focus/save-values`; // POST endpoint; use api helper if needed
export const dataPackageUrl=()=>`${API}/setup/data-package`;
