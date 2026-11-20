import test from 'node:test';
import assert from 'node:assert/strict';
import { isoDrawingTitle, itpDrawingTitle, latestIsoFile } from '../shared/iso-pages.ts';
import type { Row } from '../shared/types.ts';

const iso = { id: 'i1', isoNo: 'ISO-1', revNo: '2' } as unknown as Row;
const file = (id: string, documentType: string) => ({ id, entityType: 'isometrics', entityId: 'i1', documentType, name: id }) as unknown as Row;

test('the latest ISO file is the one attached for the current revision', () => {
  const rows = { isometrics: [iso], attachments: [file('f2', 'ISO revision 2'), file('f1', 'ISO revision 1')] } as Record<string, Row[]>;
  const result = latestIsoFile(rows, rows.attachments, 'i1', 'ISO');
  assert.equal(result.file?.id, 'f2'); assert.equal(result.revision, '2');
  assert.match(isoDrawingTitle(result.file, result.revision), /Rev 2\) in a new tab/);
});
test('without a file the name is plain text with an explanatory title', () => {
  const rows = { isometrics: [iso], attachments: [file('f1', 'ISO revision 1')] } as Record<string, Row[]>;
  const result = latestIsoFile(rows, [], 'i1', 'ISO');
  assert.equal(result.file, undefined);
  assert.equal(isoDrawingTitle(undefined, '2'), 'No drawing file uploaded yet');
  assert.equal(itpDrawingTitle(undefined, '1'), 'No ITP file uploaded yet');
});
