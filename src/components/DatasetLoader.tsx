'use client';

import {useEffect,useRef,useState} from 'react';
import {FolderInput,FolderUp,Loader2,X} from 'lucide-react';
import {api} from '@/lib/api';

export function DatasetLoader({open,onClose,onLoaded}:{open:boolean;onClose:()=>void;onLoaded:(id:string)=>void}){
  const[path,setPath]=useState('');
  const[name,setName]=useState('Inspection lot');
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState('');
  const inputRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{
    if(!open)return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy)onClose()};
    window.addEventListener('keydown',close);
    return()=>window.removeEventListener('keydown',close);
  },[open,busy,onClose]);

  if(!open)return null;

  async function loadPath(){
    setBusy(true);setErr('');
    try{
      const d=await api.loadPath(path,name);
      onLoaded(d.id);
      onClose();
    }catch(e){
      setErr((e as Error).message);
    }finally{
      setBusy(false);
    }
  }

  async function upload(files:FileList|null){
    if(!files?.length)return;
    setBusy(true);setErr('');
    try{
      const d=await api.uploadFolder(files,name);
      onLoaded(d.id);
      onClose();
    }catch(e){
      setErr((e as Error).message);
    }finally{
      setBusy(false);
    }
  }

  const dirProps={webkitdirectory:'',directory:''} as any;

  return <div className="modalBack uploadModalBack" onMouseDown={()=>{if(!busy)onClose()}}>
    <div className="modernModal uploadModalWindow" role="dialog" aria-modal="true" aria-labelledby="upload-folder-title" onMouseDown={event=>event.stopPropagation()}>
      <button className="modalClose" onClick={onClose} aria-label="Close upload folder"><X/></button>
      <div className="modalBadge"><FolderInput/></div>
      <span className="eyebrowText">IMAGE DATASET</span>
      <h2 id="upload-folder-title">Upload inspection image folder</h2>
      <p>Select a complete folder from this computer or provide a path available to the inspection server. Every upload creates a new lot in WT History. Automatic mode starts inference immediately after import.</p>

      <label>Dataset name
        <input value={name} onChange={e=>setName(e.target.value)}/>
      </label>

      <label>Folder path on backend machine
        <div className="modalInline">
          <input placeholder="/media/k/ML-PROJECTS/OAKLIN-PROJECT/DATA/Multiple Class" value={path} onChange={e=>setPath(e.target.value)}/>
          <button onClick={loadPath} disabled={busy||!path}>{busy?<Loader2 className="spin"/>:<FolderInput/>}Load</button>
        </div>
      </label>

      <div className="orLine"><span>OR</span></div>

      <input ref={inputRef} type="file" multiple {...dirProps} hidden onChange={e=>upload(e.target.files)}/>
      <button className="uploadFolder" onClick={()=>inputRef.current?.click()} disabled={busy}>{busy?<Loader2 className="spin"/>:<FolderUp/>}{busy?'Importing image folder…':'Choose and upload image folder'}</button>

      {err&&<div className="errorBox">{err}</div>}

      <div className="formatLegend">
        <span><b>BMP / TIF</b> Inspection images</span>
        <span><b>#1–#4</b> Camera channels</span>
        <span><b>Folders</b> Defect classes</span>
        <span><b>WT</b> Admin-configured positions</span>
      </div>
    </div>
  </div>;
}
