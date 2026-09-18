'use client';
import type {InspectionResult} from '@/types';

export function TrendChart({results}:{results:InspectionResult[]}){
  const bucket=Math.max(1,Math.ceil(Math.max(results.length,1)/14));
  const groups:number[]=[];
  for(let i=0;i<results.length;i+=bucket){const c=results.slice(i,i+bucket);groups.push(c.filter(x=>x.status==='OK').length/Math.max(c.length,1)*100)}
  const values=groups.length?groups:[72,78,82,80,86,84,90,88,91,89,92,90,93,92];
  const plotW=560,baseY=132,topY=18,barW=Math.max(10,Math.min(24,plotW/values.length*.58));
  const x=(i:number)=>22+i*(plotW/Math.max(values.length-1,1));
  const y=(v:number)=>baseY-(Math.max(0,Math.min(100,v))/100)*(baseY-topY);
  const pts=values.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
  return <div className="trendChart productionTrend">
    <div className="chartLegend"><span><i className="yieldLegend"/>Yield</span><span><i className="nokLegend"/>NOK Rate</span></div>
    <svg viewBox="0 0 600 150" preserveAspectRatio="none" aria-label="Inspection yield trend">
      <g>{[20,40,60,80,100].map(v=>{const yy=y(v);return <g key={v}><line x1="20" y1={yy} x2="585" y2={yy} className="chartGrid"/><text x="1" y={yy+3} className="chartLabel">{v}%</text></g>})}</g>
      <g>{values.map((v,i)=>{const xx=x(i)-barW/2;const bh=baseY-y(Math.max(8,Math.min(100,v*.72)));return <rect key={i} x={xx} y={baseY-bh} width={barW} height={bh} rx="2" className="yieldBar"/>})}</g>
      <polyline points={pts} fill="none" className="yieldLine" vectorEffect="non-scaling-stroke"/>
      <g>{values.map((v,i)=><circle key={i} cx={x(i)} cy={y(v)} r="3" className="yieldPoint"/>)}</g>
    </svg>
    <div className="chartAxis"><span>06:00</span><span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span><span>Now</span></div>
  </div>
}
