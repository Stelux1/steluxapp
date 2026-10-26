import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Store, SYSTEM } from './store.ts';
import { runtimeConfig } from './runtime-config.ts';
import type { Row } from '../shared/types.ts';

type SourceRow = Record<string, unknown>;
export function initializePrototype(store: Store) {
  if (!store.list('profiles', true).some(row => row.id === 'profile-admin')) store.create('profiles', { name: 'Administrator', ...Object.fromEntries(['general', 'materials', 'welding', 'tools', 'settings'].map(module => [`${module}Permission`, 'Administration'])) }, SYSTEM, 'profile-admin');
}

/** Imports only a separate local Store; the CLI never loads .env or PostgreSQL. */
export function importAccessPrototype(store: Store, source: SourceRow[]) {
  if (!Array.isArray(source) || !source.length || source.length > 10000 || source.some(row => !row || typeof row !== 'object' || !row.Isometric || !row['Weld No'] || !row.Project || !row['Project site'])) throw new Error('Expected ISO details rows with project site, project, isometric, and weld number.');
  const fingerprint = createHash('sha256').update(JSON.stringify(source)).digest('hex');
  const previous = store.db.prepare("SELECT value FROM metadata WHERE key='access_prototype_import'").get();
  if (previous) {
    if (previous.value === fingerprint) return { imported: 0, skipped: source.length };
    throw new Error('This prototype already contains a different import. Use a separate local workspace before importing another source.');
  }
  if (['projects', 'isometrics', 'welds'].some(key => store.list(key, true).length)) throw new Error('Import requires an empty prototype workspace. Existing project records will not be overwritten.');
  return store.transaction(() => {
    initializePrototype(store);
    const clean = (value: unknown) => value == null || /^-+$/.test(String(value).trim()) ? '' : String(value).trim();
    const numeric = (value: unknown) => clean(value) === '' ? null : Number(clean(value).replace(',', '.'));
    const yes = (value: unknown) => ['yes', 'true', '1'].includes(clean(value).toLowerCase());
    const ensure = (key: string, identity: Record<string, unknown>, extra: Record<string, unknown> = {}): Row => {
      const existing = store.list(key).find(row => Object.entries(identity).every(([name, value]) => row[name] === value));
      return existing || store.create(key, { ...extra, ...identity }, SYSTEM);
    };
    for (const sourceRow of source) {
      const value = (key: string) => clean(sourceRow[key]);
      const site = ensure('sites', { name: value('Project site') });
      const project = ensure('projects', { internnumber: value('Project'), siteId: site.id });
      const isoFields: Record<string, unknown> = Object.fromEntries(Object.entries({ itpNo: 'ITP No', irn: 'IRN no', assetTag: 'Asset Tag', drawingNo: 'Drawing No', xRay: 'X-Ray', xaxis: 'X-Axis', yaxis: 'Y-Axis', pipingClass: 'Piping Class', testPressure: 'Test Pressure', testMedium: 'Test Medium', ped: 'PED', nomDiameter: 'Nom diameter', paintSpec: 'Paint Spec', insulation: 'Insulation', elevation: 'Elevation', chemicalClean: 'Chemical Clean', tracing: 'Tracing', area: 'Zone/Area', material: 'Material' }).map(([key, label]) => [key, value(label)]));
      const ndtPercentage = numeric(sourceRow['X-Ray']);
      if (ndtPercentage !== null && Number.isFinite(ndtPercentage) && ndtPercentage >= 0 && ndtPercentage <= 100) isoFields.ndtPercentage = ndtPercentage;
      if (value('Test System')) isoFields.testSystemId = ensure('test_systems', { name: value('Test System'), projectId: project.id }).id;
      const iso = ensure('isometrics', { isoNo: value('Isometric'), projectId: project.id }, isoFields);
      if (Object.entries(isoFields).some(([key, field]) => String(iso[key] || '') !== String(field || ''))) throw new Error(`Conflicting ISO details for ${iso.isoNo}. Import was rolled back.`);
      const data: Record<string, unknown> = { weldNo: value('Weld No'), isoId: iso.id, datefit: value('Fitup date'), date: value('Weld date'), jointType: value('Joint type'), ndoReq: yes(sourceRow['NDT Req#']), tracer: yes(sourceRow.Tracer), lengthMode: Number(numeric(sourceRow['Dia Length'])) > 0 ? 'Length in mm' : 'Diameter', dialen: numeric(sourceRow['Dia Length']) };
      if (value('Weld Type')) data.typeId = ensure('weld_types', { name: value('Weld Type') }, { abbreviation: value('Weld Type'), location: value('Weld Type') === 'S' ? 'Shop' : value('Weld Type') === 'F' ? 'Field' : '' }).id;
      if (value('Spool')) data.spoolId = ensure('spools', { name: value('Spool'), isoId: iso.id }).id;
      if (value('WPS No')) {
        const wps = ensure('wps', { name: value('WPS No') }, { method: value('Welding Process') || 'Not recorded', definition: 'Imported Access prototype reference', jointType: value('Joint type'), siteIds: [site.id] });
        data.wpsId = wps.id;
      }
      if (value('Coating 1')) data.coating1Id = ensure('coatings', { name: value('Coating 1') }).id;
      if (value('Diameter (inch)')) data.diameterId = ensure('diameters', { diameter: `${value('Diameter (inch)')} in` }, { sizeinch: numeric(sourceRow['Diameter (inch)']), outline: numeric(sourceRow.Outline) }).id;
      for (const side of [1, 2, 3, 4]) {
        const welder = value(side === 1 ? 'Welder' : `Welder ${side}`);
        if (welder) {
          const [code, ...name] = welder.split('|');
          data[`welder${side}Id`] = ensure('welders', { number: code.trim() }, { welderCode: code.trim(), name: name.join('|').trim() }).id;
        }
      }
      for (const side of [1, 2]) {
        if (value(`Wire ${side}`)) data[`wire${side}Id`] = ensure('welding_wires', { name: value(`Wire ${side}`) }).id;
        data[`pos${side}`] = value(`Pos ${side}`); data[`chargeNo${side}`] = value(`Charge No ${side}`);
        const description = value(`Material ${side}`), article = value(`Article no ${side}`), index = value(`Index No ${side}`);
        const material = description || article ? ensure('materials', { materialNo: article || `ACCESS-${index || source.indexOf(sourceRow)}-${side}` }, { articleNo: article, description: description || article, dia: value('Diameter (inch)'), lbs: value(`Schedule ${side}`), wallThickness: value(`Wall thickness ${side}`), uom: 'EA' }) : undefined;
        if (material) data[`material${side}Id`] = material.id;
        if (index) {
          const certificate = ensure('certifications', { name: `Access index ${index}` }, { indexNo: index, materialId: material?.id || '', chargeNo: value(`Charge No ${side}`), diameter: value('Diameter (inch)'), materialDescription: description, wallThickness: value(`Wall thickness ${side}`), schedule: value(`Schedule ${side}`), description: 'Source contains a certificate index; the original certificate document was not supplied.' });
          data[`certificate${side}Id`] = certificate.id;
        }
      }
      const weld = store.create('welds', data, SYSTEM);
      const inspection = (type: string, process: string, result: string, report: string, date: string, location = '', requestNo = '') => {
        if (!process && !report && !result && !requestNo) return;
        const heat = ['PWHT', 'PRE-HT'].includes(type);
        const processId = process ? ensure(heat ? 'pwht_processes' : 'ndt_processes', { name: process }).id : '';
        const locationId = location ? ensure(heat ? 'pwht_locations' : 'ndt_locations', { name: location }).id : '';
        const accepted = ['yes', 'accepted', 'true', '1'].includes(result.toLowerCase()), rejected = ['no', 'rejected', 'false', '0'].includes(result.toLowerCase());
        if (result && !accepted && !rejected) throw new Error(`Unknown inspection result: ${result}`);
        const request = store.create('inspection_requests', { number: requestNo || store.next(type), weldId: weld.id, type, [heat ? 'pwhtProcessId' : 'processId']: processId, [heat ? 'pwhtLocationId' : 'locationId']: locationId, date, status: accepted ? 'Accepted' : rejected ? 'Rejected' : 'Open' }, SYSTEM);
        if (accepted || rejected) store.create('inspection_results', { requestId: request.id, weldId: weld.id, type, reportNo: report, result: accepted ? 'Accepted' : 'Rejected', round: 'Initial', examinedLength: numeric(sourceRow.Outline), date, naLength: type === 'NDT' ? numeric(sourceRow['NA Length']) : null, defectType: type === 'NDT' ? value('Defect type') : '' }, SYSTEM);
        else if (report) throw new Error(`A ${type} report has no accepted / rejected result. Import was rolled back.`);
      };
      inspection('VI', '', value('VT'), value('VT Report'), '');
      for (const i of [1, 2, 3, 4]) inspection('NDT', value(`NDT ${i}`), value(`NDT ${i} result`), value(`NDT Report ${i}`), '');
      for (const [prefix, type] of [['Pre-HT', 'PRE-HT'], ['PWHT', 'PWHT']]) {
        if (value(`${prefix} report no`)) throw new Error('Heat-treatment reports in the source do not specify a result. Review them before import.');
        inspection(type, value(`${prefix} process`), '', '', value(`${prefix} date`), value(`${prefix} ${prefix === 'Pre-HT' ? 'locaction' : 'location'}`), value(`${prefix} req#no`));
      }
      // Preserve source record dates; the audit trail still records the actual import time.
      for (const [sourceKey, column] of [['Created', 'created_at'], ['Last edit date', 'updated_at']]) if (value(sourceKey)) {
        const sourceDate = value(sourceKey);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate) || new Date(sourceDate).toISOString().slice(0, 10) !== sourceDate) throw new Error(`Invalid ${sourceKey} date.`);
        store.db.prepare(`UPDATE welds SET ${column}=? WHERE id=?`).run(`${sourceDate}T00:00:00.000Z`, weld.id);
      }
    }
    store.db.prepare("INSERT INTO metadata(key,value) VALUES('access_prototype_import',?)").run(fingerprint);
    return { imported: source.length, skipped: 0 };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = runtimeConfig({ STELUX_RELEASE_PROFILE: 'access-prototype' });
  const source = JSON.parse(readFileSync(resolve(process.argv[2] || '.data/access-prototype/source.json'), 'utf8'));
  const store = new Store(resolve(config.dataDir, 'stelux.sqlite'));
  try { console.log(JSON.stringify(importAccessPrototype(store, source))); } finally { store.close(); }
}
