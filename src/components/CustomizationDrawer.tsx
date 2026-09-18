'use client';

import {Check,ChevronRight,LayoutDashboard,MonitorCog,Palette,RotateCcw,Sparkles,X} from 'lucide-react';
import {useUI,type AccentPreset,type Density,type ThemePreset} from './UIProvider';

export function CustomizationDrawer({open,onClose}:{open:boolean;onClose:()=>void}){
  const{prefs,set,patch,reset}=useUI();
  if(!open)return null;

  const themes:{key:ThemePreset;label:string;hint:string}[]=[
    {key:'midnight',label:'Midnight',hint:'Classic navy / production default'},
    {key:'graphite',label:'Graphite',hint:'Charcoal / executive workstation'},
    {key:'arctic',label:'Arctic',hint:'Light laboratory workspace'}
  ];
  const accents:{key:AccentPreset;label:string}[]=[
    {key:'azure',label:'Azure'},
    {key:'cyan',label:'Cyan'},
    {key:'violet',label:'Violet'},
    {key:'emerald',label:'Emerald'}
  ];
  const densities:Density[]=['compact','comfortable','spacious'];

  return <div className="drawerBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <aside className="customDrawer" aria-label="Customize interface">
      <div className="drawerHead">
        <div className="drawerIcon"><Palette/></div>
        <div>
          <span className="eyebrowText">PERSONALIZE WORKSPACE</span>
          <h2>Interface Studio</h2>
          <p>Changes are saved locally on this workstation.</p>
        </div>
        <button className="iconButton" onClick={onClose}><X/></button>
      </div>

      <div className="drawerScroll">
        <section className="customSection">
          <div className="customTitle">
            <Palette/>
            <div><b>Visual theme</b><small>Production-friendly palettes with status colors preserved</small></div>
          </div>
          <div className="themeCards">
            {themes.map(t=>
              <button key={t.key} onClick={()=>set('theme',t.key)} className={prefs.theme===t.key?'selected':''}>
                <i className={`themePreview ${t.key}`}/>
                <span><b>{t.label}</b><small>{t.hint}</small></span>
                {prefs.theme===t.key&&<Check/>}
              </button>
            )}
          </div>
        </section>

        <section className="customSection">
          <div className="customTitle">
            <Sparkles/>
            <div><b>Accent & motion</b><small>Decorative color never replaces OK/NOK semantics</small></div>
          </div>
          <div className="accentRow">
            {accents.map(a=>
              <button
                key={a.key}
                aria-label={a.label}
                title={a.label}
                className={`${a.key} ${prefs.accent===a.key?'selected':''}`}
                onClick={()=>set('accent',a.key)}
              ><i/></button>
            )}
          </div>
          <Toggle label="Interface animations" hint="Subtle transitions, live pulse and scan effects" checked={prefs.motion} onChange={v=>set('motion',v)}/>
          <Toggle label="Ambient glow" hint="Soft panel edge illumination" checked={prefs.glow} onChange={v=>set('glow',v)}/>
        </section>

        <section className="customSection">
          <div className="customTitle">
            <MonitorCog/>
            <div><b>Scale & density</b><small>Optimize the HMI for your monitor and viewing distance</small></div>
          </div>
          <div className="segmented">
            {densities.map(d=>
              <button key={d} onClick={()=>set('density',d)} className={prefs.density===d?'active':''}>{d}</button>
            )}
          </div>
          <Slider label="UI scale" value={prefs.fontScale} min={.86} max={1.16} step={.01} suffix={`${Math.round(prefs.fontScale*100)}%`} onChange={v=>set('fontScale',v)}/>
          <Slider label="Corner radius" value={prefs.radius} min={4} max={16} step={1} suffix={`${prefs.radius}px`} onChange={v=>set('radius',v)}/>
          <Slider label="Surface opacity" value={prefs.glass} min={.76} max={1} step={.01} suffix={`${Math.round(prefs.glass*100)}%`} onChange={v=>set('glass',v)}/>
        </section>

        <section className="customSection">
          <div className="customTitle">
            <LayoutDashboard/>
            <div><b>Dashboard layout</b><small>Prioritize the areas your operators use most</small></div>
          </div>
          <Slider label="WT history width" value={prefs.historyWidth} min={.55} max={1.25} step={.01} suffix={prefs.historyWidth.toFixed(2)} onChange={v=>set('historyWidth',v)}/>
          <Slider label="Inspection viewer width" value={prefs.viewerWidth} min={.9} max={2.1} step={.01} suffix={prefs.viewerWidth.toFixed(2)} onChange={v=>set('viewerWidth',v)}/>
          <Slider label="Lens details width" value={prefs.detailsWidth} min={.55} max={1.25} step={.01} suffix={prefs.detailsWidth.toFixed(2)} onChange={v=>set('detailsWidth',v)}/>
          <Slider label="Inspection history width" value={prefs.inspectionHistoryWidth} min={240} max={520} step={2} suffix={`${prefs.inspectionHistoryWidth}px`} onChange={v=>set('inspectionHistoryWidth',v)}/>
          <Slider label="Inspection controls width" value={prefs.inspectionControlWidth} min={180} max={340} step={2} suffix={`${prefs.inspectionControlWidth}px`} onChange={v=>set('inspectionControlWidth',v)}/>
          <Slider label="Inspection details width" value={prefs.inspectionDetailsWidth} min={250} max={520} step={2} suffix={`${prefs.inspectionDetailsWidth}px`} onChange={v=>set('inspectionDetailsWidth',v)}/>
          <Slider label="Lens strip height" value={prefs.trayHeight} min={96} max={190} step={2} suffix={`${prefs.trayHeight}px`} onChange={v=>set('trayHeight',v)}/>
          <Slider label="Bottom workspace height" value={prefs.bottomHeight} min={150} max={340} step={2} suffix={`${prefs.bottomHeight}px`} onChange={v=>set('bottomHeight',v)}/>
          <Slider label="Trend panel width" value={prefs.trendWidth} min={.6} max={2.2} step={.01} suffix={prefs.trendWidth.toFixed(2)} onChange={v=>set('trendWidth',v)}/>
          <Slider label="Logs panel width" value={prefs.logsWidth} min={.5} max={1.6} step={.01} suffix={prefs.logsWidth.toFixed(2)} onChange={v=>set('logsWidth',v)}/>
          <Slider label="Quick actions width" value={prefs.actionsWidth} min={.5} max={1.4} step={.01} suffix={prefs.actionsWidth.toFixed(2)} onChange={v=>set('actionsWidth',v)}/>
          <div className="presetRow">
            <button onClick={()=>patch({historyWidth:.66,viewerWidth:1.72,detailsWidth:.68})}>Viewer focus</button>
            <button onClick={()=>patch({historyWidth:1.02,viewerWidth:1.20,detailsWidth:.82})}>History focus</button>
            <button onClick={()=>patch({historyWidth:.80,viewerWidth:1.48,detailsWidth:.80})}>Classic balanced</button>
            <button onClick={()=>patch({density:'compact',radius:8,glow:false,fontScale:.96,historyWidth:.76,viewerWidth:1.54,detailsWidth:.76})}>1366×768 compact</button>
          </div>
        </section>

        <section className="customSection">
          <div className="customTitle">
            <ChevronRight/>
            <div><b>Visible modules</b><small>Hide sections that are not needed for a particular station</small></div>
          </div>
          <Toggle label="Dataset source ribbon" checked={prefs.showCommandBar} onChange={v=>set('showCommandBar',v)}/>
          <Toggle label="Compact navigation rail" checked={prefs.sidebarCollapsed} onChange={v=>set('sidebarCollapsed',v)}/>
          <Toggle label="Top KPI metrics" checked={prefs.showKpis} onChange={v=>set('showKpis',v)}/>
          <Toggle label="WT history matrix" checked={prefs.showHistory} onChange={v=>set('showHistory',v)}/>
          <Toggle label="Current lens information" checked={prefs.showDetails} onChange={v=>set('showDetails',v)}/>
          <Toggle label="Current WT thumbnails" checked={prefs.showTray} onChange={v=>set('showTray',v)}/>
          <Toggle label="Yield / logs / quick actions" checked={prefs.showWorkspace} onChange={v=>set('showWorkspace',v)}/>
          <Toggle label="Yield and trend panel" checked={prefs.showTrend} onChange={v=>set('showTrend',v)}/>
          <Toggle label="System logs panel" checked={prefs.showLogs} onChange={v=>set('showLogs',v)}/>
          <Toggle label="Quick actions panel" checked={prefs.showActions} onChange={v=>set('showActions',v)}/>
        </section>
      </div>

      <div className="drawerFoot">
        <button onClick={reset}><RotateCcw/>Reset to production defaults</button>
        <button className="primaryAction" onClick={onClose}>Done</button>
      </div>
    </aside>
  </div>;
}

function Toggle({label,hint,checked,onChange}:{label:string;hint?:string;checked:boolean;onChange:(v:boolean)=>void}){
  return <label className="customToggle">
    <span><b>{label}</b>{hint&&<small>{hint}</small>}</span>
    <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/>
    <i/>
  </label>;
}

function Slider({label,value,min,max,step,suffix,onChange}:{label:string;value:number;min:number;max:number;step:number;suffix:string;onChange:(v:number)=>void}){
  return <label className="customSlider">
    <span><b>{label}</b><em>{suffix}</em></span>
    <input type="range" value={value} min={min} max={max} step={step} onChange={e=>onChange(Number(e.target.value))}/>
  </label>;
}
