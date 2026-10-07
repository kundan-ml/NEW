'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {Activity,Camera,Crosshair,Download,FileImage,ImagePlus,Loader2,MousePointer2,RotateCcw,Save,SlidersHorizontal,X,ZoomIn,ZoomOut} from 'lucide-react';
import {API,api,dataPackageUrl,previewUrl} from '@/lib/api';
import {createLocalImagePreview} from '@/lib/local-image-preview';
import {ILLUMINATION_IMAGE_PATTERN as ACCEPTED,mapIlluminationImages} from '@/lib/illumination-images';
import {constrainImagePan} from '@/lib/image-pan';
import {localImageArchive} from '@/lib/lens-snapshot';
import {downloadBlob,openImageWindow} from '@/lib/image-window';
import type {Role,SystemInfo} from '@/types';

type Channel='h'|'p'|'d'|'n';
type TestTab='general'|'lens'|'focus-resolution'|'lighting';
type Tab='camera'|TestTab;
type Metric={key:string;label:string;value:number|null;status:'green'|'yellow'|'red'|'unavailable';optimum:[number,number];acceptable:[number,number];reason?:string};
type FocusResult={tab:TestTab;channel:Channel;metrics:Metric[];status:Metric['status'];note?:string};
type FocusLimit={key:string;label:string;min_role:Role;enabled?:boolean};
type FocusConfiguration={limits:FocusLimit[];channel_limits?:Partial<Record<Channel,FocusLimit[]>>;tabs?:Partial<Record<TestTab,string[]>>;valid?:boolean;validation_error?:string};
type CameraSlot={id:string;head:number;channel:string;display_name:string;mac_address:string;assigned:boolean;exposure_us:number;gain:number;black_level:number;led_channel:number;current_a:number;pulse_width_us:number;offset_x:number;offset_y:number;width:number;height:number;line_debouncer_time_us:number};
type CameraConfig={head_count:number;cameras:CameraSlot[]};
type ImageView={zoom:number;offsetX:number;offsetY:number;crosshair:boolean;probe:boolean};
const DEFAULT_VIEW:ImageView={zoom:1,offsetX:0,offsetY:0,crosshair:true,probe:false};
const CHANNELS=[
  {key:'h',name:'Telecentric Brightfield',short:'TBF'},
  {key:'p',name:'Phase Contrast',short:'PC'},
  {key:'d',name:'Dark Field',short:'DF'},
  {key:'n',name:'Diffuse Brightfield',short:'DBF'},
] as const;
const TABS:{key:Tab;label:string}[]=[
  {key:'camera',label:'Camera System'},
  {key:'general',label:'General'},
  {key:'lens',label:'Lens'},
  {key:'focus-resolution',label:'Focus + Resolution'},
  {key:'lighting',label:'Lighting'},
];
const EMPTY_FILES:Partial<Record<Channel,File>>={};
const ROLE_RANK:Record<Role,number>={NoUser:0,Operator:1,Tester:1,Service:2,Administrator:3};
const EXPECTED_METRICS:Record<TestTab,{key:string;label:string;minRole?:Role}[]>={
  general:[{key:'brightness',label:'Brightness'},{key:'contrast',label:'Contrast'}],
  lens:[{key:'brightness',label:'Brightness'},{key:'outer_circle_concentricity',label:'Edge continuity'},{key:'outer_circle_diameter',label:'Outer diameter'},{key:'outer_ring_roundness',label:'Edge roundness',minRole:'Service'},{key:'focus_score',label:'Sharpness'}],
  'focus-resolution':[{key:'middle_circle_resolution',label:'Middle circle resolution'},{key:'vertical_cross_position',label:'Vertical cross position'},{key:'horizontal_cross_position',label:'Horizontal cross position'},{key:'focus_jig_center',label:'Focus jig centre'},{key:'focus_score',label:'Focus score'}],
  lighting:[{key:'brightness',label:'Brightness'},{key:'halo_concentricity',label:'Halo concentricity',minRole:'Administrator'},{key:'outer_circle_concentricity',label:'Outer circle concentricity'},{key:'outer_circle_diameter',label:'Outer circle diameter'}],
};
function visibleMetrics(tab:TestTab,role:Role,config?:FocusConfiguration|null,channel?:Channel){
  if(!config)return EXPECTED_METRICS[tab].filter(metric=>ROLE_RANK[role]>=ROLE_RANK[metric.minRole||'NoUser']);
  const limits=new Map(config.limits.map(item=>[item.key,item]));
  if(channel)for(const item of config.channel_limits?.[channel]||[])limits.set(item.key,item);
  const keys=config.tabs?.[tab]||EXPECTED_METRICS[tab].map(item=>item.key);
  return keys.flatMap(key=>{const item=limits.get(key);return item&&item.enabled!==false&&ROLE_RANK[role]>=ROLE_RANK[item.min_role||'NoUser']?[{key:item.key,label:item.label,minRole:item.min_role}]:[]});
}

export function FocusWorkspace({onClose}:{onClose:()=>void}){
  const[tab,setTab]=useState<Tab>('camera');
  const[head,setHead]=useState(1);
  const[activeChannel,setActiveChannel]=useState<Channel>('h');
  const[cameraSettingsPage,setCameraSettingsPage]=useState<'capture'|'sensor'>('capture');
  const[filesByHead,setFilesByHead]=useState<Record<number,Partial<Record<Channel,File>>>>({});
  const[results,setResults]=useState<Record<string,FocusResult>>({});
  const[uploadedByHead,setUploadedByHead]=useState<Record<number,{head:number;datasetId:string;sampleId:string}>>({});
  const[previews,setPreviews]=useState<Partial<Record<Channel,string>>>({});
  const[failedPreviews,setFailedPreviews]=useState<Partial<Record<Channel,boolean>>>({});
  const[imageSizes,setImageSizes]=useState<Partial<Record<string,{src:string;width:number;height:number}>>>({});
  const[views,setViews]=useState<Record<string,ImageView>>({});
  const[system,setSystem]=useState<SystemInfo|null>(null);
  const[cameraConfig,setCameraConfig]=useState<CameraConfig|null>(null);
  const[focusConfig,setFocusConfig]=useState<FocusConfiguration|null>(null);
  const[busy,setBusy]=useState(false);
  const[notice,setNotice]=useState('Click any canvas to load 3–4 images, or add one image per slot.');
  const inputRefs=useRef<Partial<Record<Channel,HTMLInputElement|null>>>({});
  const batchInputRef=useRef<HTMLInputElement|null>(null);
  const clickedChannelRef=useRef<Channel>('h');
  const suppressCanvasClickRef=useRef(false);
  const dragRef=useRef<{key:string;x:number;y:number;offsetX:number;offsetY:number;moved:boolean}|null>(null);
  const pixelsRef=useRef<Record<string,{pixels:Uint8ClampedArray;width:number;height:number}>>({});
  const probeRefs=useRef<Record<string,HTMLSpanElement|null>>({});
  const stageRefs=useRef<Partial<Record<string,HTMLDivElement|null>>>({});
  const files=filesByHead[head]||EMPTY_FILES;
  const uploaded=uploadedByHead[head]||null;
  const count=CHANNELS.filter(channel=>files[channel.key]).length;
  const testTab:TestTab=tab==='camera'?'general':tab;
  const hasResults=CHANNELS.some(channel=>!!results[`${head}:${testTab}:${channel.key}`]);
  const role=system?.session.role||'NoUser';

  const constrainView=useCallback((key:string,next:ImageView):ImageView=>{
    const stage=stageRefs.current[key],image=stage?.querySelector('img');
    if(!stage||!image?.naturalWidth||!image.naturalHeight)return next;
    const rect=stage.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return next;
    const fit=Math.min(rect.width/image.naturalWidth,rect.height/image.naturalHeight);
    const width=image.naturalWidth*fit*next.zoom,height=image.naturalHeight*fit*next.zoom;
    const left=(rect.width-width)/2,top=(rect.height-height)/2;
    const bounded=constrainImagePan(rect,{x:left+next.offsetX,y:top+next.offsetY,width,height});
    return {...next,offsetX:bounded.x-left,offsetY:bounded.y-top};
  },[]);

  useEffect(()=>{
    let frame=0;
    const align=()=>setViews(current=>{
      let next=current;
      for(const channel of CHANNELS){
        const key=`${head}:${channel.key}`,view=current[key]||DEFAULT_VIEW,bounded=constrainView(key,view);
        if(view.offsetX!==bounded.offsetX||view.offsetY!==bounded.offsetY)next={...next,[key]:bounded};
      }
      return next;
    });
    const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(align)});
    for(const channel of CHANNELS){const stage=stageRefs.current[`${head}:${channel.key}`];if(stage)observer.observe(stage)}
    align();
    return()=>{cancelAnimationFrame(frame);observer.disconnect()};
  },[head,tab,activeChannel,imageSizes,constrainView]);

  useEffect(()=>{
    const body=document.body.style.overflow;
    const root=document.documentElement.style.overflow;
    document.body.style.overflow='hidden';
    document.documentElement.style.overflow='hidden';
    let active=true;
    void Promise.allSettled([api.system(),api.getCameraSystem(),api.getFocusConfig()]).then(([systemResult,cameraResult,focusResult])=>{
      if(!active)return;
      if(systemResult.status==='fulfilled')setSystem(systemResult.value);
      if(cameraResult.status==='fulfilled'&&Array.isArray(cameraResult.value?.cameras))setCameraConfig(cameraResult.value as CameraConfig);
      if(focusResult.status==='fulfilled'&&Array.isArray(focusResult.value?.limits)){
        setFocusConfig(focusResult.value as FocusConfiguration);
        if(focusResult.value.valid===false)setNotice(focusResult.value.validation_error||'Invalid focus evaluation limits.');
      }
    });
    return()=>{active=false;document.body.style.overflow=body;document.documentElement.style.overflow=root};
  },[]);

  useEffect(()=>{
    const controller=new AbortController();
    const urls:string[]=[];
    setPreviews({});
    setFailedPreviews({});
    for(const channel of CHANNELS){
      const file=files[channel.key];if(!file)continue;
      void createLocalImagePreview(file,controller.signal).then(url=>{
        if(controller.signal.aborted){URL.revokeObjectURL(url);return}
        urls.push(url);
        setPreviews(current=>({...current,[channel.key]:url}));
      }).catch(error=>{
        if(!controller.signal.aborted){setFailedPreviews(current=>({...current,[channel.key]:true}));setNotice(error instanceof Error?error.message:'Could not load this image.');}
      });
    }
    return()=>{controller.abort();urls.forEach(url=>URL.revokeObjectURL(url))};
  },[files]);
  useEffect(()=>setFailedPreviews({}),[head,files,uploaded]);

  function chooseFile(channel:Channel,file?:File){
    if(!file||busy)return;
    if(!ACCEPTED.test(file.name)){setNotice('Use BMP or TIFF images.');return}
    setFilesByHead(current=>({...current,[head]:{...(current[head]||{}),[channel]:file}}));
    const viewKey=`${head}:${channel}`;
    setViews(current=>({...current,[viewKey]:DEFAULT_VIEW}));
    delete pixelsRef.current[viewKey];
    setUploadedByHead(current=>{const next={...current};delete next[head];return next});
    setResults(current=>Object.fromEntries(Object.entries(current).filter(([key])=>!key.startsWith(`${head}:`))));
    setNotice(`${CHANNELS.find(item=>item.key===channel)?.name} image loaded.`);
  }

  function openCanvasPicker(channel:Channel){
    if(busy)return;
    clickedChannelRef.current=channel;
    batchInputRef.current?.click();
  }

  function chooseCanvasFiles(selected:FileList|null){
    if(!selected?.length||busy)return;
    const chosen=Array.from(selected);
    if(chosen.length===1){chooseFile(clickedChannelRef.current,chosen[0]);return}
    const mapping=mapIlluminationImages(chosen);
    if(!mapping.ok){setNotice(mapping.message);return}
    const mapped=mapping.images;
    // Replace the head's complete set so a missing fourth image cannot come
    // from the previous lens. Results and image coordinates belong to that set.
    setFilesByHead(current=>({...current,[head]:mapped}));
    setViews(current=>Object.fromEntries(Object.entries(current).filter(([key])=>!key.startsWith(`${head}:`))));
    for(const channel of CHANNELS)delete pixelsRef.current[`${head}:${channel.key}`];
    dragRef.current=null;
    setUploadedByHead(current=>{const next={...current};delete next[head];return next});
    setResults(current=>Object.fromEntries(Object.entries(current).filter(([key])=>!key.startsWith(`${head}:`))));
    if(!mapped[activeChannel]){
      const first=CHANNELS.find(channel=>mapped[channel.key]);
      if(first)setActiveChannel(first.key);
    }
    const missing=CHANNELS.filter(channel=>!mapped[channel.key]).map(channel=>channel.name);
    setNotice(missing.length?`${chosen.length} images matched. Add ${missing.join(', ')} to run the focus check.`:'Four illuminations matched automatically. Ready for focus checks.');
  }

  function changeView(key:string,patch:Partial<ImageView>){
    setViews(current=>({...current,[key]:constrainView(key,{...(current[key]||DEFAULT_VIEW),...patch})}));
  }

  function cacheImagePixels(key:string,image:HTMLImageElement){
    setImageSizes(current=>({...current,[key]:{src:image.getAttribute('src')||image.src,width:image.naturalWidth,height:image.naturalHeight}}));
    try{
      const canvas=document.createElement('canvas');
      const scale=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return;
      context.drawImage(image,0,0,canvas.width,canvas.height);
      pixelsRef.current[key]={pixels:context.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height};
    }catch{delete pixelsRef.current[key]}
  }

  function updateProbe(key:string,event:React.PointerEvent<HTMLDivElement>){
    const image=event.currentTarget.querySelector('img');
    const label=probeRefs.current[key];
    if(!image||!label)return;
    const rect=image.getBoundingClientRect();
    const fit=Math.min(rect.width/image.naturalWidth,rect.height/image.naturalHeight);
    const width=image.naturalWidth*fit;
    const height=image.naturalHeight*fit;
    const x=Math.floor((event.clientX-rect.left-(rect.width-width)/2)/fit);
    const y=Math.floor((event.clientY-rect.top-(rect.height-height)/2)/fit);
    if(x<0||x>=image.naturalWidth||y<0||y>=image.naturalHeight){label.textContent='X — · Y — · Gray —';return}
    const cached=pixelsRef.current[key];
    let gray='—';
    if(cached){
      const px=Math.min(cached.width-1,Math.floor(x*cached.width/image.naturalWidth));
      const py=Math.min(cached.height-1,Math.floor(y*cached.height/image.naturalHeight));
      const offset=(py*cached.width+px)*4;
      gray=String(Math.round(cached.pixels[offset]*.2126+cached.pixels[offset+1]*.7152+cached.pixels[offset+2]*.0722));
    }
    label.textContent=`X ${x} · Y ${y} · Gray ${gray}`;
  }

  async function evaluate(){
    if(tab==='camera'||count!==4||busy)return;
    setBusy(true);setNotice('Uploading images and calculating focus values…');
    try{
      let source=uploaded?.head===head?uploaded:null;
      if(!source){
        const batch=await api.uploadFocusImages(files as Record<Channel,File>,head);
        const sample=batch.samples?.[0];
        if(!sample)throw new Error('No camera sample was created from these images.');
        const nextSource={head,datasetId:batch.id,sampleId:sample.id};
        source=nextSource;
        setUploadedByHead(current=>({...current,[head]:nextSource}));
      }
      const evaluated=await Promise.all(CHANNELS.map(async channel=>{
        const value=await api.focus(source.datasetId,source.sampleId,channel.key,tab) as FocusResult;
        return [`${head}:${tab}:${channel.key}`,value] as const;
      }));
      setResults(current=>({...current,...Object.fromEntries(evaluated)}));
      setNotice(`${TABS.find(item=>item.key===tab)?.label} offline estimate complete for Head ${head}.`);
    }catch(error){setNotice((error as Error).message)}
    finally{setBusy(false)}
  }

  async function saveImages(){
    try{downloadBlob(await localImageArchive(files),`Focus_Head${head}_Originals.zip`);setNotice('Original images saved in one ZIP.')}
    catch(error){setNotice((error as Error).message)}
  }

  function updateCamera(id:string,key:keyof CameraSlot,value:string){
    if(!cameraConfig)return;
    setCameraConfig({...cameraConfig,cameras:cameraConfig.cameras.map(item=>item.id===id?{...item,[key]:key==='mac_address'?value:Number(value)}:item)});
  }

  function addCamera(channel:Channel){
    if(!cameraConfig)return;
    const name=CHANNELS.find(item=>item.key===channel)?.name||channel.toUpperCase();
    const slot:CameraSlot={id:`cam-${head}-${channel}`,head,channel,display_name:name,mac_address:'UNASSIGNED',assigned:false,exposure_us:60,gain:0,black_level:0,led_channel:CHANNELS.findIndex(item=>item.key===channel)+1,current_a:0.45,pulse_width_us:100,offset_x:0,offset_y:0,width:2448,height:2048,line_debouncer_time_us:0};
    setCameraConfig({...cameraConfig,head_count:Math.max(cameraConfig.head_count,head),cameras:[...cameraConfig.cameras,slot]});
    setNotice(`${name} slot added. Enter its MAC address, then save to Outbox.`);
  }

  async function saveCamera(){
    if(!cameraConfig||busy)return;
    setBusy(true);
    try{setCameraConfig(await api.saveCameraSystem(cameraConfig) as CameraConfig);setNotice(`Head ${head} camera settings saved to Outbox.`)}
    catch(error){setNotice((error as Error).message)}
    finally{setBusy(false)}
  }

  async function assignCamera(id:string){
    if(!cameraConfig||busy)return;
    const next={...cameraConfig,cameras:cameraConfig.cameras.map(item=>item.id===id?{...item,assigned:true}:item)};
    setBusy(true);
    try{setCameraConfig(await api.saveCameraSystem(next) as CameraConfig);setNotice('Camera assignment saved to Outbox.')}
    catch(error){setNotice((error as Error).message)}
    finally{setBusy(false)}
  }

  async function switchToSetup(){
    if(busy)return;
    setBusy(true);
    try{await api.setMode('SETUP');setSystem(await api.system());setNotice('Setup mode ready for camera settings.')}
    catch(error){setNotice((error as Error).message)}
    finally{setBusy(false)}
  }

  async function saveValues(){
    if(uploaded?.head===head){
      setBusy(true);
      try{
        const texts=await Promise.all(CHANNELS.map(async channel=>{
          const response=await fetch(`${API}/setup/focus/save-values?camera_head=${head}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataset_id:uploaded.datasetId,sample_id:uploaded.sampleId,channel:channel.key,tab:testTab})});
          if(!response.ok)throw new Error(`Values export failed (HTTP ${response.status}).`);
          return `${channel.name}\n${await response.text()}`;
        }));
        downloadBlob(new Blob([texts.join('\n\n')],{type:'text/plain'}),`${new Date().toISOString().replace(/[:.]/g,'-')}_Head${head}_Inbox.txt`);
        setNotice('All configured values exported, including checks hidden by the display role.');
      }catch(error){setNotice((error as Error).message)}
      finally{setBusy(false)}
      return;
    }
    const lines=[`Focus Check | Head ${head} | ${TABS.find(item=>item.key===tab)?.label}`,`Created: ${new Date().toISOString()}`,''];
    for(const channel of CHANNELS){
      const value=results[`${head}:${testTab}:${channel.key}`];
      lines.push(`${channel.name}: ${value?.status.toUpperCase()||'N/A'}`);
      for(const expected of visibleMetrics(testTab,role,focusConfig,channel.key)){
        const metric=value?.metrics.find(item=>item.key===expected.key);
        lines.push(metric?`  ${metric.label}: ${metric.value??'n/a'} (${metric.status}) | optimum ${metric.optimum.join('–')} | acceptable ${metric.acceptable.join('–')}${metric.reason?` | ${metric.reason}`:''}`:`  ${expected.label}: n/a`);
      }
      for(const metric of value?.metrics.filter(item=>!EXPECTED_METRICS[testTab].some(expected=>expected.key===item.key))||[]){
        lines.push(`  ${metric.label}: ${metric.value??'n/a'} (${metric.status}) | optimum ${metric.optimum.join('–')} | acceptable ${metric.acceptable.join('–')}`);
      }
      lines.push('');
    }
    const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain'}));
    const link=document.createElement('a');link.href=url;link.download=`${new Date().toISOString().replace(/[:.]/g,'-')}_Head${head}_Inbox.txt`;link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    setNotice('Focus values exported.');
  }

  async function savePackage(){
    if(!uploaded||uploaded.head!==head||busy)return;
    const reportWindow=window.open('about:blank','_blank');
    if(reportWindow){reportWindow.opener=null;reportWindow.document.title='Focus report';reportWindow.document.body.textContent='Preparing focus report…'}
    setBusy(true);
    try{
      const init={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataset_id:uploaded.datasetId,sample_id:uploaded.sampleId,camera_head:head})};
      const response=await fetch(dataPackageUrl(),init);
      if(!response.ok)throw new Error(`Data package failed (HTTP ${response.status}).`);
      downloadBlob(await response.blob(),`Focus_Head${head}_DataPackage.zip`);
      setNotice('Data package downloaded. The PDF report is also included in the ZIP.');
      if(reportWindow){
        try{
          const report=await fetch(`${dataPackageUrl()}?report=pdf`,init);
          if(!report.ok)throw new Error(`Report preview failed (HTTP ${report.status}).`);
          const url=URL.createObjectURL(await report.blob());reportWindow.location.replace(url);
          window.setTimeout(()=>URL.revokeObjectURL(url),300000);
        }catch(error){reportWindow.close();setNotice(`ZIP saved. ${(error as Error).message} Open report.pdf inside the ZIP.`)}
      }
    }catch(error){reportWindow?.close();setNotice((error as Error).message)}
    finally{setBusy(false)}
  }

  return <div className="focusModal" role="dialog" aria-modal="true" aria-label="Focus Check" onPointerDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <div className={`focusWindow focusWorkbench ${tab==='camera'?'is-camera-tab':''}`}>
      <input ref={batchInputRef} type="file" accept=".bmp,.tif,.tiff,image/bmp,image/tiff" multiple hidden aria-label="Load one, three, or four focus images" onChange={event=>{chooseCanvasFiles(event.target.files);event.target.value=''}}/>
      <datalist id="focus-known-macs">{Array.from(new Set(cameraConfig?.cameras.map(item=>item.mac_address).filter(value=>value&&value!=='UNASSIGNED')||[])).map(value=><option key={value} value={value}/>)}</datalist>
      <header className="focusHeader">
        <span className="focusHeaderIcon"><Activity/></span>
        <div><h2>Focus Check</h2></div>
        <span className="focusHeaderMode"><i/>Offline</span>
        <button className="focusIconButton" onClick={onClose} aria-label="Close Focus Check"><X/></button>
      </header>
      <nav className="focusTabs" aria-label="Focus Check sections">{TABS.map(item=><button key={item.key} className={tab===item.key?'active':''} onClick={()=>setTab(item.key)}>{item.label}</button>)}</nav>
      <div className="focusToolbar">
        <div className="focusHeads" aria-label="Camera head">{Array.from({length:cameraConfig?.head_count||4},(_,index)=>index+1).map(value=><button key={value} disabled={busy} className={head===value?'active':''} onClick={()=>setHead(value)}>Head {value}</button>)}</div>
        <span className="focusToolbarStatus"><i className={count===4?'ready':''}/>{count} / 4 images loaded</span>
      </div>
      <nav className="focusChannelRail" aria-label="Camera view">{CHANNELS.map(channel=><button key={channel.key} className={activeChannel===channel.key?'active':''} onClick={()=>setActiveChannel(channel.key)} title={channel.name}><span className={files[channel.key]?'loaded':''}/>{channel.short}</button>)}</nav>
      <section className="focusCameraGrid" aria-label="Four camera views">{CHANNELS.map((channel,index)=>{
        const value=results[`${head}:${testTab}:${channel.key}`];
        const camera=cameraConfig?.cameras.find(item=>item.head===head&&(item.channel==='f'?'n':item.channel)===channel.key);
        const imageUrl=uploaded?.head===head?previewUrl(uploaded.datasetId,uploaded.sampleId,channel.key):previews[channel.key];
        const viewKey=`${head}:${channel.key}`;
        const view=views[viewKey]||DEFAULT_VIEW;
        const imageSize=imageSizes[viewKey];
        return <article key={channel.key} className={`focusCameraCard ${value?`is-${value.status}`:''} ${activeChannel===channel.key?'is-active-channel':''}`}>
          <header className="focusCardHeader" onContextMenu={event=>{event.preventDefault();if(!openImageWindow(imageUrl,channel.name))setNotice('Load an image and allow popups to open an image window.')}} onDoubleClick={()=>openImageWindow(imageUrl,channel.name)} title="Double-click or right-click to open image window"><span className="focusCardNumber">{String(index+1).padStart(2,'0')}</span><b>{channel.name}</b><span className={`focusCardState ${value?`status-${value.status}`:''}`}>{value?value.status==='green'?'GOOD':value.status==='yellow'?'ACCEPTABLE':value.status==='unavailable'?'N/A':'OUT OF RANGE':files[channel.key]?'LOADED':'EMPTY'}</span></header>
          <div className={`focusCardImage ${files[channel.key]?'can-pan':''}`} ref={element=>{stageRefs.current[viewKey]=element}}
            onClick={event=>{if((event.target as Element).closest('button,.focusViewportTools'))return;if(suppressCanvasClickRef.current){suppressCanvasClickRef.current=false;return}openCanvasPicker(channel.key)}}
            onPointerDown={event=>{if(event.button!==0||(event.target as Element).closest('button,.focusViewportTools'))return;suppressCanvasClickRef.current=false;if(!files[channel.key])return;dragRef.current={key:viewKey,x:event.clientX,y:event.clientY,offsetX:view.offsetX,offsetY:view.offsetY,moved:false};event.currentTarget.setPointerCapture(event.pointerId)}}
            onPointerMove={event=>{if(view.probe)updateProbe(viewKey,event);const drag=dragRef.current;if(drag?.key!==viewKey)return;const dx=event.clientX-drag.x;const dy=event.clientY-drag.y;if(Math.hypot(dx,dy)>5)drag.moved=true;if(drag.moved)changeView(viewKey,{offsetX:drag.offsetX+dx,offsetY:drag.offsetY+dy})}}
            onPointerUp={()=>{if(dragRef.current?.key===viewKey)suppressCanvasClickRef.current=dragRef.current.moved;dragRef.current=null}}
            onPointerCancel={()=>{suppressCanvasClickRef.current=true;dragRef.current=null}}
            onWheel={event=>{if(!files[channel.key])return;event.preventDefault();changeView(viewKey,{zoom:Math.min(3,Math.max(1,Math.round((view.zoom+(event.deltaY<0?.1:-.1))*10)/10))})}}>
            {files[channel.key]&&!failedPreviews[channel.key]&&imageUrl?<img src={imageUrl} draggable={false} alt={`${channel.name} focus image`} style={{transform:`translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.zoom})`}} onLoad={event=>cacheImagePixels(viewKey,event.currentTarget)} onError={()=>setFailedPreviews(current=>({...current,[channel.key]:true}))}/>:<div className="focusImageEmpty"><FileImage/>{files[channel.key]?<span>{failedPreviews[channel.key]?'Preview unavailable':'Preparing preview…'}</span>:<button type="button" disabled={busy} onClick={()=>openCanvasPicker(channel.key)} aria-label={`Load images from ${channel.name} canvas`}><ImagePlus/>Load 3–4 images</button>}</div>}
            {files[channel.key]&&<button type="button" className="focusCanvasPicker" disabled={busy} onClick={()=>openCanvasPicker(channel.key)} aria-label={`Load images from ${channel.name} canvas. Select one image for this slot or three to four images for automatic illumination matching.`} title="Load 3–4 images automatically, or replace this image"><ImagePlus/></button>}
            {view.crosshair&&files[channel.key]&&!failedPreviews[channel.key]&&imageUrl&&imageSize&&imageSize.src===imageUrl&&imageSize.width>0&&imageSize.height>0&&<svg className="focusImageGuides" viewBox={`0 0 ${imageSize.width} ${imageSize.height}`} preserveAspectRatio="xMidYMid meet" style={{transform:`translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.zoom})`}} aria-hidden="true"><line x1="0" y1={imageSize.height/2} x2={imageSize.width} y2={imageSize.height/2} vectorEffect="non-scaling-stroke"/><line x1={imageSize.width/2} y1="0" x2={imageSize.width/2} y2={imageSize.height} vectorEffect="non-scaling-stroke"/></svg>}
            {files[channel.key]&&<div className="focusViewportTools" aria-label={`${channel.name} image controls`}><button title="Zoom out" aria-label={`Zoom out ${channel.name}`} onClick={()=>changeView(viewKey,{zoom:Math.max(1,Math.round((view.zoom-.1)*10)/10)})}><ZoomOut/></button><span>{Math.round(view.zoom*100)}%</span><button title="Zoom in" aria-label={`Zoom in ${channel.name}`} onClick={()=>changeView(viewKey,{zoom:Math.min(3,Math.round((view.zoom+.1)*10)/10)})}><ZoomIn/></button><button title="Reset view" aria-label={`Reset ${channel.name} view`} onClick={()=>changeView(viewKey,DEFAULT_VIEW)}><RotateCcw/></button><button className={view.crosshair?'active':''} title="Toggle crosshair" aria-label={`Toggle ${channel.name} crosshair`} onClick={()=>changeView(viewKey,{crosshair:!view.crosshair})}><Crosshair/></button><button className={view.probe?'active':''} title="Toggle image coordinates and gray value" aria-label={`Toggle ${channel.name} coordinates and gray value`} onClick={()=>changeView(viewKey,{probe:!view.probe})}><MousePointer2/></button></div>}
            {view.probe&&files[channel.key]&&<span className="focusCoordinate" ref={element=>{probeRefs.current[viewKey]=element}}>X — · Y — · Gray —</span>}
          </div>
          <div className="focusCardData">
            {tab==='camera'?<div className={`focusCameraParameters settings-${cameraSettingsPage}`}>
              {camera?<>
                <label className="focusMacField"><span>Assigned camera</span><span className="focusFieldUnit">MAC</span><input list="focus-known-macs" aria-label={`${channel.name} MAC address`} value={camera.mac_address} disabled={system?.mode==='AUTO'} onChange={event=>updateCamera(camera.id,'mac_address',event.target.value)}/></label>
                <div className="focusSettingsSwitch" role="tablist" aria-label={`${channel.name} camera settings group`}><button type="button" role="tab" aria-selected={cameraSettingsPage==='capture'} className={cameraSettingsPage==='capture'?'active':''} onClick={()=>setCameraSettingsPage('capture')}><SlidersHorizontal/>Capture</button><button type="button" role="tab" aria-selected={cameraSettingsPage==='sensor'} className={cameraSettingsPage==='sensor'?'active':''} onClick={()=>setCameraSettingsPage('sensor')}><Camera/>Sensor</button></div>
                <div className="focusParameterGrid">
                  {([{key:'exposure_us',label:'Exposure',unit:'µs',min:28,max:10000000,group:'capture'},{key:'gain',label:'Gain',unit:'',min:0,max:490,group:'capture'},{key:'black_level',label:'Black level',unit:'',min:0,max:600,group:'capture'},{key:'current_a',label:'LED current',unit:'A',min:0,max:4,group:'capture'},{key:'pulse_width_us',label:'Pulse width',unit:'µs',min:0,max:200000,group:'capture'},{key:'led_channel',label:'LED channel',unit:'',min:1,max:16,group:'capture'},{key:'width',label:'Width',unit:'px',min:1,max:2456,group:'sensor'},{key:'height',label:'Height',unit:'px',min:1,max:2058,group:'sensor'},{key:'offset_x',label:'Offset X',unit:'px',min:0,max:2455,group:'sensor'},{key:'offset_y',label:'Offset Y',unit:'px',min:0,max:2057,group:'sensor'},{key:'line_debouncer_time_us',label:'Debounce',unit:'µs',min:0,max:100,group:'sensor'}] as const).map(field=><label key={field.key} data-focus-group={field.group}><span className="focusParameterLabel" title={field.label}>{field.label}</span><span className="focusFieldUnit">{field.unit}</span><input type="number" aria-label={`${channel.name} ${field.label}`} min={field.min} max={field.max} step={field.key==='current_a'?'0.01':'1'} value={camera[field.key]} disabled={system?.mode==='AUTO'} onChange={event=>updateCamera(camera.id,field.key,event.target.value)}/></label>)}
                </div>
                <button className="focusAssign" disabled={busy||system?.mode==='AUTO'||!camera.mac_address||camera.mac_address==='UNASSIGNED'} onClick={()=>void assignCamera(camera.id)}><Camera/>{camera.assigned?'Update assignment':'Assign camera'}</button>
              </>:<div className="focusUnconfigured"><Camera/><b>Camera not assigned</b><button disabled={!cameraConfig||system?.mode==='AUTO'} onClick={()=>addCamera(channel.key)}>Add camera slot</button></div>}
            </div>:tab==='general'?<div className="focusGeneralData">
              <MetricRows tab={tab} result={value} role={role} config={focusConfig} channel={channel.key} onExplain={setNotice}/>
              <div className="focusProfiles"><ProfilePlot src={files[channel.key]&&!failedPreviews[channel.key]?imageUrl:undefined} axis="horizontal" view={view} stage={stageRefs.current[viewKey]}/><ProfilePlot src={files[channel.key]&&!failedPreviews[channel.key]?imageUrl:undefined} axis="vertical" view={view} stage={stageRefs.current[viewKey]}/></div>
            </div>:<div className="focusTestData"><MetricRows tab={tab} result={value} role={role} config={focusConfig} channel={channel.key} onExplain={setNotice}/></div>}
          </div>
          <footer className="focusCardFooter"><span title={files[channel.key]?.name}>{files[channel.key]?.name||'BMP / TIFF image'}</span><input ref={element=>{inputRefs.current[channel.key]=element}} type="file" accept=".bmp,.tif,.tiff,image/bmp,image/tiff" hidden aria-label={`Load ${channel.name} image`} onChange={event=>{chooseFile(channel.key,event.target.files?.[0]);event.target.value=''}}/><button disabled={busy} onClick={()=>inputRefs.current[channel.key]?.click()}><ImagePlus/>{files[channel.key]?'Replace':'Load'}</button></footer>
        </article>})}</section>
      <footer className="focusFooter focusCommandBar">
        <p role="status" title={notice}>{busy?<Loader2 className="focusSpin"/>:<span className="focusFooterDot"/>}{notice}</p>
        <div className="focusActions">
          <button className="focusSecondary" disabled={busy||count===0} onClick={()=>{setFilesByHead(current=>({...current,[head]:{}}));setResults(current=>Object.fromEntries(Object.entries(current).filter(([key])=>!key.startsWith(`${head}:`))));setUploadedByHead(current=>{const next={...current};delete next[head];return next});setNotice('Images cleared.')}}><RotateCcw/>Clear</button>
          <button className="focusSecondary" disabled={count===0} onClick={()=>void saveImages()} title="Save original images as ZIP"><Download/>Images</button>
          {tab==='camera'?<><button className="focusSecondary" disabled={busy||system?.mode!=='AUTO'} onClick={()=>void switchToSetup()} title="Switch to setup mode">Setup</button><button className="focusPrimary" disabled={busy||!cameraConfig||system?.mode==='AUTO'} onClick={()=>void saveCamera()} title="Save camera configuration to Outbox"><Save/>Save setup</button></>:<><button className="focusSecondary" disabled={!hasResults||busy} onClick={()=>void saveValues()} title="Save all configured focus values"><Download/>Values</button><button className="focusSecondary" disabled={!uploaded||uploaded.head!==head||busy} onClick={()=>void savePackage()} title="Download data package and open its PDF report"><Save/>Package</button><button className="focusPrimary" disabled={busy||count!==4||focusConfig?.valid===false} onClick={()=>void evaluate()}>{busy?<Loader2 className="focusSpin"/>:<SlidersHorizontal/>}Run check</button></>}
        </div>
      </footer>
    </div>
  </div>;
}

function MetricRows({tab,result,role,config,channel,onExplain}:{tab:TestTab;result?:FocusResult;role:Role;config:FocusConfiguration|null;channel:Channel;onExplain:(message:string)=>void}){
  const expected=visibleMetrics(tab,role,config,channel);
  const extra=result?.metrics.filter(metric=>!EXPECTED_METRICS[tab].some(item=>item.key===metric.key))||[];
  return <div className="focusCompactMetrics">{expected.map(item=>{
    const metric=result?.metrics.find(value=>value.key===item.key);
    const detail=metric?.reason|| (metric?`${metric.label}: optimum ${metric.optimum.join('–')}; acceptable ${metric.acceptable.join('–')}.`:'');
    return <div key={item.key} className={`focusCompactMetric ${metric?'has-range':''}`} title={detail||'Not reported by the current focus backend'} role={metric?'button':undefined} tabIndex={metric?0:undefined} onClick={()=>metric&&onExplain(detail)} onKeyDown={event=>{if(metric&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onExplain(detail)}}}><span>{metric?.label||item.label}</span><b className={metric?`status-${metric.status}`:'is-unavailable'}>{typeof metric?.value==='number'&&Number.isFinite(metric.value)?metric.value.toFixed(2):'—'}</b></div>;
  })}{extra.map(metric=>{const detail=metric.reason||`${metric.label}: optimum ${metric.optimum.join('–')}; acceptable ${metric.acceptable.join('–')}.`;return <div key={metric.key} className="focusCompactMetric has-range" title={detail} role="button" tabIndex={0} onClick={()=>onExplain(detail)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onExplain(detail)}}}><span>{metric.label}</span><b className={`status-${metric.status}`}>{typeof metric.value==='number'&&Number.isFinite(metric.value)?metric.value.toFixed(2):'—'}</b></div>})}</div>;
}

function ProfilePlot({src,axis,view,stage}:{src?:string;axis:'horizontal'|'vertical';view:ImageView;stage?:HTMLDivElement|null}){
  const[values,setValues]=useState<number[]>([]);
  const[size,setSize]=useState({width:0,height:0});
  useEffect(()=>{if(!stage)return;const observer=new ResizeObserver(()=>{const box=stage.getBoundingClientRect();setSize({width:box.width,height:box.height})});observer.observe(stage);return()=>observer.disconnect()},[stage]);
  useEffect(()=>{
    if(!src){setValues([]);return}
    let active=true;
    const image=new Image();
    image.onload=()=>{
      try{
        const box=stage?.getBoundingClientRect();
        if(!box?.width||!box.height)return;
        const scale=256/Math.max(box.width,box.height);
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(box.width*scale));canvas.height=Math.max(1,Math.round(box.height*scale));
        const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return;
        context.fillStyle='#000';context.fillRect(0,0,canvas.width,canvas.height);
        const fitted=Math.min(box.width/image.width,box.height/image.height)*scale;
        const drawWidth=image.width*fitted*view.zoom;
        const drawHeight=image.height*fitted*view.zoom;
        context.drawImage(image,(canvas.width-drawWidth)/2+view.offsetX*scale,(canvas.height-drawHeight)/2+view.offsetY*scale,drawWidth,drawHeight);
        const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
        const next=Array.from({length:48},(_,index)=>{
          const x=axis==='horizontal'?Math.round(index*(canvas.width-1)/47):Math.floor(canvas.width/2);
          const y=axis==='vertical'?Math.round(index*(canvas.height-1)/47):Math.floor(canvas.height/2);
          const offset=(y*canvas.width+x)*4;
          return Math.round((pixels[offset]*.2126+pixels[offset+1]*.7152+pixels[offset+2]*.0722));
        });
        if(active)setValues(next);
      }catch{if(active)setValues([])}
    };
    image.onerror=()=>{if(active)setValues([])};
    image.src=src;
    return()=>{active=false};
  },[src,axis,view.zoom,view.offsetX,view.offsetY,stage,size.width,size.height]);
  const points=values.map((value,index)=>`${index*100/47},${30-value*28/255}`).join(' ');
  return <div className="focusProfile"><span>{axis==='horizontal'?'Horizontal':'Vertical'} brightness</span><svg viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={`${axis} brightness profile`}><path d="M0 15H100"/>{values.length>0&&<polyline points={points}/>}</svg></div>;
}
