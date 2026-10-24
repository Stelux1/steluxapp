import type {Row} from './types.ts';

export const revisionField=(type:string)=>type==='ITP'?'itpRevNo':type==='ITP 2'?'itp2RevNo':'revNo';
export function currentRevision(rows:Record<string,Row[]>,isoId:string,type='ISO'){
  const iso=rows.isometrics?.find(r=>r.id===isoId);const field=revisionField(type);
  return String(iso?.[field]??(rows.revisions||[]).filter(r=>!r._archived&&r.isoId===isoId&&r.type===type).sort((a,b)=>b._createdAt.localeCompare(a._createdAt))[0]?.revNo??'0');
}
export function nextRevision(rows:Record<string,Row[]>,isoId:string,type='ISO'){
  const current=currentRevision(rows,isoId,type);return /^\d+$/.test(current)?String(Number(current)+1):'';
}
export function materialQuantityLog(rows:Record<string,Row[]>,requirement:Row){
  const changes=(rows.material_quantity_changes||[]).filter(r=>!r._archived&&r.requirementId===requirement.id).sort((a,b)=>Number(a.sequence)-Number(b.sequence));
  return {beginning:Number(changes[0]?.previousQuantity??requirement.quantity),current:Number(requirement.quantity),changes};
}
