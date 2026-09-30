'use client';

import {useEffect,useRef,useState} from 'react';
import {Activity,Camera,Crosshair,Download,FileImage,ImagePlus,Loader2,MousePointer2,RotateCcw,Save,SlidersHorizontal,Video,VideoOff,X,ZoomIn,ZoomOut} from 'lucide-react';
import {api,dataPackageUrl,previewUrl} from '@/lib/api';
import {createLocalImagePreview,downloadLocalImage} from '@/lib/local-image-preview';
import type {Role,SystemInfo} from '@/types';

type Channel='h'|'p'|'d'|'n';
type TestTab='general'|'lens'|'focus-resolution'|'lighting';
type Tab='camera'|TestTab;
type Metric={key:string;label:string;value:number;status:'green'|'yellow'|'red';optimum:[number,number];acceptable:[number,number]};
type FocusResult={tab:TestTab;channel:Channel;metrics:Metric[];status:'green'|'yellow'|'red';note?:string};
type CameraSlot={id:string;head:number;channel:string;display_name:string;mac_address:string;assigned:boolean;exposure_us:number;gain:number;black_level:number;led_channel:number;current_a:number;pulse_width_us:number;offset_x:number;offset_y:number;width:number;height:number;line_debouncer_time_us:number};
type CameraConfig={head_count:number;cameras:CameraSlot[]};
type ImageView={zoom:number;offsetX:number;offsetY:number;crosshair:boolean;probe:boolean};
const DEFAULT_VIEW:ImageView={zoom:1,offsetX:0,offsetY:0,crosshair:true,probe:false};
const CHANNELS=[
  {key:'h',name:'Diffuse Brightfield',short:'DBF'},
  {key:'p',name:'Phase Contrast',short:'PC'},
  {key:'d',name:'Darkfield',short:'DF'},
  {key:'n',name:'Telecentric Brightfield',short:'TBF'},
] as const;
const TABS:{key:Tab;label:string}[]=[
  {key:'camera',label:'Camera System'},
  {key:'general',label:'General'},
  {key:'lens',label:'Lens'},
  {key:'focus-resolution',label:'Focus + Resolution'},
  {key:'lighting',label:'Lighting'},
];
const ACCEPTED=/\.(bmp|tif|tiff)$/i;
const EMPTY_FILES:Partial<Record<Channel,File>>={};
const LENS_CONDITIONS=['Unplugged → unplugged','Plugged → plugged','Unplugged → plugged','Plugged → unplugged'] as const;
const ROLE_RANK:Record<Role,number>={NoUser:0,Operator:1,Tester:1,Service:2,Administrator:3};
const EXPECTED_METRICS:Record<TestTab,{key:string;label:string;minRole?:Role}[]>={
  general:[{key:'brightness',label:'Brightness'},{key:'contrast',label:'Contrast'}],
  lens:[{key:'brightness',label:'Brightness'},{key:'outer_circle_concentricity',label:'Edge continuity'},{key:'outer_circle_diameter',label:'Outer diameter'},{key:'outer_ring_roundness',label:'Edge roundness',minRole:'Service'},{key:'focus_score',label:'Sharpness'}],
  'focus-resolution':[{key:'middle_circle_resolution',label:'Middle circle resolution'},{key:'vertical_cross_position',label:'Vertical cross position'},{key:'horizontal_cross_position',label:'Horizontal cross position'},{key:'focus_jig_center',label:'Focus jig centre'},{key:'focus_score',label:'Focus score'}],
  lighting:[{key:'brightness',label:'Brightness'},{key:'halo_concentricity',label:'Halo concentricity',minRole:'Administrator'},{key:'outer_circle_concentricity',label:'Outer circle concentricity'},{key:'outer_circle_diameter',label:'Outer circle diameter'}],
};
const visibleMetrics=(tab:TestTab,role:Role)=>EXPECTED_METRICS[tab].filter(metric=>ROLE_RANK[role]>=ROLE_RANK[metric.minRole||'NoUser']);

export function FocusWorkspace({onClose}:{onClose:()=>void}){
  const[tab,setTab]=useState<Tab>('camera');
  const[head,setHead]=useState(1);
  const[lensCondition,setLensCondition]=useState(0);
  const[filesByHead,setFilesByHead]=useState<Record<number,Partial<Record<Channel,File>>>>({});
  const[results,setResults]=useState<Record<string,FocusResult>>({});
  const[uploadedByHead,setUploadedByHead]=useState<Record<number,{head:number;datasetId:string;sampleId:string}>>({});
  const[previews,setPreviews]=useState<Partial<Record<Channel,string>>>({});
  const[failedPreviews,setFailedPreviews]=useState<Partial<Record<Channel,boolean>>>({});
  const[views,setViews]=useState<Record<string,ImageView>>({});
  const[system,setSystem]=useState<SystemInfo|null>(null);
  const[cameraConfig,setCameraConfig]=useState<CameraConfig|null>(null);
  const[busy,setBusy]=useState(false);
  const[notice,setNotice]=useState('Load four BMP or TIFF images to check focus.');
  const inputRefs=useRef<Partial<Record<Channel,HTMLInputElement|null>>>({});
  const dragRef=useRef<{key:string;x:number;y:number;offsetX:number;offsetY:number}|null>(null);
  const pixelsRef=useRef<Record<string,{pixels:Uint8ClampedArray;width:number;height:number}>>({});
  const probeRefs=useRef<Record<string,HTMLSpanElement|null>>({});
  const files=filesByHead[head]||EMPTY_FILES;
  const uploaded=uploadedByHead[head]||null;
  const count=CHANNELS.filter(channel=>files[channel.key]).length;
  const testTab:TestTab=tab==='camera'?'general':tab;
  const hasResults=CHANNELS.some(channel=>!!results[`${head}:${testTab}:${channel.key}`]);
  const role=system?.session.role||'NoUser';

  useEffect(()=>{
    const body=document.body.style.overflow;
    const root=document.documentElement.style.overflow;
    document.body.style.overflow='hidden';
    document.documentElement.style.overflow='hidden';
    void Promise.allSettled([api.system(),api.getCameraSystem()]).then(([systemResult,cameraResult])=>{
      if(systemResult.status==='fulfilled')setSystem(systemResult.value);
      if(cameraResult.status==='fulfilled')setCameraConfig(cameraResult.value as CameraConfig);
    });
    return()=>{document.body.style.overflow=body;document.documentElement.style.overflow=root};
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
      }).catch(()=>{
        if(!controller.signal.aborted)setFailedPreviews(current=>({...current,[channel.key]:true}));
      });
    }
    return()=>{controller.abort();urls.forEach(url=>URL.revokeObjectURL(url))};
  },[files]);
  useEffect(()=>setFailedPreviews({}),[head,files,uploaded]);

  function chooseFile(channel:Channel,file?:File){
    if(!file)return;
    if(!ACCEPTED.test(file.name)){setNotice('Use BMP or TIFF images.');return}
    setFilesByHead(current=>({...current,[head]:{...(current[head]||{}),[channel]:file}}));
    const viewKey=`${head}:${channel}`;
    setViews(current=>({...current,[viewKey]:DEFAULT_VIEW}));
    delete pixelsRef.current[viewKey];
    setUploadedByHead(current=>{const next={...current};delete next[head];return next});
    setResults(current=>Object.fromEntries(Object.entries(current).filter(([key])=>!key.startsWith(`${head}:`))));
    setNotice(`${CHANNELS.find(item=>item.key===channel)?.name} image loaded.`);
  }

  function changeView(key:string,patch:Partial<ImageView>){
    setViews(current=>({...current,[key]:{...(current[key]||DEFAULT_VIEW),...patch}}));
  }

  function cacheImagePixels(key:string,image:HTMLImageElement){
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

  function saveImages(){
    CHANNELS.forEach((channel,index)=>{
      const file=files[channel.key];
      if(!file)return;
      downloadLocalImage(file,`Focus_Head${head}_${index+1}_${file.name}`);
    });
    setNotice('Image downloads started.');
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

  function saveValues(){
    const lines=[`Focus Check | Head ${head} | ${TABS.find(item=>item.key===tab)?.label}`,`Created: ${new Date().toISOString()}`,''];
    for(const channel of CHANNELS){
      const value=results[`${head}:${testTab}:${channel.key}`];
      lines.push(`${channel.name}: ${value?.status.toUpperCase()||'N/A'}`);
      for(const expected of visibleMetrics(testTab,role)){
        const metric=value?.metrics.find(item=>item.key===expected.key);
        lines.push(metric?`  ${metric.label}: ${metric.value} (${metric.status}) | optimum ${metric.optimum.join('–')} | acceptable ${metric.acceptable.join('–')}`:`  ${expected.label}: n/a`);
      }
      for(const metric of value?.metrics.filter(item=>!EXPECTED_METRICS[testTab].some(expected=>expected.key===item.key))||[]){
        lines.push(`  ${metric.label}: ${metric.value} (${metric.status}) | optimum ${metric.optimum.join('–')} | acceptable ${metric.acceptable.join('–')}`);
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
    setBusy(true);
    try{
      const response=await fetch(dataPackageUrl(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataset_id:uploaded.datasetId,sample_id:uploaded.sampleId,camera_head:head})});
      if(!response.ok)throw new Error(`Data package failed (HTTP ${response.status}).`);
      const url=URL.createObjectURL(await response.blob());
      const link=document.createElement('a');link.href=url;link.download=`Focus_Head${head}_DataPackage.zip`;link.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setNotice('Data package downloaded.');
    }catch(error){setNotice((error as Error).message)}
    finally{setBusy(false)}
  }

  return <div className="focusModal" role="dialog" aria-modal="true" aria-label="Focus Check" onPointerDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <div className="focusWindow focusWorkbench">
      <datalist id="focus-known-macs">{Array.from(new Set(cameraConfig?.cameras.map(item=>item.mac_address).filter(value=>value&&value!=='UNASSIGNED')||[])).map(value=><option key={value} value={value}/>)}</datalist>
      <header className="focusHeader">
        <span className="focusHeaderIcon"><Activity/></span>
        <div><small>OPTICAL WORKSPACE · 4.2</small><h2>Focus Check</h2></div>
        <span className="focusHeaderMode"><i/>Offline image mode</span>
        <span className="focusHeadPill">HEAD {String(head).padStart(2,'0')}</span>
        <button className="focusIconButton" onClick={onClose} aria-label="Close Focus Check"><X/></button>
      </header>
      <nav className="focusTabs" aria-label="Focus Check sections">{TABS.map(item=><button key={item.key} className={tab===item.key?'active':''} onClick={()=>setTab(item.key)}>{item.label}</button>)}</nav>
      <div className="focusToolbar">
        <div className="focusHeads" aria-label="Camera head">{[1,2,3,4].map(value=><button key={value} className={head===value?'active':''} onClick={()=>setHead(value)}>Head {value}</button>)}</div>
        <span className="focusToolbarStatus"><i className={count===4?'ready':''}/>{count} / 4 images loaded</span>
      </div>
      <div className="focusContext">
        {tab==='lens'?<><b>Lens condition</b><div className="focusConditions">{LENS_CONDITIONS.map((condition,index)=><button key={condition} className={lensCondition===index?'active':''} onClick={()=>{setLensCondition(index);setNotice('Lens condition shown as reference; the offline backend uses one calculation profile.')}} title="Reference condition; offline backend uses one calculation profile">{condition}</button>)}</div></>:<><b>{TABS.find(item=>item.key===tab)?.label}</b><span>{tab==='camera'?'Camera assignment and capture parameters':tab==='general'?'Centre-line brightness and contrast':tab==='focus-resolution'?'Hardware jig · circle, cross and focus measurements':'Hardware jig · illumination and concentricity'}</span></>}
        <em>{tab==='camera'?'SETUP':tab==='general'?'PROFILE':tab==='lens'?'LENS':'JIG'}</em>
      </div>
      <section className="focusCameraGrid" aria-label="Four camera views">{CHANNELS.map((channel,index)=>{
        const value=results[`${head}:${testTab}:${channel.key}`];
        const camera=cameraConfig?.cameras.find(item=>item.head===head&&item.channel===channel.key);
        const imageUrl=uploaded?.head===head?previewUrl(uploaded.datasetId,uploaded.sampleId,channel.key):previews[channel.key];
        const viewKey=`${head}:${channel.key}`;
        const view=views[viewKey]||DEFAULT_VIEW;
        return <article key={channel.key} className={`focusCameraCard ${value?`is-${value.status}`:''}`}>
          <header className="focusCardHeader"><span className="focusCardNumber">{String(index+1).padStart(2,'0')}</span><b>{channel.name}</b><span className={`focusCardState ${value?`status-${value.status}`:''}`}>{value?value.status==='green'?'GOOD':value.status==='yellow'?'ACCEPTABLE':'OUT OF RANGE':files[channel.key]?'LOADED':'EMPTY'}</span></header>
          <div className={`focusCardImage ${files[channel.key]?'can-pan':''}`}
            onPointerDown={event=>{if(!files[channel.key]||(event.target as HTMLElement).closest('button'))return;dragRef.current={key:viewKey,x:event.clientX,y:event.clientY,offsetX:view.offsetX,offsetY:view.offsetY};event.currentTarget.setPointerCapture(event.pointerId)}}
            onPointerMove={event=>{if(view.probe)updateProbe(viewKey,event);const drag=dragRef.current;if(drag?.key!==viewKey)return;changeView(viewKey,{offsetX:drag.offsetX+event.clientX-drag.x,offsetY:drag.offsetY+event.clientY-drag.y})}}
            onPointerUp={()=>{dragRef.current=null}}
            onPointerCancel={()=>{dragRef.current=null}}
            onWheel={event=>{if(!files[channel.key])return;event.preventDefault();changeView(viewKey,{zoom:Math.min(3,Math.max(1,Math.round((view.zoom+(event.deltaY<0?.1:-.1))*10)/10))})}}>
            {files[channel.key]&&!failedPreviews[channel.key]&&imageUrl?<img src={imageUrl} alt={`${channel.name} focus image`} style={{transform:`translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.zoom})`}} onLoad={event=>cacheImagePixels(viewKey,event.currentTarget)} onError={()=>setFailedPreviews(current=>({...current,[channel.key]:true}))}/>:<div className="focusImageEmpty"><FileImage/>{files[channel.key]?<span>{failedPreviews[channel.key]?'Preview unavailable':'Preparing preview…'}</span>:<button onClick={()=>inputRefs.current[channel.key]?.click()}><ImagePlus/>Load image</button>}</div>}
            {(tab==='general'||tab==='focus-resolution')&&view.crosshair&&files[channel.key]&&!failedPreviews[channel.key]&&<span className="focusCrosshair" aria-hidden="true"/>}
            {files[channel.key]&&<div className="focusViewportTools" aria-label={`${channel.name} image controls`}><button title="Zoom out" aria-label={`Zoom out ${channel.name}`} onClick={()=>changeView(viewKey,{zoom:Math.max(1,Math.round((view.zoom-.1)*10)/10)})}><ZoomOut/></button><span>{Math.round(view.zoom*100)}%</span><button title="Zoom in" aria-label={`Zoom in ${channel.name}`} onClick={()=>changeView(viewKey,{zoom:Math.min(3,Math.round((view.zoom+.1)*10)/10)})}><ZoomIn/></button><button title="Reset view" aria-label={`Reset ${channel.name} view`} onClick={()=>changeView(viewKey,DEFAULT_VIEW)}><RotateCcw/></button><button className={view.crosshair?'active':''} title="Toggle crosshair" aria-label={`Toggle ${channel.name} crosshair`} onClick={()=>changeView(viewKey,{crosshair:!view.crosshair})}><Crosshair/></button><button className={view.probe?'active':''} title="Toggle image coordinates and gray value" aria-label={`Toggle ${channel.name} coordinates and gray value`} onClick={()=>changeView(viewKey,{probe:!view.probe})}><MousePointer2/></button></div>}
            {view.probe&&files[channel.key]&&<span className="focusCoordinate" ref={element=>{probeRefs.current[viewKey]=element}}>X — · Y — · Gray —</span>}
          </div>
          <div className="focusCardData">
            {tab==='camera'?<div className="focusCameraParameters">
              {camera?<>
                <label className="focusMacField">Assigned camera (MAC)<input list="focus-known-macs" aria-label={`${channel.name} MAC address`} value={camera.mac_address} disabled={system?.mode==='AUTO'} onChange={event=>updateCamera(camera.id,'mac_address',event.target.value)}/></label>
                <div className="focusParameterGrid">
                  {([{key:'exposure_us',label:'Exposure',unit:'µs',min:28,max:10000000},{key:'gain',label:'Gain',unit:'',min:0,max:490},{key:'black_level',label:'Black level',unit:'',min:0,max:600},{key:'current_a',label:'LED current',unit:'A',min:0,max:4},{key:'pulse_width_us',label:'Pulse width',unit:'µs',min:0,max:200000},{key:'led_channel',label:'LED channel',unit:'',min:1,max:16},{key:'width',label:'Width',unit:'px',min:1,max:2456},{key:'height',label:'Height',unit:'px',min:1,max:2058},{key:'offset_x',label:'Offset X',unit:'px',min:0,max:2455},{key:'offset_y',label:'Offset Y',unit:'px',min:0,max:2057},{key:'line_debouncer_time_us',label:'Debounce',unit:'µs',min:0,max:100}] as const).map(field=><label key={field.key}>{field.label}<span>{field.unit}</span><input type="number" min={field.min} max={field.max} step={field.key==='current_a'?'0.01':'1'} value={camera[field.key]} disabled={system?.mode==='AUTO'} onChange={event=>updateCamera(camera.id,field.key,event.target.value)}/></label>)}
                </div>
                <button className="focusAssign" disabled={busy||system?.mode==='AUTO'||!camera.mac_address||camera.mac_address==='UNASSIGNED'} onClick={()=>void assignCamera(camera.id)}><Camera/>{camera.assigned?'Update assignment':'Assign camera'}</button>
              </>:<div className="focusUnconfigured"><Camera/><b>No camera slot configured</b><span>Add a slot to enter assignment and capture settings.</span><button disabled={!cameraConfig||system?.mode==='AUTO'} onClick={()=>addCamera(channel.key)}>Add camera slot</button></div>}
            </div>:tab==='general'?<div className="focusGeneralData">
              <MetricRows tab={tab} result={value} role={role} onExplain={setNotice}/>
              <div className="focusProfiles"><ProfilePlot src={files[channel.key]&&!failedPreviews[channel.key]?imageUrl:undefined} axis="horizontal" view={view}/><ProfilePlot src={files[channel.key]&&!failedPreviews[channel.key]?imageUrl:undefined} axis="vertical" view={view}/></div>
            </div>:<div className="focusTestData"><MetricRows tab={tab} result={value} role={role} onExplain={setNotice}/><div className="focusDataTail">{tab==='lens'?'Condition reference · offline profile':tab==='focus-resolution'?'Circle · cross · focus jig':'Halo · illumination'}</div></div>}
          </div>
          <footer className="focusCardFooter"><span title={files[channel.key]?.name}>{files[channel.key]?.name||'BMP / TIFF image'}</span><input ref={element=>{inputRefs.current[channel.key]=element}} type="file" accept=".bmp,.tif,.tiff,image/bmp,image/tiff" hidden onChange={event=>{chooseFile(channel.key,event.target.files?.[0]);event.target.value=''}}/><button onClick={()=>inputRefs.current[channel.key]?.click()}><ImagePlus/>{files[channel.key]?'Replace':'Load'}</button></footer>
        </article>})}</section>
      <footer className="focusFooter focusCommandBar">
        <div className="focusCaptureControls"><button disabled title="No live camera connected"><Camera/>Snap</button><button disabled title="No live camera connected"><Video/>Grab</button><span><VideoOff/>Camera offline</span></div>
        <p role="status">{busy?<Loader2 className="focusSpin"/>:<span className="focusFooterDot"/>}{notice}</p>
        <div className="focusActions">
          <button className="focusSecondary" disabled={busy||count===0} onClick={()=>{setFilesByHead(current=>({...current,[head]:{}}));setResults(current=>Object.fromEntries(Object.entries(current).filter(([key])=>!key.startsWith(`${head}:`))));setUploadedByHead(current=>{const next={...current};delete next[head];return next});setNotice('Images cleared.')}}><RotateCcw/>Clear</button>
          <button className="focusSecondary" disabled={count===0} onClick={saveImages}><Download/>Save images</button>
          {tab==='camera'?<><button className="focusSecondary" disabled={busy||system?.mode!=='AUTO'} onClick={()=>void switchToSetup()}>Setup mode</button><button className="focusPrimary" disabled={busy||!cameraConfig||system?.mode==='AUTO'} onClick={()=>void saveCamera()}><Save/>Save to Outbox</button></>:<><button className="focusSecondary" disabled={!hasResults} onClick={saveValues}><Download/>Save values</button><button className="focusSecondary" disabled={!uploaded||uploaded.head!==head||busy} onClick={()=>void savePackage()}><Save/>Data package</button><button className="focusPrimary" disabled={busy||count!==4} onClick={()=>void evaluate()}>{busy?<Loader2 className="focusSpin"/>:<SlidersHorizontal/>}Run check</button></>}
        </div>
      </footer>
    </div>
  </div>;
}

function MetricRows({tab,result,role,onExplain}:{tab:TestTab;result?:FocusResult;role:Role;onExplain:(message:string)=>void}){
  const expected=visibleMetrics(tab,role);
  const extra=result?.metrics.filter(metric=>!EXPECTED_METRICS[tab].some(item=>item.key===metric.key))||[];
  return <div className="focusCompactMetrics">{expected.map(item=>{
    const metric=result?.metrics.find(value=>value.key===item.key);
    const detail=metric?`${metric.label}: optimum ${metric.optimum.join('–')}; acceptable ${metric.acceptable.join('–')}.`:'';
    return <div key={item.key} className={`focusCompactMetric ${metric?'has-range':''}`} title={detail||'Not reported by the current focus backend'} role={metric?'button':undefined} tabIndex={metric?0:undefined} onClick={()=>metric&&onExplain(detail)} onKeyDown={event=>{if(metric&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onExplain(detail)}}}><span>{metric?.label||item.label}</span><b className={metric?`status-${metric.status}`:'is-unavailable'}>{metric?metric.value.toFixed(2):'—'}</b></div>;
  })}{extra.map(metric=>{const detail=`${metric.label}: optimum ${metric.optimum.join('–')}; acceptable ${metric.acceptable.join('–')}.`;return <div key={metric.key} className="focusCompactMetric has-range" title={detail} role="button" tabIndex={0} onClick={()=>onExplain(detail)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onExplain(detail)}}}><span>{metric.label}</span><b className={`status-${metric.status}`}>{metric.value.toFixed(2)}</b></div>})}</div>;
}

function ProfilePlot({src,axis,view}:{src?:string;axis:'horizontal'|'vertical';view:ImageView}){
  const[values,setValues]=useState<number[]>([]);
  useEffect(()=>{
    if(!src){setValues([]);return}
    let active=true;
    const image=new Image();
    image.onload=()=>{
      try{
        const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
        const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return;
        context.fillStyle='#000';context.fillRect(0,0,64,64);
        const fitted=Math.min(64/image.width,64/image.height);
        const drawWidth=image.width*fitted*view.zoom;
        const drawHeight=image.height*fitted*view.zoom;
        context.drawImage(image,(64-drawWidth)/2+view.offsetX*.22,(64-drawHeight)/2+view.offsetY*.22,drawWidth,drawHeight);
        const pixels=context.getImageData(0,0,64,64).data;
        const next=Array.from({length:48},(_,index)=>{
          const coordinate=Math.round(index*63/47);
          const x=axis==='horizontal'?coordinate:32;
          const y=axis==='vertical'?coordinate:32;
          const offset=(y*64+x)*4;
          return Math.round((pixels[offset]*.2126+pixels[offset+1]*.7152+pixels[offset+2]*.0722));
        });
        if(active)setValues(next);
      }catch{if(active)setValues([])}
    };
    image.onerror=()=>{if(active)setValues([])};
    image.src=src;
    return()=>{active=false};
  },[src,axis,view.zoom,view.offsetX,view.offsetY]);
  const points=values.map((value,index)=>`${index*100/47},${30-value*28/255}`).join(' ');
  return <div className="focusProfile"><span>{axis==='horizontal'?'Horizontal':'Vertical'} brightness</span><svg viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={`${axis} brightness profile`}><path d="M0 15H100"/>{values.length>0&&<polyline points={points}/>}</svg></div>;
}
