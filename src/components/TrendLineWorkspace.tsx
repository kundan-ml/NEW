'use client';

import {useEffect,useId,useMemo,useRef,useState,type KeyboardEvent,type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {Activity,BarChart3,Box,Clock3,Maximize2,Minimize2,TrendingUp,X} from 'lucide-react';
import type {InspectionResult,StatusSymbolLegend} from '@/types';
import {buildInspectionTrends,buildLiveDefectTrends,clampLiveDefectDuration,type TrendBucket,type TrendRange} from '@/lib/inspection-trends';
import {LiveDefectTrend} from './LiveDefectTrend';
import {OverallDefectTrend} from './OverallDefectTrend';
import {YieldQualityAnalysis} from './YieldQualityAnalysis';
import {DefectAnalysis} from './DefectAnalysis';
import {TrayDefectChart} from './TrayDefectChart';
import './trend-line.css';

export type TrendView='live'|'yield'|'defects'|'3d'|'timing';
type Props={results:InspectionResult[];capacity?:number;running?:boolean;liveResultAt?:string;legend?:StatusSymbolLegend|null;initialView?:TrendView;trayLabels?:ReadonlyMap<string,number>;liveDefects?:boolean;modal?:boolean;onClose?:()=>void};
type TrendSelection=TrendRange|'custom';
type Size={width:number;height:number};
type Readout={title:string;items:string[]};
const VIEWS=[{key:'live',name:'Live',icon:Activity},{key:'yield',name:'Yield',icon:TrendingUp},{key:'defects',name:'Defects',icon:BarChart3},{key:'3d',name:'3D Trays',icon:Box},{key:'timing',name:'Timing',icon:Clock3}] as const;
const RANGES=[['5m','5 min'],['30m','30 min'],['1h','1 hour'],['4h','4 hours'],['24h','24 hours'],['all','All results']] as const;
const LIVE_RANGES:ReadonlyArray<readonly[TrendSelection,string]>=[...RANGES.filter(([key])=>key!=='all'),['custom','Custom…']];
const LIVE_DURATIONS:Record<string,number>={'5m':300000,'30m':1800000,'1h':3600000,'4h':14400000,'24h':86400000};
const PREF_KEY='lens-trend-explorer-v1';
const timeLabel=(time:number,seconds=false)=>new Date(time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit'}:{})});
const dateLabel=(time:number)=>new Date(time).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const percentage=(value:number|null)=>value===null?'—':`${value.toFixed(1)}%`;
const milliseconds=(value:number|null)=>value===null?'—':`${value.toFixed(1)} ms`;
const DEFAULT_COLORS={ok:'var(--success, var(--status-ok, #35d982))',nok:'var(--error, var(--status-nok, #ef6464))',warn:'var(--warning, var(--status-warn, #f4b740))'};
type StatusColors=typeof DEFAULT_COLORS;

function linePath(points:Array<{x:number;y:number|null}>){
  let connected=false;
  return points.map(point=>{if(point.y===null){connected=false;return ''}const command=connected?'L':'M';connected=true;return `${command}${point.x.toFixed(2)},${point.y.toFixed(2)}`}).join(' ');
}

function bucketReadout(bucket:TrendBucket):Readout{
  return {title:dateLabel(bucket.time),items:[`${bucket.total} inspected · ${bucket.ok} OK · ${bucket.nok} NOK · ${bucket.warn} warning`,`Yield ${percentage(bucket.yield)} · average ${milliseconds(bucket.avgInferenceMs)}`,`${bucket.perMinute.toFixed(1)} lenses/min in this interval`]};
}

export function TrendLineWorkspace({results,capacity=16,running=false,liveResultAt,legend,initialView,trayLabels,liveDefects=false,modal=false,onClose}:Props){
  const[view,setView]=useState<TrendView>(initialView||'live');
  const[scope,setScope]=useState<'live'|'overall'>('live');
  const isOverall=liveDefects&&scope==='overall';
  const isRichAnalysis=!isOverall&&(view==='yield'||view==='defects'||view==='3d');
  const[range,setRange]=useState<TrendSelection>(liveDefects?'5m':'all');
  const[customAmount,setCustomAmount]=useState('15');
  const[customUnit,setCustomUnit]=useState<'minutes'|'hours'>('minutes');
  const[angle,setAngle]=useState(35);
  const[now,setNow]=useState<number|null>(null);
  const[restored,setRestored]=useState(false);
  const[expanded,setExpanded]=useState(modal);
  const[hover,setHover]=useState<number|null>(null);
  const[readout,setReadout]=useState<Readout|null>(null);
  const[clockOffset,setClockOffset]=useState(0);
  const[size,setSize]=useState<Size>({width:600,height:200});
  const plot=useRef<HTMLDivElement>(null),tabs=useRef<HTMLDivElement>(null),expandButton=useRef<HTMLButtonElement>(null),closeButton=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLElement>(null);
  const previousLiveResultAt=useRef(liveResultAt);
  const onCloseRef=useRef(onClose);onCloseRef.current=onClose;
  const prefKey=liveDefects?'lens-classic-trend-explorer-v1':PREF_KEY;
  const ranges=liveDefects?LIVE_RANGES:RANGES;
  const customDurationMs=clampLiveDefectDuration(Number(customAmount)*(customUnit==='hours'?3600000:60000));
  const liveDurationMs=range==='custom'?customDurationMs:LIVE_DURATIONS[range]||300000;
  function closeExplorer(){if(modal)onCloseRef.current?.();else setExpanded(false)}
  const rawId=useId().replace(/[^a-zA-Z0-9_-]/g,'');
  const panelId=`trend-panel-${rawId}`;
  useEffect(()=>{
    try{const saved=JSON.parse(localStorage.getItem(prefKey)||'null') as {scope?:'live'|'overall';view?:TrendView;range?:TrendSelection;angle?:number;customDurationMs?:number;customUnit?:'minutes'|'hours'}|null;
      if(liveDefects&&saved?.scope==='overall')setScope('overall');
      if(saved){if(!initialView&&VIEWS.some(item=>item.key===saved.view))setView(saved.view!);if(ranges.some(item=>item[0]===saved.range))setRange(saved.range!);if(typeof saved.angle==='number'&&Number.isFinite(saved.angle))setAngle(Math.max(15,Math.min(65,saved.angle)));if(liveDefects&&typeof saved.customDurationMs==='number'){const unit=saved.customUnit==='hours'?'hours':'minutes';setCustomUnit(unit);setCustomAmount(String(clampLiveDefectDuration(saved.customDurationMs)/(unit==='hours'?3600000:60000)))}}
    }catch{/* A malformed optional chart preference never blocks inspection. */}
    setRestored(true);setNow(Date.now());const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);
  },[]);
  useEffect(()=>{if(initialView)setView(initialView)},[initialView]);
  useEffect(()=>{if(restored)try{localStorage.setItem(prefKey,JSON.stringify({view,range,angle,...(liveDefects?{scope,customDurationMs,customUnit}:{})}))}catch{}},[restored,view,range,angle,prefKey,liveDefects,scope,customDurationMs,customUnit]);
  useEffect(()=>{setHover(null);setReadout(null)},[view,range]);
  useEffect(()=>{const element=plot.current;if(!element)return;const observer=new ResizeObserver(entries=>{const rect=entries[0]?.contentRect;if(rect)setSize({width:Math.max(160,rect.width),height:Math.max(36,rect.height)})});observer.observe(element);return()=>observer.disconnect()},[expanded]);
  useEffect(()=>{
    if(!expanded)return;const previous=document.body.style.overflow,previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;document.body.style.overflow='hidden';closeButton.current?.focus();
    const key=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();closeExplorer()}if(event.key==='Tab'){
      const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),select,input,[tabindex="0"]')||[]).filter(element=>element.getClientRects().length>0);const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
    }};
    window.addEventListener('keydown',key);return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',key);window.requestAnimationFrame(()=>previousFocus?.focus())};
  },[expanded,modal]);
  const latestBackendTime=useMemo(()=>results.reduce((latest,result)=>{const time=Date.parse(result.created_at);return Number.isFinite(time)?Math.max(latest,time):latest},0),[results]);
  const earliestBackendTime=useMemo(()=>results.reduce((earliest,result)=>{const time=Date.parse(result.created_at);return Number.isFinite(time)?Math.min(earliest,time):earliest},Infinity),[results]);
  useEffect(()=>{const difference=latestBackendTime-Date.now();if(difference>clockOffset)setClockOffset(difference)},[latestBackendTime,clockOffset]);
  useEffect(()=>{
    const previous=previousLiveResultAt.current;previousLiveResultAt.current=liveResultAt;
    // Only a newly received active frame can estimate negative clock skew;
    // historical results must never pull a rolling window back into the past.
    if(!running||!liveResultAt||liveResultAt===previous)return;
    const stamped=Date.parse(liveResultAt),difference=stamped-Date.now();
    if(Number.isFinite(stamped)&&Math.abs(difference)>60_000)setClockOffset(difference);
  },[liveResultAt,running]);
  const allResultsClock=useMemo(()=>Math.max(Date.now(),latestBackendTime),[latestBackendTime,restored]);
  const aggregationClock=now===null?0:isOverall||(!liveDefects&&range==='all')?allResultsClock:Math.max(now+clockOffset,latestBackendTime);
  // Inspect immediately on a new stream result; do not wait for the clock tick.
  // All-history aggregation stays cached while only the display clock advances.
  const model=useMemo(()=>buildInspectionTrends(results,liveDefects?'all':range as TrendRange,aggregationClock,capacity,liveDefects&&!isOverall?liveDurationMs:undefined),[results,range,aggregationClock,capacity,liveDefects,liveDurationMs,isOverall]);
  // Both UI modes share the same running class counts. The selected period
  // controls the time axis, never the retained-history cumulative baseline.
  const classDurationMs=!liveDefects&&range==='all'
    ?clampLiveDefectDuration(Math.max(300000,allResultsClock-earliestBackendTime+1000))
    :liveDurationMs;
  const liveClock=isOverall?aggregationClock:now===null?0:Math.max(now+clockOffset,latestBackendTime);
  const liveModel=useMemo(()=>buildLiveDefectTrends(results,classDurationMs,liveClock),[results,classDurationMs,liveClock]);
  const overallDefects=liveModel?.series.reduce((sum,item)=>sum+item.overallTotal,0)||0;
  const colors:StatusColors={ok:legend?.statuses.find(item=>item.key==='OK')?.color||DEFAULT_COLORS.ok,nok:legend?.statuses.find(item=>item.key==='NOK')?.color||DEFAULT_COLORS.nok,warn:legend?.statuses.find(item=>item.key==='WARN')?.color||DEFAULT_COLORS.warn};
  const latestBucket=model.buckets.findLast(bucket=>bucket.total>0);
  const activeBucket=hover===null?latestBucket:model.buckets[Math.max(0,Math.min(hover,model.buckets.length-1))];
  const selected=readout||(activeBucket?bucketReadout(activeBucket):null);
  const width=size.width,height=size.height;
  const left=42,right=Math.max(85,width-(view==='live'?42:16)),top=height<100?8:16,bottom=Math.max(22,height-22),chartHeight=bottom-top;
  const x=(time:number)=>left+(time-model.start)/Math.max(1,model.end-model.start)*(right-left);
  const timingMax=Math.max(1,...model.buckets.map(bucket=>bucket.p95InferenceMs??0))*1.12;
  const timingY=(value:number)=>bottom-value/timingMax*chartHeight;
  const bucketX=(bucket:TrendBucket)=>(x(bucket.time)+x(bucket.end))/2;
  function chooseView(next:TrendView){setView(next);setReadout(null)}
  function tabKey(event:KeyboardEvent<HTMLButtonElement>,index:number){
    const next=event.key==='ArrowRight'?(index+1)%VIEWS.length:event.key==='ArrowLeft'?(index+VIEWS.length-1)%VIEWS.length:event.key==='Home'?0:event.key==='End'?VIEWS.length-1:-1;
    if(next<0)return;event.preventDefault();chooseView(VIEWS[next].key);tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }
  function chartKey(event:KeyboardEvent<SVGSVGElement>){
    if(view!=='timing')return;const last=model.buckets.length-1,index=hover??Math.max(0,model.buckets.findLastIndex(bucket=>bucket.total>0));
    const next=event.key==='ArrowLeft'?Math.max(0,index-1):event.key==='ArrowRight'?Math.min(last,index+1):event.key==='Home'?0:event.key==='End'?last:-1;
    if(next>=0){event.preventDefault();setHover(next)}
  }
  function inspectPoint(event:PointerEvent<SVGSVGElement>){
    if(view!=='timing')return;
    const rect=event.currentTarget.getBoundingClientRect(),localX=(event.clientX-rect.left)*width/Math.max(1,rect.width);
    let index=0,distance=Infinity;
    model.buckets.forEach((bucket,i)=>{const d=Math.abs(bucketX(bucket)-localX);if(d<distance){distance=d;index=i}});
    setHover(index);
  }
  const grid=(timing=false)=><g className="trendSvgGrid">{(height<110?[0,.5,1]:[0,.25,.5,.75,1]).map(fraction=><g key={fraction}><line x1={left} x2={right} y1={bottom-fraction*chartHeight} y2={bottom-fraction*chartHeight}/><text x={left-7} y={bottom-fraction*chartHeight+3} textAnchor="end">{timing?Math.round(timingMax*fraction):`${Math.round(fraction*100)}%`}</text></g>)}
    {(width<420?[0,1]:[0,.5,1]).map(fraction=>{const time=model.start+fraction*(model.end-model.start);return <text key={fraction} x={left+fraction*(right-left)} y={height-7} textAnchor={fraction===0?'start':fraction===1?'end':'middle'}>{model.end-model.start>=86400000?`${new Date(time).toLocaleDateString([],{month:'short',day:'numeric'})} ${timeLabel(time)}`:timeLabel(time)}</text>})}
  </g>;
  const empty=(message:string)=><g className="trendSvgEmpty"><text x={width/2} y={height/2} textAnchor="middle">{message}</text><text x={width/2} y={height/2+19} textAnchor="middle" className="trendSvgMuted">New inspection results appear here automatically</text></g>;

  const chart=view==='timing'?<>
    {grid(true)}
    {model.total===0?empty('Waiting for inspection results'):<>
      <path d={linePath(model.buckets.filter(bucket=>bucket.p95InferenceMs!==null).map(bucket=>({x:bucketX(bucket),y:timingY(bucket.p95InferenceMs!)})))} className="trendP95Bridge"><title>Dashed connections bridge intervals without timing measurements</title></path>
      <path d={linePath(model.buckets.filter(bucket=>bucket.avgInferenceMs!==null).map(bucket=>({x:bucketX(bucket),y:timingY(bucket.avgInferenceMs!)})))} className="trendBridgeLine"><title>Dashed connections bridge intervals without timing measurements</title></path>
      <path d={linePath(model.buckets.map(bucket=>({x:bucketX(bucket),y:bucket.p95InferenceMs===null?null:timingY(bucket.p95InferenceMs)})))} className="trendP95Line"/>
      <path d={linePath(model.buckets.map(bucket=>({x:bucketX(bucket),y:bucket.avgInferenceMs===null?null:timingY(bucket.avgInferenceMs)})))} className="trendMainLine"/>
      {model.buckets.filter(bucket=>bucket.avgInferenceMs!==null).map(bucket=><circle key={bucket.time} cx={bucketX(bucket)} cy={timingY(bucket.avgInferenceMs!)} r="3" className="trendMainPoint"><title>{dateLabel(bucket.time)} · {milliseconds(bucket.avgInferenceMs)}</title></circle>)}
      {model.avgInferenceMs===null&&empty('Inference timing has not been reported')}
    </>}
    {hover!==null&&activeBucket&&<g className="trendCursor"><line x1={bucketX(activeBucket)} x2={bucketX(activeBucket)} y1={top} y2={bottom}/></g>}
  </>:null;

  const content=<section className={`trendLineWorkspace ${expanded?'isExpanded':''} ${liveDefects?'hasLiveDefects':''} ${isOverall?'isOverall':''}`} data-scope={scope} data-view={view} data-count={model.total} data-lens-count={model.total} data-empty={model.total===0} aria-label="Live inspection analytics">
    {liveDefects&&<div className="trendScopeHeader"><div><small>INSPECTION INTELLIGENCE</small><strong>{isOverall?'The complete picture':'Every defect. In real time.'}</strong></div><div className="trendScopeSwitch" role="group" aria-label="Trend display mode"><button aria-pressed={!isOverall} onClick={()=>setScope('live')}><Activity/>Live trend</button><button aria-pressed={isOverall} onClick={()=>setScope('overall')}><BarChart3/>Overall</button></div></div>}
    {!isOverall&&<div className="trendViewTabs" role="tablist" aria-label="Trend Line views" ref={tabs}>{VIEWS.map((item,index)=><button key={item.key} id={`${panelId}-${item.key}`} role="tab" aria-selected={view===item.key} aria-controls={panelId} tabIndex={view===item.key?0:-1} onKeyDown={event=>tabKey(event,index)} onClick={()=>chooseView(item.key)} className={view===item.key?'active':''}><item.icon aria-hidden="true"/><span>{item.name}</span></button>)}</div>}
    <div className="trendLineToolbar">
      <span className={`trendLiveBadge ${running?'isRunning':''}`}><i/>{running?'Live inspection':'Live monitor'}</span>
      {isOverall?<span className="trendOverallContext">All loaded results · updates automatically</span>:<><time className="trendLiveClock" dateTime={now===null?undefined:new Date(now).toISOString()}>{now===null?'—':timeLabel(now,true)}</time>
      <label><span className="trendSrOnly">Time range</span><select aria-label="Trend time range" value={range} onChange={event=>setRange(event.target.value as TrendSelection)}>{ranges.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></>}
      {!isOverall&&liveDefects&&range==='custom'&&<div className="trendCustomDuration"><input aria-label="Custom trend duration" type="number" min={customUnit==='hours'?1/60:1} max={customUnit==='hours'?24:1440} step="any" value={customAmount} onChange={event=>setCustomAmount(event.target.value)} onBlur={()=>setCustomAmount(String(customDurationMs/(customUnit==='hours'?3600000:60000)))}/><select aria-label="Trend duration unit" value={customUnit} onChange={event=>{const unit=event.target.value==='hours'?'hours':'minutes';setCustomUnit(unit);setCustomAmount(String(customDurationMs/(unit==='hours'?3600000:60000)))}}><option value="minutes">Minutes</option><option value="hours">Hours</option></select></div>}
      {!modal&&<button ref={expandButton} className="trendExpand" aria-label={expanded?'Minimize Trend Line':'Expand Trend Line'} title={expanded?'Minimize':'Expand charts'} onClick={()=>setExpanded(value=>!value)}>{expanded?<Minimize2/>:<Maximize2/>}</button>}
    </div>
    {!isRichAnalysis&&<div className="trendMetricStrip">
      {!isOverall&&view==='live'?<>
      <div title="Running count of actual reported defect occurrences across retained inspection history, including repeated defects on one lens"><small>Running defect total</small><strong data-trend-metric="defects">{overallDefects.toLocaleString()}</strong><em>Continues across time windows</em></div>
      <div><small>Defect classes detected</small><strong data-trend-metric="classes">{liveModel.series.filter(item=>item.overallTotal>0).length}</strong><em>Retained inspection history</em></div>
      <div><small>Lenses in visible period</small><strong data-trend-metric="total">{liveModel.inspected.toLocaleString()}</strong><em>{liveModel.totalDefects} new defects in view</em></div>
      </>:<>
      <div><small>Inspected</small><strong data-trend-metric="total">{model.total.toLocaleString()}</strong><em><i style={{background:colors.ok}}/>{model.ok} OK</em></div>
      <div title="Yield excludes reported no-lens/no-test-job results. Outcome counts include every inspected result."><small>{isOverall?'Overall yield':'Window yield'}</small><strong data-trend-metric="yield">{percentage(model.yield)}</strong><em><i style={{background:colors.nok}}/>{model.nok} NOK</em></div>
      <div title="One backend-measured four-camera inference call per lens"><small>{isOverall?'Total defects':'Avg. inference'}</small><strong data-trend-metric={isOverall?'defects':'avg'}>{isOverall?overallDefects.toLocaleString():milliseconds(model.avgInferenceMs)}</strong><em><i style={{background:colors.warn}}/>{model.warn} warning</em></div>
      </>}
    </div>}
    {!isOverall&&(view==='timing'||view==='3d')&&<div className="trendChartHeading"><span>{view==='timing'?<><i className="trendLegendLine"/>Average ms <i className="trendLegendP95"/>P95 ms</>:'Defect occurrences by tray and class'}</span>{view==='3d'?<label className="trendRotation">Rotation<input aria-label="3D chart rotation" type="range" min="15" max="65" value={angle} onChange={event=>setAngle(Number(event.target.value))}/><output>{angle}°</output></label>:<small>{liveDefects?`${liveDurationMs/60000<60?`${Number((liveDurationMs/60000).toFixed(2))} min`:`${Number((liveDurationMs/3600000).toFixed(2))} h`} · live window`:range==='all'?'All loaded results':`${RANGES.find(item=>item[0]===range)?.[1]} window`}</small>}</div>}
    <div id={panelId} role={isOverall?'region':'tabpanel'} aria-label={isOverall?'Overall defect analysis':undefined} aria-labelledby={isOverall?undefined:`${panelId}-${view}`} className="trendPlot" ref={plot}>
      {isOverall&&liveModel?<OverallDefectTrend model={liveModel} legend={legend}/>:view==='yield'?<YieldQualityAnalysis model={model} legend={legend}/>:view==='defects'?<DefectAnalysis model={model} legend={legend}/>:view==='live'?<LiveDefectTrend model={liveModel} legend={legend}/>:view==='3d'?<TrayDefectChart model={model} legend={legend} angle={angle} trayLabels={trayLabels}/>:<><svg viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} aria-label="Inference timing trend" onKeyDown={chartKey} onPointerDown={inspectPoint} onPointerMove={inspectPoint} onPointerLeave={event=>{if(event.pointerType!=='touch'){setHover(null);setReadout(null)}}}>
        {chart}
      </svg>
      {selected&&(hover!==null||readout!==null)&&<div className="trendReadout" role="status"><b>{selected.title}</b>{selected.items.map(item=><span key={item}>{item}</span>)}</div>}</>}
    </div>
    <footer className="trendLineFooter">{isOverall?<><span>All loaded inspection results</span><span>{overallDefects} defects · {liveModel?.series.filter(item=>item.overallTotal>0).length||0} types</span></>:<><span title={model.lastResultAt===null?'No results in this range':dateLabel(model.lastResultAt)}>{view==='live'&&liveModel?'Cumulative counts · idle periods hold the last total':model.lastResultAt===null?'Waiting for measured results':`Last result ${timeLabel(model.lastResultAt,true)}`}</span><span>{view==='live'&&liveModel?`${overallDefects} running defects · ${liveModel.series.filter(item=>item.overallTotal>0).length} classes`:view==='3d'?`${model.defects.length} defect classes · ${model.trays.length} WT`:view==='defects'?`${model.defects.length} types · ${model.total} lenses`:view==='timing'?`P95 ${milliseconds(model.p95InferenceMs)}`:`${model.total} inspected · ${model.trays.length} WT`}</span></>}</footer>
  </section>;
  if(expanded&&typeof document!=='undefined')return <>{!modal&&<div className="trendExpandedPlaceholder"><TrendingUp/><span>Trend Line is expanded</span><button onClick={closeExplorer}>Return to workspace</button></div>}{createPortal(<div className="trendExplorerBackdrop" onPointerDown={event=>{if(event.target===event.currentTarget)closeExplorer()}}><section className="trendExplorerWindow" ref={dialog} role="dialog" aria-modal="true" aria-label="Expanded Trend Line"><header><span><Activity/><b>Trend Line</b><small>{liveDefects?'Live defect monitor':'Live inspection analytics'}</small></span><button ref={closeButton} aria-label="Close Trend Line" onClick={closeExplorer}><X/></button></header>{content}</section></div>,document.body)}</>;
  return content;
}
