import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { once } from 'node:events';
import { Store } from '../server/store.ts';
import { seed } from '../server/seed.ts';
import { createApp } from '../server/http.ts';
import type { Row } from '../shared/types.ts';
async function fixture(t: {after: (fn: () => Promise<void>) => void}) {
  const dir = mkdtempSync(join(tmpdir(), 'stelux-http-')); const s = new Store(join(dir, 'test.sqlite')); seed(s);
  const server: Server = createApp(s, dir).listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address() as {port: number}; const base = `http://127.0.0.1:${address.port}/api`; let cookie = '';
  async function request(path: string, method = 'GET', data?: unknown, opts: {anonymous?: boolean; headers?: Record<string, string>} = {}) {
    const response = await fetch(base + path, { method, headers: { ...(data instanceof FormData ? {} : { 'Content-Type': 'application/json' }), 'X-Stelux-Request': '1', ...(cookie && !opts.anonymous ? { Cookie: cookie } : {}), ...opts.headers }, body: data === undefined ? undefined : data instanceof FormData ? data : JSON.stringify(data) });
    const set = response.headers.get('set-cookie'); if (set && !opts.anonymous) cookie = set.split(';')[0];
    return response;
  }
  async function setup() { const response = await request('/auth/setup', 'POST', { name: 'HTTP Test Admin', email: 'admin@example.test', password: 'Independent-Test-Password' }); assert.equal(response.status, 201); return await response.json() as {user: {id: string}}; }
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); s.close(); rmSync(dir, { recursive: true, force: true }); });
  return { s, request, setup, dir, clearCookie: () => { cookie = ''; } };
}
test('setup, sign in, logout, cookie settings, and authentication protect workspace data', async t => {
  const f = await fixture(t); let response = await f.request('/bootstrap'); assert.equal(response.status, 401);
  const status = await (await f.request('/auth/status')).json(); assert.equal(status.requiresSetup, true);
  const setup = await f.setup(); response = await f.request('/bootstrap'); const data = await response.json(); assert.equal(response.status, 200); assert.equal(data.user.id, setup.user.id); assert.equal(data.rows.projects.length, 3); assert.ok(!JSON.stringify(data).includes('Independent-Test-Password')); assert.equal(data.rows.users[0].password, undefined);
  response = await f.request('/auth/setup', 'POST', { name: 'Second admin', email: 'second@example.test', password: 'Another-Test-Password' }); assert.equal(response.status, 409);
  response = await f.request('/auth/logout', 'POST', {}); assert.equal(response.status, 200); assert.equal((await f.request('/bootstrap')).status, 401);
  response = await f.request('/auth/login', 'POST', { email: 'ADMIN@example.test', password: 'Independent-Test-Password' }); assert.equal(response.status, 200); const cookie = response.headers.get('set-cookie')!; assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Strict/i);
});
test('unsafe origins and missing request headers cannot mutate even with a valid session', async t => {
  const f = await fixture(t); await f.setup(); const count = f.s.list('sites').length;
  let response = await f.request('/records/sites', 'POST', { name: 'Origin injection' }, { headers: { Origin: 'https://example.com' } }); assert.equal(response.status, 403);
  response = await f.request('/records/sites', 'POST', { name: 'Header injection' }, { headers: { 'X-Stelux-Request': '' } }); assert.equal(response.status, 403); assert.equal(f.s.list('sites').length, count);
});
test('read-only users can read and export but cannot write, run actions, or access administration', async t => {
  const f = await fixture(t); await f.setup(); let response = await f.request('/records/users', 'POST', { name: 'Viewer', email: 'viewer@example.test', profileId: 'profile-viewer', active: true, password: 'Viewer-Test-Password' }); assert.equal(response.status, 201);
  response = await f.request('/auth/login', 'POST', { email: 'viewer@example.test', password: 'Viewer-Test-Password' }); assert.equal(response.status, 200);
  response = await f.request('/bootstrap'); const data = await response.json(); assert.ok(data.rows.materials); assert.equal(data.rows.users, undefined); assert.equal(data.rows.profiles, undefined);
  assert.equal((await f.request('/records/sites', 'POST', { name: 'Denied site' })).status, 403);
  assert.equal((await f.request('/actions/rent', 'POST', {})).status, 403); assert.equal((await f.request('/records/users')).status, 403);
  assert.equal((await f.request('/actions/order-requirements','POST',{requirementIds:['requirement-2']})).status,403);
  response = await f.request('/export/materials?format=csv'); assert.equal(response.status, 200); assert.match(await response.text(), /Material number/);
});
test('transaction records cannot be altered through generic CRUD endpoints', async t => {
  const f = await fixture(t); await f.setup(); const order = f.s.list('orders')[0]; const before = f.s.get('orders', order.id);
  assert.equal((await f.request('/records/orders', 'POST', { number: 'FAKE' })).status, 405);
  assert.equal((await f.request(`/records/orders/${order.id}`, 'PUT', { status: 'Received', _version: order._version })).status, 405);
  assert.equal((await f.request(`/records/orders/${order.id}/archive`, 'POST', { _version: order._version })).status, 405); assert.deepEqual(f.s.get('orders', order.id), before);
  assert.equal((await f.request('/records/custom_materials','POST',{materialNo:'BYPASS',description:'Bypass',uom:'EA'})).status,405);
  assert.equal((await f.request('/records/material_locations','POST',{requirementId:'requirement-1'})).status,405);
  assert.equal((await f.request('/records/material_location_events','POST',{requirementId:'requirement-1'})).status,405);
  assert.equal((await f.request('/records/material_quantity_changes','POST',{requirementId:'requirement-1'})).status,405);
});
test('revision uploads save the drawing and current revision together and retain earlier files',async t=>{
 const f=await fixture(t);await f.setup();const content='%PDF-1.4\nFictional revision fixture\n%%EOF';
 async function upload(revNo:string,type='ISO'){const body=new FormData();for(const [key,value] of Object.entries({isoId:'iso-2',type,revNo,date:'2026-10-21',comment:`Drawing ${revNo}`}))body.set(key,value);body.set('file',new Blob([content],{type:'application/pdf'}),'sample-drawing.pdf');return f.request('/revisions','POST',body);}
 let response=await upload('HTTP-1');assert.equal(response.status,201);const first=(await response.json()).record;
 response=await upload('HTTP-2');assert.equal(response.status,201);const second=(await response.json()).record;
 assert.equal(f.s.get('isometrics','iso-2').revNo,'HTTP-2');assert.equal(second.previousRev,'HTTP-1');assert.equal(f.s.list('attachments').length,2);assert.equal(readdirSync(join(f.dir,'uploads')).length,2);
 for(const id of [first.id,second.id]){const file=f.s.list('attachments').find(r=>r.entityType==='revisions'&&r.entityId===id)!;response=await f.request(`/files/${file.id}`);assert.equal(response.status,200);assert.equal(await response.text(),content);}
 response=await upload('ITP-1','ITP');assert.equal(response.status,201);assert.equal(f.s.get('isometrics','iso-2').itpRevNo,'ITP-1');assert.equal(f.s.get('isometrics','iso-2').revNo,'HTTP-2');
});
test('rejected drawing uploads leave no revision, attachment, file or audit changes',async t=>{
 const f=await fixture(t);await f.setup();const iso=f.s.get('isometrics','iso-2'),before=JSON.stringify({iso,audit:f.s.activity(10000)});
 for(const [name,revNo] of [['rejected.exe','HTTP-NEW'],['sample.pdf',String(iso.revNo)]]){const body=new FormData();body.set('isoId',iso.id);body.set('type','ISO');body.set('revNo',revNo);body.set('file',new Blob(['Fictional file']),name);const response=await f.request('/revisions','POST',body);assert.ok([409,422].includes(response.status));}
 assert.equal(f.s.list('revisions').length,0);assert.equal(f.s.list('attachments').length,0);assert.equal(readdirSync(join(f.dir,'uploads')).length,0);assert.equal(JSON.stringify({iso:f.s.get('isometrics',iso.id),audit:f.s.activity(10000)}),before);
 await f.request('/records/users','POST',{name:'Revision Viewer',email:'revision-viewer@example.test',password:'Revision-Viewer-Only',profileId:'profile-viewer',active:true});await f.request('/auth/login','POST',{email:'revision-viewer@example.test',password:'Revision-Viewer-Only'});
 const body=new FormData();body.set('isoId',iso.id);body.set('type','ISO');body.set('revNo','DENIED');body.set('file',new Blob(['Fictional file']),'sample.pdf');assert.equal((await f.request('/revisions','POST',body)).status,403);assert.equal(readdirSync(join(f.dir,'uploads')).length,0);
 assert.equal((await f.request('/actions/remove-material-quantity','POST',{})).status,403);
});
test('quantity-removal API checks revision scope and versions and keeps ordinary edits in the same log',async t=>{
 const f=await fixture(t);await f.setup();const requirement=f.s.get('iso_materials','requirement-2');
 const revision=(await (await f.request('/actions/revision','POST',{isoId:'iso-2',type:'ISO',revNo:'HTTP-Q1'})).json()).record;
 let response=await f.request('/actions/remove-material-quantity','POST',{requirementId:requirement.id,revisionId:revision.id,quantity:1.25,expectedVersion:requirement._version});assert.equal(response.status,201);
 const changed=(await response.json()).record;assert.equal(changed.quantity,2.75);
 assert.equal((await f.request('/actions/remove-material-quantity','POST',{requirementId:requirement.id,revisionId:revision.id,quantity:1,expectedVersion:requirement._version})).status,409);
 assert.equal((await f.request(`/records/iso_materials/${requirement.id}`,'PUT',{quantity:3.5,_version:changed._version})).status,200);
 const log=(await (await f.request('/records/material_quantity_changes')).json()).rows.sort((a:Row,b:Row)=>Number(a.sequence)-Number(b.sequence));assert.deepEqual(log.map((r:Row)=>[r.type,r.quantity,r.newQuantity]),[['Revision removal',-1.25,2.75],['Edit',0.75,3.5]]);
 assert.match(await (await f.request('/export/material_quantity_changes?format=csv')).text(),/HTTP-Q1/);
});
test('material logistics API preserves scoped links, exposes history, and rejects viewer mutations',async t=>{
 const f=await fixture(t);await f.setup();
 const laydownResponse=await f.request('/records/material_laydowns','POST',{name:'HTTP sample rack'});assert.equal(laydownResponse.status,201);const laydown=(await laydownResponse.json()).record;
 const requirement=f.s.list('iso_materials')[0];
 assert.equal((await f.request('/actions/move-materials','POST',{requirementIds:[requirement.id],laydownId:laydown.id})).status,201);
 const response=await f.request('/actions/service-materials','POST',{requirementIds:[requirement.id],companyId:'service-coating',name:'HTTP sample batch'});assert.equal(response.status,201);const request=(await response.json()).records[0];
 assert.equal((await f.request('/actions/complete-material-service','POST',{requestIds:[request.id]})).status,201);
 const data=await (await f.request('/bootstrap')).json();assert.equal(data.rows.material_locations.length,1);assert.equal(data.rows.material_location_events.length,3);assert.equal(data.rows.material_locations[0].laydownId,laydown.id);
 assert.equal(f.s.get('service_requests',request.id).status,'Completed');
 assert.match(await (await f.request('/export/material_location_events?format=csv')).text(),/Service completed/);
 await f.request('/records/users','POST',{name:'Logistics Viewer',email:'logistics-viewer@example.test',password:'Logistics-Viewer-Only',profileId:'profile-viewer',active:true});
 assert.equal((await f.request('/auth/login','POST',{email:'logistics-viewer@example.test',password:'Logistics-Viewer-Only'})).status,200);
 assert.equal((await f.request('/records/material_location_events')).status,200);
 assert.equal((await f.request('/actions/move-materials','POST',{requirementIds:[requirement.id],laydownId:laydown.id})).status,403);
 assert.equal((await f.request('/actions/service-materials','POST',{})).status,403);
 assert.equal((await f.request('/actions/complete-material-service','POST',{})).status,403);
});
test('stale HTTP edits and bulk update conflicts leave records consistent', async t => {
  const f = await fixture(t); await f.setup(); const a = f.s.get('projects', 'project-cooling'); const b = f.s.get('projects', 'project-steam');
  let response = await f.request(`/records/projects/${b.id}`, 'PUT', { _version: b._version, contact: 'New contact' }); assert.equal(response.status, 200);
  response = await f.request('/bulk/projects', 'POST', { ids: [a.id, b.id], changes: { status: 'On hold' }, versions: { [a.id]: a._version, [b.id]: b._version } }); assert.equal(response.status, 409); assert.equal(f.s.get('projects', a.id).status, 'Active');
  response = await f.request(`/records/projects/${a.id}`, 'PUT', { contact: 'Without a version' }); assert.equal(response.status, 422);
});
test('an administrator cannot remove the last administrator through user or profile changes', async t => {
  const f = await fixture(t); const setup = await f.setup(); const admin = f.s.get('users', setup.user.id); const profile = f.s.get('profiles', 'profile-admin');
  assert.equal((await f.request(`/records/users/${admin.id}`, 'PUT', { _version: admin._version, active: false })).status, 409); assert.equal(f.s.get('users', admin.id).active, true);
  assert.equal((await f.request(`/records/profiles/${profile.id}`, 'PUT', { _version: profile._version, settingsPermission: 'No access' })).status, 409); assert.equal(f.s.get('profiles', profile.id).settingsPermission, 'Administration');
});
test('CSV preview is non-mutating and detects duplicates within the uploaded batch', async t => {
  const f = await fixture(t); await f.setup(); const count = f.s.list('sites').length; const auditCount = f.s.activity(10000).length;
  const body = new FormData(); body.set('file', new Blob(['Site name,City\nImport site,Delft\nImport site,Breda\n'], { type: 'text/csv' }), 'sites.csv');
  const response = await f.request('/import/sites/preview', 'POST', body); assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.count, 2); assert.equal(result.errors.length, 1); assert.equal(result.errors[0].row, 3); assert.equal(f.s.list('sites').length, count); assert.equal(f.s.activity(10000).length, auditCount);
});
test('CSV import commits atomically and rejects a batch with an invalid later row', async t => {
  const f = await fixture(t); await f.setup(); const count = f.s.list('sites').length;
  let response = await f.request('/import/sites', 'POST', { rows: [{ name: 'Valid first site' }, { name: '' }] }); assert.equal(response.status, 422); assert.equal(f.s.list('sites').length, count);
  response = await f.request('/import/sites', 'POST', { rows: [{ name: 'Imported site', residence: 'Delft' }] }); assert.equal(response.status, 201); assert.equal(f.s.list('sites').length, count + 1);
});
test('CSV and XLSX exports respect selected IDs and CSV escapes spreadsheet formulas', async t => {
  const f = await fixture(t); await f.setup(); const site = f.s.create('sites', { name: '=HYPERLINK("https://example.com")' });
  let response = await f.request(`/export/sites?format=csv&ids=${site.id}`); const csv = await response.text(); assert.equal(response.status, 200); assert.ok(csv.includes("'=HYPERLINK")); assert.ok(!csv.includes('North fabrication yard'));
  response = await f.request('/export/materials?format=xlsx&ids=material-1'); const buffer = Buffer.from(await response.arrayBuffer()); assert.equal(response.status, 200); assert.equal(buffer.subarray(0, 2).toString(), 'PK'); assert.match(response.headers.get('content-disposition')!, /\.xlsx/);
});
test('document upload links to its record, downloads intact, and cleans up rejected files', async t => {
  const f = await fixture(t); await f.setup(); const form = new FormData(); form.set('file', new Blob(['Stelux sample document'], {type:'text/plain'}), 'sample.txt'); form.set('entityType', 'projects'); form.set('entityId', 'project-cooling');
  let response = await f.request('/files', 'POST', form); assert.equal(response.status, 201); const {record} = await response.json() as {record: Row};
  response = await f.request(`/files/${record.id}`); assert.equal(response.status, 200); assert.equal(await response.text(), 'Stelux sample document'); assert.match(response.headers.get('content-disposition')!, /attachment/);
  const fileCount = readdirSync(join(f.dir, 'uploads')).length; const invalid = new FormData(); invalid.set('file', new Blob(['<script>bad</script>']), 'test.html'); invalid.set('entityType', 'projects'); invalid.set('entityId', 'project-cooling');
  response = await f.request('/files', 'POST', invalid); assert.equal(response.status, 422); assert.equal(readdirSync(join(f.dir, 'uploads')).length, fileCount);
});
test('module restrictions also protect document metadata and downloads', async t => {
  const f = await fixture(t); await f.setup(); const form = new FormData(); form.set('file', new Blob(['Weld-only document']), 'quality.txt'); form.set('entityType', 'welds'); form.set('entityId', 'weld-1'); let response = await f.request('/files', 'POST', form); const attachment = (await response.json()).record;
  const profile = f.s.create('profiles', { name: 'Tools only', generalPermission: 'Read only', materialsPermission: 'No access', weldingPermission: 'No access', toolsPermission: 'Read & write', settingsPermission: 'No access' });
  await f.request('/records/users', 'POST', { name: 'Tool operator', email: 'tools@example.test', profileId: profile.id, active: true, password: 'Tools-Test-Password' }); await f.request('/auth/login', 'POST', { email: 'tools@example.test', password: 'Tools-Test-Password' });
  const data = await (await f.request('/bootstrap')).json(); assert.equal(data.rows.welds, undefined); assert.ok(!data.rows.attachments.some((r: Row) => r.id === attachment.id)); assert.equal((await f.request(`/files/${attachment.id}`)).status, 403);
  response = await f.request('/export/attachments?format=csv'); assert.ok(!(await response.text()).includes('quality.txt'));
});
test('report downloads require authentication and respect project, search and module permissions',async t=>{
  const f=await fixture(t);assert.equal((await f.request('/reports/wdi')).status,401);await f.setup();
  const response=await f.request('/reports/wdi?projectId=project-cooling&q=W001');assert.equal(response.status,200);assert.match(response.headers.get('content-disposition')!,/blitzkrieg-wdi.*csv/);const csv=await response.text();assert.ok(csv.includes('W001'));assert.ok(!csv.includes('W002'));assert.ok(!csv.includes('STX-2402'));assert.equal((await f.request('/reports/unknown')).status,404);
  const profile=f.s.create('profiles',{name:'Report tools only',generalPermission:'Read only',materialsPermission:'No access',weldingPermission:'No access',toolsPermission:'Read only',settingsPermission:'No access'});
  await f.request('/records/users','POST',{name:'Report reader',email:'report-reader@example.test',profileId:profile.id,active:true,password:'Reports-Test-Password'});await f.request('/auth/login','POST',{email:'report-reader@example.test',password:'Reports-Test-Password'});
  assert.equal((await f.request('/reports/wdi')).status,403);assert.equal((await f.request('/reports/mto')).status,403);assert.equal((await f.request('/reports/rentals')).status,200);
});
test('record history pages retain older events and enforce resource permissions',async t=>{
  const f=await fixture(t);await f.setup();const actor={id:'test',name:'History test'};
  for(let i=0;i<56;i++)f.s.audit('projects','project-cooling','test',`History event ${i}`,actor);
  for(let i=0;i<110;i++)f.s.audit('projects','project-steam','test',`Unrelated event ${i}`,actor);
  const first=await(await f.request('/history/projects/project-cooling')).json();assert.equal(first.events.length,50);assert.equal(first.events[0].summary,'History event 55');assert.ok(first.nextCursor);
  const older=await(await f.request(`/history/projects/project-cooling?before=${first.nextCursor}`)).json();assert.equal(older.events[0].summary,'History event 5');assert.equal(older.nextCursor,null);assert.ok(!older.events.some((e:{summary:string})=>e.summary.startsWith('Unrelated')));assert.equal(new Set([...first.events,...older.events].map(e=>e.id)).size,first.events.length+older.events.length);
  assert.equal((await f.request('/history/projects/project-cooling?before=invalid')).status,422);assert.equal((await f.request('/history/projects/missing')).status,404);
  const profile=f.s.create('profiles',{name:'No welding history',generalPermission:'Read only',materialsPermission:'No access',weldingPermission:'No access',toolsPermission:'Read only',settingsPermission:'No access'});
  await f.request('/records/users','POST',{name:'History reader',email:'history@example.test',profileId:profile.id,active:true,password:'History-Test-Password'});await f.request('/auth/login','POST',{email:'history@example.test',password:'History-Test-Password'});
  assert.equal((await f.request('/history/welds/weld-1')).status,403);assert.equal((await f.request('/history/projects/project-cooling')).status,200);
});
test('WPS HTTP saves and CSV imports preserve multi-PQR, project and site links atomically',async t=>{
  const f=await fixture(t);await f.setup();const pqr=f.s.create('pqr',{name:'PQR-HTTP-SECOND'});
  let response=await f.request('/records/wps','POST',{name:'HTTP-WPS',method:'141',definition:'Sample scope',allProjects:false,pqrIds:['pqr-1',pqr.id],projectIds:['project-cooling'],siteIds:['site-north']});assert.equal(response.status,201);const record=(await response.json()).record;
  assert.equal(f.s.list('wps_pqr').filter(r=>r.wpsId===record.id).length,2);
  response=await f.request(`/records/wps/${record.id}`,'PUT',{_version:record._version,pqrIds:[pqr.id],siteIds:['missing']});assert.equal(response.status,404);assert.equal(f.s.get('wps',record.id)._version,record._version);assert.equal(f.s.list('wps_pqr').filter(r=>r.wpsId===record.id).length,2);
  response=await f.request(`/export/wps?ids=${record.id}`);const csv=await response.text();assert.ok(csv.includes('Procedure qualifications (PQRs)'));assert.ok(csv.includes('PQR-HTTP-SECOND'));assert.ok(csv.includes('North fabrication yard'));assert.ok(!csv.includes('Primary PQR'));
  const form=new FormData();form.set('file',new Blob([csv.replace('HTTP-WPS','CSV-WPS')],{type:'text/csv'}),'wps.csv');const before=f.s.list('wps_pqr').length;
  response=await f.request('/import/wps/preview','POST',form);assert.equal(response.status,200);const preview=await response.json();assert.equal(preview.errors.length,0);assert.equal(f.s.list('wps_pqr').length,before);
  response=await f.request('/import/wps','POST',{rows:preview.rows});assert.equal(response.status,201);const imported=f.s.list('wps').find(r=>r.name==='CSV-WPS')!;assert.ok(imported);assert.equal(f.s.list('wps_pqr').filter(r=>r.wpsId===imported.id).length,2);assert.equal(f.s.list('wps_sites').find(r=>r.wpsId===imported.id)!.siteId,'site-north');
});
test('PQR CSV preview creates no persistent values and resolves identical labels by attribute category',async t=>{
  const f=await fixture(t);await f.setup();f.s.create('qualification_options',{category:'Impact Test',name:'Yes'});const count=f.s.list('qualification_options').length;
  const body=new FormData();body.set('file',new Blob(['Certificate number,Hardness Test,Standard\nCSV-PQR,Yes,Sample Standard\n'],{type:'text/csv'}),'pqr.csv');let response=await f.request('/import/pqr/preview','POST',body);assert.equal(response.status,200);const preview=await response.json();assert.equal(preview.errors.length,0);assert.equal(f.s.list('qualification_options').length,count);
  response=await f.request('/import/pqr','POST',{rows:preview.rows});assert.equal(response.status,201);const pqr=f.s.list('pqr').find(r=>r.name==='CSV-PQR')!;assert.equal(f.s.get('qualification_options',pqr.attribute23Id).category,'Hardness Test');assert.equal(f.s.get('qualification_options',pqr.attribute25Id).name,'Sample Standard');
});
test('welding-only exports do not reveal project-site names from a restricted module',async t=>{
  const f=await fixture(t);await f.setup();const profile=f.s.create('profiles',{name:'Welding without shared data',generalPermission:'No access',materialsPermission:'No access',weldingPermission:'Read only',toolsPermission:'No access',settingsPermission:'No access'});
  await f.request('/records/users','POST',{name:'Welding reader',email:'welding-reader@example.test',profileId:profile.id,active:true,password:'Welding-Test-Password'});await f.request('/auth/login','POST',{email:'welding-reader@example.test',password:'Welding-Test-Password'});
  const csv=await(await f.request('/export/wps')).text();assert.ok(!csv.includes('North fabrication yard'));assert.ok(!csv.includes('Riverside installation'));assert.ok(csv.includes('Unavailable record'));
});
