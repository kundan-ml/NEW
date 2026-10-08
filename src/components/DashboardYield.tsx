'use client';
import {useId} from 'react';
export function DashboardYield({value}:{value:number}){
  const id=useId().replace(/:/g,'');
  const yieldValue=Math.max(0,Math.min(100,value));
  const angle=yieldValue*3.6;
  const endX=60+49*Math.sin(angle*Math.PI/180),endY=60-49*Math.cos(angle*Math.PI/180);
  const greenSector=yieldValue>=100?'':`M 60 60 L 60 11 A 49 49 0 ${angle>180?1:0} 1 ${endX} ${endY} Z`;
  return <div className="dashboardYield" title="Inspection yield across the latest 10 WT">
    <svg viewBox="0 0 120 120" role="img" aria-label={`Yield ${yieldValue.toFixed(1)} percent good; ${(100-yieldValue).toFixed(1)} percent not good`}>
      <defs>
        <linearGradient id={`${id}-red`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="color-mix(in srgb,var(--status-nok,#dc4545) 80%,white)"/><stop offset="1" stopColor="color-mix(in srgb,var(--status-nok,#dc4545) 82%,black)"/></linearGradient>
        <linearGradient id={`${id}-green`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="color-mix(in srgb,var(--status-ok,#269d5c) 75%,white)"/><stop offset="1" stopColor="color-mix(in srgb,var(--status-ok,#269d5c) 82%,black)"/></linearGradient>
        <radialGradient id={`${id}-depth`}><stop stopColor="#000" stopOpacity=".24"/><stop offset=".75" stopColor="#000" stopOpacity="0"/><stop offset="1" stopColor="#fff" stopOpacity=".08"/></radialGradient>
      </defs>
      <circle cx="60" cy="60" r="53" style={{fill:'var(--surface-elevated)',stroke:'var(--border)',strokeWidth:1}}/>
      <circle className="dashboardYieldDefects" cx="60" cy="60" r="49" style={{fill:`url(#${id}-red)`}}/>
      {yieldValue>=100?<circle className="dashboardYieldGood" cx="60" cy="60" r="49" style={{fill:`url(#${id}-green)`}}/>:yieldValue>0?<path className="dashboardYieldGood" d={greenSector} style={{fill:`url(#${id}-green)`}}/>:null}
      <circle cx="60" cy="60" r="49" style={{fill:`url(#${id}-depth)`,stroke:'rgba(255,255,255,.18)',strokeWidth:1}}/>
    </svg>
    <span><b>Yield<em>{yieldValue.toFixed(1)}%</em></b></span>
  </div>;
}
