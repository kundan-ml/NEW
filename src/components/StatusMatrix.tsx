'use client';
import {memo,useMemo} from 'react';
import {Archive,Radio} from 'lucide-react';
import type {InspectionResult,Sample,Status} from '@/types';

export type GlobalHistoryEntry={datasetId:string;sample:Sample;result?:InspectionResult;wt:number;position:number};
type Props={samples:Sample[];results:Map<string,InspectionResult>;current:string|null;currentDatasetId?:string;onPick:(id:string)=>void;onArchive?:(wt:number)=>void;maxRows?:number;history?:GlobalHistoryEntry[];onHistoryPick?:(entry:GlobalHistoryEntry)=>void;capacity?:number};
export const StatusMatrix=memo(function StatusMatrix({samples,results,current,currentDatasetId,onPick,onArchive,maxRows=30,history=[],onHistoryPick,capacity=16}:Props){
 const groups=useMemo(()=>{const byWt=new Map<number,Map<number,GlobalHistoryEntry>>();if(history.length){for(const entry of history){if(!byWt.has(entry.wt))byWt.set(entry.wt,new Map());byWt.get(entry.wt)!.set(entry.position,entry)}}else{for(const sample of samples){if(!byWt.has(sample.wt_index))byWt.set(sample.wt_index,new Map());byWt.get(sample.wt_index)!.set(sample.position,{datasetId:currentDatasetId||'',sample,result:results.get(sample.id),wt:sample.wt_index,position:sample.position})}}return Array.from(byWt.entries()).sort((a,b)=>b[0]-a[0]).slice(0,maxRows)},[history,samples,results,currentDatasetId,maxRows]);
 return <section className="glassPanel matrixPanel productionPanel">
   <div className="productionPanelHead premiumMatrixHead"><div><h2>WT History / Inspection Matrix</h2></div><span className="liveTag"><Radio/>Live</span></div>
   <div className="matrixScroller"><table className="historyTable"><thead><tr><th>CT No.</th>{Array.from({length:capacity},(_,i)=><th key={i}>{i+1}</th>)}</tr></thead><tbody>{groups.map(([wt,row])=><tr key={wt}><td><div><b>WT-{String(wt).padStart(4,'0')}</b>{onArchive&&!history.length&&<button title="Archive this WT" onClick={()=>onArchive(wt)}><Archive/></button>}</div></td>{Array.from({length:capacity},(_,i)=>{const entry=row.get(i+1),sample=entry?.sample,result=entry?.datasetId===currentDatasetId?results.get(sample?.id||'')||entry?.result:entry?.result,status:Status=result?.status||'IDLE';return <td key={i}>{entry&&sample?<button onClick={()=>onHistoryPick?onHistoryPick(entry):onPick(sample.id)} aria-label={`WT ${wt} position ${i+1} ${status}`} title={`${sample.category} · ${sample.metadata.defect_label||'not evaluated'}`} className={`matrixDot ${status.toLowerCase()} ${current===sample.id&&currentDatasetId===entry.datasetId?'selected':''}`}><span/></button>:<i className="matrixDot idle"><span/></i>}</td>})}</tr>)}</tbody></table></div>
   {/* <div className="matrixLegend"><span><i className="legendDot ok"/>OK</span><span><i className="legendDot nok"/>NOK</span><span><i className="legendDot warn"/>Warning</span><span><i className="legendDot idle"/>Not Inspected</span><b>{groups.length} WTs ({history.length||samples.length} Lenses)</b></div> */}
 </section>
});
