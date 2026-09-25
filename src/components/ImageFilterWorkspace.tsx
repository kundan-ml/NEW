"use client";

import {useEffect,useMemo,useState} from "react";
import {
  CalendarClock,Check,ChevronRight,Clock3,Database,FolderOpen,
  HardDrive,Image as ImageIcon,Info,Loader2,MapPin,Pause,Play,
  RefreshCw,Save,ShieldCheck,SlidersHorizontal,TimerReset,X,
} from "lucide-react";
import {api} from "@/lib/api";
import type {StorageRuntime,SystemInfo} from "@/types";

type FilterTab="selection"|"storage"|"schedule";
type StorageMode="total"|"per-position"|"per-error";
type EndMode="never"|"date"|"events";
type Pattern="daily"|"weekly";
type ErrorOption={key:string;label:string;color:string;symbol:string;severity?:string};
type FilterSettings={
  positions:number[];
  result_types:string[];
  error_classes:string[];
  storage_path:string;
  image_count:number;
  storage_mode:StorageMode;
  apply_to_display:boolean;
  storage_information:string;
  recurring:{enabled:boolean;start_date:string;start_time:string;interval_enabled:boolean;interval_minutes:number;pattern:Pattern;every_n:number;weekdays:number[];end_mode:EndMode;end_date:string;end_after_events:number};
};

const defaults:FilterSettings={positions:Array.from({length:16},(_,i)=>i+1),result_types:["OK","NOK","WARN"],error_classes:[],storage_path:"./storage/optimization",image_count:100,storage_mode:"total",apply_to_display:false,storage_information:"Offline optimization run",recurring:{enabled:false,start_date:"",start_time:"00:00",interval_enabled:false,interval_minutes:480,pattern:"daily",every_n:1,weekdays:[0,1,2,3,4],end_mode:"never",end_date:"",end_after_events:10}};
const fallbackErrors:ErrorOption[]=[
  {key:"ok",label:"OK",color:"#22c55e",symbol:"✓",severity:"OK"},{key:"inspection-error",label:"Inspection error",color:"#ef4444",symbol:"!"},{key:"acquisition-error",label:"Acquisition error",color:"#f97316",symbol:"A"},{key:"no-inspection-parameters",label:"No inspection parameters",color:"#eab308",symbol:"?",severity:"WARN"},
  {key:"no-inspection-order",label:"No inspection order",color:"#f59e0b",symbol:"!",severity:"WARN"},{key:"illumination-error",label:"Illumination error",color:"#fb7185",symbol:"☼"},{key:"no-bottom-lens",label:"No bottom lens found",color:"#a855f7",symbol:"B"},{key:"no-lens",label:"No lens",color:"#64748b",symbol:"Ø"},
  {key:"multiple-lenses",label:"Multiple lenses",color:"#8b5cf6",symbol:"2"},{key:"diameter",label:"Diameter",color:"#06b6d4",symbol:"D"},{key:"geometry-error",label:"Geometry error",color:"#0ea5e9",symbol:"G"},{key:"lens-not-floated",label:"Lens not floated",color:"#6366f1",symbol:"F"},
  {key:"bubble",label:"Bubble",color:"#3b82f6",symbol:"●"},{key:"startear",label:"Startear",color:"#f97316",symbol:"✦"},{key:"edge-error",label:"Edge defect",color:"#d946ef",symbol:"◖"},{key:"dent-scorching",label:"Dent with scorching",color:"#ec4899",symbol:"⌁"},
  {key:"tear",label:"Tear",color:"#ef4444",symbol:"╱"},{key:"roadmaps",label:"Roadmaps",color:"#d4a017",symbol:"≋"},{key:"entrapment",label:"Entrapment",color:"#67e8f9",symbol:"◆"},{key:"under-dosed",label:"Underdosed lens",color:"#38bdf8",symbol:"◌"},
  {key:"surface",label:"Surface error",color:"#fb7185",symbol:"◍"},{key:"material-foam",label:"Material foam",color:"#c2b280",symbol:"○"},{key:"toric-mark",label:"Toric mark defect",color:"#14b8a6",symbol:"T"},{key:"sph-nok",label:"SPH NOK",color:"#ef4444",symbol:"S"},
  {key:"multiple-errors",label:"Multiple errors inside",color:"#dc2626",symbol:"M"},{key:"cyl-nok",label:"CYL NOK",color:"#f43f5e",symbol:"C"},{key:"axis-nok",label:"Axis NOK",color:"#e11d48",symbol:"X"},{key:"pseudo",label:"Pseudo Error",color:"#f472b6",symbol:"P",severity:"WARN"},
];
const resultOptions=[{key:"OK",label:"Inspection OK",color:"var(--status-ok)"},{key:"NOK",label:"Not OK",color:"var(--status-nok)"},{key:"WARN",label:"Warning",color:"var(--status-warn)"}];
const weekdays=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export function ImageFilterWorkspace({modal=false,onClose}:{modal?:boolean;onClose?:()=>void}={}){
  const[tab,setTab]=useState<FilterTab>("selection");
  const[settings,setSettings]=useState<FilterSettings>(defaults);
  const[baseline,setBaseline]=useState<FilterSettings>(defaults);
  const[errors,setErrors]=useState<ErrorOption[]>(fallbackErrors);
  const[system,setSystem]=useState<SystemInfo|null>(null);
  const[runtime,setRuntime]=useState<StorageRuntime|null>(null);
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[notice,setNotice]=useState("");
  const capacity=system?.settings.wt_capacity||16;
  const dirty=JSON.stringify(settings)!==JSON.stringify(baseline);

  async function load(){
    setLoading(true);setNotice("");
    const[filterResult,errorResult,systemResult,runtimeResult]=await Promise.allSettled([api.getFilters(),api.errorMap(),api.system(),api.storageState()]);
    if(filterResult.status==="fulfilled"){
      const next={...defaults,...filterResult.value,recurring:{...defaults.recurring,...filterResult.value.recurring}} as FilterSettings;
      setSettings(next);setBaseline(next);
    }
    if(errorResult.status==="fulfilled"){
      const mapped=(errorResult.value as {lens_error_classes?:ErrorOption[]}).lens_error_classes;
      if(mapped?.length){const live=new Map(mapped.map(item=>[item.key,item]));setErrors(fallbackErrors.map(item=>live.get(item.key)||item).concat(mapped.filter(item=>!fallbackErrors.some(base=>base.key===item.key))))}
    }
    if(systemResult.status==="fulfilled")setSystem(systemResult.value);
    if(runtimeResult.status==="fulfilled")setRuntime(runtimeResult.value);
    if(filterResult.status==="rejected")setNotice(filterResult.reason instanceof Error?filterResult.reason.message:"Unable to load filter configuration");
    setLoading(false);
  }
  useEffect(()=>{void load()},[]);
  useEffect(()=>{if(!modal)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose?.()};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close)},[modal,onClose]);
  useEffect(()=>{setSettings(old=>({...old,positions:old.positions.filter(position=>position<=capacity)}))},[capacity]);

  function patch<K extends keyof FilterSettings>(key:K,value:FilterSettings[K]){setSettings(old=>({...old,[key]:value}))}
  function patchRecurring<K extends keyof FilterSettings["recurring"]>(key:K,value:FilterSettings["recurring"][K]){setSettings(old=>({...old,recurring:{...old.recurring,[key]:value}}))}
  function toggleList(key:"positions"|"result_types"|"error_classes",value:number|string){setSettings(old=>{const list=old[key] as Array<number|string>,next=list.includes(value)?list.filter(item=>item!==value):[...list,value];return {...old,[key]:next}})}
  async function save(){setSaving(true);setNotice("");try{const saved=await api.saveFilters(settings) as FilterSettings;setSettings(saved);setBaseline(saved);setNotice("Image filter configuration saved") }catch(error){setNotice(error instanceof Error?error.message:"Unable to save configuration")}finally{setSaving(false)}}
  async function toggleStorage(){setSaving(true);setNotice("");try{if(dirty)await api.saveFilters(settings);const next=runtime?.active?await api.storageStop():await api.storageStart();setRuntime(next);setBaseline(settings);setNotice(next.active?"Optimization image storage started":"Image storage stopped")}catch(error){setNotice(error instanceof Error?error.message:"Unable to update image storage")}finally{setSaving(false)}}
  const selectedSummary=useMemo(()=>`${settings.result_types.length} results · ${settings.error_classes.length||"all"} defects · ${settings.positions.length}/${capacity} positions`,[settings,capacity]);
  const completion=runtime?.active&&settings.image_count?Math.min(100,(runtime.saved_lenses/settings.image_count)*100):0;

  const workspace=<div className={`imageFilterPage ${modal?"imageFilterDialogPage":""}`}>
    {modal&&<div className="imageFilterDialogTitle"><span><SlidersHorizontal/><b>Image Filter Configuration</b><small>Optimization image rules</small></span><button onClick={onClose} aria-label="Close image filter"><X/></button></div>}
    <header className="filterHero">
      <div className="filterHeroTitle"><img src="/brand/emage-mark.png" alt="Emage Group"/><span><small><SlidersHorizontal/> Lens Inspection Control Center</small><h1>Image Filter & Storage</h1><p>Optimization capture · Operation 3.2.3</p></span></div>
      <div className="filterHeroStatus">
        <span className={runtime?.active?"recording":"ready"}><i/>{runtime?.active?"Storage active":"System ready"}</span>
        <span><small>Line</small><b>{system?.settings.line_name||"—"}</b></span>
        <span><small>Station</small><b>{system?.settings.station_name||"—"}</b></span>
        <span><small>WT capacity</small><b>{capacity}</b></span>
        <span className="filterHeaderUser"><small>{system?.session.role||"Production"}</small><b>{system?.session.username||"Operator"}</b></span>
      </div>
    </header>

    <div className="filterStepBar">
      {(["selection","storage","schedule"] as FilterTab[]).map((item,index)=><button key={item} className={tab===item?"active":""} onClick={()=>setTab(item)}><i>{index+1}</i><span><small>{item==="selection"?"FILTER RULES":item==="storage"?"OUTPUT CONTROL":"AUTOMATION"}</small><b>{item==="selection"?"Selection":item==="storage"?"Storage mode":"Schedule"}</b></span><ChevronRight/></button>)}
      <div className="filterSelectionSummary"><small>ACTIVE SCOPE</small><b>{selectedSummary}</b></div>
    </div>

    {loading?<div className="filterLoading"><Loader2 className="spin"/><span>Loading image filter configuration…</span></div>:<main className="filterWorkspace">
      {tab==="selection"&&<SelectionPanel settings={settings} errors={errors} capacity={capacity} toggleList={toggleList} patch={patch}/>} 
      {tab==="storage"&&<StoragePanel settings={settings} runtime={runtime} patch={patch}/>} 
      {tab==="schedule"&&<SchedulePanel settings={settings} patchRecurring={patchRecurring}/>} 
      <aside className="filterInsightRail">
        <section className="filterInsightCard live"><div className="filterSectionTitle"><span><small>LIVE STORAGE</small><h2>{runtime?.active?"Capturing images":"Ready to capture"}</h2></span><Database/></div><div className="filterProgress"><i><em style={{width:`${completion}%`}}/></i><span><b>{runtime?.saved_lenses||0}</b><small>of {settings.image_count} lenses</small></span></div><div className="filterStats"><span><small>Images</small><b>{runtime?.saved_images||0}</b></span><span><small>Events</small><b>{runtime?.event_count||0}</b></span><span><small>Mode</small><b>{settings.storage_mode.replace("per-","")}</b></span></div></section>
        <section className="filterInsightCard"><div className="filterSectionTitle"><span><small>FILTER LOGIC</small><h2>Current selection</h2></span><ShieldCheck/></div><div className="filterLogic"><span><i className="result"/>Result types<b>{settings.result_types.length}</b></span><em>AND</em><span><i className="defect"/>Defect classes<b>{settings.error_classes.length||"All"}</b></span><em>AND</em><span><i className="position"/>WT positions<b>{settings.positions.length}</b></span></div><p>Only images matching all enabled filter groups are retained.</p></section>
        <section className="filterInsightCard path"><div className="filterSectionTitle"><span><small>DESTINATION</small><h2>Optimization archive</h2></span><HardDrive/></div><code>{settings.storage_path}</code><span><i className={runtime?.active?"online":""}/>{runtime?.active?"Writing to ring buffer":"Storage idle"}</span></section>
      </aside>
    </main>}

    <footer className="filterActionBar">
      <div><Info/><span><b>{dirty?"Unsaved configuration":"Configuration synchronized"}</b><small>{notice||"Settings are stored in the backend image-filter configuration."}</small></span></div>
      {!modal&&<button className="filterSecondary" onClick={()=>{setSettings(baseline);setNotice("Unsaved changes discarded")}} disabled={!dirty||saving}><RefreshCw/>Discard</button>}
      <button className="filterSecondary" onClick={()=>void save()} disabled={!dirty||saving}>{saving?<Loader2 className="spin"/>:<Save/>}{modal?"Save":"Save settings"}</button>
      <button className={`filterPrimary ${runtime?.active?"stop":""}`} onClick={()=>void toggleStorage()} disabled={saving}>{runtime?.active?<Pause/>:<Play/>}{modal?(runtime?.active?"Stop":"Apply"):(runtime?.active?"Stop storage":"Start storage")}</button>
      {modal&&<button className="filterSecondary" onClick={onClose}><X/>Close</button>}
    </footer>
  </div>;
  return modal?<div className="imageFilterModal" role="dialog" aria-modal="true" aria-label="Image Filter Configuration" onMouseDown={event=>{if(event.target===event.currentTarget)onClose?.()}}><div className="imageFilterModalWindow">{workspace}</div></div>:workspace;
}

type PanelProps={settings:FilterSettings;patch:<K extends keyof FilterSettings>(key:K,value:FilterSettings[K])=>void};
function SelectionPanel({settings,errors,capacity,toggleList,patch}:PanelProps&{errors:ErrorOption[];capacity:number;toggleList:(key:"positions"|"result_types"|"error_classes",value:number|string)=>void}){
  const positions=Array.from({length:capacity},(_,i)=>i+1);
  return <div className="filterMainColumn">
    <section className="filterPanel"><div className="filterSectionTitle"><span><small>RESULT FILTER</small><h2>Inspection outcomes</h2><p>Select the result categories eligible for display and storage.</p></span><button onClick={()=>patch("result_types",settings.result_types.length?[]:["OK","NOK","WARN"])}>{settings.result_types.length?"Clear":"Select all"}</button></div><div className="resultTypeGrid">{resultOptions.map(item=><button key={item.key} className={settings.result_types.includes(item.key)?"selected":""} onClick={()=>toggleList("result_types",item.key)} style={{"--result-color":item.color} as React.CSSProperties}><i>{settings.result_types.includes(item.key)&&<Check/>}</i><span><b>{item.label}</b><small>{item.key}</small></span></button>)}</div></section>
    <section className="filterPanel grow"><div className="filterSectionTitle"><span><small>DEFECT FILTER</small><h2>Error classes</h2><p>No selection means that every configured defect class is accepted.</p></span><button onClick={()=>patch("error_classes",settings.error_classes.length?[]:errors.map(item=>item.key))}>{settings.error_classes.length?"Deactivate all":"Activate all"}</button></div><div className="defectFilterGrid">{errors.map(item=><button key={item.key} className={settings.error_classes.includes(item.key)?"selected":""} onClick={()=>toggleList("error_classes",item.key)} style={{"--defect-color":item.color} as React.CSSProperties}><i>{item.symbol}</i><span><b>{item.label}</b><small>{item.severity||"NOK"}</small></span><em>{settings.error_classes.includes(item.key)&&<Check/>}</em></button>)}</div></section>
    <section className="filterPanel"><div className="filterSectionTitle"><span><small>WT POSITION FILTER</small><h2>Tray positions</h2><p>Choose which positions are included in the storage rule.</p></span><div><button onClick={()=>patch("positions",positions)}>Activate all</button><button onClick={()=>patch("positions",[])}>Deactivate all</button></div></div><div className="positionFilterGrid" style={{"--position-count":Math.min(capacity,16)} as React.CSSProperties}>{positions.map(position=><button key={position} className={settings.positions.includes(position)?"selected":""} onClick={()=>toggleList("positions",position)}><span>{position}</span><small>P{String(position).padStart(2,"0")}</small></button>)}</div><label className="filterToggle"><input type="checkbox" checked={settings.apply_to_display} onChange={event=>patch("apply_to_display",event.target.checked)}/><i/><span><b>Apply filter to display</b><small>Use the same rule for the large inspection viewer.</small></span></label></section>
  </div>
}

function StoragePanel({settings,runtime,patch}:PanelProps&{runtime:StorageRuntime|null}){
  const modes=[{key:"total",title:"Total number",copy:"Stop after the total lens target is reached.",icon:ImageIcon},{key:"per-position",title:"Per position",copy:"Reach the target separately for every selected WT position.",icon:MapPin},{key:"per-error",title:"Per error",copy:"Reach the target separately for every selected defect class.",icon:ShieldCheck}] as const;
  return <div className="filterMainColumn storageConfig">
    <section className="filterPanel grow"><div className="filterSectionTitle"><span><small>COUNTING STRATEGY</small><h2>Image storage mode</h2><p>Choose how the configured lens target is evaluated.</p></span></div><div className="storageModeGrid">{modes.map(({key,title,copy,icon:Icon})=><button key={key} className={settings.storage_mode===key?"selected":""} onClick={()=>patch("storage_mode",key)}><i><Icon/></i><span><b>{title}</b><small>{copy}</small></span><em>{settings.storage_mode===key&&<Check/>}</em></button>)}</div></section>
    <section className="filterPanel storageFields"><div className="filterSectionTitle"><span><small>STORAGE OUTPUT</small><h2>Destination and volume</h2></span>{runtime?.active&&<strong><i/>Writing</strong>}</div><div className="filterFormGrid"><label className="wide">Destination folder<span><input value={settings.storage_path} onChange={event=>patch("storage_path",event.target.value)}/><button title="Choose folder"><FolderOpen/></button></span><small>System drive C: is not permitted in production.</small></label><label>Number of lenses<input type="number" min="1" value={settings.image_count} onChange={event=>patch("image_count",Math.max(1,Number(event.target.value)||1))}/></label><label>Estimated images<input readOnly value={settings.image_count*Math.max(1,settings.positions.length)}/></label><label className="wide">Storage information <em>{settings.storage_information.length}/50</em><textarea maxLength={50} value={settings.storage_information} onChange={event=>patch("storage_information",event.target.value)} placeholder="Reason for image storage"/><small>Written to TIFF metadata as the subject.</small></label></div></section>
  </div>
}

function SchedulePanel({settings,patchRecurring}:{settings:FilterSettings;patchRecurring:<K extends keyof FilterSettings["recurring"]>(key:K,value:FilterSettings["recurring"][K])=>void}){
  const r=settings.recurring;
  return <div className="filterMainColumn scheduleConfig">
    <section className="filterPanel scheduleMaster"><div className="filterSectionTitle"><span><small>RECURRING IMAGE STORAGE</small><h2>Automation schedule</h2><p>Run the active filter automatically at planned production intervals.</p></span><label className="compactSwitch"><input type="checkbox" checked={r.enabled} onChange={event=>patchRecurring("enabled",event.target.checked)}/><i/><b>{r.enabled?"Enabled":"Disabled"}</b></label></div></section>
    <div className={`scheduleCards ${r.enabled?"":"disabled"}`}>
      <section className="filterPanel"><div className="scheduleIcon"><CalendarClock/></div><small>01 · START</small><h2>Starting point</h2><div className="filterFormGrid"><label>Start date<input type="date" value={r.start_date} onChange={event=>patchRecurring("start_date",event.target.value)}/></label><label>Start time<input type="time" value={r.start_time} onChange={event=>patchRecurring("start_time",event.target.value)}/></label></div><label className="filterToggle"><input type="checkbox" checked={r.interval_enabled} onChange={event=>patchRecurring("interval_enabled",event.target.checked)}/><i/><span><b>Interval storage</b><small>Repeat within each active event.</small></span></label>{r.interval_enabled&&<label className="scheduleInline">Interval <input type="number" min="1" value={r.interval_minutes} onChange={event=>patchRecurring("interval_minutes",Math.max(1,Number(event.target.value)||1))}/><span>minutes</span></label>}</section>
      <section className="filterPanel"><div className="scheduleIcon"><Clock3/></div><small>02 · SERIES</small><h2>Repeat pattern</h2><div className="patternSwitch"><button className={r.pattern==="daily"?"active":""} onClick={()=>patchRecurring("pattern","daily")}>Daily</button><button className={r.pattern==="weekly"?"active":""} onClick={()=>patchRecurring("pattern","weekly")}>Weekly</button></div><label className="scheduleInline">Every <input type="number" min="1" value={r.every_n} onChange={event=>patchRecurring("every_n",Math.max(1,Number(event.target.value)||1))}/><span>{r.pattern==="daily"?"day(s)":"week(s)"}</span></label>{r.pattern==="weekly"&&<div className="weekdayGrid">{weekdays.map((day,index)=><button key={day} className={r.weekdays.includes(index)?"selected":""} onClick={()=>patchRecurring("weekdays",r.weekdays.includes(index)?r.weekdays.filter(item=>item!==index):[...r.weekdays,index])}>{day}</button>)}</div>}</section>
      <section className="filterPanel"><div className="scheduleIcon"><TimerReset/></div><small>03 · END</small><h2>End condition</h2><div className="endOptions">{(["never","date","events"] as EndMode[]).map(mode=><button key={mode} className={r.end_mode===mode?"selected":""} onClick={()=>patchRecurring("end_mode",mode)}><i/>{mode==="never"?"No end date":mode==="date"?"On a date":"After events"}</button>)}</div>{r.end_mode==="date"&&<label className="scheduleInline">End date<input type="date" value={r.end_date} onChange={event=>patchRecurring("end_date",event.target.value)}/></label>}{r.end_mode==="events"&&<label className="scheduleInline">Stop after<input type="number" min="1" value={r.end_after_events} onChange={event=>patchRecurring("end_after_events",Math.max(1,Number(event.target.value)||1))}/><span>events</span></label>}</section>
    </div>
  </div>
}
