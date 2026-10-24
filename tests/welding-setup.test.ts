import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { RESOURCES } from '../shared/resources.ts';
import { PQR_ATTRIBUTES,RELATIONS,relationIds,availableWps } from '../shared/welding.ts';

const actor={id:'welding-setup-test',name:'Setup tester'};
function fixture(t:{after:(fn:()=>void)=>void}){const s=new Store(':memory:');seed(s);t.after(()=>s.close());return s;}
const rows=(s:Store)=>Object.fromEntries(RESOURCES.map(r=>[r.key,s.list(r.key,true)]));
const snapshot=(s:Store)=>JSON.stringify({rows:rows(s),audit:s.activity(10000),counters:s.db.prepare('SELECT * FROM counters ORDER BY key').all()});
const wps=(s:Store,data:Record<string,unknown>={})=>s.create('wps',{name:'TEST-WPS',method:'141 (GTAW)',definition:'# (3 - 20) mm / D (21.1 - 9999) mm',jointType:'BW',...data},actor);
test('all 26 source PQR attributes accept reusable values and stay in the correct attribute category',t=>{
  const s=fixture(t);const data=Object.fromEntries(PQR_ATTRIBUTES.map(a=>[a.name,`Test ${a.label}`]));const p=s.create('pqr',data,actor);assert.match(String(p.name),/^PQR-/);
  for(const field of PQR_ATTRIBUTES){const value=s.get('qualification_options',p[field.name]);assert.equal(value.category,field.category);assert.equal(value.name,`Test ${field.label}`);assert.ok(s.activity(1000).some(e=>e.entityId===value.id&&e.actorId===actor.id));}
  const count=s.list('qualification_options').length;s.create('pqr',{...data,name:'SECOND-PQR'},actor);assert.equal(s.list('qualification_options').length,count);
  const before=snapshot(s);assert.throws(()=>s.update('pqr',p.id,{attribute2Id:p.attribute1Id},p._version,actor),/highlighted/);assert.equal(snapshot(s),before);
});
test('invalid PQR or WPS saves roll back new reusable values, records, assignments and audit history',t=>{
  const s=fixture(t);let before=snapshot(s);assert.throws(()=>s.create('pqr',{attribute1Id:'ROLLBACK VALUE',processId:'missing-process'},actor),/highlighted/);assert.equal(snapshot(s),before);
  before=snapshot(s);assert.throws(()=>wps(s,{pqrIds:['pqr-1'],siteIds:['missing-site']}),/could not be found/);assert.equal(snapshot(s),before);
});
test('WPS create and update atomically preserve multiple PQR, project and site assignments',t=>{
  const s=fixture(t);const p2=s.create('pqr',{name:'SECOND-PQR'},actor);let w=wps(s,{allProjects:false,pqrIds:['pqr-1',p2.id,p2.id],projectIds:['project-cooling','project-steam'],siteIds:['site-north','site-river']});let data=rows(s);
  assert.deepEqual(new Set(relationIds(data,RELATIONS.wps[0],w.id)),new Set(['pqr-1',p2.id]));assert.equal(w.pqrId,'pqr-1');assert.equal(relationIds(data,RELATIONS.wps[1],w.id).length,2);
  assert.equal(availableWps(data,w,'project-cooling'),true);assert.equal(availableWps(data,w,'project-skid'),false);
  w=s.update('wps',w.id,{definition:'Changed definition only'},w._version,actor);assert.equal(relationIds(rows(s),RELATIONS.wps[0],w.id).length,2);
  const before=snapshot(s);assert.throws(()=>s.update('wps',w.id,{pqrIds:[p2.id],projectIds:['missing']},w._version,actor),/could not be found/);assert.equal(snapshot(s),before);
  w=s.update('wps',w.id,{pqrIds:[p2.id],allProjects:true,projectIds:[],siteIds:['site-north']},w._version,actor);data=rows(s);assert.deepEqual(relationIds(data,RELATIONS.wps[0],w.id),[p2.id]);assert.equal(w.pqrId,p2.id);assert.equal(availableWps(data,w,'project-skid'),true);assert.equal(availableWps(data,w,'project-steam'),false);
});
test('archiving and restoring an unused WPS restores its assignments but does not revive deliberately removed links',t=>{
  const s=fixture(t);const p2=s.create('pqr',{name:'SECOND-PQR'},actor);let w=wps(s,{pqrIds:['pqr-1',p2.id],siteIds:['site-north']});w=s.update('wps',w.id,{pqrIds:[p2.id]},w._version,actor);
  const archived=s.archive('wps',w.id,w._version,actor);assert.equal(relationIds(rows(s),RELATIONS.wps[0],w.id).length,0);
  const restored=s.archive('wps',w.id,archived._version,actor);assert.equal(restored._archived,false);assert.deepEqual(relationIds(rows(s),RELATIONS.wps[0],w.id),[p2.id]);assert.deepEqual(relationIds(rows(s),RELATIONS.wps[2],w.id),['site-north']);
});
test('a blocked WPS archive rolls back assignment changes and retains weld references',t=>{
  const s=fixture(t);const w=s.get('wps','wps-1');const before=snapshot(s);assert.throws(()=>s.archive('wps',w.id,w._version,actor),/used by active/);assert.equal(snapshot(s),before);assert.equal(s.get('welds','weld-1').wpsId,w.id);
});
test('welder entry preserves source identity, aliases, site deployment and custom qualification fields',t=>{
  const s=fixture(t);const custom=s.create('welder_customs_catalog',{name:'Sample qualification',abbreviation:'SQ',diameterFrom:'10',diameterTo:'9999',wtFrom:'3',wtTo:'20'},actor);
  let w=s.create('welders',{number:'TEST-WELDER',welderCode:'W-TEST',welder1Id:'welder-1',welder2Id:'welder-2',globallyDeployable:false,siteIds:['site-north'],customIds:[custom.id],dob:'1990-01-02',address:'Sample address'},actor);assert.equal(s.display('welders',w),'TEST-WELDER');assert.equal(w.welder1Id,'welder-1');assert.deepEqual(relationIds(rows(s),RELATIONS.welders[0],w.id),['site-north']);
  w=s.update('welders',w.id,{name:'Sample welder',globallyDeployable:true,customIds:[]},w._version,actor);assert.equal(w.name,'Sample welder');assert.equal(relationIds(rows(s),RELATIONS.welders[1],w.id).length,0);
});
test('older local WPS/PQR records migrate once while preserving their primary PQR and weld links',()=>{
  const dir=mkdtempSync(join(tmpdir(),'stelux-welding-migration-'));const file=join(dir,'test.sqlite');let s=new Store(file);
  try{seed(s);s.db.prepare("DELETE FROM metadata WHERE key='welding_setup_v1'").run();s.db.prepare("UPDATE wps SET data=json_remove(data,'$.definition','$.allProjects') WHERE id='wps-1'").run();s.db.prepare('DELETE FROM wps_pqr').run();s.db.prepare('DELETE FROM wps_sites').run();s.close();s=new Store(file);const migrated=s.get('wps','wps-1');assert.equal(migrated.definition,'Not recorded');assert.deepEqual(relationIds(rows(s),RELATIONS.wps[0],migrated.id),['pqr-1']);assert.equal(s.get('welds','weld-1').wpsId,migrated.id);const version=migrated._version;const count=s.list('wps_sites').length;s.close();s=new Store(file);assert.equal(s.get('wps','wps-1')._version,version);assert.equal(s.list('wps_sites').length,count);assert.deepEqual(s.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
