import type { ActionField,Row } from './types.ts';

export const PQR_ATTRIBUTES=[
  ['Material EN15608','Materials'],['WPS','Procedure'],['Insp Authority No.','Procedure'],['Report No.','Procedure'],['Material','Materials'],['Filler Material','Materials'],['Pipe / Plate','Materials'],['t','Materials'],['Position','Procedure'],['Welding Process ASME','Procedure'],['Welding Process EN','Procedure'],['Weld Groove Type','Procedure'],['Shielding Gas','Materials'],['Mat. gr.','EN scope'],['EN Ø','EN scope'],['EN T','EN scope'],['ASME IX Mat.gr','ASME scope'],['ASME IX Ø','ASME scope'],['ASME IX T','ASME scope'],['Preheat (°C)','Tests & treatment'],['Annealing (°C/1h)','Tests & treatment'],['Impact Test','Tests & treatment'],['Hardness Test','Tests & treatment'],['Macro','Tests & treatment'],['Standard','Procedure'],['Comments','Notes']
].map(([label,section],i)=>({name:`attribute${i+1}Id`,label,section,category:label}));
export interface Relation {field:string;label:string;resource:string;ownerKey:string;target:string;targetKey:string;showIf?:ActionField['showIf'];}
export const RELATIONS:Record<string,Relation[]>={
  wps:[{field:'pqrIds',label:'Procedure qualifications (PQRs)',resource:'wps_pqr',ownerKey:'wpsId',target:'pqr',targetKey:'pqrId'},{field:'projectIds',label:'Available on projects',resource:'wps_projects',ownerKey:'wpsId',target:'projects',targetKey:'projectId',showIf:['allProjects',false]},{field:'siteIds',label:'Enabled on project sites',resource:'wps_sites',ownerKey:'wpsId',target:'sites',targetKey:'siteId'}],
  welders:[{field:'siteIds',label:'Active on project sites',resource:'welder_sites',ownerKey:'welderId',target:'sites',targetKey:'siteId'},{field:'customIds',label:'Custom qualifications',resource:'welder_customs',ownerKey:'welderId',target:'welder_customs_catalog',targetKey:'customId'}]
};
export const relationFields=(owner:string):ActionField[]=>(RELATIONS[owner]||[]).map(r=>({name:r.field,label:r.label,type:'ref',ref:r.target,multiple:true,section:'Links & availability',showIf:r.showIf}));
export const relationIds=(rows:Record<string,Row[]>,r:Relation,id:string)=>(rows[r.resource]||[]).filter(l=>!l._archived&&l[r.ownerKey]===id).map(l=>String(l[r.targetKey]));
export const RELATION_RESOURCES=new Set(Object.values(RELATIONS).flat().map(r=>r.resource));
export function availableWps(rows:Record<string,Row[]>,wps:Row,projectId:string){const project=rows.projects?.find(p=>p.id===projectId&&!p._archived);if(!project)return false;const scopes=RELATIONS.wps;const sites=relationIds(rows,scopes[2],wps.id);const projects=relationIds(rows,scopes[1],wps.id);return !wps._archived&&sites.includes(String(project.siteId))&&(wps.allProjects!==false||projects.includes(projectId));}
