import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { runAction } from '../server/workflows.ts';
import { RESOURCES } from '../shared/resources.ts';
import { materialLocations } from '../shared/material-logistics.ts';
const actor={id:'logistics-test',name:'Logistics test operator'};
function fixture(t:{after:(fn:()=>void)=>void}){const s=new Store(':memory:');seed(s);t.after(()=>s.close());s.create('material_laydowns',{name:'Test material rack'},actor,'material-rack');return s;}
const rows=(s:Store)=>Object.fromEntries(RESOURCES.map(r=>[r.key,s.list(r.key,true)]));
const snapshot=(s:Store)=>JSON.stringify({rows:rows(s),audit:s.activity(10000),counters:s.db.prepare('SELECT * FROM counters ORDER BY key').all()});
const requirements=(s:Store)=>s.list('iso_materials').slice(0,2).map(r=>r.id);

test('material laydown movements track requirement lines without changing warehouse balances',t=>{
 const s=fixture(t),selected=requirements(s),stock=JSON.stringify(s.list('stock')),picks=JSON.stringify(s.list('picklists'));
 runAction(s,'move-materials',{requirementIds:[...selected,selected[0]],laydownId:'material-rack',date:'2026-10-21',note:'Checked rack assignment'},actor);
 assert.equal(s.list('material_locations').length,2);assert.equal(s.list('material_location_events').length,2);
 assert.ok(s.list('material_locations').every(r=>r.laydownId==='material-rack'&&!r.companyId));assert.equal(JSON.stringify(s.list('stock')),stock);assert.equal(JSON.stringify(s.list('picklists')),picks);
 assert.ok(s.activity(100).some(e=>e.entityType==='iso_materials'&&e.entityId===selected[0]&&e.action==='moved'));
 assert.throws(()=>runAction(s,'move-materials',{requirementIds:selected,laydownId:'laydown-b'},actor),/could not be found/i);
});
test('catalog and custom material service requests retain names, links, history, and return laydowns',t=>{
 const s=fixture(t),catalog=requirements(s)[0];const custom=runAction(s,'add-iso-material',{isoId:'iso-2',source:'Custom',materialNo:'LOG-CUSTOM',description:'Fictional support',uom:'EA',quantity:2},actor).record!;
 const selected=[catalog,custom.id];runAction(s,'move-materials',{requirementIds:selected,laydownId:'material-rack',date:'2026-10-20'},actor);
 const result=runAction(s,'service-materials',{requirementIds:selected,companyId:'service-coating',name:'Material coating batch',note:'Fictional scope',date:'2026-10-21'},actor);
 assert.equal(result.records!.length,2);assert.equal(new Set(result.records!.map(r=>r.number)).size,1);assert.ok(result.records!.every(r=>r.name==='Material coating batch'&&r.materialLaydownId==='material-rack'&&!r.spoolId));
 assert.ok(s.list('material_locations').every(r=>r.companyId==='service-coating'&&!r.laydownId));
 runAction(s,'complete-material-service',{requestIds:result.records!.map(r=>r.id),date:'2026-10-22',note:'Received from service'},actor);
 assert.ok(s.list('service_requests').filter(r=>selected.includes(String(r.requirementId))).every(r=>r.status==='Completed'&&r.completedAt==='2026-10-22'&&String(r.note).includes('Received from service')));
 assert.ok(s.list('material_locations').every(r=>r.laydownId==='material-rack'&&!r.companyId));assert.equal(s.list('material_location_events').length,6);
 assert.equal(s.get('iso_materials',custom.id).customMaterial,true);
});
test('a failing selection rolls back material locations, requests, counters, and history atomically',t=>{
 const s=fixture(t),selected=requirements(s);runAction(s,'move-materials',{requirementIds:[selected[0]],laydownId:'material-rack'},actor);
 const before=snapshot(s);assert.throws(()=>runAction(s,'service-materials',{requirementIds:selected,companyId:'service-coating'},actor),/laydown before/);assert.equal(snapshot(s),before);
 assert.throws(()=>runAction(s,'move-materials',{requirementIds:[selected[0],'missing-requirement'],laydownId:'material-rack'},actor),/could not be found/i);assert.equal(snapshot(s),before);
 const result=runAction(s,'service-materials',{requirementIds:[selected[0]],companyId:'service-coating'},actor),open=snapshot(s);
 for(const key of ['move-materials','service-materials'])assert.throws(()=>runAction(s,key,{requirementIds:[selected[0]],laydownId:'material-rack',companyId:'service-coating'},actor),/open service/);
 assert.equal(snapshot(s),open);assert.ok(result.records!.length);
});
test('completion rejects wrong target types, earlier dates, and repeats with no partial changes',t=>{
 const s=fixture(t),selected=requirements(s);runAction(s,'move-materials',{requirementIds:selected,laydownId:'material-rack'},actor);
 const material=runAction(s,'service-materials',{requirementIds:selected,companyId:'service-coating',date:'2026-10-21'},actor).records!;
 const spool=runAction(s,'service',{spoolIds:['spool-2'],companyId:'service-coating',name:'Name without services',date:'2026-10-21'},actor).records![0];assert.equal(spool.name,'Name without services');
 const before=snapshot(s);
 assert.throws(()=>runAction(s,'complete-material-service',{requestIds:[material[0].id,spool.id],date:'2026-10-22'},actor),/material service requests/);
 assert.throws(()=>runAction(s,'complete-service',{requestIds:[spool.id,material[0].id],date:'2026-10-22'},actor),/spool service requests/);
 assert.throws(()=>runAction(s,'complete-material-service',{requestIds:material.map(r=>r.id),date:'2026-10-20'},actor),/before the request/);assert.equal(snapshot(s),before);
 runAction(s,'complete-material-service',{requestIds:material.map(r=>r.id),date:'2026-10-22'},actor);const after=snapshot(s);assert.throws(()=>runAction(s,'complete-material-service',{requestIds:[material[0].id],date:'2026-10-23'},actor),/already completed/);assert.equal(snapshot(s),after);
});
test('material location scope preserves separate requirements for the same stock identity',t=>{
 const s=fixture(t),first=s.list('iso_materials')[0];const extra=s.create('iso_materials',{isoId:first.isoId,materialId:first.materialId,quantity:4},actor);
 runAction(s,'move-materials',{requirementIds:[first.id],laydownId:'material-rack'},actor);
 const data=rows(s),all=materialLocations(data),one=all.find(e=>e.requirement.id===first.id)!,two=all.find(e=>e.requirement.id===extra.id)!;
 assert.equal(one.locationType,'Laydown');assert.equal(two.locationType,'Unassigned');assert.equal(one.material.id,two.material.id);
 assert.equal(materialLocations(data,{location:'Laydown:material-rack'}).length,1);assert.ok(materialLocations(data,{projectId:String(one.iso.projectId),isoId:one.iso.id}).every(e=>e.iso.id===one.iso.id));
 const scope=materialLocations(data,{group:String(one.material.materialGroup)});assert.ok(scope.every(e=>e.material.materialGroup===one.material.materialGroup));
 assert.ok(s.db.prepare('PRAGMA foreign_key_check').all().length===0);
});
