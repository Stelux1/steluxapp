import type { Row } from './types.ts';
import { materialRecord } from './materials.ts';

/** Requirement locations are operational tracking; warehouse quantities use stock movements. */
export function materialLocations(rows:Record<string,Row[]>,scope:{projectId?:string;isoId?:string;group?:string;location?:string}={}){
  const active=(key:string)=>(rows[key]||[]).filter(r=>!r._archived);
  const isos=new Map(active('isometrics').map(r=>[r.id,r]));
  const projects=new Map(active('projects').map(r=>[r.id,r]));
  const locations=new Map(active('material_locations').map(r=>[String(r.requirementId),r]));
  const requests=active('service_requests');
  return active('iso_materials').flatMap(requirement=>{
    const iso=isos.get(String(requirement.isoId));if(!iso||!projects.has(String(iso.projectId)))return [];
    const material=materialRecord(rows,requirement);if(!material)return [];
    const location=locations.get(requirement.id);
    const locationType=location?.companyId?'Service':location?.laydownId?'Laydown':'Unassigned';
    const locationId=String(location?.companyId||location?.laydownId||'');
    if(scope.projectId&&iso.projectId!==scope.projectId||scope.isoId&&iso.id!==scope.isoId||scope.group&&material.materialGroup!==scope.group||scope.location&&`${locationType}:${locationId}`!==scope.location)return [];
    const history=requests.filter(r=>r.requirementId===requirement.id).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b._createdAt).localeCompare(String(a._createdAt)));
    return [{requirement,iso,material,location,locationType,locationId,lastRequest:history[0],openRequest:history.find(r=>r.status!=='Completed')}];
  });
}
