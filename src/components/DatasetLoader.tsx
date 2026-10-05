'use client';

import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
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

  if(!open||typeof document==='undefined')return null;

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
      if(inputRef.current)inputRef.current.value='';
    }
  }

  const dirProps={webkitdirectory:'',directory:''} as any;

  return createPortal(<div className="modalBack uploadModalBack" onPointerDown={event=>{if(event.target===event.currentTarget&&!busy)onClose()}}>
    <div className="modernModal uploadModalWindow" role="dialog" aria-modal="true" aria-labelledby="upload-folder-title">
      <header className="uploadModalBrand">
        <div className="modalBadge"><FolderInput/></div>
        <span><small>EMAGE GROUP · DATA INTAKE</small><h2 id="upload-folder-title">Upload inspection images</h2><p>Add a complete camera folder for WT processing and live inference.</p></span>
        <button className="modalClose" onClick={onClose} aria-label="Close upload folder"><X/></button>
      </header>
      <div className="uploadModalBody">
        <div className="uploadStatus"><i/><span>Ready for import</span><em>H · D · N · P frame set</em></div>
        <label>Dataset name
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Inspection lot"/>
        </label>
        <div className="uploadRouteCard">
          <div className="uploadRouteHead"><i>01</i><span><b>Server folder</b><small>Use images already available on the inspection PC</small></span></div>
          <label>Folder path on backend machine
            <div className="modalInline">
              <input placeholder="D:\\Inspection Data\\Lot 01" value={path} onChange={e=>setPath(e.target.value)}/>
              <button onClick={loadPath} disabled={busy||!path}>{busy?<Loader2 className="spin"/>:<FolderInput/>}Load</button>
            </div>
          </label>
        </div>
        <div className="orLine"><span>OR UPLOAD FROM THIS COMPUTER</span></div>
        <input ref={inputRef} type="file" multiple {...dirProps} hidden onChange={e=>upload(e.target.files)}/>
        <div className="uploadDropZone">
          <span className="uploadDropGlow"/>
          <button className="uploadFolder" onClick={()=>inputRef.current?.click()} disabled={busy}>{busy?<><Loader2 className="spin"/><span className="uploadFolderCopy"><small>PROCESSING FOLDER</small><b>Importing image folder…</b><em>Preparing inspection data</em></span><i>Wait</i></>:<><FolderUp/><span className="uploadFolderCopy"><small>LOCAL IMAGE FOLDER</small><b>Choose and upload image folder</b><em>Preserves camera folders and file names</em></span><i>Browse</i></>}</button>
        </div>
        <div className="uploadAssurance"><span><i>✓</i> Folder structure retained</span><span><i>✓</i> Four camera channels validated</span><span><i>✓</i> Automatic queue available</span></div>
        {err&&<div className="errorBox">{err}</div>}
      </div>
      <div className="uploadFlow" aria-label="Upload process"><span className="active"><i>01</i><b>Select</b><small>Source folder</small></span><span><i>02</i><b>Validate</b><small>Camera sets</small></span><span><i>03</i><b>Inspect</b><small>WT queue</small></span></div>
      <footer className="formatLegend uploadModalFooter">
        <span><b>BMP / TIF</b> Inspection images</span>
        <span><b>#1–#4</b> Camera channels</span>
        <span><b>Folders</b> Defect classes</span>
        <span><b>WT</b> Admin-configured positions</span>
      </footer>
    </div>
  </div>,document.body);
}
