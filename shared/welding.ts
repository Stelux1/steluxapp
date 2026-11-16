import type { ActionField,Row } from './types.ts';
import { WELDER_DATA_RELATIONS } from './welder-data.ts';
import { USER_SITE_RELATIONS } from './site-scope.ts';

export const PQR_ATTRIBUTES=[
  ['Material EN15608','Materials'],['PQR','Procedure','WPS'],['Insp Authority No.','Procedure'],['Report No.','Procedure'],['Material','Materials'],['Filler Material','Materials'],['Pipe/ Plate','Materials','Pipe / Plate'],['t','Materials'],['Position','Procedure'],['Welding Process ASME','Procedure'],['Welding Process EN','Procedure'],['Weld Groove Type','Procedure'],['Shielding Gas','Materials'],['Mat. gr.','EN scope'],['EN Ø','EN scope'],['EN T','EN scope'],['ASME IX Mat.gr','ASME scope'],['ASME IX Ø','ASME scope'],['ASME IX T','ASME scope'],['Preheat (°C)','Tests & treatment'],['Annealing (°C/1h)','Tests & treatment'],['Impact Test','Tests & treatment'],['Hardness Test','Tests & treatment'],['Macro','Tests & treatment'],['Standard','Procedure'],['Comments','Notes']
].map(([label,section,category],i)=>({name:`attribute${i+1}Id`,label,section,category:category||label}));
// The PQR and Pipe/ Plate labels follow the reference; their stored attribute categories keep the earlier names.
export interface Relation {field:string;label:string;resource:string;ownerKey:string;target:string;targetKey:string;showIf?:ActionField['showIf'];
  /** Extra values every link of this relation carries (several relations may share one link resource). */ match?:Record<string,string>;
  /** Form section of the relation field (default: Links & availability). */ section?:string;
  /** Pilots profile only: not offered, exported or written elsewhere. */ pilotsOnly?:boolean;
  /** Hosted profile: the multi-select offers "ALL" as its first option, standing for this checkbox field of the owner. */ allField?:string;}
export const RELATIONS:Record<string,Relation[]>={
  wps:[{field:'pqrIds',label:'Procedure qualifications (PQRs)',resource:'wps_pqr',ownerKey:'wpsId',target:'pqr',targetKey:'pqrId'},{field:'projectIds',label:'Available on projects',resource:'wps_projects',ownerKey:'wpsId',target:'projects',targetKey:'projectId',showIf:['allProjects',false]},{field:'siteIds',label:'Enabled on project sites',resource:'wps_sites',ownerKey:'wpsId',target:'sites',targetKey:'siteId'}],
  itps:[{field:'projectIds',label:'Linked projects',resource:'itp_projects',ownerKey:'itpId',target:'projects',targetKey:'projectId'}],
  welders:[{field:'siteIds',label:'Active on projects',resource:'welder_sites',ownerKey:'welderId',target:'sites',targetKey:'siteId'},{field:'customIds',label:'Custom qualifications',resource:'welder_customs',ownerKey:'welderId',target:'welder_customs_catalog',targetKey:'customId'}]
};
Object.assign(RELATIONS,WELDER_DATA_RELATIONS);
// Access per project site (shared/site-scope.ts): one link resource for both pilots, told apart by `match`.
RELATIONS.users=USER_SITE_RELATIONS;
export const relationMatches=(r:Relation,link:Row)=>Object.entries(r.match||{}).every(([key,value])=>link[key]===value);
export const relationFields=(owner:string):ActionField[]=>(RELATIONS[owner]||[]).filter(r=>!r.pilotsOnly).map(r=>({name:r.field,label:r.label,type:'ref',ref:r.target,multiple:true,section:r.section||'Links & availability',showIf:r.showIf,allField:r.allField}));
export const relationIds=(rows:Record<string,Row[]>,r:Relation,id:string)=>(rows[r.resource]||[]).filter(l=>!l._archived&&l[r.ownerKey]===id&&relationMatches(r,l)).map(l=>String(l[r.targetKey]));
export const RELATION_RESOURCES=new Set(Object.values(RELATIONS).flat().map(r=>r.resource));
export function availableWps(rows:Record<string,Row[]>,wps:Row,projectId:string){const project=rows.projects?.find(p=>p.id===projectId&&!p._archived);if(!project)return false;const scopes=RELATIONS.wps;const sites=relationIds(rows,scopes[2],wps.id);const projects=relationIds(rows,scopes[1],wps.id);return !wps._archived&&sites.includes(String(project.siteId))&&(wps.allProjects!==false||projects.includes(projectId));}
