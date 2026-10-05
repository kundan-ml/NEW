'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {Camera,Check,Download,FileImage,ImagePlus,Loader2,RotateCcw,Save,ShieldAlert,X} from 'lucide-react';
import {api,previewUrl} from '@/lib/api';
import {createLocalImagePreview,downloadLocalImage} from '@/lib/local-image-preview';
import {ILLUMINATION_IMAGE_PATTERN as ACCEPTED,mapIlluminationImages} from '@/lib/illumination-images';
import type {RegistrationResult,SystemInfo} from '@/types';

type Channel='h'|'p'|'d'|'n';
type ChannelFiles=Partial<Record<Channel,File>>;
const EMPTY_FILES:ChannelFiles={};
const CHANNELS=[
  {key:'h',label:'Telecentric Brightfield',short:'TBF'},
  {key:'p',label:'Phase Contrast',short:'PC'},
  {key:'d',label:'Dark Field',short:'DF'},
  {key:'n',label:'Diffuse Brightfield',short:'DBF'},
] as const;

export function RegistrationWorkspace({onClose}:{onClose:()=>void}){
  const[head,setHead]=useState(1);
  const[mobileView,setMobileView]=useState<'images'|'details'>('images');
  const[filesByHead,setFilesByHead]=useState<Record<number,ChannelFiles>>({});
  const[previews,setPreviews]=useState<Partial<Record<Channel,string>>>({});
  const[failedPreviews,setFailedPreviews]=useState<Partial<Record<Channel,boolean>>>({});
  const[system,setSystem]=useState<SystemInfo|null>(null);
  const[result,setResult]=useState<RegistrationResult|null>(null);
  const[uploaded,setUploaded]=useState<{head:number;datasetId:string;sampleId:string}|null>(null);
  const[busy,setBusy]=useState<'uploading'|'registering'|'saving'|'mode'|null>(null);
  const[notice,setNotice]=useState('Click any canvas to load 3–4 images, or add one image per slot.');
  const inputRefs=useRef<Partial<Record<Channel,HTMLInputElement|null>>>({});
  const batchInputRef=useRef<HTMLInputElement|null>(null);
  const clickedChannelRef=useRef<Channel>('h');
  const files=filesByHead[head]||EMPTY_FILES;
  const ready=CHANNELS.every(channel=>!!files[channel.key]);
  const matchingResult=result?.camera_head===head?result:null;
  const hasUnsavedChanges=!!matchingResult&&(!uploaded||uploaded.head!==head);

  useEffect(()=>{
    const previousBody=document.body.style.overflow;
    const previousRoot=document.documentElement.style.overflow;
    document.body.style.overflow='hidden';
    document.documentElement.style.overflow='hidden';
    return()=>{document.body.style.overflow=previousBody;document.documentElement.style.overflow=previousRoot};
  },[]);

  useEffect(()=>{
    let active=true;
    void Promise.allSettled([api.system(),api.registrationCurrent()]).then(([systemState,currentState])=>{
      if(!active)return;
      if(systemState.status==='fulfilled')setSystem(systemState.value);
      if(currentState.status==='fulfilled'&&currentState.value.camera_head&&currentState.value.transforms){
        setResult(currentState.value as RegistrationResult);
      }
    });
    return()=>{active=false};
  },[]);

  useEffect(()=>{
    const controller=new AbortController();
    const urls:string[]=[];
    setPreviews({});
    setFailedPreviews({});
    for(const channel of CHANNELS){
      const file=files[channel.key];
      if(!file)continue;
      void createLocalImagePreview(file,controller.signal).then(url=>{
        if(controller.signal.aborted){URL.revokeObjectURL(url);return}
        urls.push(url);
        setPreviews(current=>({...current,[channel.key]:url}));
      }).catch(()=>{
        if(!controller.signal.aborted)setFailedPreviews(current=>({...current,[channel.key]:true}));
      });
    }
    return()=>{controller.abort();urls.forEach(url=>URL.revokeObjectURL(url))};
  },[files]);
  useEffect(()=>setFailedPreviews({}),[uploaded]);

  const sourceUrls=useMemo(()=>{
    if(!uploaded||uploaded.head!==head)return previews;
    return Object.fromEntries(CHANNELS.map(channel=>[channel.key,previewUrl(uploaded.datasetId,uploaded.sampleId,channel.key)])) as Record<Channel,string>;
  },[head,previews,uploaded]);

  function chooseFile(channel:Channel,file?:File){
    if(!file)return;
    if(!ACCEPTED.test(file.name)){
      setNotice('BMP or TIFF images only.');
      return;
    }
    setFilesByHead(current=>({...current,[head]:{...(current[head]||{}),[channel]:file}}));
    setUploaded(null);
    setResult(current=>current?.camera_head===head?null:current);
    setNotice(`${CHANNELS.find(item=>item.key===channel)?.short} loaded.`);
  }

  function chooseCanvasFiles(selected:FileList|null){
    if(!selected?.length||busy)return;
    const chosen=Array.from(selected);
    if(chosen.length===1){chooseFile(clickedChannelRef.current,chosen[0]);return}
    const mapping=mapIlluminationImages(chosen);
    if(!mapping.ok){setNotice(mapping.message);return}
    const mapped=mapping.images;
    setFilesByHead(current=>({...current,[head]:mapped}));
    setUploaded(null);
    setResult(current=>current?.camera_head===head?null:current);
    const missing=CHANNELS.filter(channel=>!mapped[channel.key]).map(channel=>channel.label);
    setNotice(missing.length?`${chosen.length} images matched. Add ${missing.join(', ')} manually to register.`:`Four illuminations matched automatically. Ready to register.`);
  }

  function openCanvasPicker(channel:Channel){
    if(busy)return;
    clickedChannelRef.current=channel;
    batchInputRef.current?.click();
  }

  function removeFile(channel:Channel){
    setFilesByHead(current=>{const next={...(current[head]||{})};delete next[channel];return {...current,[head]:next}});
    setUploaded(null);
    setResult(current=>current?.camera_head===head?null:current);
    setNotice(`${CHANNELS.find(item=>item.key===channel)?.short} removed.`);
  }

  async function switchToSetup(){
    setBusy('mode');
    try{await api.setMode('SETUP');setSystem(await api.system());setNotice('Setup mode ready.')}
    catch(error){setNotice((error as Error).message)}
    finally{setBusy(null)}
  }

  async function runRegistration(){
    if(!ready||busy)return;
    if(system?.mode==='AUTO'){setNotice('Switch the station to Setup mode before registration.');return}
    setBusy('uploading');
    setNotice('Uploading the four channel images…');
    try{
      const complete=Object.fromEntries(CHANNELS.map(channel=>[channel.key,files[channel.key]])) as Record<Channel,File>;
      const dataset=await api.uploadRegistrationImages(complete,head);
      const sample=dataset.samples[0];
      if(dataset.sample_count!==1||!sample||CHANNELS.some(channel=>!sample.images[channel.key]))throw new Error('The backend could not group the four uploaded images into one lens.');
      setUploaded({head,datasetId:dataset.id,sampleId:sample.id});
      setBusy('registering');
      setNotice('Calculating the offline registration estimate…');
      const calculated=await api.registrationRun(dataset.id,sample.id,head);
      setResult(calculated);
      setNotice('Estimate ready. Review before saving.');
    }catch(error){setNotice((error as Error).message)}
    finally{setBusy(null)}
  }

  async function saveOutbox(){
    if(!matchingResult||busy)return;
    setBusy('saving');
    try{await api.registrationOutbox();setNotice('Saved to Outbox.')}
    catch(error){setNotice((error as Error).message)}
    finally{setBusy(null)}
  }

  return <div className="registrationModal" role="dialog" aria-modal="true" aria-label="Camera registration" onPointerDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <div className="registrationWindow">
      <header className="registrationHeader">
        <span className="registrationHeaderIcon"><Camera/></span>
        <div><h2>Camera Registration</h2></div>
        <span className="registrationOffline"><i/>Offline</span>
        <button className="registrationIconButton" onClick={onClose} aria-label="Close registration"><X/></button>
      </header>

      <nav className="registrationHeadTabs" aria-label="Camera head">
        {[1,2,3,4].map(value=>{const count=CHANNELS.filter(channel=>filesByHead[value]?.[channel.key]).length;return <button key={value} type="button" className={head===value?'active':''} aria-current={head===value?'true':undefined} aria-label={`Head ${value}, ${count} of 4 images ready`} onClick={()=>setHead(value)}><span className="registrationHeadNumber">{String(value).padStart(2,'0')}</span><span className="registrationHeadLabel"><b>Head {value}</b><small>{count===4?'Ready':`${count} / 4 images`}</small></span><span className="registrationHeadProgress" aria-hidden="true">{CHANNELS.map(channel=><i key={channel.key} className={filesByHead[value]?.[channel.key]?'filled':''}/>)}</span></button>})}
        <div className="registrationMode"><b>{system?.mode==='SETUP'?'Setup':system?.mode==='AUTO'?'Automatic':'Offline'}</b></div>
      </nav>

      <div className={`registrationBody view-${mobileView}`}>
        <div className="registrationMobileViews" role="tablist" aria-label="Registration workspace view"><button role="tab" aria-selected={mobileView==='images'} className={mobileView==='images'?'active':''} onClick={()=>setMobileView('images')}>Images</button><button role="tab" aria-selected={mobileView==='details'} className={mobileView==='details'?'active':''} onClick={()=>setMobileView('details')}>Results</button></div>
        <aside className="registrationSide">
          <section className="registrationSectionHead"><span><b>Images</b></span><em>{CHANNELS.filter(channel=>files[channel.key]).length}/4 ready</em></section>
          <div className="registrationFileList">{CHANNELS.map(channel=><div className={`registrationFileRow ${files[channel.key]?'loaded':''}`} key={channel.key}>
            <span className="registrationChannelBadge">{channel.short}</span>
            <span className="registrationFileCopy"><b>{channel.label}</b>{files[channel.key]&&<small title={files[channel.key]?.name}>{files[channel.key]?.name}</small>}</span>
            <input ref={element=>{inputRefs.current[channel.key]=element}} type="file" accept=".bmp,.tif,.tiff,image/bmp,image/tiff" onChange={event=>{chooseFile(channel.key,event.target.files?.[0]);event.target.value=''}} aria-label={`Upload ${channel.label} image`} hidden/>
            <button className="registrationRowAction" onClick={()=>inputRefs.current[channel.key]?.click()} aria-label={`${files[channel.key]?'Replace':'Upload'} ${channel.label} image`} title={files[channel.key]?'Replace image':'Upload image'}><ImagePlus/></button>
            {files[channel.key]&&<button className="registrationRowAction remove" onClick={()=>removeFile(channel.key)} aria-label={`Remove ${channel.label} image`} title="Remove image"><X/></button>}
          </div>)}</div>

          <div className="registrationGuidance"><ShieldAlert/><span><b>Offline estimate</b><small>Verify before production.</small></span></div>

          <section className="registrationTransformSection">
            <div className="registrationSectionHead"><span><b>Transforms</b></span>{matchingResult&&<Check/>}</div>
            {matchingResult?<div className="registrationTransformList">{CHANNELS.map(channel=>{const transform=matchingResult.transforms.find(item=>item.channel===channel.key);return <div key={channel.key}><b>{channel.short}</b><span>{transform?`X ${transform.tx_px} · Y ${transform.ty_px} px`:'No result'}</span><small>{transform?`${transform.rotation_deg}° · ${transform.scale.toFixed(4)}×`:'—'}</small></div>})}</div>:<p className="registrationEmptyResult">Run to view alignment.</p>}
          </section>
        </aside>

        <section className="registrationVisuals" aria-label="Uploaded image previews"><input ref={batchInputRef} type="file" accept=".bmp,.tif,.tiff,image/bmp,image/tiff" multiple onChange={event=>{chooseCanvasFiles(event.target.files);event.target.value=''}} aria-label="Load one, three, or four registration images" hidden/>{CHANNELS.map((channel,index)=><article className={`registrationPreview ${files[channel.key]?'has-image':''}`} key={channel.key}>
          <header><span><i>{String(index+1).padStart(2,'0')}</i><b>{channel.label}</b></span></header>
          <div className="registrationPreviewFrame">
            {files[channel.key]&&sourceUrls[channel.key]&&!failedPreviews[channel.key]?<img src={sourceUrls[channel.key]} draggable={false} alt={`${channel.label} registration preview`} onError={()=>setFailedPreviews(current=>({...current,[channel.key]:true}))}/>:<div className="registrationPreviewEmpty"><FileImage/>{files[channel.key]&&<b>{failedPreviews[channel.key]?'Preview unavailable':'Preparing preview…'}</b>}</div>}
            <button className="registrationCanvasPicker" type="button" disabled={!!busy} onClick={()=>openCanvasPicker(channel.key)} aria-label={`Load images from ${channel.label} canvas. Select one image for this slot or three to four images for automatic illumination matching.`} title="Click to load 3–4 images automatically, or one image into this slot"><span><ImagePlus/>{files[channel.key]?'Load images':'Load 3–4 images'}</span></button>
          </div>
          <footer><span title={files[channel.key]?.name}>{files[channel.key]?.name||'—'}</span><div><button onClick={()=>inputRefs.current[channel.key]?.click()} title={`${files[channel.key]?'Replace':'Upload'} ${channel.label} image`} aria-label={`${files[channel.key]?'Replace':'Upload'} ${channel.label} image`}><ImagePlus/></button>{files[channel.key]&&<button onClick={()=>downloadLocalImage(files[channel.key]!)} title={`Download ${channel.label} source`} aria-label={`Download ${channel.label} source`}><Download/></button>}</div></footer>
        </article>)}</section>
      </div>

      <footer className="registrationFooter">
        <div className="registrationNotice" role="status"><span className={busy?'processing':matchingResult?'ready':''}>{busy?<Loader2 className="spin"/>:matchingResult?<Check/>:<ShieldAlert/>}</span><p title={notice}>{notice}</p></div>
        <div className="registrationActions">
          {system?.mode==='AUTO'&&<button className="registrationSecondary" disabled={!!busy} onClick={()=>void switchToSetup()}>Switch to Setup</button>}
          <button className="registrationSecondary" disabled={!!busy||!CHANNELS.some(channel=>files[channel.key])} onClick={()=>{setFilesByHead(current=>({...current,[head]:{}}));setUploaded(null);setResult(current=>current?.camera_head===head?null:current);setNotice('Images cleared.')}}><RotateCcw/>Clear</button>
          <button className="registrationSecondary" disabled={!!busy||!matchingResult||hasUnsavedChanges} onClick={()=>void saveOutbox()}><Save/>Save to Outbox</button>
          <button className="registrationPrimary" disabled={!!busy||!ready||system?.mode==='AUTO'} onClick={()=>void runRegistration()}>{busy==='uploading'||busy==='registering'?<Loader2 className="spin"/>:<Camera/>}Register</button>
        </div>
      </footer>
    </div>
  </div>;
}
