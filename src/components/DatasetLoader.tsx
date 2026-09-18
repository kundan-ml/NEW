'use client';

import {useRef,useState} from 'react';
import {FolderInput,FolderUp,Loader2,X} from 'lucide-react';
import {api} from '@/lib/api';

export function DatasetLoader({open,onClose,onLoaded}:{open:boolean;onClose:()=>void;onLoaded:(id:string)=>void}){
  const[path,setPath]=useState('');
  const[name,setName]=useState('OAKLIN inspection dataset');
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState('');
  const inputRef=useRef<HTMLInputElement>(null);

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

  return <div className="modalBack">
    <div className="modernModal">
      <button className="modalClose" onClick={onClose}><X/></button>
      <div className="modalBadge"><FolderInput/></div>
      <span className="eyebrowText">IMAGE DATASET</span>
      <h2>Upload inspection image folder</h2>
      <p>Select a complete folder from this computer or provide a path already available to the inspection server. After import, every dashboard panel switches to the uploaded dataset automatically.</p>

      <label>Dataset name
        <input value={name} onChange={e=>setName(e.target.value)}/>
      </label>

      <label>Folder path on backend machine
        <div className="modalInline">
          <input placeholder="/media/k/datasets/oklin" value={path} onChange={e=>setPath(e.target.value)}/>
          <button onClick={loadPath} disabled={busy||!path}>{busy?<Loader2 className="spin"/>:<FolderInput/>}Load</button>
        </div>
      </label>

      <div className="orLine"><span>OR</span></div>

      <input ref={inputRef} type="file" multiple {...dirProps} hidden onChange={e=>upload(e.target.files)}/>
      <button className="uploadFolder" onClick={()=>inputRef.current?.click()} disabled={busy}>{busy?<Loader2 className="spin"/>:<FolderUp/>}{busy?'Importing image folder…':'Choose and upload image folder'}</button>

      {err&&<div className="errorBox">{err}</div>}

      <div className="formatLegend">
        <span><b>.h.bmp</b> High Contrast</span>
        <span><b>.d.bmp</b> Dark Field</span>
        <span><b>.n.bmp</b> Diffuse</span>
        <span><b>.p.bmp</b> Phase Contrast</span>
      </div>
    </div>
  </div>;
}
