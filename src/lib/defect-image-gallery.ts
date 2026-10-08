import type {Defect, InspectionResult} from '@/types';

export const defectClassKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');

export interface DefectImageMatch {
  key: string;
  result: InspectionResult;
  defects: Defect[];
}

/** Shared overlays retain source channels, but appear on every illumination. */
export function galleryOverlayDefects(result: InspectionResult, className?:string): Defect[] {
  const seen=new Set<string>();
  return [...result.defects,...result.channels.flatMap(channel=>channel.defects)].filter(defect=>{
    if(className&&defectClassKey(defect.name)!==defectClassKey(className))return false;
    const key=JSON.stringify(defect);
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
}

/** One lens per class, retaining every matching instance and its actual output. */
export function selectDefectImages(results: readonly InspectionResult[], name: string): DefectImageMatch[] {
  const wanted = defectClassKey(name);
  if (!wanted) return [];
  const latest = new Map<string, InspectionResult>();
  for (const result of results) {
    const key = JSON.stringify([result.dataset_id, result.sample_id]);
    const previous = latest.get(key);
    if (!previous || Date.parse(result.created_at) >= Date.parse(previous.created_at)) latest.set(key, result);
  }
  return [...latest.entries()].flatMap(([key, result]) => {
    const defects = result.defects.filter(defect => defectClassKey(defect.name) === wanted);
    return defects.length ? [{key, result, defects}] : [];
  });
}
