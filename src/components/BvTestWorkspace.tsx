'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {Camera,Check,Download,FolderOpen,ImagePlus,Loader2,Play,Square,TestTube2,Upload,X} from 'lucide-react';
import {api,previewUrl} from '@/lib/api';
import {createLocalImagePreview,downloadLocalImage} from '@/lib/local-image-preview';
import type {InspectionResult,Job,Sample} from '@/types';

type Channel='h'|'p'|'d'|'n';
type Script={lens_type:string;name:string;loaded:boolean};
type TestDataset={id:string;name:string;sample_count:number;image_count:number};
type Busy='uploading'|'evaluating'|'starting'|null;

const CHANNELS=[
  {key:'h',short:'DBF',label:'Diffuse Brightfield',camera:1},
  {key:'p',short:'PC',label:'Phase Contrast',camera:4},
  {key:'d',short:'DF',label:'Darkfield',camera:2},
  {key:'n',short:'TBF',label:'Telecentric Brightfield',camera:3},
] as const;
const ACCEPTED=/\.(bmp|tif|tiff)$/i;
const ENDED=new Set<Job['status']>(['completed','failed','cancelled']);

function errorMessage(error:unknown){return error instanceof Error?error.message:String(error)}
function scriptList(value:unknown):Script[]{
  if(!value||typeof value!=='object'||!('scripts' in value)||!Array.isArray(value.scripts))return [];
  return value.scripts.filter((item:unknown):item is Script=>!!item&&typeof item==='object'&&'lens_type' in item&&typeof item.lens_type==='string'&&'name' in item&&typeof item.name==='string'&&'loaded' in item&&typeof item.loaded==='boolean');
}

export function BvTestWorkspace({onClose,onActivityChange}:{onClose:()=>void;onActivityChange?:(active:boolean)=>void}){
  const[files,setFiles]=useState<Partial<Record<Channel,File>>>({});
  const[localPreviews,setLocalPreviews]=useState<Partial<Record<Channel,string>>>({});
  const[imageErrors,setImageErrors]=useState<Record<string,boolean>>({});
  const[dataset,setDataset]=useState<TestDataset|null>(null);
  const[samples,setSamples]=useState<Sample[]>([]);
  const[results,setResults]=useState<InspectionResult[]>([]);
  const[scripts,setScripts]=useState<Script[]>([]);
  const[scriptError,setScriptError]=useState(false);
  const[bridgeUnavailable,setBridgeUnavailable]=useState(false);
  const[selectedScriptName,setSelectedScriptName]=useState('');
  const[capacity,setCapacity]=useState<number|null>(null);
  const[selectedId,setSelectedId]=useState<string|null>(null);
  const[shownWt,setShownWt]=useState(1);
  const[activeChannel,setActiveChannel]=useState<Channel>('h');
  const[mobilePanel,setMobilePanel]=useState<'images'|'results'>('images');
  const[job,setJob]=useState<Job|null>(null);
  const[jobId,setJobId]=useState<string|null>(null);
  const[busy,setBusy]=useState<Busy>(null);
  const[notice,setNotice]=useState('Load four camera images or an image folder.');
  const[error,setError]=useState('');
  const imageInputs=useRef<Partial<Record<Channel,HTMLInputElement|null>>>({});
  const batchInput=useRef<HTMLInputElement|null>(null);
  const folderInput=useRef<HTMLInputElement|null>(null);
  const dialogRef=useRef<HTMLDivElement|null>(null);
  const pollFailures=useRef(0);
  const activityCallback=useRef(onActivityChange);
  const isRunning=!!jobId&&!!job&&!ENDED.has(job.status);
  const isActive=isRunning||!!busy;
  const fileCount=CHANNELS.filter(channel=>!!files[channel.key]).length;
  const selectedSample=useMemo(()=>samples.find(item=>item.id===selectedId)||samples[0]||null,[samples,selectedId]);
  const resultBySample=useMemo(()=>new Map(results.map(item=>[item.sample_id,item])),[results]);
  const selectedResult=selectedSample?resultBySample.get(selectedSample.id)||null:null;
  const wtCount=Math.max(1,...samples.map(item=>item.wt_index));
  const layoutCapacity=capacity??Math.max(0,...samples.map(item=>item.position));
  const showMatrix=dataset!==null&&layoutCapacity>0&&samples.length>0;
  const canEvaluate=(!bridgeUnavailable&&!busy&&!isRunning&&(dataset!==null||fileCount===4));

  useEffect(()=>{activityCallback.current=onActivityChange;onActivityChange?.(isActive)},[onActivityChange]);
  useEffect(()=>{activityCallback.current?.(isActive)},[isActive]);
  useEffect(()=>()=>{activityCallback.current?.(false)},[]);

  useEffect(()=>{
    const bodyOverflow=document.body.style.overflow;
    const rootOverflow=document.documentElement.style.overflow;
    const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    document.body.style.overflow='hidden';
    document.documentElement.style.overflow='hidden';
    const focusFrame=window.requestAnimationFrame(()=>dialogRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus());
    let live=true;
    void Promise.allSettled([api.bvScripts(),api.trayLayout(),api.system()]).then(([scriptResult,layoutResult,systemResult])=>{
      if(!live)return;
      if(scriptResult.status==='fulfilled')setScripts(scriptList(scriptResult.value));else setScriptError(true);
      if(layoutResult.status==='fulfilled')setCapacity(layoutResult.value.images_per_tray);
      if(systemResult.status==='fulfilled'&&systemResult.value.bridge==='dsm-halcon-unavailable'){
        setBridgeUnavailable(true);
        setSelectedScriptName('');
        setNotice('HALCON bridge unavailable. Images can be reviewed, but evaluation cannot run.');
      }
    });
    return()=>{live=false;window.cancelAnimationFrame(focusFrame);document.body.style.overflow=bodyOverflow;document.documentElement.style.overflow=rootOverflow;previousFocus?.focus()};
  },[]);

  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.stopPropagation();if(!isActive)onClose();else setNotice('Wait for the current action or stop the BV test before closing.');return}
      if(event.key!=='Tab'||!dialogRef.current)return;
      const items=Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),select:not([disabled]),input:not([disabled]):not([hidden])')).filter(element=>element.getClientRects().length>0);
      if(!items.length){event.preventDefault();return}
      const first=items[0],last=items[items.length-1];
      if(event.shiftKey&&(document.activeElement===first||!dialogRef.current.contains(document.activeElement))){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&(document.activeElement===last||!dialogRef.current.contains(document.activeElement))){event.preventDefault();first.focus()}
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[isActive,onClose]);

  useEffect(()=>{
    const controller=new AbortController();
    const urls:string[]=[];
    setLocalPreviews({});
    setImageErrors({});
    for(const channel of CHANNELS){
      const file=files[channel.key];
      if(!file)continue;
      void createLocalImagePreview(file,controller.signal).then(url=>{
        if(controller.signal.aborted){URL.revokeObjectURL(url);return}
        urls.push(url);
        setLocalPreviews(current=>({...current,[channel.key]:url}));
      }).catch(()=>{if(!controller.signal.aborted)setImageErrors(current=>({...current,[channel.key]:true}))});
    }
    return()=>{controller.abort();urls.forEach(url=>URL.revokeObjectURL(url))};
  },[files]);

  useEffect(()=>setImageErrors({}),[dataset?.id,selectedId]);

  useEffect(()=>{
    if(!jobId||!dataset)return;
    let live=true;
    let timer=0;
    let lastCompleted=-1;
    const datasetId=dataset.id;
    async function tick(){
      try{
        const current=await api.job(jobId!);
        if(!live)return;
        setJob(current);
        if(pollFailures.current>=4)setError('');
        pollFailures.current=0;
        if(current.completed!==lastCompleted||ENDED.has(current.status)){
          lastCompleted=current.completed;
          const response=await api.results(datasetId);
          if(!live)return;
          setResults(response.items);
          if(response.items.length&&!selectedId)setSelectedId(response.items.at(-1)!.sample_id);
        }
        if(ENDED.has(current.status)){
          setJobId(null);
          if(current.status==='failed')setError(current.error||'BV test failed.');
          else setNotice(current.status==='cancelled'?'BV test stopped.':`Evaluation complete: ${current.completed} lenses.`);
          return;
        }
      }catch(cause){
        if(!live)return;
        pollFailures.current+=1;
        if(pollFailures.current>=4)setError(`Cannot read test progress; retrying: ${errorMessage(cause)}`);
      }
      if(live)timer=window.setTimeout(()=>void tick(),pollFailures.current>=4?2000:500);
    }
    void tick();
    return()=>{live=false;window.clearTimeout(timer)};
  },[jobId,dataset?.id]);

  function resetTest(){
    if(isRunning)return;
    setFiles({});setDataset(null);setSamples([]);setResults([]);setSelectedId(null);setShownWt(1);setJob(null);setJobId(null);setError('');
    setNotice('Load four camera images or an image folder.');
  }

  function chooseImage(channel:Channel,file?:File){
    if(!file)return;
    if(!ACCEPTED.test(file.name)){setError('Use BMP or TIFF camera images.');return}
    setFiles(current=>({...current,[channel]:file}));
    setDataset(null);setSamples([]);setResults([]);setSelectedId(null);setJob(null);setError('');
    setNotice(`${CHANNELS.find(item=>item.key===channel)?.label} loaded (${fileCount===3?'4/4':`${Math.min(4,fileCount+1)}/4`}).`);
    setActiveChannel(channel);
  }

  function chooseBatchImages(fileList:FileList|null){
    if(!fileList?.length)return;
    const chosen=Array.from(fileList).filter(file=>ACCEPTED.test(file.name));
    if(!chosen.length){setError('Use BMP or TIFF camera images.');return}
    const next:Partial<Record<Channel,File>>={};
    const cameraChannel:Record<string,Channel>={'1':'h','2':'d','3':'n','4':'p'};
    for(const file of chosen){
      const name=file.name.toLowerCase();
      const numbered=name.match(/#([1-4])\.(?:tif|tiff)$/);
      const letter=name.match(/\.([hdnp])\.bmp$/);
      const inferred=numbered?cameraChannel[numbered[1]]:letter?letter[1] as Channel:/dark|dunkel/.test(name)?'d':/phase|phasen/.test(name)?'p':/telecentric|telezentr/.test(name)?'n':/diffuse|hellfeld/.test(name)?'h':null;
      if(inferred&&!next[inferred])next[inferred]=file;
    }
    for(const file of chosen){
      if(Object.values(next).includes(file))continue;
      const vacant=(['h','d','n','p'] as const).find(channel=>!next[channel]);
      if(vacant)next[vacant]=file;
    }
    setFiles(next);setDataset(null);setSamples([]);setResults([]);setSelectedId(null);setJob(null);setError('');
    setNotice(`${Object.keys(next).length} camera images loaded. Review channel labels before evaluation.`);
    if(batchInput.current)batchInput.current.value='';
  }

  function saveImages(){
    if(selectedSample&&dataset){
      for(const channel of CHANNELS){
        if(!selectedSample.images[channel.key])continue;
        const link=document.createElement('a');
        link.href=previewUrl(dataset.id,selectedSample.id,channel.key);
        link.download=`${selectedSample.base_name}_${channel.short}.png`;
        link.click();
      }
      setNotice('Saving the selected lens images as PNG previews.');
      return;
    }
    for(const channel of CHANNELS){const file=files[channel.key];if(file)downloadLocalImage(file)}
    setNotice('Saving the loaded camera images.');
  }

  async function acceptDataset(uploaded:TestDataset){
    const response=await api.samples(uploaded.id);
    if(!response.items.length)throw new Error('The selected images did not contain a supported lens. Use BMP or TIFF files.');
    setDataset(uploaded);setSamples(response.items);setSelectedId(response.items[0].id);setShownWt(response.items[0].wt_index);
    setResults([]);setJob(null);setJobId(null);setFiles({});setError('');
    const incomplete=response.items.filter(sample=>CHANNELS.some(channel=>!sample.images[channel.key]));
    setNotice(incomplete.length?`${response.items.length} lenses loaded; ${incomplete.length} missing one or more camera images.`:`${response.items.length} lenses ready to evaluate.`);
    return response.items;
  }

  async function evaluateDataset(activeDataset:TestDataset,activeSamples:Sample[],scriptName:string){
    const incomplete=activeSamples.filter(sample=>CHANNELS.some(channel=>!sample.images[channel.key]));
    if(incomplete.length)throw new Error(`${incomplete.length} lens${incomplete.length===1?' is':'es are'} missing one or more camera images (DBF, DF, TBF, PC).`);
    const selectedScript=scripts.find(script=>script.name===scriptName&&script.loaded);
    setResults([]);setJob(null);
    if(activeSamples.length===1){
      setBusy('evaluating');setNotice('Evaluating lens with the active DSM bridge…');
      const output=await api.inspectOne(activeDataset.id,activeSamples[0].id,undefined,selectedScript?.lens_type||'AUTO',selectedScript?.name);
      setResults([output]);setSelectedId(output.sample_id);setNotice(`Evaluation complete: ${output.status}.`);
    }else{
      setBusy('starting');setNotice('Starting folder evaluation…');
      const started=await api.run(activeDataset.id,undefined,selectedScript?.lens_type||'AUTO',selectedScript?.name);
      setJob(started);setJobId(started.id);pollFailures.current=0;
      setNotice('Evaluating image folder with the active DSM bridge…');
    }
  }

  async function chooseScript(name:string){
    setSelectedScriptName(name);
    if(!name||!dataset||!samples.length||isActive||bridgeUnavailable)return;
    setError('');
    try{await evaluateDataset(dataset,samples,name)}
    catch(cause){setError(errorMessage(cause))}
    finally{setBusy(null)}
  }

  async function loadFolder(fileList:FileList|null){
    if(!fileList?.length||busy||isRunning)return;
    const files=Array.from(fileList).filter(file=>ACCEPTED.test(file.name));
    if(!files.length){setError('This folder has no BMP or TIFF camera images.');return}
    const folderName=files[0].webkitRelativePath?.split('/')[0]||'BV test folder';
    setBusy('uploading');setError('');setNotice('Loading image folder…');
    try{
      const items=files.map(file=>({file,relativePath:file.webkitRelativePath||file.name}));
      const uploaded=await api.uploadBvTestFiles(items,folderName);
      const loadedSamples=await acceptDataset(uploaded);
      if(!bridgeUnavailable&&selectedScriptName&&scripts.some(script=>script.name===selectedScriptName&&script.loaded))await evaluateDataset(uploaded,loadedSamples,selectedScriptName);
    }catch(cause){setError(errorMessage(cause))}
    finally{setBusy(null);if(folderInput.current)folderInput.current.value=''}
  }

  async function evaluate(){
    if(!canEvaluate)return;
    setError('');
    try{
      let activeDataset=dataset;
      let activeSamples=samples;
      if(!activeDataset){
        setBusy('uploading');setNotice('Preparing four camera images…');
        const name=`BV test ${new Date().toLocaleString()}`;
        const base=`BVTest_${Date.now()}`;
        const imageFiles=CHANNELS.map(channel=>{
          const file=files[channel.key]!;
          const suffix=file.name.split('.').pop()?.toLowerCase();
          const relativePath=suffix==='bmp'?`${base}.${channel.key}.bmp`:`${base}#${channel.camera}.${suffix==='tiff'?'tiff':'tif'}`;
          return {file,relativePath};
        });
        const uploaded=await api.uploadBvTestFiles(imageFiles,name);
        const response=await api.samples(uploaded.id);
        if(response.items.length!==1||CHANNELS.some(channel=>!response.items[0].images[channel.key]))throw new Error('The backend could not group these four images into one lens.');
        activeDataset=uploaded;activeSamples=response.items;
        setDataset(uploaded);setSamples(response.items);setSelectedId(response.items[0].id);setShownWt(response.items[0].wt_index);
      }
      await evaluateDataset(activeDataset,activeSamples,selectedScriptName);
    }catch(cause){setError(errorMessage(cause))}
    finally{setBusy(null)}
  }

  async function stop(){
    if(!jobId||!job||ENDED.has(job.status))return;
    try{setJob(await api.cancel(jobId));setNotice('Stopping after the current lens…')}
    catch(cause){setError(errorMessage(cause))}
  }

  const selectedWtSamples=samples.filter(sample=>sample.wt_index===shownWt);
  const positions=showMatrix?Array.from({length:layoutCapacity},(_,index)=>{
    const position=index+1;
    return {position,sample:selectedWtSamples.find(sample=>sample.position===position)};
  }):[];
  const resultCounts={OK:results.filter(row=>row.status==='OK').length,NOK:results.filter(row=>row.status==='NOK').length,WARN:results.filter(row=>row.status==='WARN').length};
  const progress=job?.total?Math.min(100,Math.round(job.completed/job.total*100)):dataset?.sample_count?Math.min(100,Math.round(results.length/dataset.sample_count*100)):0;
  const directoryProps={webkitdirectory:'',directory:''} as {webkitdirectory:string;directory:string};

  return <div className="bvTestModal" onPointerDown={event=>{if(event.target===event.currentTarget&&!isActive)onClose()}}>
    <div ref={dialogRef} className="bvTestWindow" data-panel={mobilePanel} role="dialog" aria-modal="true" aria-labelledby="bv-test-title">
      <header className="bvTestHeader">
        <span className="bvTestMark"><TestTube2 aria-hidden="true"/></span>
        <span className="bvTestTitle"><small>ADVANCED FUNCTIONS</small><h2 id="bv-test-title">BV Test</h2></span>
        <span className="bvTestHeaderMeta">4-camera inspection <i/> File input</span>
        <button className="bvTestClose" onClick={()=>isActive?setNotice('Wait for the current action or stop the BV test before closing.'):onClose()} aria-label="Close BV test" title={isActive?'Wait or stop test before closing':'Close BV test'}><X/></button>
      </header>

      <div className="bvTestToolbar">
        <div className="bvTestSourceActions">
          <button onClick={()=>batchInput.current?.click()} disabled={!!busy||isRunning}><ImagePlus/>Load images</button>
          <input ref={batchInput} type="file" accept=".bmp,.tif,.tiff" multiple hidden onChange={event=>chooseBatchImages(event.target.files)}/>
          <button onClick={()=>folderInput.current?.click()} disabled={!!busy||isRunning}><FolderOpen/>Load image folder</button>
          <button onClick={saveImages} disabled={!!busy||isRunning||(!dataset&&!fileCount)}><Download/>Save images</button>
          <input ref={folderInput} type="file" accept=".bmp,.tif,.tiff" multiple {...directoryProps} hidden onChange={event=>void loadFolder(event.target.files)}/>
        </div>
        <div className="bvTestHardware" title="Camera capture needs the production camera connection"><button disabled><Camera/>Snap</button><button disabled><Camera/>Grab</button><small>Camera not connected</small></div>
        <div className="bvTestSourceName" title={dataset?.name||'No folder loaded'}><span>{dataset?dataset.name:fileCount?`${fileCount} / 4 images loaded`:'No source loaded'}</span>{dataset&&<b>{dataset.sample_count} lenses</b>}</div>
      </div>

      <div className="bvTestMobileSwitch" role="tablist" aria-label="BV test view"><button role="tab" aria-selected={mobilePanel==='images'} className={mobilePanel==='images'?'active':''} onClick={()=>setMobilePanel('images')}>Images</button><button role="tab" aria-selected={mobilePanel==='results'} className={mobilePanel==='results'?'active':''} onClick={()=>setMobilePanel('results')}>Results</button></div>

      <div className="bvTestBody">
        <section className="bvTestImageSection" aria-label="Camera images">
          <div className="bvTestChannelRail" aria-label="Camera channels">{CHANNELS.map(channel=><button key={channel.key} className={activeChannel===channel.key?'active':''} onClick={()=>setActiveChannel(channel.key)}>{channel.short}</button>)}</div>
          <div className="bvTestImageGrid">{CHANNELS.map(channel=>{
            const record=selectedSample?.images[channel.key];
            const localFile=files[channel.key];
            const src=record&&dataset?previewUrl(dataset.id,selectedSample!.id,channel.key):localPreviews[channel.key];
            const imageKey=`${dataset?.id||'local'}:${selectedSample?.id||localFile?.lastModified||'empty'}:${channel.key}`;
            const channelResult=selectedResult?.channels.find(item=>item.channel===channel.key);
            const status=channelResult?.status||null;
            const fileName=record?.filename||localFile?.name||'No image';
            return <article key={channel.key} className={`bvTestImageCard ${activeChannel===channel.key?'active':''}`}>
              <header><span><i>{channel.short}</i><b>{channel.label}</b></span><em className={status?`is-${status.toLowerCase()}`:''}>{status||'CAM '+channel.camera}</em></header>
              <div className="bvTestImageStage">
                {src&&!imageErrors[imageKey]?<img key={imageKey} src={src} draggable={false} alt={`${channel.label} of ${selectedSample?.base_name||localFile?.name||'selected lens'}`} onError={()=>setImageErrors(current=>({...current,[imageKey]:true}))}/>:<div className="bvTestImageEmpty"><ImagePlus/><span>{imageErrors[imageKey]?'Preview unavailable':dataset?'Camera image missing':'No image loaded'}</span>{!dataset&&<button onClick={()=>imageInputs.current[channel.key]?.click()} disabled={!!busy||isRunning}><Upload/>Load {channel.short}</button>}</div>}
                <input ref={element=>{imageInputs.current[channel.key]=element}} type="file" accept=".bmp,.tif,.tiff" hidden onChange={event=>{chooseImage(channel.key,event.target.files?.[0]);event.target.value=''}}/>
              </div>
              <footer><span title={fileName}>{fileName}</span>{!dataset&&<button onClick={()=>imageInputs.current[channel.key]?.click()} disabled={!!busy||isRunning} title={`Replace ${channel.label} image`}><ImagePlus/>Replace</button>}</footer>
            </article>;
          })}</div>
        </section>

        <aside className="bvTestSide" aria-label="BV test controls and results">
          <section className="bvTestScriptSection"><div className="bvTestSectionHead"><span><small>PROCESSOR</small><b>Active inspection</b></span><span className="bvTestLiveDot"/></div>
            <label className="bvTestScriptSelect"><span>Evaluate</span><select value={selectedScriptName} onChange={event=>void chooseScript(event.target.value)} disabled={bridgeUnavailable||!scripts.some(script=>script.loaded)||isActive}><option value="">Active DSM bridge</option>{scripts.filter(script=>script.loaded&&!bridgeUnavailable).map(script=><option key={script.name} value={script.name}>{script.lens_type} · {script.name}</option>)}</select></label>
            <div className="bvTestScripts" title="Available scripts reported by the station">{scripts.length?scripts.map(script=><span key={`${script.lens_type}:${script.name}`} className={script.loaded&&!bridgeUnavailable?'loaded':''} title={script.name}><b>{script.lens_type}</b><small>{script.name}</small></span>):<span className="bvTestNoScript">{scriptError?'Script list unavailable':'No scripts reported'}</span>}</div>
            <p>{bridgeUnavailable?'HALCON bridge unavailable; connect the licensed inspection service to evaluate.':'Selecting a lens type starts a loaded image set. Evaluation currently uses the active DSM bridge for every type.'}</p>
          </section>

          <section className="bvTestBatchSection"><div className="bvTestSectionHead"><span><small>IMAGE SET</small><b>{dataset?dataset.name:'Current lens'}</b></span>{dataset&&<em>{dataset.sample_count} lenses · {dataset.image_count} images</em>}</div>
            {showMatrix?<><div className="bvTestWtSelector"><span>WT {shownWt} / {wtCount}</span><div>{Array.from({length:wtCount},(_,index)=><button key={index} className={shownWt===index+1?'active':''} onClick={()=>{setShownWt(index+1);const first=samples.find(sample=>sample.wt_index===index+1);if(first)setSelectedId(first.id)}}>{index+1}</button>)}</div></div>
              <div className="bvTestPositions">{positions.map(({position,sample})=>{
                const outcome=sample?resultBySample.get(sample.id)?.status:null;
                return <button key={position} className={`${selectedSample?.id===sample?.id?'selected':''} ${outcome?`is-${outcome.toLowerCase()}`:''} ${sample?'':'empty'}`} disabled={!sample} onClick={()=>{if(sample)setSelectedId(sample.id)}} title={sample?`P${position} · ${sample.base_name}${outcome?` · ${outcome}`:''}`:`P${position} · No test job`}><span>P{position}</span><i>{sample?outcome||'—':'No job'}</i></button>;
              })}</div><p className="bvTestEmptyLegend">Empty positions: no test job</p></>:<div className="bvTestBatchEmpty">{fileCount?`${fileCount} of 4 camera images loaded`:'Load four images or select a folder.'}</div>}
          </section>

          <section className="bvTestOutcomeSection"><div className="bvTestSectionHead"><span><small>RESULT</small><b>{selectedSample?`Position ${selectedSample.position}`:'No lens selected'}</b></span>{selectedResult&&<strong className={`is-${selectedResult.status.toLowerCase()}`}>{selectedResult.status}</strong>}</div>
            {selectedResult?<><div className="bvTestSummary"><span><i className="ok"/>OK <b>{resultCounts.OK}</b></span><span><i className="nok"/>NOK <b>{resultCounts.NOK}</b></span><span><i className="warn"/>WARN <b>{resultCounts.WARN}</b></span></div><div className="bvTestDefects" title={selectedResult.defects.map(defect=>defect.name).join(', ')||'No defect'}>{selectedResult.defects.length?selectedResult.defects.map(defect=>defect.name).filter((name,index,all)=>all.indexOf(name)===index).join(' · '):'No defects detected'}</div></>:<div className="bvTestNoResult">{isRunning?'Results appear as lenses finish.':'Evaluate to see real inspection results.'}</div>}
          </section>
        </aside>
      </div>

      <footer className="bvTestFooter">
        <div className="bvTestProgress"><span className="bvTestProgressTrack"><i style={{width:`${progress}%`}}/></span><span className="bvTestProgressText">{job?`${job.completed} / ${job.total} evaluated`:dataset?`${results.length} / ${dataset.sample_count} evaluated`:`${fileCount} / 4 images`}</span><small title={error||notice}>{error||notice}</small></div>
        <div className="bvTestFooterActions"><button className="bvTestReset" onClick={resetTest} disabled={isActive}>Clear</button>{isRunning?<button className="bvTestStop" onClick={()=>void stop()}><Square/>Stop</button>:<button className="bvTestEvaluate" onClick={()=>void evaluate()} disabled={!canEvaluate}>{busy?<Loader2 className="spin"/>:<Play/>}{busy?'Working…':'Evaluate'}</button>}<button className="bvTestDone" onClick={()=>isActive?setNotice('Wait for the current action or stop the BV test before closing.'):onClose()}>{!isActive&&results.length?<Check/>:<X/>}Close</button></div>
      </footer>
    </div>
  </div>;
}
