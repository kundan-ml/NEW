'use client';

import {Check,ChevronRight,ExternalLink,LayoutDashboard,MonitorCog,Palette,RotateCcw,Sparkles,X} from 'lucide-react';
import {useUI,type Density,type StatusShape} from './UIProvider';
import {GRADIENT_ANGLES,THEMES,type GradientDirection,type LayerGradient} from '@/lib/themes';

export function CustomizationDrawer({open,onClose}:{open:boolean;onClose:()=>void}){
  const{prefs,set,patch,selectTheme,resetThemeColors,reset}=useUI();
  if(!open)return null;

  const themes=Object.values(THEMES);
  const activeTokens=THEMES[prefs.theme].tokens;
  const densities:Density[]=['compact','comfortable','spacious'];

  return <div className="drawerBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <aside className={`customDrawer ${prefs.uiLocked?'uiConfigurationLocked':''}`} aria-label="Customize interface">
      <div className="drawerHead">
        <div className="drawerIcon"><Palette/></div>
        <div>
          <span className="eyebrowText">PERSONALIZE WORKSPACE</span>
          <h2>Interface Studio</h2>
          <p>Changes are saved to the shared workstation profile.</p>
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
            {themes.map(theme=>
              <button key={theme.name} onClick={()=>selectTheme(theme.name)} className={prefs.theme===theme.name?'selected':''}>
                <i className="themePreview" style={{'--preview-bg':theme.tokens.background,'--preview-surface':theme.tokens.surface,'--preview-accent':theme.tokens.accent,'--preview-gradient':`linear-gradient(135deg,${theme.tokens.gradientStart},${theme.tokens.gradientEnd})`} as React.CSSProperties}><span/><em/></i>
                <span><b>{theme.label}</b><small>{theme.description}</small></span>
                {prefs.theme===theme.name&&<Check/>}
              </button>
            )}
          </div>
        </section>

        <section className="customSection">
          <div className="customTitle"><Palette/><div><b>Fine color controls</b><small>Override individual interface layers after choosing a theme</small></div></div>
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
            {([['background','Page'],['surface','Panels'],['elevated','Headers'],['button','Buttons'],['primary','Primary actions'],['secondary','Secondary accents'],['accent','Accent details'],['canvas','Canvas']] as const).map(([key,label])=><LayerGradientEditor key={key} label={label} value={prefs.layerGradients[key]} onChange={value=>set('layerGradients',{...prefs.layerGradients,[key]:value})}/>) }
          </div>
        </section>

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
