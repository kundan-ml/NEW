'use client';
import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {Eye,EyeOff,Lock,Unlock,SlidersHorizontal} from 'lucide-react';
import {samplePreviewUrl} from '@/lib/api';
import type {Defect,Sample} from '@/types';
import {InspectionCanvas} from './InspectionCanvas';

type Props={datasetId:string;sample:Sample|null;channel:string;defects:Defect[];onChannel:(c:string)=>void;labels:Record<string,string>;hold?:boolean;onHold?:()=>void;selectedDefect?:number;onProbe?:(p:{x:number;y:number;gray:number|null})=>void;processing?:boolean;workstation?:boolean};
export function LensViewer({datasetId,sample,channel,defects,onChannel,labels,hold,onHold,selectedDefect=0,onProbe,processing=false,workstation=false}:Props){
 const[showDefects,setShowDefects]=useState(true);const[showCross,setShowCross]=useState(true);
 const channels=useMemo(()=>sample?Object.keys(sample.images).sort((a,b)=>a==='h'?-1:b==='h'?1:a==='d'?-1:b==='d'?1:a.localeCompare(b)):[],[sample]);
 const img=sample&&channels.includes(channel)?samplePreviewUrl(datasetId,sample,channel):'';
 useEffect(()=>{function key(e:KeyboardEvent){if(e.key==='F3'){e.preventDefault();const i=Math.max(0,channels.indexOf(channel));if(channels.length)onChannel(channels[(i+1)%channels.length])}if(e.key==='F4'){e.preventDefault();const i=Math.max(0,channels.indexOf(channel));if(channels.length)onChannel(channels[(i-1+channels.length)%channels.length])}if(e.key==='F5'){e.preventDefault();setShowDefects(v=>!v)}}window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[channel,channels,onChannel]);
 return <section className={`glassPanel viewerPanel productionPanel premiumViewer ${workstation?'oakViewer':''} ${processing?'processing':''}`}>
   <div className="viewerCompactHeader">
     <div className="viewerTitleInline"><h2>{workstation?'Inspection':'Inspection Viewer'}</h2><span>{sample?`WT-${String(sample.wt_index).padStart(4,'0')} · P${sample.position}`:'No lens selected'}</span></div>
     <div className="channelTabs productionChannelTabs premiumChannelTabs">{channels.map(c=><button key={c} className={c===channel?'active':''} onClick={()=>onChannel(c)} title={`Switch to ${labels[c]||c}`}><span>{labels[c]||c.toUpperCase()}</span><small>.{c}</small></button>)}</div>
     <div className="viewerUtility premiumViewerUtility"><Link href="" title="Image filters"><SlidersHorizontal/><span>Image Filters</span></Link>{onHold&&<button className={hold?'active':''} onClick={onHold} title={hold?'Release held lens':'Hold current lens'}>{hold?<Lock/>:<Unlock/>}<span>{hold?'Held':'Hold'}</span></button>}</div>
   </div>
   <div className="canvasFrame premiumCanvasFrame"><InspectionCanvas imageUrl={img} defects={defects.filter(d=>!d.channel||d.channel===channel)} selectedDefect={selectedDefect} showDefects={showDefects} showCrosshair={showCross} onProbe={onProbe}/><div className="viewerFloating compactViewerTools"><button className={showDefects?'active':''} onClick={()=>setShowDefects(v=>!v)} title="Toggle defect overlays">{showDefects?<Eye/>:<EyeOff/>}<span>Defects</span></button><button className={showCross?'active':''} onClick={()=>setShowCross(v=>!v)} title="Toggle center crosshair"><span className="crossGlyph">＋</span><span>Crosshair</span></button></div>{processing&&<div className="processingBadge"><i/><span><b>Evaluating</b><small>HALCON / BV pipeline</small></span></div>}<div className="viewerPositionPill">Position <b>{sample?.position||'—'} / 16</b></div><div className="canvasScale"><span/><b>1 mm</b></div></div>
 </section>
}
