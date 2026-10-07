'use client';

import {useEffect,useId,useMemo,useRef,useState,type CSSProperties} from 'react';
import type {LiveDefectTrends} from '@/lib/inspection-trends';
import type {StatusSymbolLegend} from '@/types';
import {seriesStyle} from './LiveDefectTrend';
import {defectClassCodes} from '@/lib/defect-class-labels';

/** A categorical comparison of all retained inspection results, never a time series. */
export function OverallDefectTrend({model,legend}:{model:LiveDefectTrends;legend?:StatusSymbolLegend|null}){
  const frame=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:700,height:280});
  const [selected,setSelected]=useState<string|null>(null);
  const id=useId().replace(/[^a-zA-Z0-9_-]/g,'');
  const series=useMemo(()=>[...model.series].sort((a,b)=>b.overallTotal-a.overallTotal||a.name.localeCompare(b.name)),[model.series]);
  const codes=useMemo(()=>defectClassCodes(series.map(item=>item.name)),[series]);
  const total=series.reduce((sum,item)=>sum+item.overallTotal,0);
  const max=Math.max(1,...series.map(item=>item.overallTotal));
  const active=series.find(item=>item.key===selected);
  const columns=series.length>10?2:1;
  const classLayout={'--legend-columns':columns,'--legend-rows':Math.max(1,Math.ceil(series.length/columns)),'--compact-legend-rows':Math.max(1,Math.ceil(series.length/2))} as CSSProperties;
  useEffect(()=>{const element=frame.current;if(!element)return;const observer=new ResizeObserver(entries=>{const r=entries[0]?.contentRect;if(r)setSize({width:Math.max(160,r.width),height:Math.max(50,r.height)})});observer.observe(element);return()=>observer.disconnect()},[]);
  const left=40,right=size.width-24,top=24,bottom=Math.max(35,size.height-28);
  const points=series.map((item,index)=>({item,x:series.length===1?(left+right)/2:left+index/Math.max(1,series.length-1)*(right-left),y:bottom-item.overallTotal/max*(bottom-top)}));
  const curve=points.map((point,index)=>{if(!index)return `M${point.x},${point.y}`;const previous=points[index-1],mid=(previous.x+point.x)/2;return `C${mid},${previous.y} ${mid},${point.y} ${point.x},${point.y}`}).join(' ');
  return <section className={`overallDefectTrend ${columns>1?'hasDenseClasses':''}`} data-total={total} aria-label="Overall defect analysis">
    <div className="overallTrendIntro"><span><small>COMPLETE INSPECTION PICTURE</small><h3>Defect distribution</h3><p>All loaded results · ranked by actual defect occurrences</p></span><div><strong>{total.toLocaleString()}</strong><small>Total defects</small></div></div>
    <div className="overallTrendChart" ref={frame}>
      <svg viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="Overall defect distribution">
        <defs><linearGradient id={`overall-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity=".23"/><stop offset="100%" stopColor="var(--primary)" stopOpacity="0"/></linearGradient></defs>
        {[0,.5,1].map(fraction=><g className="liveDefectGrid" key={fraction}><line x1={left} x2={right} y1={bottom-fraction*(bottom-top)} y2={bottom-fraction*(bottom-top)}/><text x={left-9} y={bottom-fraction*(bottom-top)+3} textAnchor="end">{Math.round(max*fraction)}</text></g>)}
        {points.length>1&&<><path d={`${curve} L${right},${bottom} L${left},${bottom} Z`} fill={`url(#overall-${id})`}/><path d={curve} className="overallTrendCurve"/></>}
        {points.map(({item,x,y},index)=>{const color=seriesStyle(item,legend).color;return <g key={item.key} tabIndex={0} role="img" aria-label={`${item.name}: ${item.overallTotal} defects`} data-overall-defect={item.key} data-count={item.overallTotal} onFocus={()=>setSelected(item.key)} onBlur={()=>setSelected(null)} onPointerEnter={()=>setSelected(item.key)} onPointerLeave={()=>setSelected(null)} onPointerDown={()=>setSelected(item.key)}><title>{item.name}: {item.overallTotal} defects · {total?(item.overallTotal/total*100).toFixed(1):0}%</title><line x1={x} x2={x} y1={bottom} y2={y} stroke={color} strokeWidth={Math.min(18,(right-left)/Math.max(1,points.length)*.22)} opacity=".22"/><circle cx={x} cy={y} r="8" fill={color} opacity=".16"/><circle cx={x} cy={y} r="3.5" fill={color}/><text x={x} y={Math.max(12,y-13)} textAnchor="middle" className="trendSvgText">{item.overallTotal}</text><text x={x} y={size.height-8} textAnchor="middle" className="trendSvgMuted">#{index+1}</text></g>})}
        {!points.length&&<text x={size.width/2} y={size.height/2} textAnchor="middle" className="trendSvgMuted">No reported defects in the loaded inspections</text>}
      </svg>
      {active&&<div className="overallTrendReadout" role="status"><b>{active.name}</b><span>{active.overallTotal} defects · {total?(active.overallTotal/total*100).toFixed(1):0}% of defects</span></div>}
    </div>
    <aside className="overallTrendSidebar" aria-label="Overall defect class totals"><div className="trendClassSideHeading"><strong>Defect classes</strong><small>Overall totals · ranked</small></div>
    <div className="overallTrendClasses" aria-label="Defect totals by class" style={classLayout}>{series.map((item,index)=>{const color=seriesStyle(item,legend).color;return <button key={item.key} data-defect-name={item.name} data-defect-code={codes.get(item.name)} style={{'--defect-line':color} as CSSProperties} title={`${item.name}: ${item.overallTotal} defects`} aria-label={`${item.name}: ${item.overallTotal} defects`} onClick={()=>setSelected(selected===item.key?null:item.key)} aria-pressed={selected===item.key}><small>#{index+1}</small><i style={{background:color}}/><span className="trendClassName"><span className="trendClassFullName">{item.name}</span><span className="trendClassInitial">{codes.get(item.name)}</span></span><b>{item.overallTotal}</b><em>{total?(item.overallTotal/total*100).toFixed(1):0}%</em></button>})}</div>
    </aside>
  </section>;
}
