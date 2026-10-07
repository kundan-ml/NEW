'use client';

import {useEffect,useId,useMemo,useRef,useState,type CSSProperties,type KeyboardEvent,type PointerEvent} from 'react';
import type {InspectionTrends,TrendBucket} from '@/lib/inspection-trends';
import {buildQualityAnalysis} from '@/lib/inspection-quality-analysis';
import {defectClassCodes} from '@/lib/defect-class-labels';
import {smoothTrendPath} from '@/lib/trend-curve';
import type {StatusSymbolLegend} from '@/types';
import {seriesStyle} from './LiveDefectTrend';
import './yield-quality-analysis.css';

type Props={model:InspectionTrends;legend?:StatusSymbolLegend|null;onClassClick?:(name:string)=>void};
const percent=(value:number|null)=>value===null?'—':`${value.toFixed(1)}%`;
const time=(value:number,includeDate=false)=>new Date(value).toLocaleString([],{
  ...(includeDate?{month:'short' as const,day:'numeric' as const}:{}),
  hour:'2-digit',minute:'2-digit',
});

function useChartSize(){
  const ref=useRef<HTMLDivElement>(null);
  const[size,setSize]=useState({width:300,height:170});
  useEffect(()=>{const element=ref.current;if(!element)return;const observer=new ResizeObserver(entries=>{const rect=entries[0]?.contentRect;if(rect)setSize({width:Math.max(80,rect.width),height:Math.max(30,rect.height)})});observer.observe(element);return()=>observer.disconnect()},[]);
  return {ref,...size};
}

export function YieldQualityAnalysis({model,legend,onClassClick}:Props){
  const analysis=useMemo(()=>buildQualityAnalysis(model),[model]);
  const codes=useMemo(()=>defectClassCodes(analysis.classes.map(item=>item.name)),[analysis.classes]);
  const[selectedClass,setSelectedClass]=useState<string|null>(null);
  const active=analysis.classes.find(item=>item.key===selectedClass);
  const outcomes=[
    {key:'OK',name:'OK',count:analysis.eligibleOkLenses,color:legend?.statuses.find(item=>item.key==='OK')?.color||'var(--success)'},
    {key:'NOK',name:'NOK',count:analysis.eligibleNokLenses,color:legend?.statuses.find(item=>item.key==='NOK')?.color||'var(--error)'},
    {key:'WARN',name:'Warning',count:analysis.eligibleWarnLenses,color:legend?.statuses.find(item=>item.key==='WARN')?.color||'var(--warning)'},
    ...(analysis.eligibleOtherLenses?[{key:'OTHER',name:'Other',count:analysis.eligibleOtherLenses,color:'var(--text-muted)'}]:[]),
  ];
  const columns=analysis.classes.length>8?3:analysis.classes.length>1?2:1;
  const classLayout={'--quality-class-columns':columns,'--quality-class-rows':Math.max(1,Math.ceil(analysis.classes.length/columns)),'--quality-narrow-rows':Math.max(1,Math.ceil(analysis.classes.length/2))} as CSSProperties;
  const change=analysis.yieldDeltaPoints;
  return <section className={`yieldQualityAnalysis ${analysis.classes.length>8?'hasDenseQualityClasses':''}`} data-total={model.total} data-yield={analysis.yieldPercent??''} data-eligible={analysis.eligibleLenses} data-excluded={analysis.excludedLenses} data-occurrences={analysis.totalOccurrences} data-affected={analysis.affectedLenses} aria-label="Yield quality analysis">
    <header className="qualityAnalysisHeading"><div><small>QUALITY INTELLIGENCE</small><h3>Yield & quality</h3></div><div className="qualitySummaryNumbers"><span><small>Inspected</small><b>{model.total.toLocaleString()}</b></span><span><small>Defect occurrences</small><b>{analysis.totalOccurrences.toLocaleString()}</b></span><span><small>Affected lenses</small><b>{analysis.affectedLenses.toLocaleString()}</b></span></div></header>
    <div className="qualityAnalysisBody">
      <section className="qualityOverview" aria-label="Eligible inspection outcomes">
        <YieldRing yieldPercent={analysis.yieldPercent} eligible={analysis.eligibleLenses} outcomes={outcomes}/>
        <div className="qualityOutcomeList"><div className="qualitySectionCaption">Eligible outcomes</div>{outcomes.map(item=>{const share=analysis.eligibleLenses?item.count/analysis.eligibleLenses*100:0;return <div key={item.key} className="qualityOutcomeRow" data-status={item.key} data-count={item.count} style={{'--quality-outcome':item.color} as CSSProperties}><div><i/><span>{item.name}</span><b>{item.count.toLocaleString()}</b><em>{share.toFixed(1)}%</em></div><div className="qualityOutcomeTrack"><i style={{width:`${share}%`}}/></div></div>})}<p className="qualityEligibilityNote">{analysis.eligibleLenses} eligible · {analysis.excludedLenses} excluded from yield</p></div>
      </section>
      <section className="qualityYieldTimeline"><header><span><strong>Yield over time</strong><small>Measured inspection intervals</small></span><span className={`qualityYieldDelta ${change!==null&&change<0?'isDown':''}`} title="Change between the latest two occupied intervals">{change===null?'No comparison yet':`${change>0?'+':''}${change.toFixed(1)} pp`}</span></header><YieldTimeline model={model}/><small className="qualityTimelineNote">Dots = measured yield · dashed gaps = no yield measurement</small></section>
    </div>
    <section className="qualityClassSection"><header><span><strong>Affected lenses by defect class</strong><small>One lens can appear in more than one class</small></span><b>{analysis.activeClasses} {analysis.activeClasses===1?'class':'classes'}</b></header>
      <div className="yieldClassImpact" style={classLayout}>{analysis.classes.map(item=>{const color=seriesStyle(item,legend).color;return <button key={item.key} data-quality-class={item.key} data-lenses={item.lenses} data-occurrences={item.occurrences} aria-pressed={selectedClass===item.key} aria-label={`${item.name}: ${item.lenses} affected lenses, ${item.occurrences} occurrences`} title={`${item.name} · ${item.lenses} affected lenses (${item.affectedPercent.toFixed(1)}% of inspected) · ${item.occurrences} occurrences`} onClick={()=>{setSelectedClass(selectedClass===item.key?null:item.key);onClassClick?.(item.name)}} style={{'--quality-class-color':color} as CSSProperties}><span className="qualityClassCode">{codes.get(item.name)}</span><span className="qualityClassLabel">{item.name}</span><b>{item.lenses}<small> {item.lenses===1?'lens':'lenses'}</small></b><span className="qualityClassMeter"><i style={{width:`${item.affectedPercent}%`}}/></span><em>{item.affectedPercent.toFixed(1)}%</em></button>})}{!analysis.classes.length&&<div className="qualityClassEmpty">{model.total?'No defects reported in this period':'Class information appears after inspection'}</div>}</div>
      <footer className="qualityClassReadout" role="status">{active?<><b>{active.name}</b><span>{active.lenses} affected {active.lenses===1?'lens':'lenses'} · {active.occurrences} {active.occurrences===1?'occurrence':'occurrences'} · {active.affectedPercent.toFixed(1)}% of inspected</span></>:<span>No-lens and no-test results remain in inspection and class counts, but are excluded from yield.</span>}</footer>
    </section>
  </section>;
}

type Outcome={key:string;name:string;count:number;color:string};
function YieldRing({yieldPercent,eligible,outcomes}:{yieldPercent:number|null;eligible:number;outcomes:Outcome[]}){
  const{ref,width,height}=useChartSize();
  const cx=width/2,cy=height/2,r=Math.max(6,Math.min(width*.39,height*.39)),circumference=2*Math.PI*r;
  const stroke=Math.max(4,Math.min(15,r*.2));let offset=0;
  return <div className="qualityYieldRing" ref={ref}><svg role="img" aria-label="Inspection quality distribution" viewBox={`0 0 ${width} ${height}`}><title>Yield {percent(yieldPercent)} from {eligible} eligible inspections; ring shows eligible outcomes</title><circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke}/>{outcomes.map(item=>{const length=eligible?item.count/eligible*circumference:0,start=offset;offset+=length;return <circle key={item.key} data-quality-status={item.key} data-count={item.count} cx={cx} cy={cy} r={r} fill="none" stroke={item.color} strokeWidth={stroke} strokeDasharray={`${length} ${circumference-length}`} strokeDashoffset={-start} transform={`rotate(-90 ${cx} ${cy})`}><title>{item.name}: {item.count} eligible lenses</title></circle>})}<text x={cx} y={cy+(r>35?-2:4)} textAnchor="middle" className="qualityRingValue" style={{fontSize:Math.max(10,Math.min(36,r*.5))}}>{percent(yieldPercent)}</text>{r>35&&<text x={cx} y={cy+18} textAnchor="middle" className="qualityRingCaption">inspection yield</text>}</svg></div>;
}

function YieldTimeline({model}:{model:InspectionTrends}){
  const{ref,width,height}=useChartSize();
  const[hoverTime,setHoverTime]=useState<number|null>(null);
  const id=useId().replace(/[^a-zA-Z0-9_-]/g,'');
  const left=31,right=Math.max(60,width-12),top=12,bottom=Math.max(top+10,height-25);
  const x=(value:number)=>left+(value-model.start)/Math.max(1,model.end-model.start)*(right-left);
  const y=(value:number)=>bottom-value/100*(bottom-top);
  const measured=model.buckets.filter(bucket=>bucket.yield!==null);
  const selected=measured.find(bucket=>bucket.time===hoverTime);
  const includeDate=new Date(model.start).toDateString()!==new Date(model.end).toDateString();
  const label=(value:number)=>time(value,includeDate);
  const point=(bucket:TrendBucket)=>({x:x((bucket.time+bucket.end)/2),y:y(bucket.yield!)});
  const segments:TrendBucket[][]=[];
  for(const bucket of model.buckets){if(bucket.yield===null){if(segments.at(-1)?.length)segments.push([])}else{if(!segments.length)segments.push([]);segments.at(-1)!.push(bucket)}}
  function inspect(event:PointerEvent<SVGSVGElement>){const rect=event.currentTarget.getBoundingClientRect(),xx=(event.clientX-rect.left)/Math.max(1,rect.width)*width;let closest=measured[0];for(const bucket of measured)if(!closest||Math.abs(point(bucket).x-xx)<Math.abs(point(closest).x-xx))closest=bucket;if(closest)setHoverTime(closest.time)}
  function keyboard(event:KeyboardEvent<SVGSVGElement>){const current=measured.findIndex(bucket=>bucket.time===hoverTime);const index=event.key==='Home'?0:event.key==='End'?measured.length-1:event.key==='ArrowLeft'?Math.max(0,(current<0?measured.length:current)-1):event.key==='ArrowRight'?Math.min(measured.length-1,current+1):-1;if(index>=0&&measured[index]){event.preventDefault();setHoverTime(measured[index].time)}if(event.key==='Escape')setHoverTime(null)}
  return <div className="qualityYieldPlot" ref={ref}><svg role="img" aria-label="Yield over time" tabIndex={0} viewBox={`0 0 ${width} ${height}`} onPointerDown={inspect} onPointerMove={inspect} onPointerLeave={event=>{if(event.pointerType!=='touch')setHoverTime(null)}} onKeyDown={keyboard} onBlur={()=>setHoverTime(null)}><defs><linearGradient id={`quality-yield-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--primary)" stopOpacity=".17"/><stop offset="1" stopColor="var(--primary)" stopOpacity="0"/></linearGradient></defs><g className="qualityTimelineGrid">{[0,50,100].map(value=><g key={value}><line x1={left} x2={right} y1={y(value)} y2={y(value)}/><text x={left-7} y={y(value)+3} textAnchor="end">{value}%</text></g>)}{(width<(includeDate?560:280)?[0,1]:[0,.5,1]).map(fraction=><text key={fraction} x={left+fraction*(right-left)} y={height-6} textAnchor={fraction===0?'start':fraction===1?'end':'middle'}>{label(model.start+fraction*(model.end-model.start))}</text>)}</g>{measured.length>1&&<path className="qualityYieldBridge" d={smoothTrendPath(measured.map(point))}><title>Dashed connections span intervals without yield measurements, not fabricated values</title></path>}{segments.filter(segment=>segment.length>1).map(segment=>{const path=smoothTrendPath(segment.map(point)),first=point(segment[0]),last=point(segment.at(-1)!);return <g key={segment[0].time}><path d={`${path} L${last.x},${bottom} L${first.x},${bottom} Z`} fill={`url(#quality-yield-${id})`}/><path d={path} className="qualityYieldMeasured"/></g>})}{measured.map(bucket=>{const p=point(bucket);return <circle key={bucket.time} data-quality-time={bucket.time} data-quality-yield={bucket.yield} cx={p.x} cy={p.y} r={selected?.time===bucket.time?4.5:3} className="qualityYieldPoint"><title>{label(bucket.time)} — {label(bucket.end)}: yield {percent(bucket.yield)} · {bucket.total} inspected</title></circle>})}{selected&&<line x1={point(selected).x} x2={point(selected).x} y1={top} y2={bottom} className="qualityYieldCursor"/>}{!measured.length&&<text x={(left+right)/2} y={(top+bottom)/2} textAnchor="middle" className="qualityYieldEmpty">{model.total?'No eligible yield measurements':'Waiting for inspection results'}</text>}</svg>{selected&&<div className="qualityYieldReadout" role="status"><b>{label(selected.time)} — {label(selected.end)}</b><span>{percent(selected.yield)} yield · {selected.total} inspected</span></div>}</div>;
}
