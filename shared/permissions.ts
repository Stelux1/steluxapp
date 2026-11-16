import observed from '../reference/permissions-observed.json' with {type:'json'};
import type {Module,PermissionRules,PermissionVerb,Row,User} from './types.ts';
import { MTO_STOCK_ACTION_SCOPES, MTO_STOCK_SCOPES } from './mto-stock.ts';
import { actionAvailable, resourceAvailable, rowAvailable, type PilotKey } from './release.ts';
import { HYDROTEST_ACTION_SCOPES, HYDROTEST_SCOPES } from './hydrotest.ts';
import { WELDER_DATA_SCOPES } from './welder-data.ts';
import { inspectionActionScope, TYPED_INSPECTION_ACTIONS } from './inspections.ts';
import { MTO_ACTION_SCOPES } from './mto-logistics.ts';
import { PDF_REPORT_RESOURCES } from './pdf-report-keys.ts';

export const PERMISSION_VERBS:PermissionVerb[]=['show','insert','edit','delete','export','import','print'];
export const VERB_LABELS:Record<PermissionVerb,string>={show:'View',insert:'Add',edit:'Edit',delete:'Archive',export:'Export',import:'Import',print:'Print'};
export interface PermissionArea {key:string;name:string;module:Module;verbs:PermissionVerb[];}
export const RESOURCE_SCOPES:Record<string,string[]>={
 calculation_norms:['71'],calculation_lines:['71'],cut_list:['71'],coatings:['84'],sites:['4'],projects:['5'],materials:['6'],material_parts:['7'],material_types:['8'],uoms:['9'],spools:['10'],operation_phases:['11'],suppliers:['12'],orders:['17','14','13'],order_lines:['17','14','13'],stock:['16'],movements:['16'],picklists:['21'],service_companies:['22'],service_requests:['24'],spool_moves:['24'],laydowns:['25'],users:['26'],user_sites:['26'],company_data:['26'],welders:['68'],certificate_types:['40'],certifications:['18'],companies:['37'],roles:['39'],welder_customs_catalog:['41'],wps:['42'],weld_processes:['43'],weld_types:['44'],diameters:['45'],ndt_processes:['46'],ndt_locations:['47'],pwht_processes:['48'],pwht_locations:['49'],profiles:['53'],clients:['59'],tool_movements:['60'],articles:['61'],tool_stock:['61'],rentals:['62'],welds:['63'],isometrics:['64'],revisions:['64'],inspection_requests:['50','65'],inspection_results:['76','94','97','116'],visual_reports:['116'],iso_materials:['70'],custom_materials:['70'],qa_engineers:['73'],warehouses:['75'],punchlists:['77'],ndt_groups:['79'],daily_reports:['82'],attachment_names:['85'],releases:['86','89','74'],test_systems:['87'],material_laydowns:['88'],field_packages:['90'],signatures:['96'],pqr:['98'],qualification_options:['98'],welding_wires:['99'],flanges:['100'],material_locations:['local-material-logistics'],material_location_events:['local-material-logistics'],material_quantity_changes:['70'],welder_certificates:['local-welder-certificates'],attachments:['local-documents'],wps_pqr:['42'],wps_projects:['42'],wps_sites:['42'],welder_sites:['68'],welder_customs:['68'],ndt_defect_codes:['46'],catalog_sites:['44','84','46','47','48','49','73','22','25'],itps:['120'],itp_projects:['120'],receipts:['15'],reservations:['20']
};
Object.assign(RESOURCE_SCOPES,WELDER_DATA_SCOPES);
Object.assign(RESOURCE_SCOPES,HYDROTEST_SCOPES);
Object.assign(RESOURCE_SCOPES,MTO_STOCK_SCOPES);
const MODULE_SCOPES:Record<Module,string[]>={
 general:['4','5','10','37','64','75','93','local-documents'],
 materials:['71','1','2','3','6','7','8','9','11','12','13','14','15','16','17','18','20','21','22','23','24','25','70','78','80','83','88','local-material-logistics'],
 welding:['35','36','39','40','41','42','43','44','45','46','47','48','49','50','63','65','66','67','68','73','74','76','77','79','81','82','84','85','86','87','89','90','91','92','94','95','97','98','99','100','local-welder-certificates','116','120'],
 tools:['59','60','61','62'],settings:['26','53','96']
};
const localNames:Record<string,string>={'local-material-logistics':'Material locations & history','local-documents':'Documents','local-welder-certificates':'Welder certificate records'};
/** Reference areas the observed matrix (reference/permissions-observed.json) does not hold yet: name and verbs from weld__system__profiles.txt (116 :183, 120 :105). */
const REFERENCE_AREAS:Record<string,{name:string;verbs:PermissionVerb[]}>={'116':{name:'Visual inspection',verbs:['show','insert','edit','delete','print']},'120':{name:'ITPs',verbs:['show','insert','edit','delete']}};
/**
 * Stored rule keys of earlier local areas, read as the reference area that replaced them (profiles are never rewritten:
 * a stored 'local-visual-results' rule is the Visual inspection area 116, 'local-itps' is ITPs 120). Verbs the new
 * area does not have are dropped when read.
 */
export const AREA_ALIASES:Record<string,string>={'local-visual-results':'116','local-itps':'120'};
export const areaKey=(key:string)=>AREA_ALIASES[key]??key;
export const PERMISSION_AREAS:PermissionArea[]=Object.entries(MODULE_SCOPES).flatMap(([module,keys])=>keys.map(key=>{
 const source=observed.areas.find(a=>a.actions.some(action=>action===`show_${key}`)),own=REFERENCE_AREAS[key];
 return {key,name:source?.name||own?.name||localNames[key]||key,module:module as Module,verbs:source?source.actions.map(a=>a.split('_')[0] as PermissionVerb):own?own.verbs:PERMISSION_VERBS};
}));
const areas=new Map(PERMISSION_AREAS.map(a=>[a.key,a]));
const areaOf=(key:string)=>areas.get(areaKey(key));
/**
 * Page areas: a page (or a part of one) that needs Show on its own area, with no record type of its own. They are kept in
 * the account's capabilities (server/release-access.ts) so the menu and the server can check them: Weld dashboard 35,
 * Overview 36, NDT / PWHT request archive 66 / 67, Export welds 81, Iso overview 92, Welder card settings 95; MTO
 * dashboard panels 1 / 2 / 3, Material list 78, Pick list export 83.
 */
export const PAGE_SCOPES=['1','2','3','35','36','66','67','78','81','83','92','95'];
export function parsePermissionRules(raw:unknown):PermissionRules{
 if(typeof raw!=='string'||raw.length>50000)throw new Error('Permission rules must be a valid matrix.');
 let input:unknown;try{input=JSON.parse(raw);}catch{throw new Error('Permission rules could not be read.');}
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Permission rules must be an object.');
 const output:PermissionRules={};
 for(const [stored,verbs] of Object.entries(input)){
  const alias=Object.hasOwn(AREA_ALIASES,stored),key=areaKey(stored),area=areas.get(key);
  // An aliased key was saved with the verbs of the earlier local area: keep those the reference area has.
  if(!area||!Array.isArray(verbs)||verbs.some(v=>typeof v!=='string'||!(alias?PERMISSION_VERBS:area.verbs).includes(v as PermissionVerb)))throw new Error('A permission area or action is invalid.');
  output[key]=[...new Set([...(output[key]||[]),...(verbs as PermissionVerb[]).filter(v=>area.verbs.includes(v))])];
 }
 return Object.fromEntries(Object.entries(output).sort(([a],[b])=>a.localeCompare(b)));
}
/** Catalog areas both pilots work with: material parts, types of material, spools, material suppliers, certifications. */
export const SHARED_PILOT_SCOPES=['7','8','10','12','18'];
/** Module-level access to an area. Where the profile delivers pilots, a shared catalog takes the higher of its own module, materials and welding. */
/**
 * Pilots profile, module levels: Signatures (96) is a Weld Pilot page; it follows the Weld Pilot (welding) level of the
 * profile instead of the settings level, which only administrators have. Other profiles keep the area's own module.
 */
const PILOT_LEVEL_MODULE:Record<string,Module>={'96':'welding'};
const levelModule=(user:User,area:PermissionArea):Module=>user.availability?.features.includes('pilots')&&PILOT_LEVEL_MODULE[area.key]?PILOT_LEVEL_MODULE[area.key]:area.module;
export function scopeLevel(user:User,key:string):number{
 const area=areaOf(key);if(!area)return 0;key=area.key;
 const own=user.permissions[levelModule(user,area)];
 return user.availability?.features.includes('pilots')&&SHARED_PILOT_SCOPES.includes(key)?Math.max(own,user.permissions.materials,user.permissions.welding):own;
}
/**
 * Areas a pilot may read but never change although they belong to the other pilot: inside Weld Pilot the Material
 * database (6), so certificates and welds show their material and a certificate can choose one. It opens to accounts
 * that may read certifications (18) or welds (63) there; every other verb stays refused.
 */
export const PILOT_READ_SCOPES:Partial<Record<PilotKey,{area:string;through:string[]}[]>>={weld:[{area:'6',through:['18','63']}]};
const pilotRead=(user:User,key:string)=>user.availability?.features.includes('pilots')&&user.pilot?PILOT_READ_SCOPES[user.pilot]?.find(entry=>entry.area===key):undefined;
export function canScope(user:User,key:string,verb:PermissionVerb='show'):boolean{
 const area=areaOf(key);if(!area)return false;
 const borrowed=pilotRead(user,area.key);if(borrowed)return verb==='show'&&borrowed.through.some(source=>canScope(user,source,'show'));
 if(user.capabilities)return Boolean(user.capabilities[area.key]?.includes(verb));
 const level=['show','export','print'].includes(verb)?1:levelModule(user,area)==='settings'?3:2;
 return scopeLevel(user,key)>=level;
}
/** Missing source columns are not separate grants; local controls inherit the nearest source operation. */
export function scopeOperation(key:string,verb:PermissionVerb):PermissionVerb{
 const verbs=areaOf(key)?.verbs||[];if(verbs.includes(verb))return verb;
 if(['export','print','show'].includes(verb))return 'show';
 if(verbs.includes('insert'))return 'insert';if(verbs.includes('edit'))return 'edit';return verb;
}
export function resourceScopes(key:string,row?:Partial<Row>):string[]{
 if(row&&key==='service_requests')return ['24'];
 if(row&&key==='catalog_sites')return RESOURCE_SCOPES[String(row.resourceKey)]||[];
 if(row&&key==='releases')return [row.type==='Field'?'89':row.type==='Hydrotest'?'74':'86'];
 if(row&&key==='inspection_requests')return [row.type==='PWHT'||row.type==='PRE-HT'?'65':'50'];
 if(row&&key==='inspection_results')return [row.type==='PWHT'?'97':row.type==='NDT PRE'?'94':row.type==='VI'||row.type==='PRE-HT'?'116':'76'];
 return RESOURCE_SCOPES[key]||[];
}
/**
 * Pilots an area belongs to: welding areas to Weld Pilot, materials areas to MTO Pilot; shared project data,
 * administration and the shared catalogs to both; tools areas to neither. Shown in the profile editor and used
 * as the pilot boundary below.
 */
/**
 * Areas whose pilots differ from their module, from the App column (data-apps) of the reference matrix
 * (weld__system__profiles.txt): Custom attachment names 85, Release prefab 86, Release field 89 and Welding wires 99
 * belong to both pilots; Signatures 96 to Weld Pilot only; Management dashboard 93 to none. Companies 37 stays in both
 * (the MTO user form reads companies) and Calculations 71 in MTO Pilot (owner decision).
 */
const AREA_PILOTS:Record<string,PilotKey[]>={'85':['weld','mto'],'86':['weld','mto'],'89':['weld','mto'],'99':['weld','mto'],'96':['weld'],'93':[]};
export function areaPilots(key:string):PilotKey[]{
 const area=areaOf(key);if(!area)return [];
 if(AREA_PILOTS[area.key])return [...AREA_PILOTS[area.key]];
 if(SHARED_PILOT_SCOPES.includes(area.key)||area.module==='general'||area.module==='settings')return ['weld','mto'];
 return area.module==='welding'?['weld']:area.module==='materials'?['mto']:[];
}
/**
 * An account evaluated inside a pilot: the other pilot's module and areas are removed, so the pilot in the
 * request is the boundary even where the profile itself would allow more. Shared areas keep this profile's rights.
 */
export function pilotBoundary(user:User,pilot:PilotKey):User{
 const other:Module=pilot==='weld'?'materials':'welding';
 return {...user,pilot,permissions:{...user.permissions,[other]:0},...(user.capabilities?{capabilities:Object.fromEntries(Object.entries(user.capabilities).filter(([key])=>areaPilots(key).includes(pilot)))}:{})};
}
/** Pilots profile: an administrator manages users and profiles (module levels: settings Administration; matrix: view, add and edit on both). */
export function isAdministrator(user:User):boolean{
 if(user.capabilities)return ['26','53'].every(key=>(['show','insert','edit'] as PermissionVerb[]).every(verb=>user.capabilities![key]?.includes(verb)));
 return (user.permissions.settings||0)>=3;
}
const OWN_SIGNATURE:PermissionVerb[]=['show','insert','edit','import','print'];
/**
 * Pilots profile: Show / Insert on the Signatures area (96) decide whether an account opens and saves signatures; within
 * it everyone keeps their own signatures, and an administrator may view (never write) another user's.
 */
function signatureAccess(user:User,verb:PermissionVerb,row?:Row):boolean{
 if(!canScope(user,'96',scopeOperation('96',verb)))return false;
 if(!row)return verb==='show'||verb==='insert';
 if(row.userId===user.id)return OWN_SIGNATURE.includes(verb);
 return isAdministrator(user)&&(verb==='show'||verb==='print');
}
export function canResource(user:User,key:string,verb:PermissionVerb='show',row?:Row):boolean{
 if(!resourceAvailable(user.availability,key)||row&&!rowAvailable(user.availability,key,row))return false;
 if(user.availability?.features.includes('pilots')){
  if((key==='users'||key==='user_sites'||key==='profiles'||key==='company_data')&&!isAdministrator(user))return false;
  if(key==='signatures')return signatureAccess(user,verb,row);
 }
 const scopes=user.availability&&!row&&['inspection_requests','inspection_results'].includes(key)?user.availability.inspectionTypes.flatMap(type=>resourceScopes(key,{type})):resourceScopes(key,row);
 // An area read across the pilot boundary is read only: no export or print either (PILOT_READ_SCOPES).
 if(verb!=='show'&&scopes.length&&scopes.every(scope=>pilotRead(user,scope)))return false;
 return scopes.some(scope=>canScope(user,scope,scopeOperation(scope,verb)));
}
export function actionScope(key:string,data:Record<string,unknown>={}):[string,PermissionVerb]{
 const direct:Record<string,[string,PermissionVerb]>={
  'add-iso-material':['70','insert'],'duplicate-site':['4','insert'],'reorder-attachment-names':['85','edit'],order:['13','print'],'order-requirements':['13','print'],receive:['15','insert'],'issue-material':['20','insert'],'adjust-material':['16','insert'],'transfer-material':['16','insert'],rent:['61','insert'],return:['61','insert'],'adjust-tool':['61','insert'],'transfer-tool':['61','insert'],service:['23','insert'],'move-spools':['1','edit'],'move-materials':['local-material-logistics','edit'],'service-materials':['80','insert'],repair:['63','edit'],'save-weld':['63',data.weldId?'edit':'insert'],'add-welds':['63','insert'],'mass-edit-welds':['63','edit'],'reorder-welds':['63','edit'],phases:['64','edit'],'copy-isometrics':['64','insert'],'add-new-isometric':['64','insert'],'fill-irn':['4','edit'],revision:['64','edit'],'remove-material-quantity':['70','edit'],'inspection-request':[data.type==='PWHT'||data.type==='PRE-HT'?'65':'50','print'],release:[data.type==='Field'?'89':data.type==='Hydrotest'?'74':'86','insert'],'complete-phase':[data.type==='Field'?'89':'86','insert'],'reopen-release':[data.type==='Field'?'89':'86','insert'],'assign-fwp':['91','edit'],'punch-finish':['77','edit'],'punch-approve':['77','edit'],'punch-promote':['77','edit'],'punch-remove':['77','delete'],'punch-report-passed':['77','insert'],'correct-receipt':['15','edit'],'set-material-type':['70','edit'],'archive-iso-materials':['70','delete']
 };
 if(MTO_STOCK_ACTION_SCOPES[key])return MTO_STOCK_ACTION_SCOPES[key];
 const inspection=inspectionActionScope(key,data);if(inspection)return inspection;
 if(key==='inspection-result')return [data.type==='PWHT'?'97':data.type==='NDT PRE'?'94':data.type==='VI'||data.type==='PRE-HT'?'116':'76','insert'];
 if(HYDROTEST_ACTION_SCOPES[key])return HYDROTEST_ACTION_SCOPES[key];
  return direct[key]||MTO_ACTION_SCOPES[key]||['','insert'];
}
/** Copy isometrics: each ticked box needs the add right on what it copies (welds, material requirements, calculation / cut-list lines). */
export type CopyPart='copyWelds'|'copyMaterials'|'copyCalculations';
/** Pilots profile: per part of Copy isometrics, whether the account may copy it (evaluated in the pilot that owns the part) and why not. */
export type CopyParts=Record<CopyPart,{allowed:boolean;pilot?:PilotKey;reason?:string}>;
export const COPY_SCOPES:[CopyPart,string][]=[['copyWelds','63'],['copyMaterials','70'],['copyCalculations','71']];
/** Actions that need one more right than their own area. A receipt correction changes stock, so it also needs the add right on material inventory (the reference has no edit right on receipts). */
const EXTRA_ACTION_SCOPES:Record<string,[string,PermissionVerb][]>={'correct-receipt':[['16','insert']],'fill-irn':[['64','edit']]};
export function canAction(user:User,key:string,data:Record<string,unknown>={}):boolean{
 if(!actionAvailable(user.availability,key,data.type))return false;
 if(user.capabilities&&data.type===undefined){const types=key==='release'||key==='reopen-release'||key==='complete-phase'?['Prefab','Field','Hydrotest']:key==='inspection-request'||key==='inspection-result'?['NDT','NDT PRE','VI','PWHT','PRE-HT']:TYPED_INSPECTION_ACTIONS.includes(key)?['NDT','NDT PRE','PWHT','PRE-HT']:[];if(types.length)return types.some(type=>canAction(user,key,{...data,type}));}
 if(key==='hydrotest-move'&&!canScope(user,'64','edit'))return false;
 // Storehouse lines (area 75, a Workspace area) are operated from MTO Pilot's Storehouses page only, never from Weld Pilot.
 if(user.pilot==='weld'&&MTO_STOCK_ACTION_SCOPES[key])return false;
 if(!(EXTRA_ACTION_SCOPES[key]||[]).every(([area,verb])=>canScope(user,area,scopeOperation(area,verb))))return false;
 if((key==='copy-isometrics'||key==='add-new-isometric')&&!COPY_SCOPES.every(([flag,area])=>data[flag]!==true||canScope(user,area,'insert')))return false;
 const [scope,verb]=actionScope(key,data);if(!user.capabilities){const area=areas.get(scope);return Boolean(area)&&user.permissions[area!.module]>=2;}return canScope(user,scope,scopeOperation(scope,verb));
}
export const REPORT_RESOURCES:Record<string,string[]>={lisl:['welds'],wdi:['welds'],welder:['welders'],tracer:['welds'],'open-welds':['welds'],'weld-cards':['welds'],'inspection-requests':['inspection_requests'],'inspection-results':['inspection_results'],releases:['releases'],mto:['iso_materials'],calculation:['calculation_lines'],'cut-list':['cut_list'],picklists:['picklists'],'order-status':['orders','order_lines'],'spool-locations':['spools'],rentals:['rentals'],'tool-movements':['tool_movements'],revisions:['revisions'],'isometric-status':['isometrics']};
Object.assign(REPORT_RESOURCES,PDF_REPORT_RESOURCES);
export function canReport(user:User,key:string,verb:PermissionVerb='show'){return (!user.availability||Object.hasOwn(user.availability.reports,key))&&(REPORT_RESOURCES[key]||[]).some(resource=>canResource(user,resource,verb));}
export function moduleSummary(rules:PermissionRules):User['permissions']{
 const result={general:0,materials:0,welding:0,tools:0,settings:0};
 for(const area of PERMISSION_AREAS){const allowed=rules[area.key]||[];if(allowed.length)result[area.module]=Math.max(result[area.module],allowed.some(v=>['insert','edit','delete','import'].includes(v))?(area.module==='settings'?3:2):1);}
 return result;
}
export function inheritedRules(user:User):PermissionRules{return Object.fromEntries(PERMISSION_AREAS.map(area=>[area.key,area.verbs.filter(verb=>canScope(user,area.key,verb))]));}
