'use client';

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Activity,ChevronLeft,ChevronRight,ScanLine} from 'lucide-react';
import type {Defect} from '@/types';
import type {CanvasPopupDetails} from './InspectionCanvas';

type Props={
  details?:CanvasPopupDetails;
  controls?:ReactNode;
  defects:Defect[];
  selectedDefect:number;
  onSelectDefect?:(index:number)=>void;
  zoom:number;
  live:boolean;
};

/** Compact metadata and paged defects keep the viewer free of nested scrolling. */
export function CanvasPopupDetailsPanel({details,controls,defects,selectedDefect,onSelectDefect,zoom,live}:Props){
  const panel=useRef<HTMLElement>(null);
  const[compact,setCompact]=useState(false);
  const[dense,setDense]=useState(false);
  const[page,setPage]=useState(0);
  const pageSize=compact?1:2;
  const pages=Math.max(1,Math.ceil(defects.length/pageSize));
  const currentPage=Math.min(page,pages-1);
  const identity=(details?.rows||[]).filter(row=>row.label==='Dataset'||row.label==='Lens ID');
  const facts=(details?.rows||[]).filter(row=>row.label!=='Dataset'&&row.label!=='Lens ID');
  const status=details?.status||'WAITING';

  useEffect(()=>{
    const element=panel.current;if(!element)return;
    const update=()=>{setCompact(element.clientHeight<780);setDense(element.clientHeight<570)};
    update();const observer=new ResizeObserver(update);observer.observe(element);
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{if(selectedDefect>=0)setPage(Math.floor(selectedDefect/pageSize))},[selectedDefect,pageSize]);

  return <aside className={`canvasPopupSidebar ${compact?'isCompact':''} ${dense?'isDense':''}`} ref={panel} aria-label="Inspection image details">
    <div className="canvasPopupSummary"><div><small>INSPECTION DETAILS</small><h2>Current lens</h2></div><span className={`canvasPopupResult result-${status}`}>{status}</span></div>
    <div className="canvasPopupIdentity">{identity.map(row=><div key={row.label}><small>{row.label}</small><strong title={String(row.value??'—')}>{row.value??'—'}</strong></div>)}</div>
    {controls&&<section className="canvasPopupIllumination"><header><small>ILLUMINATION</small><span><Activity size={12}/>{live?'Live':'Review'}</span></header>{controls}</section>}
    <dl className="canvasPopupFacts">{facts.map(row=><div key={row.label}><dt>{row.label}</dt><dd title={String(row.value??'—')}>{row.value??'—'}</dd></div>)}<div><dt>Viewer zoom</dt><dd>{Math.round(zoom*100)}%</dd></div></dl>
    <section className="canvasPopupDefectSection"><header><h3><ScanLine size={15}/>Detected defects</h3><span>{defects.length}</span></header>
      <div className="canvasPopupDefectList">{defects.length?defects.slice(currentPage*pageSize,(currentPage+1)*pageSize).map((defect,offset)=>{
        const index=currentPage*pageSize+offset;
        return <button type="button" key={index} data-defect-index={index} disabled={!onSelectDefect} className={index===selectedDefect?'selected':''} aria-pressed={index===selectedDefect} onClick={()=>onSelectDefect?.(index===selectedDefect?-1:index)}>
          <i style={{background:defect.overlay_color||'var(--status-nok, #e6585e)'}}/>
          <span><b title={defect.name}>{defect.name}</b><small>{defect.position_text||defect.channel||'Shared geometry'} · {Number.isFinite(defect.confidence)?`${(defect.confidence*100).toFixed(1)}%`:'—'}</small></span>
          <em title={`Severity: ${defect.severity}`}>{defect.tolerance||defect.severity}</em>
        </button>;
      }):<p className="canvasPopupNoDefects"><ScanLine size={20}/><span>No defects reported</span></p>}</div>
      <div className="canvasPopupDefectPager"><span>{defects.length?`${currentPage*pageSize+1}–${Math.min(defects.length,(currentPage+1)*pageSize)} of ${defects.length}`:'Inspection output'}{pages>1?' · use arrows':''}</span><div><button type="button" aria-label="Previous defect page" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={14}/></button><button type="button" aria-label="Next defect page" disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}><ChevronRight size={14}/></button></div></div>
    </section>
  </aside>;
}
