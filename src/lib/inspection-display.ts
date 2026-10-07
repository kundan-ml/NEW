import type {Defect, InspectionResult, Sample, StatusSymbolLegend} from '@/types';

export type DisplayFilter={positions:number[];result_types:string[];error_classes:string[];apply_to_display:boolean};
export type DefectBounds=[number,number,number,number];

export function displayFilterFrom(value:unknown):DisplayFilter|null{
  if(!value||typeof value!=='object')return null;
  const raw=value as Record<string,unknown>;
  return {positions:Array.isArray(raw.positions)?raw.positions.filter((item):item is number=>typeof item==='number'&&Number.isFinite(item)):[],result_types:Array.isArray(raw.result_types)?raw.result_types.filter((item):item is string=>typeof item==='string'):[],error_classes:Array.isArray(raw.error_classes)?raw.error_classes.filter((item):item is string=>typeof item==='string'):[],apply_to_display:raw.apply_to_display===true};
}

export function matchesDisplayFilter(sample:Sample,result:InspectionResult,filter:DisplayFilter|null,legend:StatusSymbolLegend|null):boolean{
  if(!filter?.apply_to_display)return true;
  if(!filter.positions.includes(sample.position)||!filter.result_types.includes(result.status))return false;
  if(!filter.error_classes.length)return true;
  const names=result.defects.map(defect=>defect.name.toLocaleLowerCase());
  return filter.error_classes.some(key=>names.includes(key.toLocaleLowerCase())||(legend?.defects.find(entry=>entry.key===key)?.match_terms||[]).some(term=>names.some(name=>name.includes(term.toLocaleLowerCase()))));
}

export function defectPolygon(defect:Defect):number[][]|null{
  const polygon=defect.polygon_norm;
  return polygon&&polygon.length>=3&&polygon.every(point=>point.length>=2&&Number.isFinite(point[0])&&Number.isFinite(point[1]))?polygon:null;
}

export function defectBounds(defect:Defect):DefectBounds|null{
  const polygon=defectPolygon(defect);
  if(polygon){const xs=polygon.map(point=>point[0]),ys=polygon.map(point=>point[1]);const x=Math.min(...xs),y=Math.min(...ys);return [x,y,Math.max(...xs)-x,Math.max(...ys)-y]}
  const box=defect.bbox_xywh_norm;
  return box&&box.length===4&&box.every(Number.isFinite)&&box[2]>=0&&box[3]>=0?[box[0],box[1],box[2],box[3]]:null;
}

export function hitTestDefects(defects:Defect[],x:number,y:number):number{
  let winner=-1,smallest=Infinity;
  defects.forEach((defect,index)=>{
    const bounds=defectBounds(defect);if(!bounds)return;
    const [left,top,width,height]=bounds;
    if(x<left||x>left+width||y<top||y>top+height)return;
    const polygon=defectPolygon(defect);
    if(polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const [xi,yi]=polygon[i],[xj,yj]=polygon[j];
      if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
    }if(!inside)return}
    const area=width*height;if(area<smallest){smallest=area;winner=index}
  });
  return winner;
}
