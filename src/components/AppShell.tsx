'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect,useState} from 'react';
import {
  ChartNoAxesCombined,
  ChevronsLeft,
  ChevronsRight,
  FolderArchive,
  History,
  ImageIcon,
  LayoutDashboard,
  Microscope,
  Settings,
  SlidersHorizontal,
  Wrench,
  Camera
} from 'lucide-react';
import {useUI} from './UIProvider';
import {CustomizationDrawer} from './CustomizationDrawer';
import {CommandPalette} from './CommandPalette';
import {ClassicHeader} from './ClassicHeader';
import {ImageFilterWorkspace} from './ImageFilterWorkspace';
import {api} from '@/lib/api';
import type {SystemInfo} from '@/types';

const items=[
  ['/','Inspection',Microscope],
  ['/dashboard','Dashboard',LayoutDashboard],
  ['/history','WT History',History],
  ['/registration','Registration',Camera],
  ['/focus','Focus Check',ChartNoAxesCombined],
  ['/storage','Image Filter',FolderArchive],
  ['/settings','Settings',SlidersHorizontal],
  ['/bv-test','BV Test',Settings],
  ['/system','System',Wrench],
] as const;

export function AppShell({children}:{children:React.ReactNode}){
  return <ShellInner>{children}</ShellInner>;
}

function ShellInner({children}:{children:React.ReactNode}){
  const path=usePathname();
  const{prefs,set}=useUI();
  const[customize,setCustomize]=useState(false);
  const[palette,setPalette]=useState(false);
  const[imageFilterOpen,setImageFilterOpen]=useState(false);
  const[system,setSystem]=useState<SystemInfo|null>(null);
  const[now,setNow]=useState(()=>new Date());
  const sharedChrome=path!=="/";
  const pageName=items.find(([href])=>href===path)?.[1]||'Lens Inspection';

  useEffect(()=>{if(!sharedChrome)return;void api.system().then(setSystem).catch(()=>{});const timer=window.setInterval(()=>setNow(new Date()),1000);return()=>window.clearInterval(timer)},[sharedChrome,path]);

  useEffect(()=>{
    function key(e:KeyboardEvent){
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
        e.preventDefault();
        setPalette(true);
      }
      if(e.key==='Escape'){
        setPalette(false);
        setCustomize(false);
      }
    }
    function custom(){setCustomize(true)}
    function command(){setPalette(true)}
    function imageFilter(){setImageFilterOpen(true)}
    window.addEventListener('keydown',key);
    window.addEventListener('lens-open-customizer',custom);
    window.addEventListener('lens-open-command',command);
    window.addEventListener('lens-open-image-filter',imageFilter);
    return()=>{
      window.removeEventListener('keydown',key);
      window.removeEventListener('lens-open-customizer',custom);
      window.removeEventListener('lens-open-command',command);
      window.removeEventListener('lens-open-image-filter',imageFilter);
    };
  },[]);

  return <div className={`appShell ${prefs.sidebarCollapsed?'sidebarCollapsed':''} ${prefs.manualSkeleton?'manualSkeletonShell pdfSkeletonMode':''}`}>
    {!prefs.manualSkeleton&&<aside className="sideRail productionRail">
      <button className="brandArea productionBrand emageRailBrand" onClick={()=>setCustomize(true)} title="Emage Group interface settings" aria-label="Open interface settings">
        <span className="emageMark"><img src="/brand/emage-mark.png" alt="Emage Group"/></span>
      </button>

      <nav className="productionNav" aria-label="Primary navigation">
        {items.map(([href,label,Icon])=>
          <Link key={href} href={href} title={label} aria-current={path===href?'page':undefined} className={`sideNav ${path===href?'active':''}`}>
            <Icon/><span>{label}</span>
          </Link>
        )}
      </nav>

      <div className="railFoot productionRailFoot">
        <div className="railOnline" title="Production line connected"><i/><span>Line online</span></div>
        <button className="sideNav utilityNav" onClick={()=>setCustomize(true)} title="Interface Studio">
          <Settings/><span>Customize</span>
        </button>
        <button
          className="collapseRail"
          onClick={()=>set('sidebarCollapsed',!prefs.sidebarCollapsed)}
          title={prefs.sidebarCollapsed?'Expand navigation':'Collapse navigation'}
          aria-expanded={!prefs.sidebarCollapsed}
        >
          {prefs.sidebarCollapsed?<ChevronsRight/>:<ChevronsLeft/>}
          <span>{prefs.sidebarCollapsed?'Expand':'Collapse'}</span>
        </button>
        <span className="buildLabel">EMAGE · v7.4</span>
      </div>
    </aside>}

    <main className={`appMain ${sharedChrome?'withSharedChrome':''}`}>
      {prefs.manualSkeleton&&path!=="/"&&<ClassicHeader
        onSwitchUser={()=>window.location.assign('/?login=1')}
        onImageFilter={()=>setImageFilterOpen(true)}
        onDataset={()=>window.location.assign('/?dataset=1')}
        onInfo={()=>window.location.assign('/system')}
        onExit={()=>window.location.assign('/')}
        onUi={()=>setCustomize(true)}
      />}
      {!prefs.manualSkeleton&&sharedChrome&&<header className="sharedModernHeader">
        <div className="sharedHeaderBrand"><img src="/brand/emage-mark.png" alt="Emage Group"/><span><b>Lens Inspection Control Center</b><small>{pageName} · Emage Group</small></span></div>
        <div className="sharedHeaderContext"><span><small>LINE</small><b>{system?.settings.line_name||'—'}</b></span><span><small>STATION</small><b>{system?.settings.station_name||'—'}</b></span></div>
        <div className="sharedHeaderState"><i/><span><b>Connected</b><small>{system?.bridge||'Backend service'}</small></span></div>
        <div className="sharedHeaderClock"><small>{now.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</small><b>{now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</b></div>
        <div className="sharedHeaderUser"><span><b>{system?.session.username||'Operator'}</b><small>{system?.session.role||'Production'}</small></span></div>
      </header>}
      <div className="sharedPageBody">{children}</div>
      {sharedChrome&&<footer className="sharedAppFooter"><span><i/>System ready</span><span>{pageName}</span><span>{system?.mode==='AUTO'?'Automatic operation':'Setup operation'}</span><span>{system?.version?`v${system.version}`:'Emage Group'}</span></footer>}
    </main>

    <CustomizationDrawer open={customize} onClose={()=>setCustomize(false)}/>
    {imageFilterOpen&&<ImageFilterWorkspace modal onClose={()=>setImageFilterOpen(false)}/>}
    <CommandPalette
      open={palette}
      onClose={()=>setPalette(false)}
      onCustomize={()=>setCustomize(true)}
    />
  </div>;
}
