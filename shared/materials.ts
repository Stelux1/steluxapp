import type { Row } from './types.ts';
import { countedSiteId, inventoryClaims } from './mto-stock.ts';

export const MATERIAL_FIELDS=['materialNo','description','materialGroup','articleNo','legacyNo','dia','lbs','uom','price'] as const;
export function materialRecord(rows:Record<string,Row[]>,row:Row){return row.materialId?rows.materials?.find(m=>m.id===row.materialId):row.customMaterialId?rows.custom_materials?.find(m=>m.id===row.customMaterialId):row.customMaterial?row:undefined;}
export function materialName(rows:Record<string,Row[]>,row:Row){return String(materialRecord(rows,row)?.materialNo||row.materialNo||'Unavailable material');}
export function materialIdentity(row:Row){return row.materialId?`catalog:${row.materialId}`:row.customMaterialId?`custom:${row.customMaterialId}`:`requirement:${row.id}`;}
const round=(v:number)=>Math.round(v*1e6)/1e6;
/**
 * Stock state of a pick-list line (one rule for every reader). Issued: the stock has left the inventory, so the line
 * counts as Picked: a line taken (or issued directly, which has no flag) or one booked out at Start (`issued`). Claim:
 * an untaken line written before Start issued stock; it still holds its quantity in the inventory. A line whose
 * material was moved back to the inventory (`returned`) is neither.
 */
export const pickIssued=(line:Row)=>line.returned!==true&&(line.taken!==false||line.issued===true);
export const pickClaims=(line:Row)=>line.returned!==true&&line.taken===false&&line.issued!==true;
/** The isometric requirements an order line was ordered for: `requirementIds` (comma separated) of a line merged per material, else its one `requirementId`. */
export function lineRequirementIds(line:Row):string[]{const list=String(line.requirementIds||'').split(',').map(id=>id.trim()).filter(Boolean);return list.length?[...new Set(list)]:line.requirementId?[String(line.requirementId)]:[];}
/**
 * The one rule for "is this requirement on an order": an order line of an order that is not cancelled names it, through its
 * `requirementId` or the `requirementIds` of a line merged per material (w3-mto-procurement). An ordered requirement cannot be
 * deleted (server/mto-materials.ts), and the MTO dashboard attributes the line's open quantity to it (shared/mto-dashboard.ts).
 */
export function requirementOrderLines(rows:Record<string,Row[]>,requirementId:string):Row[]{const live=new Set((rows.orders||[]).filter(o=>!o._archived&&o.status!=='Cancelled').map(o=>o.id));return (rows.order_lines||[]).filter(l=>!l._archived&&live.has(String(l.orderId))&&lineRequirementIds(l).includes(requirementId));}
/** The isometrics of an order line: its own isometric, else those of the requirements it was merged from. */
export function lineIsoIds(rows:Record<string,Row[]>,line:Row):string[]{if(line.isoId)return [String(line.isoId)];const ids=lineRequirementIds(line);return [...new Set((rows.iso_materials||[]).filter(r=>ids.includes(r.id)).map(r=>String(r.isoId||'')).filter(Boolean))];}
export function orderProjectIds(rows:Record<string,Row[]>,orderId:string){const order=rows.orders?.find(o=>o.id===orderId);const ids=new Set<string>();if(order?.projectId)ids.add(String(order.projectId));for(const line of rows.order_lines||[])if(line.orderId===orderId){for(const isoId of lineIsoIds(rows,line)){const iso=rows.isometrics?.find(i=>i.id===isoId);if(iso?.projectId)ids.add(String(iso.projectId));}}return [...ids];}
export function requirementExecution(rows:Record<string,Row[]>,filters:{projectId?:string;isoId?:string}={}){
  const active=(key:string)=>(rows[key]||[]).filter(r=>!r._archived);
  const isos=new Map(active('isometrics').map(i=>[i.id,i]));const orders=new Map(active('orders').filter(o=>o.status!=='Cancelled').map(o=>[o.id,o]));
  const lines=active('order_lines').filter(l=>orders.has(String(l.orderId)));const picks=active('picklists').filter(pickIssued);
  // Inv.: the Material inventory of the isometric's project site (rows with locationKind 'site', plus the old-model
  // storehouse rows derived to it; other storehouse lines never count), less what pick lists claim of it and have not
  // taken yet (shared/mto-stock.ts holds the location rules: countedSiteId, inventoryClaims).
  const projectSite=new Map(active('projects').map(p=>[p.id,String(p.siteId||'')]));
  const available=new Map<string,number>();const bump=(key:string,delta:number)=>available.set(key,round((available.get(key)||0)+delta));
  for(const s of active('stock')){const site=countedSiteId(rows,s);if(site)bump(site+'|'+materialIdentity(s),Number(s.quantity));}
  for(const claim of inventoryClaims(rows))bump(claim.siteId+'|'+claim.identity,-claim.quantity);
  // Lines without an order or pick link share what was ordered / picked for their material in line order. A line's share is capped by its
  // quantity at the start of its quantity log, so a later change of one line's quantity never moves the shares of the others.
  const startQuantity=new Map<string,number>();for(const c of [...(rows.material_quantity_changes||[])].filter(c=>!c._archived).sort((a,b)=>Number(b.sequence)-Number(a.sequence)))startQuantity.set(String(c.requirementId),Number(c.previousQuantity));
  // A line merged per material (several requirements) gives its quantity to them in the order of its requirementIds, each up to its need.
  const merged=lines.filter(l=>!l.requirementId&&lineRequirementIds(l).length).map(l=>({line:l,ids:lineRequirementIds(l),left:Number(l.quantity)}));
  const requirementsById=new Map(active('iso_materials').map(r=>[r.id,r]));const mergedShare=new Map<string,number>();
  for(const pool of merged)for(const id of pool.ids){const requirement=requirementsById.get(id);if(!requirement||materialIdentity(requirement)!==materialIdentity(pool.line))continue;const own=lines.filter(l=>l.requirementId===id&&materialIdentity(l)===materialIdentity(requirement)).reduce((n,l)=>n+Number(l.quantity),0)+(mergedShare.get(id)||0);const take=round(Math.min(Math.max(0,Number(requirement.quantity)-own),pool.left));pool.left=round(pool.left-take);mergedShare.set(id,round((mergedShare.get(id)||0)+take));}
  const legacyOrder=new Map<string,number>();for(const l of lines.filter(l=>!l.requirementId&&!lineRequirementIds(l).length)){const project=String(orders.get(String(l.orderId))?.projectId||'');const id=project+'|'+materialIdentity(l);legacyOrder.set(id,round((legacyOrder.get(id)||0)+Number(l.quantity)));}
  const legacyPick=new Map<string,number>();for(const p of picks.filter(p=>!p.requirementId)){const id=String(p.isoId)+'|'+materialIdentity(p);legacyPick.set(id,round((legacyPick.get(id)||0)+Number(p.quantity)));}
  return active('iso_materials').sort((a,b)=>String(a._createdAt).localeCompare(String(b._createdAt))||a.id.localeCompare(b.id)).flatMap(requirement=>{
    const iso=isos.get(String(requirement.isoId));if(!iso)return [];
    const required=Number(requirement.quantity);const identity=materialIdentity(requirement);const orderKey=String(iso.projectId)+'|'+identity;const pickKey=iso.id+'|'+identity;
    let linkedOrder=lines.filter(l=>l.requirementId===requirement.id&&materialIdentity(l)===identity).reduce((n,l)=>n+Number(l.quantity),0);const cap=startQuantity.get(requirement.id)??required;linkedOrder=round(linkedOrder+(mergedShare.get(requirement.id)||0));const orderAllocation=Math.min(Math.max(0,cap-linkedOrder),legacyOrder.get(orderKey)||0);legacyOrder.set(orderKey,round((legacyOrder.get(orderKey)||0)-orderAllocation));
    const linkedPick=picks.filter(p=>p.requirementId===requirement.id&&materialIdentity(p)===identity).reduce((n,p)=>n+Number(p.quantity),0);const pickAllocation=Math.min(Math.max(0,cap-linkedPick),legacyPick.get(pickKey)||0);legacyPick.set(pickKey,round((legacyPick.get(pickKey)||0)-pickAllocation));
    if(filters.projectId&&iso.projectId!==filters.projectId||filters.isoId&&iso.id!==filters.isoId)return [];
    const ordered=round(linkedOrder+orderAllocation);const picked=round(linkedPick+pickAllocation);const site=projectSite.get(String(iso.projectId))||'';const inventory=site?Math.max(0,available.get(site+'|'+identity)||0):0;
    return [{requirement,iso,material:materialRecord(rows,requirement)||requirement,identity,required,ordered,picked,inventory,toOrder:round(Math.max(0,required-ordered)),notOrdered:round(Math.max(0,required-linkedOrder)),toPick:round(Math.max(0,required-picked))}];
  });
}
