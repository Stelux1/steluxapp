import { Store, SYSTEM } from './store.ts';
import { runAction } from './workflows.ts';

export function seed(store: Store) {
  if (store.db.prepare("SELECT value FROM metadata WHERE key='seed_version'").get()) return;
  store.transaction(() => {
    const add = (key: string, id: string, data: Record<string, unknown>) => store.create(key, data, SYSTEM, id);
    const action = (key: string, data: Record<string, unknown>) => runAction(store, key, data, SYSTEM);
    add('profiles', 'profile-admin', { name: 'Administrator', generalPermission: 'Administration', materialsPermission: 'Administration', weldingPermission: 'Administration', toolsPermission: 'Administration', settingsPermission: 'Administration' });
    add('profiles', 'profile-operator', { name: 'Project operator', generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write', toolsPermission: 'Read & write', settingsPermission: 'No access' });
    add('profiles', 'profile-viewer', { name: 'Viewer', generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'Read only', toolsPermission: 'Read only', settingsPermission: 'No access' });
    add('sites', 'site-north', { name: 'North fabrication yard', address: '18 Foundry Road', residence: 'Rotterdam', zip: '3089', email: 'north@example.com' });
    add('sites', 'site-river', { name: 'Riverside installation', address: '42 Harbour Lane', residence: 'Antwerp', zip: '2000' });
    add('companies', 'company-stelux', { name: 'Stelux Engineering', residence: 'Belgrade', email: 'projects@example.com' });
    add('companies', 'company-north', { name: 'Northline Process', residence: 'Rotterdam', email: 'office@example.com' });
    add('warehouses', 'warehouse-main', { name: 'Main warehouse', siteId: 'site-north', companyId: 'company-stelux', use: 'Both', residence: 'Rotterdam' });
    add('warehouses', 'warehouse-field', { name: 'Field stores', siteId: 'site-river', companyId: 'company-stelux', use: 'Both', residence: 'Antwerp' });
    add('suppliers', 'supplier-steel', { name: 'Atlas Steel Supply', residence: 'Breda', email: 'orders@example.com' });
    add('suppliers', 'supplier-pipe', { name: 'Meridian Piping', residence: 'Delft', email: 'supply@example.com' });
    add('service_companies', 'service-coating', { name: 'Precision Surface Works', residence: 'Rotterdam' });
    add('laydowns', 'laydown-a', { name: 'Laydown A — Prefab', siteId: 'site-north' });
    add('laydowns', 'laydown-b', { name: 'Laydown B — Field', siteId: 'site-river' });
    ['Pipe', 'Elbow 90', 'Flange', 'Tee', 'Reducer', 'Valve', 'Cap'].forEach((name, i) => add('material_parts', `part-${i}`, { name }));
    ['Carbon steel', 'Stainless steel', 'Alloy steel'].forEach((name, i) => add('material_types', `material-type-${i}`, { name }));
    ['EA', 'M', 'KG', 'SET'].forEach(name => add('uoms', `uom-${name}`, { name, symbol: name }));
    ['Shop', 'Field', 'Hydrotest field'].forEach((name, i) => add('operation_phases', `phase-${i}`, { name, sort: i + 1 }));
    const projects = [
      { id: 'project-cooling', internnumber: 'STX-2401', externnumber: 'NLP-CW-04', description: 'Cooling water expansion', siteId: 'site-north', companyId: 'company-north', contact: 'Alex Morgan', authority: 'Project manager', startdate: '2026-09-01', enddate: '2026-11-28', status: 'Active' },
      { id: 'project-steam', internnumber: 'STX-2402', externnumber: 'RIV-ST-02', description: 'Riverside steam network', siteId: 'site-river', companyId: 'company-stelux', contact: 'Sam Rivers', startdate: '2026-09-14', enddate: '2026-12-18', status: 'Active' },
      { id: 'project-skid', internnumber: 'STX-2403', externnumber: 'NLP-SK-01', description: 'Process skid fabrication', siteId: 'site-north', companyId: 'company-north', contact: 'Jamie Ellis', startdate: '2026-08-10', enddate: '2026-10-30', status: 'Active' }
    ];
    projects.forEach(p => { const { id, ...data } = p; add('projects', id, { ...data, amounthours: 8, workingdays: 60 }); });
    add('test_systems', 'test-cw', { name: 'CW-01', projectId: 'project-cooling', medium: 'Water', pressure: '15 bar' });
    add('field_packages', 'fwp-1', { name: 'Cooling loop — Area 1', number: 'FWP-001', projectId: 'project-cooling' });
    for (let i = 1; i <= 9; i++) add('isometrics', `iso-${i}`, { isoNo: `STX-${i <= 3 ? 'CW' : i <= 6 ? 'ST' : 'SK'}-${String(i).padStart(3, '0')}`, projectId: projects[Math.floor((i - 1) / 3)].id, revNo: i <= 3 ? '2' : '0', irn: `IRN-${100 + i}`, pipingClass: i <= 3 ? 'CS150' : 'SS300', material: i <= 3 ? 'A106 Gr B' : 'A312 TP316L', itpNo: `ITP-0${Math.ceil(i / 3)}`, priority: i === 2 ? 'High' : 'Normal', date: '2026-09-18', prefab_materials: i >= 7, prefab_welds: i >= 8, prefab_doc: i === 9, prep_finished: i >= 4, paintSpec: 'PS-02' });
    const mats = [['CS-P060', 'Seamless carbon steel pipe', 'Pipe', '2', 'SCH 40', 'M', 28.4], ['CS-E090', '90° long radius elbow', 'Elbow', '2', 'SCH 40', 'EA', 18.6], ['CS-F150', 'Weld neck flange, class 150', 'Flange', '2', '150', 'EA', 42.5], ['SS-P114', 'Stainless steel pipe 316L', 'Pipe', '4', 'SCH 10S', 'M', 82], ['SS-T114', 'Equal tee, stainless steel 316L', 'Tee', '4', 'SCH 10S', 'EA', 118], ['CS-V060', 'Gate valve, flanged ends', 'Valve', '2', '150', 'EA', 156], ['SS-E114', '90° elbow, stainless steel 316L', 'Elbow', '4', 'SCH 10S', 'EA', 56], ['CS-B020', 'Stud bolt and two hex nuts', 'Bolt', '3/4', 'B7 / 2H', 'SET', 6.8]];
    mats.forEach(([materialNo, description, materialGroup, dia, lbs, uom, price], i) => add('materials', `material-${i + 1}`, { materialNo, description, materialGroup, dia, lbs, uom, price, articleNo: `ART-${1001 + i}`, typeId: i >= 3 && i <= 4 ? 'material-type-1' : 'material-type-0' }));
    for (let i = 1; i <= 9; i++) {
      add('spools', `spool-${i}`, { name: `SP-${String(i).padStart(3, '0')}`, isoId: `iso-${i}`, diameter: i < 4 ? '2' : '4', paintSpec: 'PS-02', laydownId: i < 7 ? 'laydown-a' : 'laydown-b' });
      add('iso_materials', `requirement-${i}`, { isoId: `iso-${i}`, materialId: `material-${(i - 1) % 8 + 1}`, quantity: i % 2 ? 12 : 4, phaseId: 'phase-0' });
    }
    add('roles', 'role-welder', { name: 'Welder' });
    for (let i = 1; i <= 4; i++) add('welders', `welder-${i}`, { name: ['Alex Taylor', 'Robin Lane', 'Casey Brooks', 'Jordan Reed'][i - 1], number: `W-${String(i).padStart(3, '0')}`, companyId: 'company-stelux', roleId: 'role-welder', status: 'Active',globallyDeployable:true });
    ['141 — TIG', '111 — MMA', '135 — MAG', '136 — FCAW'].forEach((name, i) => add('weld_processes', `process-${i}`, { name, code: name.slice(0, 3) }));
    ['Butt Weld - Field', 'Butt Weld - Shop', 'Branch welds - Field', 'Branch welds - Shop', 'Socket welds - Shop', 'Socket welds - Field', 'Fillet Weld - Shop', 'Fillet Weld - Field', 'Longitudinal Welds - Shop', 'Longitudinal Welds - Field', 'HOOK-UP', 'Victaulic Joint - Shop', 'Victaulic Joint - Field', 'Reinforcement Pad GW - Shop', 'Reinforcement Pad GW - Field', 'Reinforcement Pad FW - Shop', 'Reinforcement Pad FW - Field'].forEach((name, i) => add('weld_types', `weld-type-${i}`, { name, location: name.includes('Field') ? 'Field' : 'Shop', sort: i + 1 }));
    add('coatings', 'coating-none', { name: 'UNCOATED' });
    [['1/2"', 21.3, 0.5, 66.9], ['3/4"', 26.7, 0.75, 83.8], ['1"', 33.4, 1, 104.9], ['1.1/4"', 42.2, 1.25, 132.5], ['1.1/2"', 48.3, 1.5, 151.7], ['2"', 60.3, 2, 189.3], ['2.1/2"', 73, 2.5, 229.2], ['3"', 88.9, 3, 279.1], ['4"', 114.3, 4, 358.9], ['6"', 168.3, 6, 528.5], ['8"', 219.1, 8, 688]].forEach(([diameter, size, sizeinch, outline], i) => add('diameters', `diameter-${i + 1}`, { diameter, size, sizeinch, outline, sorting: i + 1 }));
    add('pqr', 'pqr-1', { name: 'STX-PQR-001', standard: 'ISO 15614-1', processId: 'process-0' });
    add('wps', 'wps-1', { name: 'STX-WPS-141-01', method: '141', definition:'Sample procedure — see the attached specification',jointType:'BW',allProjects:true,siteIds:['site-north','site-river'], processId: 'process-0', pqrId: 'pqr-1', standard: 'ISO 15609-1' });
    add('welding_wires', 'wire-1', { name: 'WIRE-316L-01', classification: 'ER316L', diameter: 2.4, manufacturer: 'Sample Filler Co.', chargeNo: 'H-1042' });
    add('ndt_groups', 'ndt-vol', { name: 'Volumetric examination' });
    ['RT', 'UT', 'PT', 'MT', 'VT'].forEach((name, i) => add('ndt_processes', `ndt-${i}`, { name, groupId: 'ndt-vol' }));
    add('ndt_locations', 'ndt-shop', { name: 'Fabrication shop' });
    add('pwht_processes', 'pwht-1', { name: 'Controlled post-weld heat treatment' });
    add('pwht_locations', 'pwht-shop', { name: 'Heat treatment bay' });
    add('qa_engineers', 'qa-1', { name: 'Morgan Lee', companyId: 'company-stelux', email: 'quality@example.com' });
    ['Isometric drawing', 'ITP', 'NDT report', 'Material certificate', 'Signed release'].forEach((name, i) => add('attachment_names', `attachment-type-${i}`, { name }));
    for (let i = 1; i <= 30; i++) add('welds', `weld-${i}`, { weldNo: `W${String(i).padStart(3, '0')}`, isoId: `iso-${(i - 1) % 9 + 1}`, spoolId: `spool-${(i - 1) % 9 + 1}`, typeId: `weld-type-${i % 4}`, welder1Id: `welder-${i % 4 + 1}`, wpsId: 'wps-1', diameterId: i % 2 ? 'diameter-6' : 'diameter-9', lengthMode: 'Diameter', date: i < 25 ? `2026-10-${String(Math.min(21, i)).padStart(2, '0')}` : '', datefit: '2026-10-01', ndoReq: true, wire1Id: 'wire-1', chargeNo1: 'H-1042', coating1Id: 'coating-none' });
    for (let i = 1; i <= 18; i++) {
      const result = action('inspection-request', { weldIds: [`weld-${i}`], type: 'NDT', processId: 'ndt-0', locationId: 'ndt-shop', date: '2026-10-19' });
      const request = 'records' in result ? result.records?.[0] : undefined;
      if (i <= 14 && request) action('inspection-result', { requestId: request.id, reportNo: `RT-2026-${String(i).padStart(3, '0')}`, result: i === 5 || i === 11 ? 'Rejected' : 'Accepted', round: 'Initial', date: '2026-10-20' });
    }
    action('repair', { weldId: 'weld-5', date: '2026-10-21', note: 'Sample repair record — repeat examination pending.' });
    add('punchlists', 'punch-1', { name: 'Confirm support tag on cooling line', isoId: 'iso-2', category: 'B', status: 'Open', assignedTo: 'Site team', dueDate: '2026-10-27' });
    action('release', { isoIds: ['iso-9'], type: 'Prefab', reportNo: 'PFR-001', engineerId: 'qa-1', date: '2026-10-20' });
    for (let i = 1; i <= 8; i++) action('adjust-material', { materialId: `material-${i}`, warehouseId: 'warehouse-main', chargeNo: 'H-1042', quantity: i === 3 ? 3 : 20 + i * 8, date: '2026-10-01', note: 'Sample opening balance' });
    const po = action('order', { supplierId: 'supplier-steel', projectId: 'project-cooling', date: '2026-10-16', items: [{ materialId: 'material-1', quantity: 60 }, { materialId: 'material-3', quantity: 24 }] });
    if ('record' in po && po.record) { const line = store.list('order_lines').find(l => l.orderId === po.record?.id)!; action('receive', { orderId: po.record.id, warehouseId: 'warehouse-main', date: '2026-10-20', items: [{ lineId: line.id, quantity: 12, chargeNo: 'H-1043' }] }); }
    action('order', { supplierId: 'supplier-pipe', projectId: 'project-steam', date: '2026-10-19', items: [{ materialId: 'material-4', quantity: 42 }, { materialId: 'material-5', quantity: 16 }] });
    action('issue-material', { isoId: 'iso-7', materialId: 'material-7', warehouseId: 'warehouse-main', chargeNo: 'H-1042', quantity: 8, date: '2026-10-18' });
    action('service', { spoolIds: ['spool-4'], companyId: 'service-coating', services: 'Surface preparation and coating', laydownId: 'laydown-b', date: '2026-10-20' });
    const tools = [['TIG welding set', true, 2], ['Angle grinder 125 mm', true, 3], ['Digital torque wrench', true, 2], ['Pipe alignment clamp', true, 4], ['Welding helmet', true, 4], ['Grinding discs, pack of 10', false, 5], ['Safety gloves, pair', false, 10], ['Hydraulic test pump', true, 1]];
    tools.forEach(([title, returnable, minimal], i) => { add('articles', `article-${i + 1}`, { title, barcode: `STX-T${String(i + 1).padStart(4, '0')}`, returnable, minimal }); action('adjust-tool', { articleId: `article-${i + 1}`, warehouseId: 'warehouse-main', quantity: i === 2 ? 2 : 12 + i * 2, date: '2026-10-01', note: 'Sample opening balance' }); });
    ['Alex Taylor', 'Robin Lane', 'Casey Brooks', 'Jordan Reed'].forEach((name, i) => add('clients', `client-${i + 1}`, { barcode: `C-${1001 + i}`, name, companyId: 'company-stelux', warehouseId: 'warehouse-main' }));
    for (let i = 1; i <= 5; i++) action('rent', { articleId: `article-${i}`, warehouseId: 'warehouse-main', clientId: `client-${i % 4 + 1}`, quantity: i === 3 ? 1 : 2, date: '2026-10-18', dueDate: i === 2 ? '2026-10-20' : '2026-10-28' });
    action('rent', { articleId: 'article-6', warehouseId: 'warehouse-main', clientId: 'client-1', quantity: 3, date: '2026-10-19' });
    store.db.prepare('DELETE FROM audit').run();
    store.audit('projects', 'project-cooling', 'created', 'Cooling water expansion added to the workspace', SYSTEM);
    store.audit('orders', '', 'received', 'Partial delivery recorded from Atlas Steel Supply', SYSTEM);
    store.audit('inspection_results', '', 'inspected', '14 NDT results recorded · 2 require follow-up', SYSTEM);
    store.audit('rentals', '', 'rented', 'Tools issued to the fabrication team', SYSTEM);
    store.db.prepare("INSERT INTO metadata(key,value) VALUES ('seed_version','1')").run();
  });
}
