import type {InspectionResult} from '@/types';

export type YieldTray={key:string;time:number;results:InspectionResult[]};
const excluded=new Set(['nolens','lensnotfound','nolensfound','missinglens','klnichtgefunden','klnotfound','notestjob','noinspectiontask','notestparameters','noverificationtask']);
export function eligibleForYield(result:InspectionResult):boolean{
  return !result.defects.some(defect=>excluded.has(defect.name.toLowerCase().replace(/[^a-z]/g,'')));
}
export function yieldTrays(results:InspectionResult[]):YieldTray[]{
  const grouped=new Map<string,YieldTray>();
  const latest=new Map<string,InspectionResult>();
  for(const result of results){const key=`${result.dataset_id}:${result.sample_id}`,previous=latest.get(key);if(!previous||Date.parse(result.created_at)>=Date.parse(previous.created_at))latest.set(key,result)}
  for(const result of latest.values()){
    const time=Date.parse(result.created_at),key=`${result.dataset_id}:${result.wt_index}`;
    if(!Number.isFinite(time))continue;
    const tray=grouped.get(key)||{key,time,results:[]};
    tray.time=Math.max(tray.time,time);tray.results.push(result);grouped.set(key,tray);
  }
  return [...grouped.values()].sort((a,b)=>a.time-b.time);
}
export function calculateInspectionYield(results:InspectionResult[],windowTrays=10):number{
  const eligible=yieldTrays(results).slice(-windowTrays).flatMap(tray=>tray.results).filter(eligibleForYield);
  return eligible.length?eligible.filter(result=>result.status==='OK').length/eligible.length*100:0;
}
export function yieldSeries(results:InspectionResult[],capacity=16){
  const trays=yieldTrays(results).filter(tray=>new Set(tray.results.map(result=>result.sample_id)).size>=capacity);
  return trays.map((tray,index)=>{
    const eligible=trays.slice(Math.max(0,index-9),index+1).flatMap(item=>item.results).filter(eligibleForYield);
    return {time:tray.time,yield:eligible.length?eligible.filter(result=>result.status==='OK').length/eligible.length*100:0,
      nok:eligible.length?eligible.filter(result=>result.status==='NOK').length/eligible.length*100:0};
  });
}
