import test from 'node:test';
import assert from 'node:assert/strict';
import { isNonWeldCode, nonWeldCode } from '../shared/weld-codes.ts';

test('weld codes: GAP, SP, E and B next to digits are no welds, case-insensitive; ordinary numbers are', () => {
  for (const [weldNo, code] of [['12GAP', 'GAP'], ['1SP2', 'SP'], ['E12', 'E'], ['09E', 'E'], ['B12', 'B'], ['07B', 'B'], ['e01', 'E'], ['12gap', 'GAP'], ['GAP3', 'GAP'], ['SP01', 'SP'], [' E02 ', 'E']] as const) {
    assert.equal(nonWeldCode(weldNo), code, weldNo); assert.equal(isNonWeldCode(weldNo), true, weldNo);
  }
  for (const weldNo of ['120', '001', '005A', '010R1', 'W040', 'BP 01', 'E', 'GAP', 'SPOOL1', '', null, undefined]) {
    assert.equal(nonWeldCode(weldNo), null, String(weldNo)); assert.equal(isNonWeldCode(weldNo), false, String(weldNo));
  }
  assert.equal(isNonWeldCode('09E', ['e']), false, 'a ticked code is included again (export)');
  assert.equal(isNonWeldCode('12GAP', ['E']), true);
});
