'use client';

import {Check,ChevronRight,ExternalLink,LayoutDashboard,MonitorCog,Palette,RotateCcw,Sparkles,X} from 'lucide-react';
import {useUI,type AccentPreset,type Density,type StatusShape,type ThemePreset} from './UIProvider';

export function CustomizationDrawer({open,onClose}:{open:boolean;onClose:()=>void}){
  const{prefs,set,patch,reset}=useUI();
  if(!open)return null;

  const themes:{key:ThemePreset;label:string;hint:string}[]=[
    {key:'charcoal',label:'Charcoal',hint:'Deep neutral production default'},
    {key:'graphite',label:'Graphite',hint:'Soft grey executive workstation'},
    {key:'slate',label:'Industrial Slate',hint:'Steel blue inspection environment'},
    {key:'navy',label:'Technical Navy',hint:'Classic optical workstation'},
    {key:'classic',label:'Heritage',hint:'Warm charcoal and brass'},
    {key:'arctic',label:'Arctic',hint:'Light laboratory workspace'}
  ];
  const accents:{key:AccentPreset;label:string}[]=[
    {key:'bronze',label:'Classic Bronze'},
    {key:'azure',label:'Azure'},
    {key:'cyan',label:'Cyan'},
    {key:'violet',label:'Violet'},
    {key:'emerald',label:'Emerald'}
  ];
  const densities:Density[]=['compact','comfortable','spacious'];

  return <div className="drawerBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <aside className={`customDrawer ${prefs.uiLocked?'uiConfigurationLocked':''}`} aria-label="Customize interface">
      <div className="drawerHead">
        <div className="drawerIcon"><Palette/></div>
        <div>
          <span className="eyebrowText">PERSONALIZE WORKSPACE</span>
          <h2>Interface Studio</h2>
          <p>Changes are saved locally on this workstation.</p>
        </div>
        <button className="iconButton" onClick={onClose}><X/></button>
        <button className="drawerPopout" title="Open on another monitor" onClick={()=>window.open('/ui-studio','oaklin-ui-studio','width=520,height=900,resizable=yes,scrollbars=yes')}><ExternalLink/> Pop out</button>
      </div>

      <div className="drawerScroll">
        <section className="customSection lockControlSection">
          <div className="customTitle">
            <MonitorCog/>
            <div><b>Station UI control</b><small>Saved on this workstation and used by every page and operator</small></div>
          </div>
          <Toggle label={prefs.uiLocked?'Interface locked':'Interface unlocked'} hint={prefs.uiLocked?'Unlock to change layout, visibility or appearance':'Lock the approved layout for all users'} checked={prefs.uiLocked} onChange={v=>set('uiLocked',v)}/>
          <p className="lockNotice">{prefs.uiLocked?'Layout controls and drag handles are disabled. The saved interface remains active for every user.':'Adjust the workspace below, then lock it when the station layout is approved.'}</p>
        </section>

        <section className="customSection">
          <div className="customTitle">
            <LayoutDashboard/>
            <div><b>Workspace style</b><small>Switch between the modern shell and the original manual skeleton</small></div>
          </div>
          <div className="workspaceStyleCards">
            <button className={!prefs.manualSkeleton?'selected':''} onClick={()=>set('manualSkeleton',false)}>
              <i className="modernLayoutPreview"><span/><span/><span/></i><span><b>Modern UI</b><small>Compact header and navigation rail</small></span>{!prefs.manualSkeleton&&<Check/>}
            </button>
            <button className={prefs.manualSkeleton?'selected':''} onClick={()=>set('manualSkeleton',true)}>
              <i className="manualLayoutPreview"><span/><span/><span/></i><span><b>PDF skeleton</b><small>Top menu, no sidebar, WT History first</small></span>{prefs.manualSkeleton&&<Check/>}
            </button>
          </div>
        </section>

        <section className="customSection statusControlSection">
          <div className="customTitle"><Sparkles/><div><b>Status symbols</b><small>Shared by WT History, WT View, legends and result cards</small></div></div>
          <div className="statusEditors">
            {([
              ['OK','okColor','okShape'],['Not OK','nokColor','nokShape'],['Warning','warnColor','warnShape'],['Not inspected','idleColor','idleShape']
            ] as const).map(([label,colorKey,shapeKey])=><div className="statusEditor" key={label}><input type="color" value={prefs[colorKey]} onChange={e=>set(colorKey,e.target.value)}/><span>{label}</span><select value={prefs[shapeKey]} onChange={e=>set(shapeKey,e.target.value as StatusShape)}><option value="circle">Circle</option><option value="square">Square</option><option value="diamond">Diamond</option><option value="ring">Ring</option><option value="plus">Plus</option></select></div>)}
          </div>
        </section>

        <section className="customSection">
          <div className="customTitle">
            <Palette/>
            <div><b>Visual theme</b><small>Production-friendly palettes with status colors preserved</small></div>
          </div>
          <div className="themeCards">
            {themes.map(t=>
              <button key={t.key} onClick={()=>patch({theme:t.key,customBg:'',customPanel:'',customHeader:'',customButton:'',customCanvas:'',customBorder:'',customText:''})} className={prefs.theme===t.key?'selected':''}>
                <i className={`themePreview ${t.key}`}/>
                <span><b>{t.label}</b><small>{t.hint}</small></span>
                {prefs.theme===t.key&&<Check/>}
              </button>
            )}
          </div>
        </section>

        <section className="customSection">
          <div className="customTitle"><Palette/><div><b>Fine color controls</b><small>Override individual interface layers after choosing a theme</small></div></div>
          <div className="fineColorGrid">
            {([
              ['Page background','customBg','#0b0d0f'],['Panels','customPanel','#15191c'],['Headers & tabs','customHeader','#22282d'],['Buttons','customButton','#1a1f23'],['Image canvas','customCanvas','#000000'],['Borders','customBorder','#343b40'],['Primary text','customText','#eeece7']
            ] as const).map(([label,key,fallback])=><label key={key}><input type="color" value={prefs[key]||fallback} onChange={e=>set(key,e.target.value)}/><span>{label}</span></label>)}
          </div>
          <button className="clearColorOverrides" onClick={()=>patch({customBg:'',customPanel:'',customHeader:'',customButton:'',customCanvas:'',customBorder:'',customText:''})}>Use selected theme colors</button>
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
          <Slider label="Sidebar width" value={prefs.sidebarWidth} min={62} max={112} step={2} suffix={`${prefs.sidebarWidth}px`} onChange={v=>set('sidebarWidth',v)}/>
          <Slider label="Header height" value={prefs.headerHeight} min={38} max={72} step={2} suffix={`${prefs.headerHeight}px`} onChange={v=>set('headerHeight',v)}/>
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
        <button onClick={reset} disabled={prefs.uiLocked}><RotateCcw/>Reset to production defaults</button>
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
