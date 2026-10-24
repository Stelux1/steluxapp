import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { runAction } from '../server/workflows.ts';
import { RESOURCES } from '../shared/resources.ts';
import { requirementExecution,materialIdentity } from '../shared/materials.ts';
import { buildReport } from '../shared/reports.ts';
import { summary } from '../shared/metrics.ts';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const actor={id:'material-test',name:'Material execution test'};
function fixture(t:{after:(fn:()=>void)=>void}){const s=new Store(':memory:');seed(s);t.after(()=>s.close());return s;}
const rows=(s:Store)=>Object.fromEntries(RESOURCES.map(r=>[r.key,s.list(r.key,true)]));
const snapshot=(s:Store)=>JSON.stringify({rows:rows(s),audit:s.activity(10000),counters:s.db.prepare('SELECT * FROM counters ORDER BY key').all()});
function catalogRequirements(s:Store){const m=s.create('materials',{materialNo:'EXEC-TEST-PIPE',description:'Execution test pipe',uom:'M'},actor);const a=s.create('iso_materials',{isoId:'iso-1',materialId:m.id,quantity:5.5},actor);const b=s.create('iso_materials',{isoId:'iso-2',materialId:m.id,quantity:2},actor);return {m,a,b};}
function order(s:Store,requirementIds:string[]){const result=runAction(s,'order-requirements',{requirementIds,date:'2026-10-21'},actor);assert.ok('record' in result&&result.record);return result.record!;}
test('checked requirements order exact outstanding quantities and pick totals stay linked to the correct isometric',t=>{
  const s=fixture(t);const {m,a,b}=catalogRequirements(s);const o=order(s,[a.id,b.id]);assert.equal(o.supplierId,'');assert.equal(o.projectId,'project-cooling');
  const lines=s.list('order_lines').filter(l=>l.orderId===o.id);assert.equal(lines.length,2);assert.equal(lines.reduce((n,l)=>n+Number(l.quantity),0),7.5);
  let data=requirementExecution(rows(s));assert.equal(data.find(e=>e.requirement.id===a.id)!.ordered,5.5);assert.equal(data.find(e=>e.requirement.id===b.id)!.ordered,2);
  const before=snapshot(s);assert.throws(()=>order(s,[a.id]),/already fully ordered/);assert.equal(snapshot(s),before);
  const line=lines.find(l=>l.requirementId===a.id)!;
  assert.throws(()=>runAction(s,'receive',{orderId:o.id,warehouseId:'warehouse-field',items:[{lineId:line.id,quantity:2}]},actor),/supplier/);
  runAction(s,'receive',{orderId:o.id,supplierId:'supplier-steel',warehouseId:'warehouse-field',items:[{lineId:line.id,quantity:2,chargeNo:'EXEC-HEAT'}]},actor);
  assert.equal(s.get('orders',o.id).supplierId,'supplier-steel');assert.equal(s.get('orders',o.id).status,'Partially received');
  runAction(s,'issue-material',{isoId:a.isoId,requirementId:a.id,materialId:m.id,warehouseId:'warehouse-field',quantity:1.25,chargeNo:'EXEC-HEAT'},actor);
  data=requirementExecution(rows(s));assert.equal(data.find(e=>e.requirement.id===a.id)!.picked,1.25);assert.equal(data.find(e=>e.requirement.id===b.id)!.picked,0);assert.equal(data.find(e=>e.requirement.id===a.id)!.inventory,.75);
  const wrong=snapshot(s);assert.throws(()=>runAction(s,'issue-material',{isoId:b.isoId,requirementId:a.id,materialId:m.id,warehouseId:'warehouse-field',quantity:.25,chargeNo:'EXEC-HEAT'},actor),/must match/);assert.equal(snapshot(s),wrong);
});
test('custom materials can be ordered, received, transferred and picked without entering the reusable catalog',t=>{
  const s=fixture(t);const count=s.list('materials').length;const result=runAction(s,'add-iso-material',{isoId:'iso-1',source:'Custom',materialNo:'CUSTOM-FLOW',description:'Custom mounting bracket',uom:'EA',quantity:4},actor);assert.ok('record' in result&&result.record);const req=result.record!;assert.ok(req.customMaterialId);
  const o=order(s,[req.id]);const line=s.list('order_lines').find(l=>l.orderId===o.id)!;assert.equal(line.materialId,'');assert.equal(line.customMaterialId,req.customMaterialId);
  runAction(s,'receive',{orderId:o.id,supplierId:'supplier-steel',warehouseId:'warehouse-main',items:[{lineId:line.id,quantity:4,chargeNo:'CUSTOM-HEAT'}]},actor);
  runAction(s,'transfer-material',{customMaterialId:req.customMaterialId,fromId:'warehouse-main',toId:'warehouse-field',quantity:2,chargeNo:'CUSTOM-HEAT'},actor);
  runAction(s,'issue-material',{customMaterialId:req.customMaterialId,requirementId:req.id,isoId:req.isoId,warehouseId:'warehouse-field',quantity:1,chargeNo:'CUSTOM-HEAT'},actor);
  const balances=s.list('stock').filter(r=>r.customMaterialId===req.customMaterialId);assert.equal(balances.reduce((n,r)=>n+Number(r.quantity),0),3);assert.equal(s.list('materials').length,count);
  const execution=requirementExecution(rows(s)).find(e=>e.requirement.id===req.id)!;assert.equal(execution.ordered,4);assert.equal(execution.picked,1);assert.equal(execution.inventory,3);
  assert.equal(buildReport('order-status',rows(s)).rows.find(r=>r.id===line.id)!.values.material,'CUSTOM-FLOW');assert.ok(buildReport('picklists',rows(s)).rows.some(r=>r.values.material==='CUSTOM-FLOW'));
});
test('a bad requirement in a batch rolls back orders, lines, counters and audit history',t=>{
  const s=fixture(t);const {a,b}=catalogRequirements(s);order(s,[b.id]);const before=snapshot(s);assert.throws(()=>order(s,[a.id,b.id]),/already fully ordered/);assert.equal(snapshot(s),before);assert.equal(requirementExecution(rows(s)).find(e=>e.requirement.id===a.id)!.ordered,0);
});
test('legacy unlinked orders and picks are allocated once across repeated material requirements',t=>{
  const s=fixture(t);const {m,a,b}=catalogRequirements(s);runAction(s,'order',{projectId:'project-cooling',items:[{materialId:m.id,quantity:6}]},actor);
  const duplicate=s.create('iso_materials',{isoId:a.isoId,materialId:m.id,quantity:3},actor);runAction(s,'adjust-material',{materialId:m.id,warehouseId:'warehouse-main',quantity:3,note:'Test opening balance'},actor);runAction(s,'issue-material',{isoId:a.isoId,materialId:m.id,warehouseId:'warehouse-main',quantity:2},actor);
  const execution=requirementExecution(rows(s)).filter(e=>materialIdentity(e.requirement)===materialIdentity(a));assert.equal(execution.reduce((n,e)=>n+e.ordered,0),6);assert.equal(execution.filter(e=>e.iso.id===a.isoId).reduce((n,e)=>n+e.picked,0),2);
  const scoped=requirementExecution(rows(s),{isoId:String(b.isoId)});assert.equal(scoped.find(e=>e.requirement.id===b.id)!.ordered,execution.find(e=>e.requirement.id===b.id)!.ordered);assert.ok(execution.some(e=>e.requirement.id===duplicate.id));
});
test('custom material revisions preserve old delivery snapshots and do not apply old stock to the revised item',t=>{
  const s=fixture(t);const result=runAction(s,'add-iso-material',{isoId:'iso-1',source:'Custom',materialNo:'CUSTOM-REV',description:'Original part',uom:'EA',quantity:2},actor);assert.ok('record' in result&&result.record);const original=result.record!;const o=order(s,[original.id]);const line=s.list('order_lines').find(l=>l.orderId===o.id)!;
  const revised=s.update('iso_materials',original.id,{description:'Revised part'},original._version,actor);assert.notEqual(revised.customMaterialId,original.customMaterialId);
  runAction(s,'receive',{orderId:o.id,supplierId:'supplier-steel',warehouseId:'warehouse-main',items:[{lineId:line.id,quantity:2}]},actor);
  assert.equal(s.get('order_lines',line.id).description,'Original part');assert.equal(s.list('stock').find(st=>st.customMaterialId===original.customMaterialId)!.quantity,2);const execution=requirementExecution(rows(s)).find(e=>e.requirement.id===original.id)!;assert.equal(execution.inventory,0);assert.equal(execution.ordered,0);
});
test('the source X-ray requirement accepts a class designation and older numeric values remain editable',t=>{
  const s=fixture(t);const iso=s.get('isometrics','iso-1');const updated=s.update('isometrics',iso.id,{xRay:'CLASS 1'},iso._version,actor);assert.equal(updated.xRay,'CLASS 1');const numeric=s.update('isometrics',iso.id,{xRay:20},updated._version,actor);assert.equal(numeric.xRay,'20');
});
test('one checked order can cover several projects without disappearing from either project scope',t=>{
  const s=fixture(t);const {m,a}=catalogRequirements(s);const other=s.create('iso_materials',{isoId:'iso-4',materialId:m.id,quantity:2},actor);const o=order(s,[a.id,other.id]);assert.equal(o.projectId,'');const data=rows(s);
  assert.ok(summary(data,'project-cooling').orders.some(r=>r.id===o.id));assert.ok(summary(data,'project-steam').orders.some(r=>r.id===o.id));
  assert.equal(buildReport('order-status',data,{projectId:'project-cooling'}).rows.filter(r=>r.values.number===o.number).length,1);assert.equal(buildReport('order-status',data,{projectId:'project-steam'}).rows.filter(r=>r.values.number===o.number).length,1);
});
test('older custom requirements acquire a stable inventory reference once when the database reopens',()=>{
  const dir=mkdtempSync(join(tmpdir(),'stelux-custom-migration-'));const file=join(dir,'test.sqlite');let s=new Store(file);
  try{seed(s);const req=s.create('iso_materials',{isoId:'iso-1',customMaterial:true,materialNo:'LEGACY-CUSTOM',description:'Legacy custom item',uom:'EA',quantity:2},actor);const oldId=String(req.customMaterialId);s.db.prepare("UPDATE iso_materials SET data=json_remove(data,'$.customMaterialId') WHERE id=?").run(req.id);s.db.prepare('DELETE FROM custom_materials WHERE id=?').run(oldId);s.close();s=new Store(file);const migrated=s.get('iso_materials',req.id);assert.ok(migrated.customMaterialId);assert.equal(s.get('custom_materials',migrated.customMaterialId).materialNo,'LEGACY-CUSTOM');const count=s.list('custom_materials').length;s.close();s=new Store(file);assert.equal(s.get('iso_materials',req.id).customMaterialId,migrated.customMaterialId);assert.equal(s.list('custom_materials').length,count);assert.deepEqual(s.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
