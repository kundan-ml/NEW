'use client';
import {useMemo,useState} from 'react';
import type {InspectionResult} from '@/types';
import {yieldSeries} from '@/lib/inspection-yield';

export function TrendChart({results,capacity=16}:{results:InspectionResult[];capacity?:number}){
  const [hours,setHours]=useState(8);
  const all=useMemo(()=>yieldSeries(results,capacity),[results,capacity]);
  const last=all.at(-1)?.time||0;
  const values=all.filter(point=>point.time>=last-hours*3600000);
  const left=42,right=580,top=16,bottom=126;
  const start=values[0]?.time||0;
  const x=(index:number)=>values.length===1?(left+right)/2:left+((values[index].time-start)/Math.max(1,last-start))*(right-left);
  const y=(value:number)=>bottom-Math.max(0,Math.min(100,value))*(bottom-top)/100;
  const path=(key:'yield'|'nok')=>values.map((point,index)=>`${x(index)},${y(point[key])}`).join(' ');
  const timeLabel=(time:number)=>new Date(time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  return <div className="trendChart productionTrend">
    <div className="chartLegend"><span><i className="yieldLegend"/>Yield · last 10 WT</span><span><i className="nokLegend"/>NOK</span>
      <label style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}>Range <select aria-label="Yield time range" value={hours} onChange={event=>setHours(Number(event.target.value))}>{[1,4,8,24,72].map(value=><option key={value} value={value}>{value}h</option>)}</select></label>
    </div>
    <svg viewBox="0 0 600 150" preserveAspectRatio="none" role="img" aria-label="Measured inspection yield trend">
      {[0,25,50,75,100].map(value=><g key={value}><line x1={left} y1={y(value)} x2={right} y2={y(value)} className="chartGrid"/><text x="4" y={y(value)+3} className="chartLabel">{value}%</text></g>)}
      {values.length?<><polyline points={path('yield')} fill="none" className="yieldLine" vectorEffect="non-scaling-stroke"/><polyline points={path('nok')} fill="none" stroke="var(--error, #ef6464)" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>{values.map((point,index)=><circle key={`${point.time}:${index}`} cx={x(index)} cy={y(point.yield)} r="3" className="yieldPoint"><title>{timeLabel(point.time)} · {point.yield.toFixed(1)}% yield</title></circle>)}</>:<text x="310" y="75" textAnchor="middle" className="chartLabel">Waiting for a completed WT</text>}
    </svg>
    <div className="chartAxis"><span>{values[0]?timeLabel(values[0].time):'—'}</span><span>{values.at(-1)?timeLabel(values.at(-1)!.time):'—'}</span></div>
  </div>;
}
