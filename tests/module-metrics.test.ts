import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { runAction } from '../server/workflows.ts';
import { RESOURCES } from '../shared/resources.ts';
import { spoolLocations, minimumArticles, weldingStats } from '../shared/module-metrics.ts';

const actor = {id:'metrics-test',name:'Metrics test'};
const allRows = (s:Store) => Object.fromEntries(RESOURCES.map(r=>[r.key,s.list(r.key,true)]));
function fixture(t:{after:(fn:()=>void)=>void}){const s=new Store(':memory:');seed(s);t.after(()=>s.close());return s;}

test('spool overview follows service and laydown movements in project scope',t=>{
  const s=fixture(t); const spool=s.get('spools','spool-1');const iso=s.get('isometrics',spool.isoId);
  const request=runAction(s,'service',{spoolIds:[spool.id],companyId:'service-coating',services:'Coating',laydownId:'laydown-b'},actor);
  let location=spoolLocations(allRows(s),String(iso.projectId)).find(x=>x.spool.id===spool.id)!;
  assert.equal(location.locationType,'Service');assert.equal(location.locationId,'service-coating');assert.equal(location.lastRequest?.spoolId,spool.id);
  assert.ok(spoolLocations(allRows(s),String(iso.projectId)).every(x=>x.projectId===iso.projectId));
  assert.ok('records' in request && request.records);
  runAction(s,'complete-service',{requestIds:request.records!.map(r=>r.id)},actor);
  location=spoolLocations(allRows(s)).find(x=>x.spool.id===spool.id)!;
  assert.equal(location.locationType,'Laydown');assert.equal(location.locationId,'laydown-b');
});
test('minimum stock includes zero and exact minimum and respects warehouse scope',t=>{
  const s=fixture(t);const article=s.get('articles','article-1');
  const stock=s.list('tool_stock').find(x=>x.articleId===article.id && x.warehouseId==='warehouse-main')!;
  s.update('articles',article.id,{minimal:Number(stock.quantity)},article._version,actor);
  assert.ok(minimumArticles(allRows(s),'warehouse-main').some(x=>x.article.id===article.id && x.available===stock.quantity));
  assert.ok(minimumArticles(allRows(s),'warehouse-field').some(x=>x.article.id===article.id && x.available===0));
  assert.equal(minimumArticles({}).length,0);
});
test('welding dashboard length and count use the same filtered weld population',t=>{
  const s=fixture(t);const rows=allRows(s); const w=s.get('welds','weld-1');const iso=s.get('isometrics',w.isoId);
  const filters={projectId:String(iso.projectId),welderId:String(w.welder1Id)};
  const length=weldingStats(rows,filters);const count=weldingStats(rows,filters,'count');
  assert.deepEqual(length.welds.map(w=>w.id),count.welds.map(w=>w.id));assert.equal(count.total,count.welds.length);
  assert.ok(count.welds.every(w=>[w.welder1Id,w.welder2Id,w.welder3Id,w.welder4Id].includes(filters.welderId)));
  assert.ok(length.examined<=length.total);assert.ok(count.examined<=count.total);
  assert.equal(weldingStats(rows,{from:'2099-01-01'}).total,0);assert.equal(weldingStats({},{}).examined,0);
});
test('repeat inspection reports cannot inflate the local dashboard examination total',t=>{
  const s=fixture(t);const req=runAction(s,'inspection-request',{weldIds:['weld-25'],type:'NDT'},actor);
  assert.ok('records' in req && req.records);
  for(const round of ['Initial','Additional 1'])runAction(s,'inspection-result',{requestId:req.records![0].id,result:'Accepted',reportNo:round,round,examinedLength:100},actor);
  const rows=allRows(s);const justOne={...rows,welds:rows.welds.filter(w=>w.id==='weld-25')};
  assert.equal(weldingStats(justOne,{},'count').examined,1);assert.equal(weldingStats(justOne).examined,100);
});
