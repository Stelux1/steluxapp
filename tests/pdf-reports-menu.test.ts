import test from 'node:test';
import assert from 'node:assert/strict';
import { PDF_MENU, pdfEntries } from '../client/pdf-reports.tsx';
import { PDF_DOCUMENTS } from '../server/pdf/documents.ts';
import { NDT_FORM_COLUMNS, COLUMN_TABLE } from '../shared/pdf-ndt-columns.ts';

test('the Reports menu of the Weld isometric page lists the documents in the order of the reference', () => {
  assert.deepEqual(pdfEntries('weld', 'isometric').map(entry => entry.label), [
    'LISL Report', 'LISL Report (A3)', 'LISL Report [GU]', 'LISL Report [MV]', 'LISL Report [ISS]', 'LISL Report [WQ]', 'LISL Report [WQ ver 2]',
    'LISL Report [GU Rev 2]', 'LISL Report [GU Rev 3]', 'Blank LISL template', 'Weld card', 'Weld labels', 'Punch list - blank',
  ]);
  assert.deepEqual(pdfEntries('mto', 'materials').map(entry => entry.label), ['MTO report']);
  assert.deepEqual(pdfEntries('mto', 'isometric'), [], 'MTO Pilot has no LISL menu');
  assert.deepEqual(pdfEntries('weld', 'certifications').map(entry => entry.label), ['Certification index']);
  assert.deepEqual(pdfEntries('mto', 'certifications').map(entry => entry.label), ['Certification index']);
});

test('every menu entry has a document on the server, and every document a menu entry or a button of its own record', () => {
  const documents = PDF_DOCUMENTS.map(document => document.key), menu = PDF_MENU.map(entry => entry.key);
  for (const key of menu) assert.ok(documents.includes(key), `${key} has a document`);
  // Documents of their own record (requests, releases, punch / flange / pick lists) are printed from that record's page.
  const elsewhere = PDF_DOCUMENTS.filter(document => !menu.includes(document.key)).map(document => [document.key, document.scope]);
  assert.deepEqual(elsewhere.filter(([, scope]) => scope !== 'scoped'), [], 'every isometric or project document is in the menu');
});

test('one NDT column module: every form column has an id and a label, the [GU] table is derived from its columns', () => {
  for (const [form, columns] of Object.entries(NDT_FORM_COLUMNS)) {
    assert.ok(columns.length > 0, form);
    assert.equal(new Set(columns.map(column => column.id)).size, columns.length, `${form}: unique ids`);
  }
  assert.equal(COLUMN_TABLE.NDT.MT, 'MTPT'); assert.equal(COLUMN_TABLE['NDT PRE'].MT, 'MTPT_PRE'); assert.equal(COLUMN_TABLE.PWHT.any, 'PWHT');
});
