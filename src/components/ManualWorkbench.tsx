'use client';

import {useMemo,useState} from 'react';
import {AppShell} from './AppShell';
import {Camera,Check,ChevronDown,FolderOpen,Play,RotateCcw,Save,Upload} from 'lucide-react';

type Kind='registration'|'focus'|'settings'|'test'|'filter';

const copy={
  registration:{eyebrow:'Advanced functions · 4.1',title:'Camera Registration',subtitle:'Register every camera head against its reference geometry',tabs:['Camera Head 1','Camera Head 2','Camera Head 3','Camera Head 4']},
  focus:{eyebrow:'Advanced functions · 4.2',title:'Focus Check',subtitle:'Camera system, lens quality, focus and illumination',tabs:['Camera system','General','Lens','Focus + Resolution','Lighting']},
  settings:{eyebrow:'Advanced functions · 4.3',title:'General Settings',subtitle:'Production, inspection and display parameters',tabs:['General','Camera settings','Triggerbox','System','Image storage']},
  test:{eyebrow:'Advanced functions · 4.4',title:'BV Test',subtitle:'Evaluate a complete image folder with the active inspection script',tabs:['Image Folder','Evaluation','Results']},
  filter:{eyebrow:'Operation · 3.2.3',title:'Image Filter',subtitle:'Select which lens images are stored during inspection',tabs:['Selection','Storage mode','Schedule']}
} as const;

const channels=['Diffuse bright field','Dark field','Phase contrast','Bright field'];

export function ManualWorkbench({kind}:{kind:Kind}){
  const c=copy[kind];
  const[tab,setTab]=useState(0);
  const[head,setHead]=useState(0);
  const[selected,setSelected]=useState(()=>new Set(['Dark field','Phase contrast']));
  const[run,setRun]=useState(false);
  const cams=useMemo(()=>channels.map((name,i)=>({name,value:72-i*9,status:i===2?'Review':'Ready'})),[]);
  function toggle(name:string){setSelected(old=>{const n=new Set(old);n.has(name)?n.delete(name):n.add(name);return n})}

  return <AppShell><div className="manualPage">
    <header className="manualHeader">
      <div><span>{c.eyebrow}</span><h1>{c.title}</h1><p>{c.subtitle}</p></div>
      <div className="manualHeaderActions"><span className="manualMachine"><i/> OKLIN3 · Station 01</span><button className="manualBtn secondary"><RotateCcw size={14}/>Reset</button><button className="manualBtn primary"><Save size={14}/>Apply</button></div>
    </header>
    <nav className="manualTabs" aria-label={`${c.title} sections`}>{c.tabs.map((t,i)=><button key={t} className={tab===i?'active':''} onClick={()=>setTab(i)}>{t}</button>)}</nav>

    {kind==='filter'?<FilterBody selected={selected} toggle={toggle}/>:kind==='test'?<TestBody run={run} setRun={setRun}/>:<div className="manualGrid">
      <section className="manualCard previewCard">
        <div className="manualCardTitle"><div><small>LIVE CAMERA ARRAY</small><h2>{kind==='registration'?'Registration overview':kind==='focus'?'Optical evaluation':'System configuration'}</h2></div><span className="manualStatus"><i/>Connected</span></div>
        <div className="cameraHeadSelect">{[0,1,2,3].map(i=><button key={i} className={head===i?'active':''} onClick={()=>setHead(i)}>Camera head {i+1}</button>)}</div>
        <div className="manualCameraGrid">{cams.map((cam,i)=><article key={cam.name} className="cameraTile"><div className={`lensSim lens${i}`}><span/><b>CAM {i+1}</b></div><div className="cameraMeta"><span>{cam.name}</span><b>{cam.status}</b></div></article>)}</div>
        <div className="manualReadout"><span>Head <b>{head+1}</b></span><span>Lens type <b>SPH</b></span><span>Recipe <b>Standard</b></span><span>Last calibration <b>21 Sep 2026 · 14:32</b></span></div>
      </section>
      <aside className="manualSide">
        <section className="manualCard controlsCard"><div className="manualCardTitle"><div><small>PARAMETERS</small><h2>{c.tabs[tab]}</h2></div><ChevronDown size={17}/></div><ParameterForm kind={kind}/></section>
        <section className="manualCard actionCard"><div><small>CHANGE CONTROL</small><h3>Configuration output</h3><p>Changes are written to the Outbox and become active after approval.</p></div><button className="manualBtn primary full"><Check size={14}/>Save configuration</button></section>
      </aside>
    </div>}
  </div></AppShell>
}

function ParameterForm({kind}:{kind:Kind}){
  return <div className="parameterForm">
    <label>Camera system<select defaultValue="DSM Flex BV"><option>DSM Flex BV</option><option>LS Flex BV</option></select></label>
    <label>Camera channel<select defaultValue="Diffuse bright field"><option>Diffuse bright field</option><option>Dark field</option><option>Phase contrast</option></select></label>
    <div className="fieldPair"><label>Exposure [µs]<input defaultValue="1800"/></label><label>Gain<input defaultValue="1.00"/></label></div>
    <label>Brightness threshold<input type="range" min="0" max="255" defaultValue="128"/><span className="rangeLabels"><i>0</i><b>128</b><i>255</i></span></label>
    <div className="fieldPair"><label>Offset X [px]<input defaultValue="0.00"/></label><label>Offset Y [px]<input defaultValue="0.00"/></label></div>
    <label className="manualCheck"><input type="checkbox" defaultChecked/><span/>Save camera images during {kind==='focus'?'focus check':'setup'}</label>
  </div>
}

function FilterBody({selected,toggle}:{selected:Set<string>,toggle:(s:string)=>void}){
  return <div className="manualGrid filterLayout"><section className="manualCard"><div className="manualCardTitle"><div><small>IMAGE SELECTION</small><h2>Lens image channels</h2></div><span>{selected.size} selected</span></div><div className="filterRows">{channels.map((name,i)=><button key={name} className={selected.has(name)?'selected':''} onClick={()=>toggle(name)}><span className={`filterPreview lens${i}`}/><span><b>{name}</b><small>Camera {i+1} · original image</small></span><i>{selected.has(name)?<Check size={14}/>:null}</i></button>)}</div></section><aside className="manualSide"><section className="manualCard controlsCard"><div className="manualCardTitle"><div><small>STORAGE</small><h2>Image storage mode</h2></div></div><div className="parameterForm"><label>Mode<select defaultValue="Only faulty lenses"><option>All lenses</option><option>Only faulty lenses</option><option>Recurring storage</option></select></label><label>Output folder<div className="pathField"><input defaultValue="C:\\MA\\Outbox\\Images"/><button><FolderOpen size={15}/></button></div></label><label>File format<select><option>PNG</option><option>TIFF</option><option>BMP</option></select></label><label className="manualCheck"><input type="checkbox" defaultChecked/><span/>Create subfolder for every WT</label></div></section></aside></div>
}

function TestBody({run,setRun}:{run:boolean,setRun:(v:boolean)=>void}){
  return <div className="manualGrid"><section className="manualCard"><div className="manualCardTitle"><div><small>INPUT DATA</small><h2>Evaluation of image folders</h2></div><button className="manualBtn secondary"><Upload size={14}/>Select folder</button></div><div className="testDrop"><FolderOpen size={36}/><h3>Dataset ready</h3><p>16 lenses · 64 camera images · SPH inspection script</p><code>D:\Inspection\Lot_20260921_1432</code></div><div className="testProgress"><span><i style={{width:run?'100%':'0%'}}/></span><div><b>{run?'Evaluation complete':'Ready to run'}</b><small>{run?'16 / 16 lenses inspected':'Select Run BV test to start'}</small></div></div></section><aside className="manualSide"><section className="manualCard controlsCard"><div className="manualCardTitle"><div><small>ACTIVE CONFIGURATION</small><h2>BV test parameters</h2></div></div><div className="kvManual"><span>Lens type<b>SPH</b></span><span>Script<b>SPH_Inspection.hdev</b></span><span>Camera images<b>4 per lens</b></span><span>Expected lenses<b>16</b></span></div><button className="manualBtn primary full" onClick={()=>setRun(true)}><Play size={14}/>Run BV test</button></section></aside></div>
}
