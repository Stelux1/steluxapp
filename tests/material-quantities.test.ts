import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/store.ts';
import {seed} from '../server/seed.ts';
import {runAction} from '../server/workflows.ts';
import {RESOURCES} from '../shared/resources.ts';
import {materialQuantityLog,currentRevision,nextRevision} from '../shared/revisions.ts';
import {requirementExecution} from '../shared/materials.ts';
const actor={id:'quantity-test',name:'Quantity test operator'};
function fixture(t:{after:(fn:()=>void)=>void}){const s=new Store(':memory:');seed(s);t.after(()=>s.close());return s;}
const rows=(s:Store)=>Object.fromEntries(RESOURCES.map(r=>[r.key,s.list(r.key,true)]));
const snapshot=(s:Store)=>JSON.stringify({rows:rows(s),audit:s.activity(10000),counters:s.db.prepare('SELECT * FROM counters ORDER BY key').all()});
function revision(s:Store,isoId='iso-2',revNo='Q-1',type='ISO'){return runAction(s,'revision',{isoId,revNo,type,date:'2026-10-21'},actor).record!;}

test('revision quantity removal preserves beginning, current balance and the referenced drawing revision',t=>{
 const s=fixture(t),req=s.get('iso_materials','requirement-2'),rev=revision(s);const stock=JSON.stringify(s.list('stock')),picks=JSON.stringify(s.list('picklists')),orders=JSON.stringify(s.list('order_lines'));
 runAction(s,'remove-material-quantity',{requirementId:req.id,revisionId:rev.id,quantity:1.25,expectedVersion:req._version,date:'2026-10-21',note:'Changed support count'},actor);
 const updated=s.get('iso_materials',req.id),log=materialQuantityLog(rows(s),updated);assert.equal(log.beginning,4);assert.equal(log.current,2.75);assert.equal(log.changes.length,1);assert.equal(log.changes[0].quantity,-1.25);assert.equal(log.changes[0].revisionId,rev.id);assert.equal(log.changes[0].note,'Changed support count');
 assert.equal(JSON.stringify(s.list('stock')),stock);assert.equal(JSON.stringify(s.list('picklists')),picks);assert.equal(JSON.stringify(s.list('order_lines')),orders);
 assert.ok(s.activity().some(e=>e.entityType==='iso_materials'&&e.entityId===req.id&&e.action==='quantity removed'));
});
test('catalog and custom requirements can be fully removed while their identity and history remain',t=>{
 const s=fixture(t),rev=revision(s),custom=runAction(s,'add-iso-material',{isoId:'iso-2',source:'Custom',materialNo:'Q-CUSTOM',description:'Fictional custom item',uom:'EA',quantity:0.75},actor).record!;
 for(const id of ['requirement-2',custom.id]){const before=s.get('iso_materials',id);runAction(s,'remove-material-quantity',{requirementId:id,revisionId:rev.id,quantity:Number(before.quantity)},actor);const after=s.get('iso_materials',id);assert.equal(after.quantity,0);assert.equal(after._archived,false);assert.equal(after.customMaterialId,before.customMaterialId);assert.equal(after.materialId,before.materialId);assert.equal(materialQuantityLog(rows(s),after).beginning,Number(before.quantity));const execution=requirementExecution(rows(s)).find(e=>e.requirement.id===id)!;assert.equal(execution.toOrder,0);assert.equal(execution.toPick,0);}
 assert.throws(()=>s.create('iso_materials',{isoId:'iso-2',materialId:'material-1',quantity:0},actor),/positive quantity/);
 assert.equal(s.db.prepare('PRAGMA foreign_key_check').all().length,0);
});
test('ordinary edits and revision removals retain a single ordered quantity log',t=>{
 const s=fixture(t),rev=revision(s);let req=s.get('iso_materials','requirement-2');req=s.update('iso_materials',req.id,{quantity:5.25},req._version,actor);s.update('iso_materials',req.id,{chargeNo:'Q-HEAT'},req._version,actor);
 runAction(s,'remove-material-quantity',{requirementId:req.id,revisionId:rev.id,quantity:0.75},actor);
 const log=materialQuantityLog(rows(s),s.get('iso_materials',req.id));assert.equal(log.beginning,4);assert.equal(log.current,4.5);assert.deepEqual(log.changes.map(r=>[r.sequence,r.type,r.quantity,r.previousQuantity,r.newQuantity]),[[1,'Edit',1.25,4,5.25],[2,'Revision removal',-0.75,5.25,4.5]]);
});
test('invalid quantities, wrong revisions, stale edits and invalid dates leave every record untouched',t=>{
 const s=fixture(t),rev=revision(s),wrongIso=revision(s,'iso-1'),wrongType=revision(s,'iso-2','ITP-Q-1','ITP'),req=s.get('iso_materials','requirement-2');const before=snapshot(s);
 for(const data of [{quantity:5},{quantity:0},{quantity:-1},{quantity:0.001},{quantity:0.015},{quantity:Number.NaN},{quantity:1,revisionId:wrongIso.id},{quantity:1,revisionId:wrongType.id},{quantity:1,expectedVersion:req._version+1},{quantity:1,date:'2026-02-30'}])assert.throws(()=>runAction(s,'remove-material-quantity',{requirementId:req.id,revisionId:rev.id,...data},actor));
 assert.equal(snapshot(s),before);assert.equal(s.list('material_quantity_changes').length,0);
});
test('a failed outer batch rolls back requirement changes, quantity logs and audit together',t=>{
 const s=fixture(t),rev=revision(s),before=snapshot(s);
 assert.throws(()=>s.transaction(()=>{runAction(s,'remove-material-quantity',{requirementId:'requirement-2',revisionId:rev.id,quantity:1},actor);runAction(s,'remove-material-quantity',{requirementId:'requirement-1',revisionId:rev.id,quantity:1},actor);}));assert.equal(snapshot(s),before);
});
test('ISO, ITP and ITP 2 current revisions update independently and retain previous values',t=>{
 const s=fixture(t),initial=s.get('isometrics','iso-2');revision(s,'iso-2','3','ISO');revision(s,'iso-2','1','ITP');revision(s,'iso-2','B','ITP 2');revision(s,'iso-2','2','ITP');const data=rows(s);
 assert.equal(currentRevision(data,'iso-2','ISO'),'3');assert.equal(currentRevision(data,'iso-2','ITP'),'2');assert.equal(currentRevision(data,'iso-2','ITP 2'),'B');assert.equal(nextRevision(data,'iso-2','ISO'),'4');assert.equal(nextRevision(data,'iso-2','ITP 2'),'');
 assert.equal(s.list('revisions').find(r=>r.type==='ISO')!.previousRev,initial.revNo);assert.equal(s.list('revisions').find(r=>r.type==='ITP'&&r.revNo==='2')!.previousRev,'1');assert.equal(s.list('revisions').find(r=>r.type==='ITP 2')!.previousRev,'0');
 const before=snapshot(s);assert.throws(()=>revision(s,'iso-2','B','ITP 2'),/differ/);assert.equal(snapshot(s),before);
});
test('editing an older local isometric retains its ITP revision history as the current value',t=>{
 const s=fixture(t);s.create('revisions',{isoId:'iso-2',type:'ITP',revNo:'LEGACY-A',previousRev:'0',date:'2026-10-20'},actor);
 s.db.prepare("UPDATE isometrics SET data=json_remove(data,'$.itpRevNo','$.itp2RevNo') WHERE id='iso-2'").run();let iso=s.get('isometrics','iso-2');
 assert.equal(currentRevision(rows(s),iso.id,'ITP'),'LEGACY-A');iso=s.update('isometrics',iso.id,{xRay:'CLASS 1'},iso._version,actor);assert.equal(iso.itpRevNo,'LEGACY-A');assert.equal(iso.itp2RevNo,'0');
 const next=revision(s,iso.id,'LEGACY-B','ITP');assert.equal(next.previousRev,'LEGACY-A');
});
