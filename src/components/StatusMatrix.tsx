'use client';
import {memo,useMemo} from 'react';
import {Archive,Radio} from 'lucide-react';
import type {InspectionResult,Sample,Status} from '@/types';

type Props={samples:Sample[];results:Map<string,InspectionResult>;current:string|null;onPick:(id:string)=>void;onArchive?:(wt:number)=>void;maxRows?:number};
export const StatusMatrix=memo(function StatusMatrix({samples,results,current,onPick,onArchive,maxRows=30}:Props){
 const groups=useMemo(()=>{const byWt=new Map<number,Map<number,Sample>>();for(const s of samples){if(!byWt.has(s.wt_index))byWt.set(s.wt_index,new Map());byWt.get(s.wt_index)!.set(s.position,s)}return Array.from(byWt.entries()).sort((a,b)=>b[0]-a[0]).slice(0,maxRows)},[samples,maxRows]);
 return <section className="glassPanel matrixPanel productionPanel">
   <div className="productionPanelHead premiumMatrixHead"><div><h2>WT History / Inspection Matrix</h2></div><span className="liveTag"><Radio/>Live</span></div>
   <div className="matrixScroller"><table className="historyTable"><thead><tr><th>WT Nr.</th>{Array.from({length:16},(_,i)=><th key={i}>{i+1}</th>)}</tr></thead><tbody>{groups.map(([wt,row])=><tr key={wt}><td><div><b>WT-{String(wt).padStart(4,'0')}</b>{onArchive&&<button title="Archive this WT" onClick={()=>onArchive(wt)}><Archive/></button>}</div></td>{Array.from({length:16},(_,i)=>{const s=row.get(i+1);const status:Status=s?(results.get(s.id)?.status||'IDLE'):'IDLE';return <td key={i}>{s?<button onClick={()=>onPick(s.id)} aria-label={`WT ${wt} position ${i+1} ${status}`} title={`${s.category} · ${s.metadata.defect_label||'not evaluated'}`} className={`matrixDot ${status.toLowerCase()} ${current===s.id?'selected':''}`}><span/></button>:<i className="matrixDot idle"><span/></i>}</td>})}</tr>)}</tbody></table></div>
   <div className="matrixLegend"><span><i className="legendDot ok"/>OK</span><span><i className="legendDot nok"/>NOK</span><span><i className="legendDot warn"/>Warning</span><span><i className="legendDot idle"/>Not Inspected</span><b>{groups.length} Trays ({samples.length} Lenses)</b></div>
 </section>
});
