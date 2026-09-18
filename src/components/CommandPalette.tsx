'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {
  Archive,BookOpen,Camera,ChartNoAxesCombined,Clock3,FolderArchive,History,ImageIcon,
  Microscope,Search,Settings,ShieldCheck,SlidersHorizontal,Sparkles,Wrench,X
} from 'lucide-react';
import {manualUrl} from '@/lib/api';

const commands=[
  {name:'Live Inspection',detail:'Main operator workspace, WT view, yield and lens viewer',href:'/',icon:Microscope,keys:'G I'},
  {name:'WT History',detail:'Ring buffer, error symbols and archive',href:'/history',icon:History,keys:'G H'},
  {name:'Image Filter & Storage',detail:'Filters, recurring storage and optimization images',href:'/storage',icon:FolderArchive,keys:'G S'},
  {name:'BV Test',detail:'Evaluate single images or complete image folders',href:'/bv-test',icon:Archive,keys:'G B'},
  {name:'Focus Check — General / Lens',detail:'Brightness, lens checks and comparison limits',href:'/focus',icon:ChartNoAxesCombined,keys:'G F'},
  {name:'Focus + Resolution / Lighting',detail:'Hardware jig focus, resolution and illumination metrics',href:'/focus',icon:Sparkles,keys:''},
  {name:'Registration',detail:'Camera alignment, image scale, Inbox / Outbox',href:'/registration',icon:ImageIcon,keys:'G R'},
  {name:'Camera System',detail:'Camera assignment, exposure, ROI, triggerbox and lighting',href:'/setup',icon:Camera,keys:'G C'},
  {name:'General Settings',detail:'PLC, triggerbox, CSV, image format and timeouts',href:'/settings',icon:Settings,keys:'G G'},
  {name:'Access & Operation Mode',detail:'NoUser / Operator / Service / Administrator, AUTO / SETUP',href:'/',icon:ShieldCheck,keys:''},
  {name:'System Messages & Version',detail:'Logs, version information and capability status',href:'/system',icon:Wrench,keys:'G Y'},
  {name:'Trigger Timeout Model',detail:'16-position processing deadline model',href:'/settings',icon:Clock3,keys:''},
  {name:'Open OKLIN3 Manual',detail:'Open the supplied operating manual',href:'manual',icon:BookOpen,keys:''},
  {name:'Image Display Controls',detail:'Pan, zoom, 1:1, crosshair, gray probe and defect focus',href:'/',icon:SlidersHorizontal,keys:''}
];

export function CommandPalette({open,onClose,onCustomize}:{open:boolean;onClose:()=>void;onCustomize:()=>void}){
  const[q,setQ]=useState('');
  const[active,setActive]=useState(0);
  const router=useRouter();
  const input=useRef<HTMLInputElement>(null);

  useEffect(()=>{
    if(open){
      setQ('');
      setActive(0);
      setTimeout(()=>input.current?.focus(),30);
    }
  },[open]);

  const filtered=useMemo(()=>{
    const s=q.trim().toLowerCase();
    return s?commands.filter(c=>(c.name+' '+c.detail).toLowerCase().includes(s)):commands;
  },[q]);

  useEffect(()=>{setActive(0)},[q]);
  if(!open)return null;

  function go(href:string){
    onClose();
    if(href==='manual'){
      window.open(manualUrl(),'_blank');
      return;
    }
    router.push(href);
  }

  return <div className="paletteBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="commandPalette">
      <div className="paletteSearch">
        <Search/>
        <input
          ref={input}
          value={q}
          onChange={e=>setQ(e.target.value)}
          placeholder="Search every OKLIN function…"
          onKeyDown={e=>{
            if(e.key==='Escape')onClose();
            if(e.key==='ArrowDown'){
              e.preventDefault();
              setActive(a=>Math.min(filtered.length-1,a+1));
            }
            if(e.key==='ArrowUp'){
              e.preventDefault();
              setActive(a=>Math.max(0,a-1));
            }
            if(e.key==='Enter'&&filtered[active])go(filtered[active].href);
          }}
        />
        <kbd>ESC</kbd>
        <button onClick={onClose}><X/></button>
      </div>

      <div className="paletteMeta">
        <span>Navigation</span>
        <button onClick={()=>{onClose();onCustomize()}}><Sparkles/>Customize interface</button>
      </div>

      <div className="commandResults">
        {filtered.map((c,i)=>
          <button key={`${c.name}-${i}`} className={i===active?'active':''} onMouseEnter={()=>setActive(i)} onClick={()=>go(c.href)}>
            <i><c.icon/></i>
            <span><b>{c.name}</b><small>{c.detail}</small></span>
            {c.keys&&<kbd>{c.keys}</kbd>}
          </button>
        )}
        {!filtered.length&&<div className="paletteEmpty">No matching command</div>}
      </div>

      <div className="paletteFoot">
        <span><kbd>↑</kbd><kbd>↓</kbd> browse</span>
        <span><kbd>Enter</kbd> open</span>
        <span><kbd>Ctrl K</kbd> command palette</span>
      </div>
    </div>
  </div>;
}
