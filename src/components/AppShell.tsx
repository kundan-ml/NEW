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

const items=[
  ['/','Dashboard',LayoutDashboard],
  ['/inspect','Inspection',Microscope],
  ['#','WT History',History],
  ['#','Statistics',ChartNoAxesCombined],
  ['#','Recipe / Setup',SlidersHorizontal],
  ['#','Maintenance',Settings],
  ['#','System',Wrench],
] as const;

export function AppShell({children}:{children:React.ReactNode}){
  return <ShellInner>{children}</ShellInner>;
}

function ShellInner({children}:{children:React.ReactNode}){
  const path=usePathname();
  const{prefs,set}=useUI();
  const[customize,setCustomize]=useState(false);
  const[palette,setPalette]=useState(false);

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
    window.addEventListener('keydown',key);
    window.addEventListener('lens-open-customizer',custom);
    window.addEventListener('lens-open-command',command);
    return()=>{
      window.removeEventListener('keydown',key);
      window.removeEventListener('lens-open-customizer',custom);
      window.removeEventListener('lens-open-command',command);
    };
  },[]);

  return <div className={`appShell ${prefs.sidebarCollapsed?'sidebarCollapsed':''}`}>
    <aside className="sideRail productionRail">
      <button className="brandArea productionBrand" onClick={()=>setCustomize(true)} title="Oaklin interface settings" aria-label="Open interface settings">
        <span className="brandAperture"><i/><i/><i/><i/><i/><i/></span>
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
        >
          {prefs.sidebarCollapsed?<ChevronsRight/>:<ChevronsLeft/>}
        </button>
        <span className="buildLabel">OAKLIN · v7.4</span>
      </div>
    </aside>

    <main className="appMain">{children}</main>

    <CustomizationDrawer open={customize} onClose={()=>setCustomize(false)}/>
    <CommandPalette
      open={palette}
      onClose={()=>setPalette(false)}
      onCustomize={()=>setCustomize(true)}
    />
  </div>;
}
