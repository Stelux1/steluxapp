import type { Row } from './types.ts';

export const MATERIAL_FIELDS=['materialNo','description','materialGroup','articleNo','legacyNo','dia','lbs','uom','price'] as const;
export function materialRecord(rows:Record<string,Row[]>,row:Row){return row.materialId?rows.materials?.find(m=>m.id===row.materialId):row.customMaterialId?rows.custom_materials?.find(m=>m.id===row.customMaterialId):row.customMaterial?row:undefined;}
export function materialName(rows:Record<string,Row[]>,row:Row){return String(materialRecord(rows,row)?.materialNo||row.materialNo||'Unavailable material');}
export function materialIdentity(row:Row){return row.materialId?`catalog:${row.materialId}`:row.customMaterialId?`custom:${row.customMaterialId}`:`requirement:${row.id}`;}
const round=(v:number)=>Math.round(v*1e6)/1e6;
export function orderProjectIds(rows:Record<string,Row[]>,orderId:string){const order=rows.orders?.find(o=>o.id===orderId);const ids=new Set<string>();if(order?.projectId)ids.add(String(order.projectId));for(const line of rows.order_lines||[])if(line.orderId===orderId){const iso=rows.isometrics?.find(i=>i.id===line.isoId);if(iso?.projectId)ids.add(String(iso.projectId));}return [...ids];}
export function requirementExecution(rows:Record<string,Row[]>,filters:{projectId?:string;isoId?:string}={}){
  const active=(key:string)=>(rows[key]||[]).filter(r=>!r._archived);
  const isos=new Map(active('isometrics').map(i=>[i.id,i]));const orders=new Map(active('orders').filter(o=>o.status!=='Cancelled').map(o=>[o.id,o]));
  const lines=active('order_lines').filter(l=>orders.has(String(l.orderId)));const picks=active('picklists');const stocks=active('stock');
  const legacyOrder=new Map<string,number>();for(const l of lines.filter(l=>!l.requirementId)){const project=String(orders.get(String(l.orderId))?.projectId||'');const id=project+'|'+materialIdentity(l);legacyOrder.set(id,round((legacyOrder.get(id)||0)+Number(l.quantity)));}
  const legacyPick=new Map<string,number>();for(const p of picks.filter(p=>!p.requirementId)){const id=String(p.isoId)+'|'+materialIdentity(p);legacyPick.set(id,round((legacyPick.get(id)||0)+Number(p.quantity)));}
  return active('iso_materials').sort((a,b)=>String(a._createdAt).localeCompare(String(b._createdAt))||a.id.localeCompare(b.id)).flatMap(requirement=>{
    const iso=isos.get(String(requirement.isoId));if(!iso)return [];
    const required=Number(requirement.quantity);const identity=materialIdentity(requirement);const orderKey=String(iso.projectId)+'|'+identity;const pickKey=iso.id+'|'+identity;
    const linkedOrder=lines.filter(l=>l.requirementId===requirement.id&&materialIdentity(l)===identity).reduce((n,l)=>n+Number(l.quantity),0);const orderAllocation=Math.min(Math.max(0,required-linkedOrder),legacyOrder.get(orderKey)||0);legacyOrder.set(orderKey,round((legacyOrder.get(orderKey)||0)-orderAllocation));
    const linkedPick=picks.filter(p=>p.requirementId===requirement.id&&materialIdentity(p)===identity).reduce((n,p)=>n+Number(p.quantity),0);const pickAllocation=Math.min(Math.max(0,required-linkedPick),legacyPick.get(pickKey)||0);legacyPick.set(pickKey,round((legacyPick.get(pickKey)||0)-pickAllocation));
    if(filters.projectId&&iso.projectId!==filters.projectId||filters.isoId&&iso.id!==filters.isoId)return [];
    const ordered=round(linkedOrder+orderAllocation);const picked=round(linkedPick+pickAllocation);const inventory=round(stocks.filter(s=>materialIdentity(s)===identity).reduce((n,s)=>n+Number(s.quantity),0));
    return [{requirement,iso,material:materialRecord(rows,requirement)||requirement,identity,required,ordered,picked,inventory,toOrder:round(Math.max(0,required-ordered)),toPick:round(Math.max(0,required-picked))}];
  });
}
