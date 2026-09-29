'use client';

import {Check,ChevronRight,ExternalLink,LayoutDashboard,MonitorCog,Palette,RotateCcw,Sparkles,X} from 'lucide-react';
import {useUI,type Density} from './UIProvider';
import {COMPONENTS,defaultComponentStyles,type ComponentId,type ComponentStyle} from '@/lib/appearance';
import type {StatusSymbolLegend} from '@/types';
import {GRADIENT_ANGLES,THEMES,type GradientDirection,type LayerGradient} from '@/lib/themes';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';

export function CustomizationDrawer({open,onClose,popout=false}:{open:boolean;onClose:()=>void;popout?:boolean}){
  const{prefs,canCustomize,saveState,saveError,saveNow,set,patch,selectTheme,resetThemeColors,reset}=useUI();
  const[wtCapacity,setWtCapacity]=useState(16);
  const[trayCapacities,setTrayCapacities]=useState<number[]>([12,14,16]);
  const[capacityNotice,setCapacityNotice]=useState('');
  const[activeTab,setActiveTab]=useState<'basics'|'colors'|'components'|'layout'>('basics');
  const[legend,setLegend]=useState<StatusSymbolLegend|null>(null);
  const[legendNotice,setLegendNotice]=useState('');
  useEffect(()=>{if(open&&canCustomize)api.trayLayout().then(layout=>{setWtCapacity(layout.images_per_tray);setTrayCapacities(layout.supported_images_per_tray)}).catch(()=>{})},[open,canCustomize]);
  useEffect(()=>{if(open)api.statusSymbolLegend().then(setLegend).catch(()=>setLegendNotice('Status configuration is unavailable.'))},[open]);
  if(!open)return null;

  const themes=Object.values(THEMES);
  const activeTokens=THEMES[prefs.theme].tokens;
  const densities:Density[]=['compact','comfortable','spacious'];
  const updateSymbol=(group:'statuses'|'defects',key:string,field:'color'|'symbol',value:string)=>setLegend(current=>current?{...current,[group]:current[group].map(item=>item.key===key?{...item,[field]:value}:item)}:current);
  const updateComponent=(key:ComponentId,change:Partial<ComponentStyle>)=>set('componentStyles',{...defaultComponentStyles(),...prefs.componentStyles,[key]:{...defaultComponentStyles()[key],...prefs.componentStyles?.[key],...change}});
  const setLayer=(key:keyof typeof prefs.layerGradients,value:LayerGradient)=>{
    const solidKey={background:'customBg',surface:'customPanel',elevated:'customHeader',button:'customButton',primary:'customPrimary',secondary:'customSecondary',accent:'customAccent',canvas:'customCanvas'}[key];
    patch({layerGradients:{...prefs.layerGradients,[key]:value},...(value.enabled?{[solidKey]:''}:{})});
  };
  const saveLegend=async()=>{if(!legend)return;try{const saved=await api.saveStatusSymbolLegend(legend);setLegend(saved);setLegendNotice('Symbols saved for every user.');localStorage.setItem('lens-status-legend-version',String(Date.now()));window.dispatchEvent(new Event('lens-status-legend-changed'))}catch(error){setLegendNotice((error as Error).message)}};
  const closeStudio=async()=>{if(popout&&canCustomize&&!(await saveNow()))return;onClose()};

  return <div className="drawerBackdrop" onPointerDown={e=>{if(e.target===e.currentTarget)void closeStudio()}}>
    <aside className={`customDrawer ${prefs.uiLocked?'uiConfigurationLocked':''}`} aria-label="Customize interface">
      <div className="drawerHead">
        <div className="drawerIcon"><Palette/></div>
        <div>
          <span className="eyebrowText">PERSONALIZE WORKSPACE</span>
          <h2>Interface Studio</h2>
          <p>Changes are saved to the shared workstation profile.</p>
        </div>
        <button className="iconButton" onClick={()=>void closeStudio()} aria-label="Close Interface Studio"><X/></button>
        {!popout&&<button className="drawerPopout" title="Open on another monitor" onClick={()=>window.open('/ui-studio','oaklin-ui-studio','width=520,height=900,resizable=yes,scrollbars=yes')}><ExternalLink/> Pop out</button>}
      </div>

      <nav className="studioTabBar" aria-label="Interface Studio sections">{([['basics','Start'],['colors','Colors & effects'],['components','Components'],['layout','Layout']] as const).map(([key,label])=><button key={key} className={activeTab===key?'active':''} onClick={()=>setActiveTab(key)}>{label}</button>)}</nav>
      <div className="drawerScroll">
        {!canCustomize&&<section className="customSection lockControlSection"><div className="customTitle"><MonitorCog/><div><b>Administrator access required</b><small>Sign in as an administrator to change the shared workstation interface.</small></div></div></section>}
        <div className="studioSections">
        <section className="customSection lockControlSection">
          <div className="customTitle">
            <MonitorCog/>
            <div><b>Station UI control</b><small>Saved on this workstation and used by every page and operator</small></div>
          </div>
          <fieldset disabled={!canCustomize} className="studioFieldset"><Toggle label={prefs.uiLocked?'Interface locked':'Interface unlocked'} hint={prefs.uiLocked?'Unlock to change layout, visibility or appearance':'Lock the approved layout for all users'} checked={prefs.uiLocked} onChange={v=>set('uiLocked',v)}/></fieldset>
          <p className="lockNotice">{prefs.uiLocked?'Layout controls and drag handles are disabled. The saved interface remains active for every user.':'Adjust the workspace below, then lock it when the station layout is approved.'}</p>
        </section>
        <fieldset disabled={!canCustomize||prefs.uiLocked} className="studioFieldset">
        <div hidden={activeTab!=='basics'}>

        <section className="customSection">
          <div className="customTitle"><LayoutDashboard/><div><b>WT capacity</b><small>Number of sequential lens positions in each WT</small></div></div>
          <label className="customSlider"><span><b>Positions per WT</b><em>{wtCapacity}</em></span><select value={wtCapacity} onChange={event=>setWtCapacity(Number(event.target.value))}>{trayCapacities.map(capacity=><option key={capacity} value={capacity}>{capacity} images</option>)}</select></label>
          <button className="drawerPopout" onClick={async()=>{try{await api.setWtCapacity(wtCapacity);setCapacityNotice(`Saved ${wtCapacity} positions per WT`);window.dispatchEvent(new Event('lens-system-changed'))}catch(error){setCapacityNotice((error as Error).message)}}}>Save WT capacity</button>
          {capacityNotice&&<p className="lockNotice">{capacityNotice}</p>}
        </section>

        <section className="customSection">
          <div className="customTitle">
            <LayoutDashboard/>
            <div><b>Workspace style</b><small>Switch between the modern shell and the original manual skeleton</small></div>
          </div>
          <div className="workspaceStyleCards">
            <button className={!prefs.manualSkeleton?'selected':''} onClick={()=>set('manualSkeleton',false)}>
              <i className="modernLayoutPreview"><span/><span/><span/></i><span><b>Modern UI</b><small>Contemporary dashboard with navigation rail</small></span>{!prefs.manualSkeleton&&<Check/>}
            </button>
            <button className={prefs.manualSkeleton?'selected':''} onClick={()=>set('manualSkeleton',true)}>
              <i className="manualLayoutPreview"><span/><span/><span/></i><span><b>Classic UI</b><small>Technical top menu with WT History first</small></span>{prefs.manualSkeleton&&<Check/>}
            </button>
          </div>
        </section>

        <section className="customSection statusControlSection">
          <div className="customTitle"><Sparkles/><div><b>Status & defect symbols</b><small>Colors and letters used in WT History, WT View and defect lists</small></div></div>
          {legend?<div className="studioSymbolGroups">{([['statuses','Inspection status'],['defects','HALCON defects']] as const).map(([group,label])=><details key={group} open={group==='statuses'}><summary>{label} <small>{legend[group].length}</small></summary><div className="statusEditors">{legend[group].map(item=><label className="statusEditor" key={item.key}><input aria-label={`${item.label} color`} type="color" value={item.color} onChange={e=>updateSymbol(group,item.key,'color',e.target.value)}/><span>{item.label}</span><input aria-label={`${item.label} symbol`} className="studioSymbolInput" value={item.symbol} maxLength={3} onChange={e=>updateSymbol(group,item.key,'symbol',e.target.value)}/></label>)}</div></details>)}</div>:<p className="lockNotice">Loading legend…</p>}
          <button className="studioSaveButton" type="button" disabled={!legend} onClick={saveLegend}>Save status & defect symbols</button>
          {legendNotice&&<p className="lockNotice" role="status">{legendNotice}</p>}
        </section>

        <section className="customSection">
          <div className="customTitle">
            <Palette/>
            <div><b>Visual theme</b><small>Production-friendly palettes with status colors preserved</small></div>
          </div>
          <div className="themeCards">
            {themes.map(theme=>
              <button key={theme.name} onClick={()=>selectTheme(theme.name)} className={prefs.theme===theme.name?'selected':''}>
                <i className="themePreview" style={{'--preview-bg':theme.tokens.background,'--preview-surface':theme.tokens.surface,'--preview-accent':theme.tokens.accent,'--preview-gradient':`linear-gradient(135deg,${theme.tokens.gradientStart},${theme.tokens.gradientEnd})`} as React.CSSProperties}><span/><em/></i>
                <span><b>{theme.label}</b><small>{theme.description}</small></span>
                {prefs.theme===theme.name&&<Check/>}
              </button>
            )}
          </div>
        </section>
        </div>
        <div hidden={activeTab!=='colors'}>

        <section className="customSection">
          <div className="customTitle"><Palette/><div><b>Fine color controls</b><small>Picking a solid color overrides that layer’s gradient; re-enable its gradient below to switch back</small></div></div>
          <div className="fineColorGrid">
            {([
              ['Page background','customBg',activeTokens.background],['Panels','customPanel',activeTokens.surface],['Headers & tabs','customHeader',activeTokens.surfaceElevated],['Buttons','customButton',activeTokens.surfaceHover],['Image canvas','customCanvas','#000000'],['Borders','customBorder',activeTokens.border],['Primary text','customText',activeTokens.textPrimary],['Primary color','customPrimary',activeTokens.primary],['Secondary color','customSecondary',activeTokens.secondary],['Accent color','customAccent',activeTokens.accent]
            ] as const).map(([label,key,fallback])=><label key={key}><input type="color" value={prefs[key]||fallback} onChange={e=>set(key,e.target.value)}/><span>{label}</span></label>)}
          </div>
          <button className="clearColorOverrides" onClick={resetThemeColors}><RotateCcw/> Use default colors for {THEMES[prefs.theme].label}</button>
        </section>

        <section className="customSection gradientEditorSection">
          <div className="customTitle"><Sparkles/><div><b>Gradient studio</b><small>Central accent gradient shared by active controls and highlights</small></div></div>
          <div className="gradientColorRow">
            <ColorField label="Start" value={prefs.gradientStart||THEMES[prefs.theme].tokens.gradientStart} onChange={value=>set('gradientStart',value)}/>
            <ColorField label="End" value={prefs.gradientEnd||THEMES[prefs.theme].tokens.gradientEnd} onChange={value=>set('gradientEnd',value)}/>
          </div>
          <label className="gradientDirection"><span>Direction</span><select value={prefs.gradientDirection} onChange={event=>set('gradientDirection',event.target.value as GradientDirection)}><option value="to-right">Left → Right</option><option value="to-left">Right → Left</option><option value="to-bottom">Top → Bottom</option><option value="to-top">Bottom → Top</option><option value="to-bottom-right">Top Left → Bottom Right</option><option value="to-top-right">Bottom Left → Top Right</option></select></label>
          <Slider label="Gradient intensity" value={prefs.gradientIntensity} min={.25} max={1} step={.05} suffix={`${Math.round(prefs.gradientIntensity*100)}%`} onChange={value=>set('gradientIntensity',value)}/>
          <div className="gradientLivePreview" style={{background:`linear-gradient(${GRADIENT_ANGLES[prefs.gradientDirection]},${prefs.gradientStart||THEMES[prefs.theme].tokens.gradientStart},${prefs.gradientEnd||THEMES[prefs.theme].tokens.gradientEnd})`}}><span>Live gradient</span><em>{GRADIENT_ANGLES[prefs.gradientDirection]}</em></div>
          <button className="clearColorOverrides" onClick={()=>patch({gradientStart:'',gradientEnd:'',gradientDirection:'to-bottom-right',gradientIntensity:.9})}>Use theme gradient</button>
        </section>

        <section className="customSection layerGradientSection">
          <div className="customTitle"><Palette/><div><b>Advanced layer gradients</b><small>Multi-color gradients with individual stops, percentages and 360° rotation</small></div></div>
          <div className="layerGradientList">
            {([['background','Page'],['surface','Panels'],['elevated','Headers'],['button','Buttons'],['primary','Primary actions'],['secondary','Secondary accents'],['accent','Accent details'],['canvas','Canvas']] as const).map(([key,label])=><LayerGradientEditor key={key} label={label} value={prefs.layerGradients[key]} onChange={value=>setLayer(key,value)}/>) }
          </div>
        </section>

        <section className="customSection studioEffectsSection">
          <div className="customTitle"><Sparkles/><div><b>Depth & transparency</b><small>These controls update panels and buttons across the application</small></div></div>
          <Slider label="Surface opacity" value={prefs.glass} min={.25} max={1} step={.01} suffix={`${Math.round(prefs.glass*100)}%`} onChange={v=>set('glass',v)}/>
          <Slider label="Border opacity" value={prefs.borderOpacity??1} min={0} max={1} step={.01} suffix={`${Math.round((prefs.borderOpacity??1)*100)}%`} onChange={v=>set('borderOpacity',v)}/>
          <ColorField label="Shadow color" value={prefs.shadowColor||'#000000'} onChange={v=>set('shadowColor',v)}/>
          <Slider label="Shadow strength" value={prefs.shadowStrength??1} min={0} max={2} step={.05} suffix={`${Math.round((prefs.shadowStrength??1)*100)}%`} onChange={v=>set('shadowStrength',v)}/>
          <Slider label="Shadow blur" value={prefs.shadowBlur??24} min={0} max={80} step={1} suffix={`${prefs.shadowBlur??24}px`} onChange={v=>set('shadowBlur',v)}/>
        </section>
        </div>
        <div hidden={activeTab!=='components'}>
          <section className="customSection">
            <div className="customTitle"><LayoutDashboard/><div><b>Individual components</b><small>Choose a section, then set its own color, opacity, border, corners and shadow</small></div></div>
            <div className="studioComponentList">{COMPONENTS.map(([key,label])=>{const style={...defaultComponentStyles()[key],...prefs.componentStyles?.[key]},fallback=key==='canvas'?'#000000':['header','matrixHead','viewerToolbar','bottomTabs'].includes(key)?activeTokens.surfaceElevated:['actionButtons','formControls'].includes(key)?activeTokens.surfaceHover:activeTokens.surface;return <details key={key} className="studioComponentEditor"><summary><i style={{background:style.background||fallback}}/><b>{label}</b><small>{style.background?'Custom color':'Theme color'}</small></summary><div className="studioComponentBody"><ColorField label="Background" value={style.background||fallback} onChange={v=>updateComponent(key,{background:v})}/><Slider label="Opacity" value={style.opacity} min={.2} max={1} step={.01} suffix={`${Math.round(style.opacity*100)}%`} onChange={v=>updateComponent(key,{opacity:v})}/><ColorField label="Border" value={style.border||activeTokens.border} onChange={v=>updateComponent(key,{border:v})}/><Slider label="Corner radius" value={style.radius} min={0} max={24} step={1} suffix={style.radius?`${style.radius}px`:'Theme'} onChange={v=>updateComponent(key,{radius:v})}/><Slider label="Shadow" value={style.shadow} min={0} max={2} step={.05} suffix={`${Math.round(style.shadow*100)}%`} onChange={v=>updateComponent(key,{shadow:v})}/><button type="button" className="clearColorOverrides" onClick={()=>updateComponent(key,defaultComponentStyles()[key])}>Use theme settings for {label}</button></div></details>})}</div>
          </section>
        </div>
        <div hidden={activeTab!=='layout'}>

        <section className="customSection">
          <div className="customTitle"><Sparkles/><div><b>Motion & atmosphere</b><small>Subtle interaction polish without distracting operators</small></div></div>
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
          <details className="studioComponentEditor"><summary><b>Modern shell sizing</b><small>Sidebar and top header</small></summary><div className="studioComponentBody"><Slider label="Sidebar width" value={prefs.sidebarWidth} min={62} max={112} step={2} suffix={`${prefs.sidebarWidth}px`} onChange={v=>set('sidebarWidth',v)}/><Slider label="Header height" value={prefs.headerHeight} min={38} max={72} step={2} suffix={`${prefs.headerHeight}px`} onChange={v=>set('headerHeight',v)}/></div></details>
          <Slider label="Corner radius" value={prefs.radius} min={4} max={16} step={1} suffix={`${prefs.radius}px`} onChange={v=>set('radius',v)}/>
        </section>

        <section className="customSection">
          <div className="customTitle">
            <LayoutDashboard/>
            <div><b>Dashboard layout</b><small>Prioritize the areas your operators use most</small></div>
          </div>
          <Slider label="Inspection history width" value={prefs.inspectionHistoryWidth} min={240} max={570} step={2} suffix={`${prefs.inspectionHistoryWidth}px`} onChange={v=>set('inspectionHistoryWidth',v)}/>
          <Slider label="Inspection controls width" value={prefs.inspectionControlWidth} min={180} max={340} step={2} suffix={`${prefs.inspectionControlWidth}px`} onChange={v=>set('inspectionControlWidth',v)}/>
          <Slider label="Inspection details width" value={prefs.inspectionDetailsWidth} min={250} max={520} step={2} suffix={`${prefs.inspectionDetailsWidth}px`} onChange={v=>set('inspectionDetailsWidth',v)}/>
          <Slider label="Bottom workspace height" value={prefs.bottomHeight} min={150} max={340} step={2} suffix={`${prefs.bottomHeight}px`} onChange={v=>set('bottomHeight',v)}/>
          <details className="studioComponentEditor"><summary><b>Modern dashboard sizing</b><small>Grid, thumbnail strip and columns</small></summary><div className="studioComponentBody">
            <Slider label="WT history width" value={prefs.historyWidth} min={.55} max={1.25} step={.01} suffix={prefs.historyWidth.toFixed(2)} onChange={v=>set('historyWidth',v)}/>
            <Slider label="Inspection viewer width" value={prefs.viewerWidth} min={.9} max={2.1} step={.01} suffix={prefs.viewerWidth.toFixed(2)} onChange={v=>set('viewerWidth',v)}/>
            <Slider label="Lens details width" value={prefs.detailsWidth} min={.55} max={1.25} step={.01} suffix={prefs.detailsWidth.toFixed(2)} onChange={v=>set('detailsWidth',v)}/>
            <Slider label="Lens strip height" value={prefs.trayHeight} min={96} max={190} step={2} suffix={`${prefs.trayHeight}px`} onChange={v=>set('trayHeight',v)}/>
            <Slider label="Trend panel width" value={prefs.trendWidth} min={.6} max={2.2} step={.01} suffix={prefs.trendWidth.toFixed(2)} onChange={v=>set('trendWidth',v)}/>
            <Slider label="Logs panel width" value={prefs.logsWidth} min={.5} max={1.6} step={.01} suffix={prefs.logsWidth.toFixed(2)} onChange={v=>set('logsWidth',v)}/>
            <Slider label="Quick actions width" value={prefs.actionsWidth} min={.5} max={1.4} step={.01} suffix={prefs.actionsWidth.toFixed(2)} onChange={v=>set('actionsWidth',v)}/>
          <div className="presetRow">
            <button onClick={()=>patch({historyWidth:.66,viewerWidth:1.72,detailsWidth:.68})}>Viewer focus</button>
            <button onClick={()=>patch({historyWidth:1.02,viewerWidth:1.20,detailsWidth:.82})}>History focus</button>
            <button onClick={()=>patch({historyWidth:.80,viewerWidth:1.48,detailsWidth:.80})}>Classic balanced</button>
            <button onClick={()=>patch({density:'compact',radius:8,glow:false,fontScale:.96,historyWidth:.76,viewerWidth:1.54,detailsWidth:.76})}>1366×768 compact</button>
          </div>
          </div></details>
        </section>

        <section className="customSection">
          <div className="customTitle">
            <ChevronRight/>
            <div><b>Visible modules</b><small>Hide sections that are not needed for a particular station</small></div>
          </div>
          <Toggle label="WT history matrix" checked={prefs.showHistory} onChange={v=>set('showHistory',v)}/>
          <Toggle label="Current lens information" checked={prefs.showDetails} onChange={v=>set('showDetails',v)}/>
          <Toggle label="Bottom workspace" checked={prefs.showWorkspace} onChange={v=>set('showWorkspace',v)}/>
          <details className="studioComponentEditor"><summary><b>Modern UI only</b><small>These controls apply to the modern dashboard</small></summary><div className="studioComponentBody">
            <Toggle label="Top KPI metrics" checked={prefs.showKpis} onChange={v=>set('showKpis',v)}/>
            <Toggle label="Dataset source ribbon" checked={prefs.showCommandBar} onChange={v=>set('showCommandBar',v)}/>
            <Toggle label="Compact navigation rail" checked={prefs.sidebarCollapsed} onChange={v=>set('sidebarCollapsed',v)}/>
            <Toggle label="Current WT thumbnails" checked={prefs.showTray} onChange={v=>set('showTray',v)}/>
            <Toggle label="Yield and trend panel" checked={prefs.showTrend} onChange={v=>set('showTrend',v)}/>
            <Toggle label="System logs panel" checked={prefs.showLogs} onChange={v=>set('showLogs',v)}/>
            <Toggle label="Quick actions panel" checked={prefs.showActions} onChange={v=>set('showActions',v)}/>
          </div></details>
        </section>
        </div>
        </fieldset>
        </div>
      </div>

      <div className="drawerFoot">
        <span className={`studioSaveStatus ${saveState}`} role="status">{saveState==='error'?saveError:saveState==='saving'?'Saving appearance…':saveState==='saved'?'Appearance saved':'Changes preview live'}</span>
        <button onClick={reset} disabled={prefs.uiLocked||!canCustomize}><RotateCcw/>Reset to production defaults</button>
        <button className="primaryAction" onClick={()=>void closeStudio()}>{popout?'Save & close':'Done'}</button>
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

function ColorField({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){
  return <label className="gradientColorField"><span>{label}</span><div><input type="color" value={value} onChange={event=>onChange(event.target.value)}/><code>{value.toUpperCase()}</code></div></label>;
}

function LayerGradientEditor({label,value,onChange}:{label:string;value:LayerGradient;onChange:(value:LayerGradient)=>void}){
  const updateStop=(index:number,patch:Partial<LayerGradient['stops'][number]>)=>onChange({...value,stops:value.stops.map((stop,i)=>i===index?{...stop,...patch}:stop)});
  const addStop=()=>{if(value.stops.length>=5)return;onChange({...value,stops:[...value.stops,{color:'#ffffff',position:50}].sort((a,b)=>a.position-b.position)})};
  const removeStop=(index:number)=>{if(value.stops.length<=2)return;onChange({...value,stops:value.stops.filter((_,i)=>i!==index)})};
  const preview=`linear-gradient(${value.angle}deg,${[...value.stops].sort((a,b)=>a.position-b.position).map(stop=>`${stop.color} ${stop.position}%`).join(',')})`;
  return <details className="layerGradientEditor"><summary><span className="layerGradientSwatch" style={{background:value.enabled?preview:value.stops[0]?.color}}/><b>{label}</b><em>{value.enabled?`${value.stops.length} colors · ${value.angle}°`:'Solid'}</em></summary><div className="layerGradientBody"><Toggle label="Use gradient" checked={value.enabled} onChange={enabled=>onChange({...value,enabled})}/><Slider label="Rotation" value={value.angle} min={0} max={360} step={1} suffix={`${value.angle}°`} onChange={angle=>onChange({...value,angle})}/><div className="gradientStops">{value.stops.map((stop,index)=><div key={index}><input type="color" value={stop.color} onChange={event=>updateStop(index,{color:event.target.value})}/><input type="range" min={0} max={100} value={stop.position} onChange={event=>updateStop(index,{position:Number(event.target.value)})}/><code>{stop.position}%</code><button onClick={()=>removeStop(index)} disabled={value.stops.length<=2}>×</button></div>)}</div><div className="layerGradientPreview" style={{background:preview}}/><button className="addGradientStop" onClick={addStop} disabled={value.stops.length>=5}>+ Add color stop</button></div></details>;
}
