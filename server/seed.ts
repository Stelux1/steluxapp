import { Store, SYSTEM } from './store.ts';
import { runAction } from './workflows.ts';
import { seedHydrotest } from './hydrotest.ts';
import { seedItpSamples } from './itp-dashboard.ts';
import { seedWeldCatalogs } from './weld-catalogs-seed.ts';
import { seedWeldEntry } from './weld-entry.ts';
export { seedInspectionSamples } from './inspections-seed.ts';
import { seedMtoStock } from './mto-stock-seed.ts';
import { loadDiameterCatalog } from './diameter-catalog.ts';

export function seed(store: Store) {
  // An existing workspace is left as stored: a spool saved before test systems moved to spool level follows its isometric when read (shared/hydrotest.ts).
  if (store.db.prepare("SELECT value FROM metadata WHERE key='seed_version'").get()) return;
  store.transaction(() => {
    const add = (key: string, id: string, data: Record<string, unknown>) => store.create(key, data, SYSTEM, id);
    const action = (key: string, data: Record<string, unknown>) => runAction(store, key, data, SYSTEM);
    add('profiles', 'profile-admin', { name: 'Administrator', generalPermission: 'Administration', materialsPermission: 'Administration', weldingPermission: 'Administration', toolsPermission: 'Administration', settingsPermission: 'Administration' });
    add('profiles', 'profile-operator', { name: 'Project operator', generalPermission: 'Read & write', materialsPermission: 'Read & write', weldingPermission: 'Read & write', toolsPermission: 'Read & write', settingsPermission: 'No access' });
    add('profiles', 'profile-viewer', { name: 'Viewer', generalPermission: 'Read only', materialsPermission: 'Read only', weldingPermission: 'Read only', toolsPermission: 'Read only', settingsPermission: 'No access' });
    add('sites', 'site-north', { name: 'North fabrication yard', address: '18 Foundry Road', residence: 'Rotterdam', zip: '3089', phone: '+31 10 555 0142', email: 'north@example.com',
      mandatoryFields: true, flangeStandard: 'ASME B16.5 torque table (2012)', wpsValidation: true, projectCertificates: true, materialManagementDisplay: false, defectNorm: 'ISO 6520-1', repairLimit: 4, ndtMeasurement: 'Inch-weighted', irnCode: 'NFY-IRN',
      prefix: 'NFY', releaseDocDrawing: 'Drawing no + iso', hydrotestPlan: 'HEP-NFY-001 rev 2', flangeProcedureNo: 'FP-2026-03', signSubQaqc: 'QA/QC Manager', signSubConstruction: 'Construction Manager', signPrincipalUi: 'Principal inspector', signContractorQaqc: 'Contractor QA/QC lead', signContractorConstruction: 'Contractor site manager', signNobo: 'Notified body inspector',
      vtDocNo: 'VT-NFY-01 rev B', vtProcedureNo: 'PR-VT-004', vtType2No: 'VT2-118', vtType2Rev: 'A', vtType2Date: '2026-06-15', vtType2OrderNo: 'PO-44017', lislField1: 'Stelux Piping Contractor', lislField2: 'NLP Operations', lislField3: 'NB-0343', lislDocNo: 'LISL-NFY-01 rev C', lislProcedureNo: 'PR-LISL-002',
      lislGuField1: 'Stelux Piping Contractor', lislGuField2: 'NLP Operations', lislGuField3: 'NB-0343', lislGuSpec1: 'Welded to the project piping specification PS-NFY-2026', lislGuSpec2: 'Welds carry welder code and weld number',
      lislMvDocNo: 'LMV-NFY-02', lislMvVersion: 'Rev. 1', lislMvDate: '2026-09-01', lislMvSpec1: 'Welded to the project piping specification PS-NFY-2026', lislMvSpec2: 'Consumables traceable by heat number',
      lislRevOwnerLine: 'Client heat transport standard HT-STD-12', lislRevDocNo: 'LGR-NFY-03', lislRevVersion: 'Rev. 2', lislRevDate: '2026-09-01',
      ownerName: 'Northgate Pipeline Owner', ownerStandard: 'Owner standard OS-PL-210 - pipeline construction', wqDocNo: 'FORM-LISL-014', wqVersion: '3', wqDate: '2026-03-01', issDocTemplate: 'TPL-ISS-007 rev 2', issSupplier: 'Stelux Engineering', issTrain: 'Train 2', issFluidService: 'Cooling water, fluid group 2', issNdtStandard: 'EN ISO',
      weightShop: 38, weightField: 54, weightSite: 8, shopWelds: 40, shopNdt: 15, shopMaterialPipe: 25, shopSupports: 10, shopAppendages: 10,
      fieldMaterialPipe: 20, fieldWelds: 35, fieldNdt: 15, fieldSupports: 10, fieldAppendages: 10, fieldPunch: 10, siteHydrotest: 40, sitePaintTracing: 60 });
    add('sites', 'site-river', { name: 'Riverside installation', address: '42 Harbour Lane', residence: 'Antwerp', zip: '2000' });
    add('companies', 'company-stelux', { name: 'Stelux Engineering', address: '12 Knez Mihailova', zip: '11000', residence: 'Belgrade', phone: '+381 11 555 0100', email: 'projects@example.com' });
    add('companies', 'company-north', { name: 'Northline Process', address: '7 Maasboulevard', zip: '3063', residence: 'Rotterdam', phone: '+31 10 555 0150', email: 'office@example.com' });
    add('warehouses', 'warehouse-main', { name: 'Main warehouse', siteId: 'site-north', companyId: 'company-stelux', use: 'Both', residence: 'Rotterdam' });
    add('warehouses', 'warehouse-field', { name: 'Field stores', siteId: 'site-river', companyId: 'company-stelux', use: 'Both', residence: 'Antwerp' });
    add('suppliers', 'supplier-steel', { name: 'Atlas Steel Supply', residence: 'Breda', email: 'orders@example.com' });
    add('suppliers', 'supplier-pipe', { name: 'Meridian Piping', residence: 'Delft', email: 'supply@example.com' });
    add('service_companies', 'service-coating', { name: 'Precision Surface Works', address: '7 Havenstraat', residence: 'Rotterdam', phone: '+31 10 555 0121', email: 'planning@example.com' });
    add('laydowns', 'laydown-a', { name: 'Laydown A — Prefab', siteId: 'site-north' });
    add('laydowns', 'laydown-b', { name: 'Laydown B — Field', siteId: 'site-river' });
    ['Pipe', 'Elbow 90', 'Flange', 'Tee', 'Reducer', 'Valve', 'Cap'].forEach((name, i) => add('material_parts', `part-${i}`, { name }));
    add('material_parts', 'part-custom', { name: 'Customer spool piece', custom: 'Yes' });
    ['Carbon steel', 'Stainless steel', 'Alloy steel'].forEach((name, i) => add('material_types', `material-type-${i}`, { name, typeOfSteel: name }));
    [['a106b', 'A106 Gr B', 'Carbon steel', 'Seamless carbon steel pipe for high-temperature service', 'C-Si', '1.1', 'P-1', '1'], ['a312-316l', 'A312 TP316L', 'Stainless steel', 'Seamless austenitic stainless steel pipe', 'Cr-Ni-Mo', '8.1', 'P-8', '1'], ['a335-p11', 'A335 P11', 'Alloy steel', 'Seamless ferritic alloy steel pipe for high-temperature service', 'Cr-Mo', '5.1', 'P-4', '1']].forEach(([id, name, typeOfSteel, materialDescription, basicMaterial, iso15608, asmePNumber, asmeGroup]) => add('material_types', `material-type-${id}`, { name, typeOfSteel, materialDescription, basicMaterial, materialGroup: typeOfSteel, iso15608, asmePNumber, asmeGroup, isoAsme: `${iso15608} / ${asmePNumber} Gr ${asmeGroup}` }));
    ['EA', 'M', 'KG', 'SET', 'BX', 'L', 'M2', 'PR'].forEach(name => add('uoms', `uom-${name}`, { name, symbol: name }));
    ['Shop', 'Field', 'Hydrotest field', 'Support Shop', 'Support Field', 'Valves'].forEach((name, i) => add('operation_phases', `phase-${i}`, { name, sort: i + 1 }));
    const projects = [
      { id: 'project-cooling', internnumber: 'STX-2401', externnumber: 'NLP-CW-04', description: 'Cooling water expansion', siteId: 'site-north', companyId: 'company-north', contact: 'Alex Morgan', authority: 'Project manager', startdate: '2026-09-01', enddate: '2026-11-28', status: 'Active' },
      { id: 'project-steam', internnumber: 'STX-2402', externnumber: 'RIV-ST-02', description: 'Riverside steam network', siteId: 'site-river', companyId: 'company-stelux', contact: 'Sam Rivers', startdate: '2026-09-14', enddate: '2026-12-18', status: 'Active' },
      { id: 'project-skid', internnumber: 'STX-2403', externnumber: 'NLP-SK-01', description: 'Process skid fabrication', siteId: 'site-north', companyId: 'company-north', contact: 'Jamie Ellis', mtoPilot: true, startdate: '2026-08-10', enddate: '2026-10-30', status: 'Active' }
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
    // Every sample isometric shows a revision number, so it also gets that ISO revision record (the Revision select of
    // Add material and the quantity log need one).
    for (const iso of store.list('isometrics')) if (String(iso.revNo ?? '') !== '') {
      const revNo = String(iso.revNo), previous = /^\d+$/.test(revNo) && Number(revNo) > 0 ? String(Number(revNo) - 1) : '';
      add('revisions', `revision-${iso.id}`, { isoId: iso.id, type: 'ISO', revNo, previousRev: previous, date: String(iso.date || '2026-09-01'), comment: revNo === '0' ? 'First issue (sample).' : `Revision ${revNo} issued for construction (sample).` });
    }
    const mats = [['CS-P060', 'Seamless carbon steel pipe', 'Pipe', '2', 'SCH 40', 'M', 28.4], ['CS-E090', '90° long radius elbow', 'Elbow', '2', 'SCH 40', 'EA', 18.6], ['CS-F150', 'Weld neck flange, class 150', 'Flange', '2', '150', 'EA', 42.5], ['SS-P114', 'Stainless steel pipe 316L', 'Pipe', '4', 'SCH 10S', 'M', 82], ['SS-T114', 'Equal tee, stainless steel 316L', 'Tee', '4', 'SCH 10S', 'EA', 118], ['CS-V060', 'Gate valve, flanged ends', 'Valve', '2', '150', 'EA', 156], ['SS-E114', '90° elbow, stainless steel 316L', 'Elbow', '4', 'SCH 10S', 'EA', 56], ['CS-B020', 'Stud bolt and two hex nuts', 'Bolt', '3/4', 'B7 / 2H', 'SET', 6.8]];
    // Component code (CC 1 = pipe, 2 = supports, 3 = appendages; it drives the ISO progress): only pipe, supports and valves are classified.
    const parts: Record<string, string> = { Pipe: 'part-0', Elbow: 'part-1', Flange: 'part-2', Tee: 'part-3', Valve: 'part-5' };
    const classes: Record<string, [string, string]> = { 'CS-P060': ['1', 'Pipe'], 'SS-P114': ['1', 'Pipe'], 'CS-V060': ['3', 'Appendages'] };
    mats.forEach(([materialNo, description, materialGroup, dia, lbs, uom, price], i) => add('materials', `material-${i + 1}`, { materialNo, description, materialGroup, dia, lbs, uom, price, articleNo: `ART-${1001 + i}`, typeId: i >= 3 && i <= 4 ? 'material-type-1' : 'material-type-0', partId: parts[String(materialGroup)] || '', componentCode: classes[materialNo]?.[0] || '', progressClass: classes[materialNo]?.[1] || '' }));
    [['SUP-U060', 'U-bolt pipe clamp, galvanised', 'Support', '2', 'M10', 'EA', 7.4, '2', 'Supports'], ['SUP-S114', 'Pipe shoe with welded base plate', 'Support', '4', 'L=200', 'EA', 24.9, '2', 'Supports'], ['SUP-G060', 'Guide support, slotted', 'Support', '2', 'L=150', 'EA', 31.2, '2', 'Supports'], ['GA-A150', 'Spectacle blind, class 150', 'Appendage', '2', '150', 'EA', 64, '3', 'Appendages']].forEach(([materialNo, description, materialGroup, dia, lbs, uom, price, componentCode, progressClass], i) => add('materials', `material-${i + 9}`, { materialNo, description, materialGroup, dia, lbs, uom, price, componentCode, progressClass, partId: '', articleNo: `ART-${1009 + i}`, typeId: 'material-type-0' }));
    for (let i = 1; i <= 9; i++) {
      add('spools', `spool-${i}`, { name: `SP-${String(i).padStart(3, '0')}`, isoId: `iso-${i}`, diameter: i < 4 ? '2' : '4', paintSpec: 'PS-02', laydownId: i < 7 ? 'laydown-a' : 'laydown-b' });
      add('iso_materials', `requirement-${i}`, { isoId: `iso-${i}`, materialId: `material-${(i - 1) % 8 + 1}`, quantity: i % 2 ? 12 : 4, phaseId: 'phase-0' });
    }
    // The first isometric carries pipe, supports and an appendage in Shop and Field phases, so its progress budgets are not empty.
    [['requirement-11', 'material-1', 18, 'phase-1'], ['requirement-12', 'material-9', 6, 'phase-3'], ['requirement-13', 'material-9', 4, 'phase-4'], ['requirement-14', 'material-12', 2, 'phase-4']].forEach(([id, materialId, quantity, phaseId]) => add('iso_materials', String(id), { isoId: 'iso-1', materialId, quantity, phaseId }));
    add('roles', 'role-welder', { name: 'Welder', abbreviation: 'WE', maxTasks: 6, leadRole: false });
    add('roles', 'role-foreman', { name: 'Welding foreman', abbreviation: 'WFM', maxTasks: 10, leadRole: true });
    add('roles', 'role-trainee', { name: 'Trainee welder', abbreviation: 'TRW', maxTasks: 2, leadRole: false });
    [['ISO 9606-1', 'Welder qualification test (EN ISO 9606-1)'], ['NEN 3650', 'Welder qualification test (NEN 3650)'], ['ASME IX', 'Welder performance qualification (ASME IX)']].forEach(([abbreviation, name], i) => add('certificate_types', `welder-certificate-type-${i}`, { name, abbreviation }));
    [['141|FM1-FM2|ISO9606-1', '21.3', '168.3', '2', '12'], ['111|FM1|ISO9606-1', '48.3', '219.1', '3', '16'], ['135|FM1-FM2|ISO9606-1', '', '', '3', '20'], ['141|FM5|ISO9606-1', '21.3', '114.3', '2', '8']].forEach(([name, diameterFrom, diameterTo, wtFrom, wtTo], i) => add('welder_customs_catalog', `welder-custom-${i + 1}`, { name, abbreviation: name, diameterFrom, diameterTo, wtFrom, wtTo }));
    const welderRows = [['Alex Taylor', '1984-03-12', 'W01-441', 'site-north', ['welder-custom-1', 'welder-custom-2']], ['Robin Lane', '1990-07-02', 'W01-518', 'site-north', ['welder-custom-1']], ['Casey Brooks', '1979-11-23', 'W02-207', 'site-river', ['welder-custom-4']], ['Jordan Reed', '1995-01-30', 'W02-389', 'site-river', ['welder-custom-3']]];
    welderRows.forEach(([name, dob, welderCode, siteId, customIds], i) => add('welders', `welder-${i + 1}`, { name, number: `W-${String(i + 1).padStart(3, '0')}`, welderCode, dob, phone: `+31 10 555 02${40 + i}`, email: `${String(name).toLowerCase().replace(' ', '.')}@example.com`, companyId: 'company-stelux', roleId: i === 0 ? 'role-foreman' : 'role-welder', status: 'Active', globallyDeployable: i < 2, combination: i === 1, currentlyOn: i < 2 ? 'Cooling water expansion' : 'Riverside steam network', siteIds: [siteId], customIds }));
    add('welders', 'welder-5', { name: 'Sam Peters', number: 'W-005', welderCode: 'W03-112', companyId: 'company-north', roleId: 'role-trainee', status: 'Inactive', globallyDeployable: false, description: 'On leave until the next fabrication package.' });
    add('welders', 'welder-6', { name: 'Noor Hendriks', number: 'W-006', welderCode: 'W03-140', companyId: 'company-north', roleId: 'role-welder', status: 'Active', globallyDeployable: false, description: 'Left the company.' });
    const welder6 = store.get('welders', 'welder-6'); store.archive('welders', welder6.id, welder6._version, SYSTEM);
    ['141', '111', '135', '136'].forEach((name, i) => add('weld_processes', `process-${i}`, { name }));
    seedWeldCatalogs(store);
    // Qualifications relative to the day the sample workspace is created, so the expire warnings always have an expired and an expiring entry.
    const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    [['welder-1', 'WQ-2024-0412', 'welder-certificate-type-0', 'welder-custom-1', 'process-0', 'ISO 9606-1', 'PF', 'BW', 'EN', -730, -12], ['welder-1', 'WQ-2025-0233', 'welder-certificate-type-1', 'welder-custom-2', 'process-1', 'NEN 3650', 'PA', 'BW', 'EN', -350, 18], ['welder-2', 'WQ-2025-0310', 'welder-certificate-type-0', 'welder-custom-1', 'process-0', 'ISO 9606-1', 'PF', 'BW', 'EN', -125, 240], ['welder-3', 'WQ-2025-0118', 'welder-certificate-type-2', 'welder-custom-4', 'process-0', 'ASME IX', '6G', 'BW', 'ASME', -40, 690], ['welder-4', 'WQ-2025-0377', 'welder-certificate-type-0', 'welder-custom-3', 'process-2', 'ISO 9606-1', 'PB', 'FW', 'EN', -356, 9], ['welder-5', 'WQ-2024-0105', 'welder-certificate-type-0', 'welder-custom-1', 'process-0', 'ISO 9606-1', 'PF', 'BW', 'EN', -800, -60], ['welder-4', 'WQ-2025-0378', 'welder-certificate-type-0', 'welder-custom-1', 'process-0', 'ISO 9606-1', 'PF', 'BW', 'EN', -356, 374]].forEach(([welderId, name, certificateTypeId, customId, processId, standard, position, weldKind, system, issued, expires], i) => add('welder_certificates', `welder-qualification-${i + 1}`, { name, welderId, certificateTypeId, customId, processId, standard, position, weldKind, system, issuedAt: inDays(Number(issued)), expiresAt: inDays(Number(expires)) }));
    // A welder document with its own expiry date and notify days (shown in Expire warnings like a qualification).
    add('welder_certificates', 'welder-document-1', { name: 'Summary list', welderId: 'welder-2', isDocument: true, expiresAt: inDays(-30), notifyDays: 30, notify: true, description: 'Welding summary list of the welder.' });
    [['1/2"', 21.3, 0.5, 66.9], ['3/4"', 26.7, 0.75, 83.8], ['1"', 33.4, 1, 104.9], ['1.1/4"', 42.2, 1.25, 132.5], ['1.1/2"', 48.3, 1.5, 151.7], ['2"', 60.3, 2, 189.3], ['2.1/2"', 73, 2.5, 229.2], ['3"', 88.9, 3, 279.1], ['4"', 114.3, 4, 358.9], ['6"', 168.3, 6, 528.5], ['8"', 219.1, 8, 688]].forEach(([diameter, size, sizeinch, outline], i) => add('diameters', `diameter-${i + 1}`, { diameter, size, sizeinch, outline, sorting: i + 1 }));
    // The rest of the reference diameter catalog (reducer pairs, mm sizes): only what the rows above do not already hold.
    loadDiameterCatalog(store);
    add('pqr', 'pqr-1', { name: 'STX-PQR-001', standard: 'ISO 15614-1', processId: 'process-0' });
    add('wps', 'wps-1', { name: 'STX-WPS-141-01', method: '141', definition:'Sample procedure — see the attached specification',jointType:'BW',allProjects:true,siteIds:['site-north','site-river'], processId: 'process-0', pqrId: 'pqr-1', standard: 'ISO 15609-1' });
    add('welding_wires', 'wire-1', { siteId: 'site-north', name: 'WIRE-316L-01', classification: 'ER316L', diameter: 2.4, manufacturer: 'Sample Filler Co.', chargeNo: 'H-1042', materialTypeId: 'material-type-a312-316l', typeMaterial: 'A312 TP316L', norm: 'EN ISO 14343-A', certType: '3.1', attestNo: 'ATT-W-2291', supplierId: 'supplier-steel', allProjects: true, controlled: true, accepted: true });
    // A welding wire belongs to one main project: the riverside welds use their own 316L wire.
    add('welding_wires', 'wire-3', { siteId: 'site-river', name: 'WIRE-316L-02', classification: 'ER316L', diameter: 2.4, manufacturer: 'Sample Filler Co.', chargeNo: 'H-1077', materialTypeId: 'material-type-a312-316l', typeMaterial: 'A312 TP316L', norm: 'EN ISO 14343-A', certType: '3.1', attestNo: 'ATT-W-2318', supplierId: 'supplier-steel', allProjects: true, controlled: true, accepted: true });
    add('welding_wires', 'wire-2', { siteId: 'site-north', name: '0001', classification: 'ER70S-6', diameter: 2.4, chargeNo: '4417-8812', materialTypeId: 'material-type-a106b', typeMaterial: 'A106 Gr B', norm: 'AWS A5.18', certType: '3.1', attestNo: 'ATT-W-2305', supplierId: 'supplier-pipe', allProjects: false, projectIds: ['project-cooling'], controlled: true, accepted: false, description: 'Waiting for the incoming inspection.' });
    // Material certificates: a certificate for every project, and two linked to one project each. The weld entry sample
    // (seedWeldEntry) adds the fitting and flange certificates and traces welds to them.
    add('certifications', 'certificate-1', { siteId: 'site-north', diameterId: 'diameter-6', name: 'ATT-26-1184', indexNo: '0001', chargeNo: 'H-1042', certType: '3.1', date: '2026-09-02', standard: 'EN 10204 3.1', materialCode: 'A106 Gr B', materialDescription: 'Seamless carbon steel pipe', materialId: 'material-1', materialTypeId: 'material-type-a106b', materialPartId: 'part-0', basicMaterial: 'C-Si', diameter: '2"', schedule: '40', wallThickness: '3.91', supplierId: 'supplier-steel', allProjects: true, controlled: true, accepted: true });
    add('certifications', 'certificate-2', { siteId: 'site-river', diameterId: 'diameter-9', name: 'ATT-26-1190', indexNo: '0002', chargeNo: 'H-2210', certType: '3.1', date: '2026-09-09', standard: 'EN 10204 3.1', materialCode: 'A312 TP316L', materialDescription: 'Stainless steel pipe 316L', materialId: 'material-4', materialTypeId: 'material-type-a312-316l', materialPartId: 'part-0', basicMaterial: 'Cr-Ni-Mo', diameter: '4"', schedule: '10S', wallThickness: '3.05', supplierId: 'supplier-pipe', allProjects: false, projectIds: ['project-steam'], controlled: true, accepted: true });
    add('certifications', 'certificate-3', { siteId: 'site-north', diameterId: 'diameter-8', name: 'ATT-26-1207', indexNo: '0003', chargeNo: 'H-5120', certType: '3.2', date: '2026-09-23', standard: 'EN 10204 3.2', materialCode: 'A335 P11', materialDescription: 'Seamless alloy steel pipe P11', materialTypeId: 'material-type-a335-p11', materialPartId: 'part-0', basicMaterial: 'Cr-Mo', diameter: '3"', schedule: '40', wallThickness: '5.49', supplierId: 'supplier-steel', allProjects: false, projectIds: ['project-cooling'], controlled: true, accepted: false, description: 'Third-party inspection report still to be countersigned.' });
    for (let i = 1; i <= 30; i++) add('welds', `weld-${i}`, { weldNo: `W${String(i).padStart(3, '0')}`, isoId: `iso-${(i - 1) % 9 + 1}`, spoolId: `spool-${(i - 1) % 9 + 1}`, typeId: `weld-type-${i % 4}`, welder1Id: `welder-${i % 4 + 1}`, wpsId: 'wps-1', diameterId: i % 2 ? 'diameter-6' : 'diameter-9', lengthMode: 'Diameter', date: `2026-10-${String(Math.min(21, i)).padStart(2, '0')}`, datefit: '2026-10-01', ndoReq: true, pwhtReq: i === 2 || i === 11, wire1Id: [4, 5, 6].includes((i - 1) % 9 + 1) ? 'wire-3' : 'wire-1', chargeNo1: 'H-1042', chargeNo2: i === 29 ? '' : 'H-1042', coating1Id: 'coating-none' });
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
    // Punch items relative to the day the sample is created, so the Overdue and Deadline 7 days cards always have something to show.
    const due = (days: number) => { const date = new Date(); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
    add('punchlists', 'punch-1', { punchType: 'Pre-punch', category: 'B — ASAP fix (blocking)', isoId: 'iso-2', name: 'Support tag missing on cooling line', description: 'Support CW-SUP-014 on the cooling line has no tag plate; fit the stainless tag and record the number on the as-built.', status: 'Open', contractorId: 'company-north', dueDate: due(-5), reportedDate: due(-12), reportedBy: 'Morgan Lee' });
    add('punchlists', 'punch-2', { punchType: 'Pre-punch', category: 'A — Immediate fix (blocking)', isoId: 'iso-1', description: 'Gasket on flange FL-1104 is spiral wound 316/graphite; the line list asks for PTFE envelope. Replace before the hydrotest.', status: 'Open', contractorId: 'company-north', dueDate: due(3), reportedDate: due(-4), reportedBy: 'Morgan Lee' });
    add('punchlists', 'punch-3', { punchType: 'Punch', category: 'C — Fix (non-blocking)', isoId: 'iso-1', description: 'Paint damage on the 2" pipe support after the transport; touch up to PS-02.', status: 'Open', contractorId: 'company-stelux', dueDate: due(6), reportedDate: due(-2), reportedBy: 'Sara Jansen' });
    add('punchlists', 'punch-4', { punchType: 'Punch', category: 'D — Fix in operation (non-blocking)', projectId: 'project-cooling', description: 'Add name plates to the isolation valves of the cooling water header when the plant is commissioned.', status: 'Open', contractorId: 'company-north', dueDate: due(45), reportedDate: due(-1), reportedBy: 'Alex Morgan' });
    add('punchlists', 'punch-5', { punchType: 'Pre-punch', category: 'C — Fix (non-blocking)', isoId: 'iso-3', description: 'Weld W021 shows slight undercut on the visual inspection record; grind smooth and re-inspect.', status: 'Open', contractorId: 'company-stelux', dueDate: due(14), reportedDate: due(-3), reportedBy: 'Morgan Lee' });
    add('punchlists', 'punch-6', { punchType: 'Punch', category: 'B — ASAP fix (blocking)', isoId: 'iso-5', description: 'Pipe class label missing on spool SP-005; marking must follow the project procedure.', status: 'Finished', contractorId: 'company-stelux', dueDate: due(-8), reportedDate: due(-15), reportedBy: 'Morgan Lee', finishedAt: due(-7), finishedBy: 'Sara Jansen', signerType: 'Inspection', signInspector: 'Morgan Lee', signMethod: 'Drawn' });
    add('punchlists', 'punch-7', { punchType: 'Punch', category: 'A — Immediate fix (blocking)', isoId: 'iso-4', description: 'Temporary blind left in the steam header branch; remove and close the joint.', status: 'Finished', contractorId: 'company-stelux', dueDate: due(-20), reportedDate: due(-30), reportedBy: 'Sam Rivers', finishedAt: due(-19), finishedBy: 'Sara Jansen', signerType: 'Client', signName: 'Jan de Vries', signCompany: 'Riverside Utilities', signFunction: 'Site engineer', signMethod: 'Uploaded PDF', clientApproved: true, approvedAt: due(-19), approvedBy: 'Sara Jansen' });
    add('punchlists', 'punch-8', { punchType: 'Pre-punch', category: 'C — Fix (non-blocking)', isoId: 'iso-6', description: 'Insulation clips ordered for this line are no longer needed after the design change.', status: 'Removed', dueDate: due(-10), reportedDate: due(-20), reportedBy: 'Sam Rivers', removedAt: due(-9), removedBy: 'Morgan Lee', removeReason: 'Design change DC-044 removes the insulation on this line.' });
    for (const [id, punchProgress] of [['iso-1', '50%'], ['iso-4', '100%']]) { const iso = store.get('isometrics', id); store.update('isometrics', id, { punchProgress }, iso._version, SYSTEM); }
    // Flange Management sample records: one per status. Torque values are sample entries, not catalog values.
    const flangeBase = { gasket_type: 'Spiral wound', gasket_material: '316L / flexible graphite', flange_type: 'Weld neck (WN)', flange_rating: 'Class 150', studbolt_afmeting: '3/4" x 110 mm', stud_dia: '3/4"', matl_studbolts: 'ASTM A193 B7', materiaal_moer: 'ASTM A194 2H', lubricant_used: 'Molykote P-37', torque_wrench_type: 'Hydraulic square drive', pipe_class: 'CS150' };
    add('flanges', 'flange-1', { ...flangeBase, isoId: 'iso-1', flange_id: 'FL-CW-001', from_equipment: 'P-101A', to_equipment: 'Line 6"-CW-1101', eq_con: 'Pump discharge', pid: 'P&ID-CW-01', line_number: 'AT-CW-FL-001', fluid_code: 'CW', area_unit: 'Area 1 / Cooling', location: 'Pump deck', flange_size: '6" (DN150)', aantal_studbolts: 8, operatingPressure: '10 bar', operatingTemp: '35 °C', testPressure: '15 bar', criticality: 'Medium' });
    add('flanges', 'flange-2', { ...flangeBase, isoId: 'iso-1', flange_id: 'FL-CW-002', from_equipment: 'Line 6"-CW-1101', to_equipment: 'V-101 gate valve', eq_con: 'Valve inlet', pid: 'P&ID-CW-01', line_number: 'AT-CW-FL-002', fluid_code: 'CW', area_unit: 'Area 1 / Cooling', location: 'Pump deck', flange_size: '6" (DN150)', aantal_studbolts: 8, torque_wrench_id: 'TW-014', first_pass_nm: 60, second_pass_nm: 120, target_moment_nm: 190, max_dev: 10, tightning_date: '2026-10-19', report_nr: 'FT-2026-031', operator: 'Alex Taylor' });
    add('flanges', 'flange-3', { ...flangeBase, isoId: 'iso-2', flange_id: 'FL-CW-003', from_equipment: 'Line 4"-CW-1102', to_equipment: 'HX-201 shell inlet', eq_con: 'Heat exchanger nozzle N1', pid: 'P&ID-CW-02', line_number: 'AT-CW-FL-003', fluid_code: 'CW', area_unit: 'Area 1 / Cooling', location: 'Exchanger bay', flange_size: '4" (DN100)', aantal_studbolts: 8, studbolt_afmeting: '5/8" x 100 mm', stud_dia: '5/8"', torque_wrench_id: 'TW-014', first_pass_nm: 40, second_pass_nm: 80, target_moment_nm: 125, max_dev: 8, tightning_date: '2026-10-21', report_nr: 'FT-2026-034', operator: 'Robin Lane', cqi: 'CQI-2026-112', insp_result: 'Accepted', highRisk: true });
    add('flanges', 'flange-4', { ...flangeBase, isoId: 'iso-4', flange_id: 'FL-ST-004', from_equipment: 'Line 3"-ST-2101', to_equipment: 'PSV-301 inlet', eq_con: 'Relief valve inlet', pid: 'P&ID-ST-01', line_number: 'AT-ST-FL-004', fluid_code: 'ST', area_unit: 'Area 2 / Steam', location: 'Skid level 2', flange_size: '3" (DN80)', gasket_material: '316L / PTFE envelope', aantal_studbolts: 4, studbolt_afmeting: '5/8" x 90 mm', stud_dia: '5/8"', torque_wrench_id: 'TW-022', first_pass_nm: 35, second_pass_nm: 70, target_moment_nm: 110, max_dev: 8, tightning_date: '2026-10-26', report_nr: 'FT-2026-040', operator: 'Casey Brooks', cqi: 'CQI-2026-120', insp_result: 'Accepted', commisioning_date: '2026-11-02', operatingPressure: '8 bar', operatingTemp: '175 °C', testPressure: '12 bar', finished: true });
    action('release', { isoIds: ['iso-9'], type: 'Prefab', reportNo: 'PFR-001', engineerId: 'qa-1', date: '2026-10-20' });
    action('release', { isoIds: ['iso-3'], type: 'Prefab', reportNo: 'PFR-002', engineerId: 'qa-1', date: '2026-10-22' });
    action('release', { isoIds: ['iso-3'], type: 'Field', reportNo: 'FLR-001', engineerId: 'qa-1', date: '2026-10-25' });
    action('release', { isoIds: ['iso-3'], type: 'Hydrotest', reportNo: 'HTR-001', engineerId: 'qa-1', date: '2026-10-26' });
    // A reopened release in the history: iso-9's prefab release was reopened after the client's dimensional check and issued again.
    action('reopen-release', { isoId: 'iso-9', type: 'Prefab', reason: 'Client dimensional check found spool SP-009 out of tolerance; shop welds re-inspected after the correction.', date: '2026-10-21' });
    action('release', { isoIds: ['iso-9'], type: 'Prefab', reportNo: 'PFR-003', engineerId: 'qa-1', date: '2026-10-23' });
    // Prefab complete without a release document yet: STX-ST-004 waits on the Prefab release page, its shop welds are locked.
    action('complete-phase', { isoId: 'iso-4', type: 'Prefab' });
    seedHydrotest(store);
    // Field work packages: descriptions, a second package for the steam network and the first assignments (see shared/releases.ts).
    store.update('field_packages', 'fwp-1', { description: 'Cooling water loop, area 1: prefab spools erected and welded in the field.' }, store.get('field_packages', 'fwp-1')._version, SYSTEM);
    add('field_packages', 'fwp-2', { name: 'Steam header — Area 2', number: 'FWP-002', projectId: 'project-steam', description: 'Riverside steam header and branches, installed after the cooling loop.' });
    for (const [isoId, packageId] of [['iso-1', 'fwp-1'], ['iso-2', 'fwp-1'], ['iso-4', 'fwp-2']]) store.update('isometrics', isoId, { fieldPackageId: packageId }, store.get('isometrics', isoId)._version, SYSTEM);
    for (let i = 1; i <= 8; i++) action('adjust-material', { materialId: `material-${i}`, warehouseId: 'warehouse-main', chargeNo: 'H-1042', quantity: i === 3 ? 3 : 20 + i * 8, date: '2026-10-01', note: 'Sample opening balance' });
    // Procurement samples: an order for checked requirements without a supplier (assigned at take-in, delivered in full)
    // and a correction with its reason on the first order's partial delivery.
    const requirementOrder = action('order-requirements', { requirementIds: ['requirement-6', 'requirement-7', 'requirement-9'], date: '2026-10-21', note: 'Steam and skid prefab package' });
    if ('record' in requirementOrder && requirementOrder.record) {
      const lines = store.list('order_lines').filter(l => l.orderId === requirementOrder.record?.id);
      action('receive', { orderId: requirementOrder.record.id, supplierId: 'supplier-pipe', warehouseId: 'warehouse-main', date: '2026-10-23', items: lines.map((l, n) => ({ lineId: l.id, quantity: Number(l.quantity), chargeNo: `H-22${String(n + 6).padStart(2, '0')}` })) });
    }
    const po = action('order', { supplierId: 'supplier-steel', projectId: 'project-cooling', date: '2026-10-16', items: [{ materialId: 'material-1', quantity: 60 }, { materialId: 'material-3', quantity: 24 }] });
    if ('record' in po && po.record) { const line = store.list('order_lines').find(l => l.orderId === po.record?.id)!; action('receive', { orderId: po.record.id, warehouseId: 'warehouse-main', date: '2026-10-20', items: [{ lineId: line.id, quantity: 12, chargeNo: 'H-1043' }] }); }
    action('order', { supplierId: 'supplier-pipe', projectId: 'project-steam', date: '2026-10-19', items: [{ materialId: 'material-4', quantity: 42 }, { materialId: 'material-5', quantity: 16 }] });
    if ('record' in po && po.record) { const delivered = store.list('receipts').find(r => r.orderId === po.record?.id); if (delivered) action('correct-receipt', { receiptId: delivered.id, quantity: 2, date: '2026-10-22', note: 'Delivery note showed 12, two pieces were returned to the carrier' }); }
    action('issue-material', { isoId: 'iso-7', materialId: 'material-7', warehouseId: 'warehouse-main', chargeNo: 'H-1042', quantity: 8, date: '2026-10-18' });
    action('service', { spoolIds: ['spool-4'], companyId: 'service-coating', services: 'Surface preparation and coating', laydownId: 'laydown-b', date: '2026-10-20' });
    const tools = [['TIG welding set', true, 2], ['Angle grinder 125 mm', true, 3], ['Digital torque wrench', true, 2], ['Pipe alignment clamp', true, 4], ['Welding helmet', true, 4], ['Grinding discs, pack of 10', false, 5], ['Safety gloves, pair', false, 10], ['Hydraulic test pump', true, 1]];
    tools.forEach(([title, returnable, minimal], i) => { add('articles', `article-${i + 1}`, { title, barcode: `STX-T${String(i + 1).padStart(4, '0')}`, returnable, minimal }); action('adjust-tool', { articleId: `article-${i + 1}`, warehouseId: 'warehouse-main', quantity: i === 2 ? 2 : 12 + i * 2, date: '2026-10-01', note: 'Sample opening balance' }); });
    ['Alex Taylor', 'Robin Lane', 'Casey Brooks', 'Jordan Reed'].forEach((name, i) => add('clients', `client-${i + 1}`, { barcode: `C-${1001 + i}`, name, companyId: 'company-stelux', warehouseId: 'warehouse-main' }));
    for (let i = 1; i <= 5; i++) action('rent', { articleId: `article-${i}`, warehouseId: 'warehouse-main', clientId: `client-${i % 4 + 1}`, quantity: i === 3 ? 1 : 2, date: '2026-10-18', dueDate: i === 2 ? '2026-10-20' : '2026-10-28' });
    action('rent', { articleId: 'article-6', warehouseId: 'warehouse-main', clientId: 'client-1', quantity: 3, date: '2026-10-19' });
    seedWeldEntry(store);
    seedItpSamples(store);
    seedMtoStock(store, SYSTEM);
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

/**
 * Sample account for access per project site (local sample workspace of the hosted profile only; never called for
 * a connected database): a weld coordinator who works on North fabrication yard only in Weld Pilot and on every main
 * project in MTO Pilot. No password, like the other sample accounts. Runs once; an existing account is left untouched.
 */
export function seedSiteScopeSamples(store: Store) {
  if (store.db.prepare("SELECT value FROM metadata WHERE key='seed_site_scope_v1'").get()) return;
  store.transaction(() => {
    const has = (key: string, id: string) => store.list(key, true).some(row => row.id === id);
    const ready = ['profile-qaqc', 'profile-review'].every(id => has('profiles', id)) && has('sites', 'site-north');
    if (ready && !store.list('users', true).some(row => row.id === 'user-sample-north' || row.email === 'noor.bakker@example.com')) {
      store.create('users', { name: 'Noor Bakker', email: 'noor.bakker@example.com', title: 'Weld coordinator, North yard', phone: '+31 10 555 0186', companyId: has('companies', 'company-north') ? 'company-north' : '', profileId: 'profile-review', active: true, weldEnabled: true, weldProfileId: 'profile-qaqc', weldSiteScope: 'Specific project site(s)', mtoEnabled: true, mtoProfileId: 'profile-review', mtoSiteScope: 'All project sites' }, SYSTEM, 'user-sample-north');
      store.create('user_sites', { userId: 'user-sample-north', pilot: 'weld', siteId: 'site-north' }, SYSTEM);
    }
    store.db.prepare("INSERT INTO metadata(key,value) VALUES ('seed_site_scope_v1','1')").run();
  });
}

/**
 * Sample company data for documents (local sample workspace of the hosted profile only; never called for a
 * connected database): a fictional contractor, no logo. Runs once; an existing company record is left untouched.
 */
export function seedCompanySample(store: Store) {
  if (store.db.prepare("SELECT value FROM metadata WHERE key='seed_company_v1'").get()) return;
  store.transaction(() => {
    if (!store.list('company_data', true).length) store.create('company_data', { name: 'Kestrel Pipe Fabrication B.V.', address: 'Havenstraat 112', address2: 'Unit 4, Prefab hall', zip: '3089 KB', residence: 'Rotterdam', phone: '+31 10 555 0100', logoHeight: 18 }, SYSTEM, 'company-data');
    store.db.prepare("INSERT INTO metadata(key,value) VALUES ('seed_company_v1','1')").run();
  });
}
