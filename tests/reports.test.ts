import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { runAction } from '../server/workflows.ts';
import { RESOURCES } from '../shared/resources.ts';
import { REPORTS, buildReport, reportCsv } from '../shared/reports.ts';

const actor={id:'report-test',name:'Report test'};
function fixture(t:{after:(fn:()=>void)=>void}){const s=new Store(':memory:');seed(s);t.after(()=>s.close());return s;}
const rows=(s:Store)=>Object.fromEntries(RESOURCES.map(r=>[r.key,s.list(r.key,true)]));

test('all report families build with sample or empty data and resolve every declared column',t=>{
  const s=fixture(t);for(const d of REPORTS){const result=buildReport(d.key,rows(s));assert.ok(result.columns.length>0,d.key);for(const r of result.rows)for(const c of result.columns)assert.ok(Object.hasOwn(r.values,c.key),`${d.key}.${c.key}`);assert.equal(buildReport(d.key,{}).rows.length,0,d.key);}
});
test('weld reports filter project, tracer, open work, date and all four welder positions',t=>{
  const s=fixture(t);const w=s.get('welds','weld-1');s.update('welds',w.id,{welder4Id:'welder-4',tracer:true,date:''},w._version,actor);
  const data=rows(s);assert.ok(buildReport('tracer',data,{welderId:'welder-4'}).rows.some(r=>r.id===w.id));assert.ok(buildReport('open-welds',data).rows.some(r=>r.id===w.id));
  assert.ok(!buildReport('wdi',data,{from:'2026-01-01'}).rows.some(r=>r.id===w.id));
  const selected=buildReport('wdi',data,{projectId:'project-cooling'});assert.ok(selected.rows.length>0);assert.ok(selected.rows.every(r=>r.values.project==='STX-2401'));
  assert.ok(buildReport('welder',data,{welderId:'welder-4'}).rows.some(r=>Number(r.values.count)>0));
});
test('material take-off retains custom materials without introducing a catalog entry',t=>{
  const s=fixture(t);const before=s.list('materials').length;runAction(s,'add-iso-material',{isoId:'iso-1',source:'Custom',materialNo:'CUSTOM-REPORT',description:'Custom bracket',uom:'EA',quantity:2.5},actor);
  const report=buildReport('mto',rows(s),{isoId:'iso-1'});const custom=report.rows.find(r=>r.values.material==='CUSTOM-REPORT')!;assert.equal(custom.values.quantity,2.5);assert.equal(custom.values.description,'Custom bracket');assert.equal(s.list('materials').length,before);
});
test('delivery and rental reports reflect partial transactions and exclude consumed outstanding stock',t=>{
  const s=fixture(t);const rental=runAction(s,'rent',{articleId:'article-4',warehouseId:'warehouse-main',clientId:'client-1',quantity:3,date:'2026-10-21'},actor);assert.ok('record' in rental&&rental.record);
  runAction(s,'return',{rentalId:rental.record!.id,quantity:1,date:'2026-10-21'},actor);
  const report=buildReport('rentals',rows(s),{clientId:'client-1'});assert.equal(report.rows.find(r=>r.id===rental.record!.id)!.values.outstanding,2);assert.ok(report.rows.filter(r=>r.values.status==='Consumed').every(r=>r.values.outstanding===0));
  const order=s.list('orders').find(o=>o.status==='Pending')!;const line=s.list('order_lines').find(l=>l.orderId===order.id)!;runAction(s,'receive',{orderId:order.id,warehouseId:'warehouse-main',items:[{lineId:line.id,quantity:1.25}]},actor);
  const delivered=buildReport('order-status',rows(s)).rows.find(r=>r.id===line.id)!;assert.equal(delivered.values.received,1.25);assert.equal(delivered.values.outstanding,Number(line.quantity)-1.25);
});
test('inspection history reports keep initial and additional results and filter by inspection date',t=>{
  const s=fixture(t);const request=runAction(s,'inspection-request',{weldIds:['weld-25'],type:'NDT',date:'2026-10-01'},actor);assert.ok('records' in request&&request.records);
  for(const round of ['Initial','Additional 1'])runAction(s,'inspection-result',{requestId:request.records![0].id,reportNo:round,result:'Accepted',round,date:'2026-10-21'},actor);
  const report=buildReport('inspection-results',rows(s),{from:'2026-10-21',to:'2026-10-21',type:'NDT'});const resultIds=s.list('inspection_results').filter(r=>r.requestId===request.records![0].id).map(r=>r.id);assert.equal(report.rows.filter(r=>resultIds.includes(r.id)).length,2);
  assert.ok(buildReport('inspection-requests',rows(s),{from:'2026-10-21'}).rows.every(r=>r.values.date!=='2026-10-01'));
});
test('report CSV quotes commas, embedded newlines and spreadsheet formulas',()=>{
  const report=buildReport('mto',{});report.rows=[{id:'test',values:{material:'=1+1',description:'Line 1, "quoted"\nLine 2',quantity:2}}];const csv=reportCsv(report);assert.ok(csv.includes('"\'=1+1"'));assert.ok(csv.includes('"Line 1, ""quoted""\nLine 2"'));assert.ok(csv.startsWith('\ufeff'));assert.throws(()=>buildReport('unknown',{}),/Unknown/);
});
