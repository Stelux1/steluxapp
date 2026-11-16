import { Store, SYSTEM } from './store.ts';
import { runAction } from './workflows.ts';
import { seedWeldCatalogs } from './weld-catalogs-seed.ts';

export function seed(store: Store) {
  if (store.db.prepare("SELECT value FROM metadata WHERE key='seed_version'").get()) return;
  store.transaction(() => {
    const add = (key: string, id: string, data: Record<string, unknown>) => store.create(key, data, SYSTEM, id);
    const action = (key: string, data: Record<string, unknown>) => runAction(store, key, data, SYSTEM);
    add('profiles', 'profile-admin', { name: 'Administrator', generalPermission: 'Administration', materialsPermission: 'Administration', weldingPermission: 'Administration', toolsPermission: 'Administration', settingsPermission: 'Administration' });
    add('profiles', 'profile-operator', { name: 'Project operator', generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write', toolsPermission: 'Read & write', settingsPermission: 'No access' });
    add('profiles', 'profile-viewer', { name: 'Viewer', generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'Read only', toolsPermission: 'Read only', settingsPermission: 'No access' });
    add('sites', 'site-north', { name: 'North fabrication yard', address: '18 Foundry Road', residence: 'Rotterdam', zip: '3089', phone: '+31 10 555 0142', email: 'north@example.com',
      mandatoryFields: true, flangeStandard: 'ASME B16.5 torque table (2012)', wpsValidation: true, projectCertificates: true, materialDisplay: 'Materials added to isometrics', defectNorm: 'ISO 6520-1', repairLimit: 4, ndtMeasurement: 'Inch-weighted', irnCode: 'NFY-IRN',
      prefix: 'NFY', releaseDocDrawing: 'Drawing no + iso', hydrotestPlan: 'HEP-NFY-001 rev 2', flangeProcedureNo: 'FP-2026-03', signSubQaqc: 'QA/QC Manager', signSubConstruction: 'Construction Manager', signPrincipalUi: 'Principal inspector', signContractorQaqc: 'Contractor QA/QC lead', signContractorConstruction: 'Contractor site manager', signNobo: 'Notified body inspector',
      vtDocNo: 'VT-NFY-01 rev B', vtProcedureNo: 'PR-VT-004', vtType2No: 'VT2-118', vtType2Rev: 'A', vtType2Date: '2026-06-15', vtType2OrderNo: 'PO-44017', lislField1: 'Fabrication package', lislField2: 'Welding coordinator', lislField3: 'Cooling water', lislDocNo: 'LISL-NFY-01 rev C', lislProcedureNo: 'PR-LISL-002',
      weightShop: 38, weightField: 54, weightSite: 8, shopWelds: 40, shopNdt: 15, shopMaterialPipe: 25, shopSupports: 10, shopAppendages: 10,
      fieldMaterialPipe: 20, fieldWelds: 35, fieldNdt: 15, fieldSupports: 10, fieldAppendages: 10, fieldPunch: 10, siteHydrotest: 40, sitePaintTracing: 60 });
    add('sites', 'site-river', { name: 'Riverside installation', address: '42 Harbour Lane', residence: 'Antwerp', zip: '2000' });
    add('companies', 'company-stelux', { name: 'Stelux Engineering', address: '12 Knez Mihailova', zip: '11000', residence: 'Belgrade', phone: '+381 11 555 0100', email: 'projects@example.com' });
    add('companies', 'company-north', { name: 'Northline Process', address: '7 Maasboulevard', zip: '3063', residence: 'Rotterdam', phone: '+31 10 555 0150', email: 'office@example.com' });
    add('warehouses', 'warehouse-main', { name: 'Main warehouse', siteId: 'site-north', companyId: 'company-stelux', use: 'Both', residence: 'Rotterdam' });
    add('warehouses', 'warehouse-field', { name: 'Field stores', siteId: 'site-river', companyId: 'company-stelux', use: 'Both', residence: 'Antwerp' });
    add('suppliers', 'supplier-steel', { name: 'Atlas Steel Supply', residence: 'Breda', email: 'orders@example.com' });
    add('suppliers', 'supplier-pipe', { name: 'Meridian Piping', residence: 'Delft', email: 'supply@example.com' });
    add('service_companies', 'service-coating', { name: 'Precision Surface Works', residence: 'Rotterdam' });
    add('laydowns', 'laydown-a', { name: 'Laydown A — Prefab', siteId: 'site-north' });
    add('laydowns', 'laydown-b', { name: 'Laydown B — Field', siteId: 'site-river' });
    ['Pipe', 'Elbow 90', 'Flange', 'Tee', 'Reducer', 'Valve', 'Cap'].forEach((name, i) => add('material_parts', `part-${i}`, { name }));
    add('material_parts', 'part-custom', { name: 'Customer spool piece', custom: true });
    ['Carbon steel', 'Stainless steel', 'Alloy steel'].forEach((name, i) => add('material_types', `material-type-${i}`, { name, typeOfSteel: name }));
    [['a106b', 'A106 Gr B', 'Carbon steel', 'Seamless carbon steel pipe for high-temperature service', 'C-Si', '1.1', 'P-1', '1'], ['a312-316l', 'A312 TP316L', 'Stainless steel', 'Seamless austenitic stainless steel pipe', 'Cr-Ni-Mo', '8.1', 'P-8', '1'], ['a335-p11', 'A335 P11', 'Alloy steel', 'Seamless ferritic alloy steel pipe for high-temperature service', 'Cr-Mo', '5.1', 'P-4', '1']].forEach(([id, name, typeOfSteel, materialDescription, basicMaterial, iso15608, asmePNumber, asmeGroup]) => add('material_types', `material-type-${id}`, { name, typeOfSteel, materialDescription, basicMaterial, materialGroup: typeOfSteel, iso15608, asmePNumber, asmeGroup, isoAsme: `${iso15608} / ${asmePNumber} Gr ${asmeGroup}` }));
    ['EA', 'M', 'KG', 'SET'].forEach(name => add('uoms', `uom-${name}`, { name, symbol: name }));
    ['Shop', 'Field', 'Hydrotest field'].forEach((name, i) => add('operation_phases', `phase-${i}`, { name, sort: i + 1 }));
    const projects = [
      { id: 'project-cooling', internnumber: 'STX-2401', externnumber: 'NLP-CW-04', description: 'Cooling water expansion', siteId: 'site-north', companyId: 'company-north', contact: 'Alex Morgan', authority: 'Project manager', startdate: '2026-09-01', enddate: '2026-11-28', status: 'Active' },
      { id: 'project-steam', internnumber: 'STX-2402', externnumber: 'RIV-ST-02', description: 'Riverside steam network', siteId: 'site-river', companyId: 'company-stelux', contact: 'Sam Rivers', startdate: '2026-09-14', enddate: '2026-12-18', status: 'Active' },
      { id: 'project-skid', internnumber: 'STX-2403', externnumber: 'NLP-SK-01', description: 'Process skid fabrication', siteId: 'site-north', companyId: 'company-north', contact: 'Jamie Ellis', mtoPilot: false, startdate: '2026-08-10', enddate: '2026-10-30', status: 'Active' }
    ];
    projects.forEach(p => { const { id, ...data } = p; add('projects', id, { ...data, amounthours: 8, workingdays: 60 }); });
    add('test_systems', 'test-cw', { name: 'CW-01', projectId: 'project-cooling', medium: 'Water', pressure: '15 bar' });
    add('field_packages', 'fwp-1', { name: 'Cooling loop — Area 1', number: 'FWP-001', projectId: 'project-cooling' });
    for (let i = 1; i <= 9; i++) add('isometrics', `iso-${i}`, { isoNo: `STX-${i <= 3 ? 'CW' : i <= 6 ? 'ST' : 'SK'}-${String(i).padStart(3, '0')}`, projectId: projects[Math.floor((i - 1) / 3)].id, revNo: i <= 3 ? '2' : '0', irn: `IRN-${100 + i}`, pipingClass: i <= 3 ? 'CS150' : 'SS300', material: i <= 3 ? 'A106 Gr B' : 'A312 TP316L', itpNo: `ITP-0${Math.ceil(i / 3)}`, priority: i === 2 ? 'Prio 2' : i === 3 ? 'Prio 1' : 'Prio 3', date: '2026-09-18', prefab_materials: i >= 7, prefab_welds: i >= 8, prefab_est: i === 9, prefab_doc: i === 9, field_doc: i === 9, prep_finished: i >= 4, paintSpec: 'PS-02',
      assetTag: `AT-${i <= 3 ? 'CW' : i <= 6 ? 'ST' : 'SK'}-${String(i).padStart(2, '0')}`, drawingNo: `DWG-${2400 + i}`, testPressure: i <= 3 ? '15 bar' : '24 bar', testMedium: 'Water', ped: i <= 3 ? 'Cat II / B' : 'Cat I / A', xRay: i <= 3 ? '10' : '5', pwht: i === 2,
      noBo: i <= 3, noBoReg: i <= 3 ? `NB-2026-${100 + i}` : '', noBoSerial: i <= 3 ? `SN-${4100 + i}` : '', ...(i <= 3 ? { testSystemId: 'test-cw' } : {}), ...(i === 1 ? { itpNo2: 'ITP-NDT-01' } : {}),
      ...(i === 3 ? { paintState: 'Done', tracingState: 'N/A', insulationState: 'N/A' } : i === 1 ? { paintState: 'Done' } : {}) });
    // A field-only drawing: no shop welds yet, so its Prefab flag in the isometrics list is a dash.
    add('isometrics', 'iso-10', { isoNo: 'STX-SK-010', projectId: 'project-skid', revNo: '0', irn: 'IRN-110', pipingClass: 'SS300', material: 'A312 TP316L', itpNo: 'ITP-04', priority: 'Prio 3', date: '2026-09-25', assetTag: 'AT-SK-10', drawingNo: 'DWG-2410', testPressure: '24 bar', testMedium: 'Water', ped: 'Cat I / A', xRay: '5', paintSpec: 'PS-02', prefab_materials: true });
    const mats = [['CS-P060', 'Seamless carbon steel pipe', 'Pipe', '2', 'SCH 40', 'M', 28.4], ['CS-E090', '90° long radius elbow', 'Elbow', '2', 'SCH 40', 'EA', 18.6], ['CS-F150', 'Weld neck flange, class 150', 'Flange', '2', '150', 'EA', 42.5], ['SS-P114', 'Stainless steel pipe 316L', 'Pipe', '4', 'SCH 10S', 'M', 82], ['SS-T114', 'Equal tee, stainless steel 316L', 'Tee', '4', 'SCH 10S', 'EA', 118], ['CS-V060', 'Gate valve, flanged ends', 'Valve', '2', '150', 'EA', 156], ['SS-E114', '90° elbow, stainless steel 316L', 'Elbow', '4', 'SCH 10S', 'EA', 56], ['CS-B020', 'Stud bolt and two hex nuts', 'Bolt', '3/4', 'B7 / 2H', 'SET', 6.8]];
    mats.forEach(([materialNo, description, materialGroup, dia, lbs, uom, price], i) => add('materials', `material-${i + 1}`, { materialNo, description, materialGroup, dia, lbs, uom, price, articleNo: `ART-${1001 + i}`, typeId: i >= 3 && i <= 4 ? 'material-type-1' : 'material-type-0' }));
    for (let i = 1; i <= 9; i++) {
      add('spools', `spool-${i}`, { name: `SP-${String(i).padStart(3, '0')}`, isoId: `iso-${i}`, diameter: i < 4 ? '2' : '4', paintSpec: 'PS-02', laydownId: i < 7 ? 'laydown-a' : 'laydown-b' });
      add('iso_materials', `requirement-${i}`, { isoId: `iso-${i}`, materialId: `material-${(i - 1) % 8 + 1}`, quantity: i % 2 ? 12 : 4, phaseId: 'phase-0' });
    }
    add('roles', 'role-welder', { name: 'Welder', abbreviation: 'WLD', maxTasks: 6, leadRole: false });
    add('roles', 'role-foreman', { name: 'Welding foreman', abbreviation: 'WFM', maxTasks: 10, leadRole: true });
    add('roles', 'role-trainee', { name: 'Trainee welder', abbreviation: 'TRW', maxTasks: 2, leadRole: false });
    [['ISO 9606-1', 'Welder qualification test (EN ISO 9606-1)'], ['NEN 3650', 'Welder qualification test (NEN 3650)'], ['ASME IX', 'Welder performance qualification (ASME IX)']].forEach(([abbreviation, name], i) => add('certificate_types', `welder-certificate-type-${i}`, { name, abbreviation }));
    [['W01', 'W01 Custom - 141 | FM1-FM2', '21.3', '168.3', '2', '12'], ['W02', 'W02 Custom - 111 | FM1', '48.3', '219.1', '3', '16'], ['W03', 'W03 Custom - 135 | FM1-FM2 | FW', '', '', '3', '20'], ['W04', 'W04 Custom - 141 | FM5', '21.3', '114.3', '2', '8']].forEach(([abbreviation, name, diameterFrom, diameterTo, wtFrom, wtTo], i) => add('welder_customs_catalog', `welder-custom-${i + 1}`, { name, abbreviation, diameterFrom, diameterTo, wtFrom, wtTo }));
    const welderRows = [['Alex Taylor', '1984-03-12', 'W01-441', 'site-north', ['welder-custom-1', 'welder-custom-2']], ['Robin Lane', '1990-07-02', 'W01-518', 'site-north', ['welder-custom-1']], ['Casey Brooks', '1979-11-23', 'W02-207', 'site-river', ['welder-custom-4']], ['Jordan Reed', '1995-01-30', 'W02-389', 'site-river', ['welder-custom-3']]];
    welderRows.forEach(([name, dob, welderCode, siteId, customIds], i) => add('welders', `welder-${i + 1}`, { name, number: `W-${String(i + 1).padStart(3, '0')}`, welderCode, dob, phone: `+31 10 555 02${40 + i}`, email: `${String(name).toLowerCase().replace(' ', '.')}@example.com`, companyId: 'company-stelux', roleId: i === 0 ? 'role-foreman' : 'role-welder', status: 'Active', globallyDeployable: i < 2, combination: i === 1, currentlyOn: i < 2 ? 'Cooling water expansion' : 'Riverside steam network', siteIds: [siteId], customIds }));
    add('welders', 'welder-5', { name: 'Sam Peters', number: 'W-005', welderCode: 'W03-112', companyId: 'company-north', roleId: 'role-trainee', status: 'Inactive', globallyDeployable: false, description: 'On leave until the next fabrication package.' });
    add('welders', 'welder-6', { name: 'Noor Hendriks', number: 'W-006', welderCode: 'W03-140', companyId: 'company-north', roleId: 'role-welder', status: 'Active', globallyDeployable: false, description: 'Left the company.' });
    const welder6 = store.get('welders', 'welder-6'); store.archive('welders', welder6.id, welder6._version, SYSTEM);
    ['141 — TIG', '111 — MMA', '135 — MAG', '136 — FCAW'].forEach((name, i) => add('weld_processes', `process-${i}`, { name, code: name.slice(0, 3) }));
    seedWeldCatalogs(store);
    // Qualifications relative to the day the sample workspace is created, so the expire warnings always have an expired and an expiring entry.
    const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    [['welder-1', 'WQ-2024-0412', 'welder-certificate-type-0', 'welder-custom-1', 'process-0', 'ISO 9606-1', 'PF', 'BW', 'EN', -730, -12], ['welder-1', 'WQ-2025-0233', 'welder-certificate-type-1', 'welder-custom-2', 'process-1', 'NEN 3650', 'PA', 'BW', 'EN', -350, 18], ['welder-2', 'WQ-2025-0310', 'welder-certificate-type-0', 'welder-custom-1', 'process-0', 'ISO 9606-1', 'PF', 'BW', 'EN', -125, 240], ['welder-3', 'WQ-2025-0118', 'welder-certificate-type-2', 'welder-custom-4', 'process-0', 'ASME IX', '6G', 'BW', 'ASME', -40, 690], ['welder-4', 'WQ-2025-0377', 'welder-certificate-type-0', 'welder-custom-3', 'process-2', 'ISO 9606-1', 'PB', 'FW', 'EN', -356, 9], ['welder-5', 'WQ-2024-0105', 'welder-certificate-type-0', 'welder-custom-1', 'process-0', 'ISO 9606-1', 'PF', 'BW', 'EN', -800, -60]].forEach(([welderId, name, certificateTypeId, customId, processId, standard, position, weldKind, system, issued, expires], i) => add('welder_certificates', `welder-qualification-${i + 1}`, { name, welderId, certificateTypeId, customId, processId, standard, position, weldKind, system, issuedAt: inDays(Number(issued)), expiresAt: inDays(Number(expires)) }));
    [['1/2"', 21.3, 0.5, 66.9], ['3/4"', 26.7, 0.75, 83.8], ['1"', 33.4, 1, 104.9], ['1.1/4"', 42.2, 1.25, 132.5], ['1.1/2"', 48.3, 1.5, 151.7], ['2"', 60.3, 2, 189.3], ['2.1/2"', 73, 2.5, 229.2], ['3"', 88.9, 3, 279.1], ['4"', 114.3, 4, 358.9], ['6"', 168.3, 6, 528.5], ['8"', 219.1, 8, 688]].forEach(([diameter, size, sizeinch, outline], i) => add('diameters', `diameter-${i + 1}`, { diameter, size, sizeinch, outline, sorting: i + 1 }));
    add('pqr', 'pqr-1', { name: 'STX-PQR-001', standard: 'ISO 15614-1', processId: 'process-0' });
    add('wps', 'wps-1', { name: 'STX-WPS-141-01', method: '141', definition:'Sample procedure — see the attached specification',jointType:'BW',allProjects:true,siteIds:['site-north','site-river'], processId: 'process-0', pqrId: 'pqr-1', standard: 'ISO 15609-1' });
    add('welding_wires', 'wire-1', { name: 'WIRE-316L-01', classification: 'ER316L', diameter: 2.4, manufacturer: 'Sample Filler Co.', chargeNo: 'H-1042', materialTypeId: 'material-type-a312-316l', norm: 'EN ISO 14343-A', certType: '3.1', attestNo: 'ATT-W-2291', supplierId: 'supplier-steel', allProjects: true, controlled: true, accepted: true });
    add('welding_wires', 'wire-2', { name: '0001', classification: 'ER70S-6', diameter: 2.4, chargeNo: '4417-8812', materialTypeId: 'material-type-a106b', norm: 'AWS A5.18', certType: '3.1', attestNo: 'ATT-W-2305', supplierId: 'supplier-pipe', allProjects: false, projectIds: ['project-cooling'], controlled: true, accepted: false, description: 'Waiting for the incoming inspection.' });
    // Material certificates: a certificate for every project, and two linked to one project each.
    add('certifications', 'certificate-1', { name: 'ATT-26-1184', indexNo: '0001', chargeNo: 'H-1042', certType: '3.1', materialId: 'material-1', materialTypeId: 'material-type-a106b', materialPartId: 'part-0', basicMaterial: 'C-Si', diameter: '2"', schedule: '40', wallThickness: '3.91', supplierId: 'supplier-steel', allProjects: true, controlled: true, accepted: true });
    add('certifications', 'certificate-2', { name: 'ATT-26-1190', indexNo: '0002', chargeNo: 'H-1043', certType: '3.1', materialId: 'material-4', materialTypeId: 'material-type-a312-316l', materialPartId: 'part-0', basicMaterial: 'Cr-Ni-Mo', diameter: '4"', schedule: '10S', wallThickness: '3.05', supplierId: 'supplier-pipe', allProjects: false, projectIds: ['project-steam'], controlled: true, accepted: true });
    add('certifications', 'certificate-3', { name: 'ATT-26-1207', indexNo: '0003', chargeNo: 'H-2210', certType: '3.2', materialTypeId: 'material-type-a335-p11', materialPartId: 'part-0', basicMaterial: 'Cr-Mo', diameter: '3"', schedule: '40', wallThickness: '5.49', supplierId: 'supplier-steel', allProjects: false, projectIds: ['project-cooling'], controlled: true, accepted: false, description: 'Third-party inspection report still to be countersigned.' });
    for (let i = 1; i <= 30; i++) add('welds', `weld-${i}`, { weldNo: `W${String(i).padStart(3, '0')}`, isoId: `iso-${(i - 1) % 9 + 1}`, spoolId: `spool-${(i - 1) % 9 + 1}`, typeId: `weld-type-${i % 4}`, welder1Id: `welder-${i % 4 + 1}`, wpsId: 'wps-1', diameterId: i % 2 ? 'diameter-6' : 'diameter-9', lengthMode: 'Diameter', date: `2026-10-${String(Math.min(21, i)).padStart(2, '0')}`, datefit: '2026-10-01', ndoReq: true, pwhtReq: i === 2 || i === 11, wire1Id: 'wire-1', chargeNo1: 'H-1042', chargeNo2: i === 29 ? '' : 'H-1042', coating1Id: 'coating-none' });
    for (let i = 1; i <= 18; i++) {
      const result = action('inspection-request', { weldIds: [`weld-${i}`], type: 'NDT', processId: 'ndt-0', locationId: 'ndt-shop', date: '2026-10-19' });
      const request = 'records' in result ? result.records?.[0] : undefined;
      if (i <= 14 && request) action('inspection-result', { requestId: request.id, reportNo: `RT-2026-${String(i).padStart(3, '0')}`, result: i === 5 || i === 11 ? 'Rejected' : 'Accepted', round: 'Initial', date: '2026-10-20' });
    }
    // Welds 21 and 30 close the NDT of iso-3, which is meant to be the one isometric with nothing blocking it.
    for (const i of [21, 30]) {
      const result = action('inspection-request', { weldIds: [`weld-${i}`], type: 'NDT', processId: 'ndt-0', locationId: 'ndt-shop', date: '2026-10-19' });
      const request = 'records' in result ? result.records?.[0] : undefined;
      if (request) action('inspection-result', { requestId: request.id, reportNo: `RT-2026-${String(i).padStart(3, '0')}`, result: 'Accepted', round: 'Initial', date: '2026-10-20' });
    }
    add('welds', 'weld-31', { weldNo: 'W031', isoId: 'iso-10', typeId: 'weld-type-0', wpsId: 'wps-1', diameterId: 'diameter-9', lengthMode: 'Diameter' });
    // The two welds of iso-2 that need post-weld heat treatment are treated and accepted.
    for (const i of [2, 11]) {
      const result = action('inspection-request', { weldIds: [`weld-${i}`], type: 'PWHT', pwhtProcessId: 'pwht-1', pwhtLocationId: 'pwht-shop', date: '2026-10-19' });
      const request = 'records' in result ? result.records?.[0] : undefined;
      if (request) action('inspection-result', { requestId: request.id, reportNo: `PWHT-2026-${String(i).padStart(3, '0')}`, result: 'Accepted', round: 'Initial', date: '2026-10-21' });
    }
    action('repair', { weldId: 'weld-5', date: '2026-10-21', note: 'Sample repair record — repeat examination pending.' });
    add('punchlists', 'punch-1', { name: 'Confirm support tag on cooling line', isoId: 'iso-2', category: 'B', status: 'Open', assignedTo: 'Site team', dueDate: '2026-10-27' });
    action('release', { isoIds: ['iso-9'], type: 'Prefab', reportNo: 'PFR-001', engineerId: 'qa-1', date: '2026-10-20' });
    action('release', { isoIds: ['iso-3'], type: 'Prefab', reportNo: 'PFR-002', engineerId: 'qa-1', date: '2026-10-22' });
    action('release', { isoIds: ['iso-3'], type: 'Field', reportNo: 'FLR-001', engineerId: 'qa-1', date: '2026-10-25' });
    action('release', { isoIds: ['iso-3'], type: 'Hydrotest', reportNo: 'HTR-001', engineerId: 'qa-1', date: '2026-10-26' });
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

/**
 * Sample profiles and accounts for access per pilot (local sample workspace of the hosted profile only; never
 * called for a connected database). The accounts have no password: an administrator sets one under User accounts
 * before they can sign in. Runs once; existing records with the same id or name are left untouched.
 */
export function seedAccessSamples(store: Store) {
  if (store.db.prepare("SELECT value FROM metadata WHERE key='seed_access_v1'").get()) return;
  store.transaction(() => {
    const exists = (key: string, id: string, field: string, value: string) => store.list(key, true).some(row => row.id === id || String(row[field]).toLowerCase() === value.toLowerCase());
    const profile = (id: string, data: Record<string, unknown>) => { if (!exists('profiles', id, 'name', String(data.name))) store.create('profiles', data, SYSTEM, id); };
    profile('profile-qaqc', { name: 'Highest rights for QAQC', description: 'QA/QC: welds, inspections and releases; reads the material side.', generalPermission: 'Read & write', materialsPermission: 'Read only', weldingPermission: 'Administration', toolsPermission: 'No access', settingsPermission: 'No access' });
    profile('profile-workprep', { name: 'Standard profile for workpreparator', description: 'Work preparation: material take-off, ordering and logistics.', generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read only', toolsPermission: 'No access', settingsPermission: 'No access' });
    profile('profile-review', { name: 'Only review', description: 'External reviewer: reads projects, isometrics and their records.', generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'Read only', toolsPermission: 'No access', settingsPermission: 'No access' });
    const ready = ['profile-qaqc', 'profile-workprep', 'profile-review'].every(id => { try { store.get('profiles', id); return true; } catch { return false; } });
    const company = (id: string) => store.list('companies').some(row => row.id === id) ? id : '';
    const user = (id: string, data: Record<string, unknown>) => { if (ready && !exists('users', id, 'email', String(data.email))) store.create('users', { active: true, ...data, companyId: company(String(data.companyId || 'company-north')) }, SYSTEM, id); };
    user('user-sample-qaqc', { name: 'Mila Kovač', email: 'mila.kovac@example.com', title: 'QA/QC inspector', phone: '+31 10 555 0175', profileId: 'profile-review', weldEnabled: true, weldProfileId: 'profile-qaqc', mtoEnabled: false });
    user('user-sample-workprep', { name: 'Daan Visser', email: 'daan.visser@example.com', title: 'Work preparation', phone: '+31 10 555 0168', profileId: 'profile-review', weldEnabled: false, mtoEnabled: true, mtoProfileId: 'profile-workprep' });
    user('user-sample-engineer', { name: 'Sara Jansen', email: 'sara.jansen@example.com', title: 'Project engineer', phone: '+31 10 555 0193', profileId: 'profile-review', weldEnabled: true, weldProfileId: 'profile-qaqc', mtoEnabled: true, mtoProfileId: 'profile-review' });
    user('user-sample-reviewer', { name: 'External reviewer', email: 'reviewer@example.com', title: 'Client inspector', companyId: 'company-stelux', profileId: 'profile-review' });
    store.db.prepare("INSERT INTO metadata(key,value) VALUES ('seed_access_v1','1')").run();
  });
}
