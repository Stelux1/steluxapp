import { canScope, scopeOperation } from './permissions.ts';
import type { PermissionVerb, User } from './types.ts';

/**
 * Tables whose CSV / Excel the server writes (`POST /api/export/table`, server/report-export.ts) and the permission area
 * whose Export box decides who may download them. The page sends the columns and rows it lists; the server checks the
 * right of the area and builds the file, so a button hidden in the browser is also refused on the server.
 *
 * Where a reference area has no Export box (20 ISO execution, 13 Material order, 14 Pending order) the export follows
 * the area's Show box, the rule every local control of the project uses (`scopeOperation`); where the reference page
 * shows no export at all (23 Service request rows, 24 Request archive) no table is listed here.
 */
export interface ExportTable { title: string; area: string }
export const EXPORT_TABLES: Record<string, ExportTable> = {
  'iso-execution': { title: 'Isometric execution', area: '20' },
  'picklist-archive': { title: 'Pick List archive', area: '21' },
  picklist: { title: 'Pick List', area: '21' },
  'order-materials': { title: 'Order materials', area: '13' },
  'pending-order': { title: 'Pending order', area: '14' },
  'take-in': { title: 'Material take in', area: '15' },
  'order-archive': { title: 'Order archive', area: '17' },
  'material-inventory': { title: 'Material inventory', area: '16' },
  'release-prefab': { title: 'Release prefab', area: '86' },
  'release-field': { title: 'Release field', area: '89' },
  'release-hydrotest': { title: 'Release hydrotest', area: '74' },
  'assign-fwp': { title: 'Assign ISO to FWP', area: '91' },
};
/** Columns of the Order materials export (the list's own column titles; the reference Export is an Excel file of the list). */
export const ORDER_MATERIALS_EXPORT_COLUMNS = ['Material group', 'Article No', 'Material No', 'DIA', 'LBS/SCH', 'Description', 'Quantity', 'UOM'] as const;
/** Columns of the Material inventory export: the reference exports its columns 0-7, Material group to UOM (Options and the check box are left out). */
export const INVENTORY_EXPORT_COLUMNS = ORDER_MATERIALS_EXPORT_COLUMNS;
/** The area of the release lists and archives of one release type (Prefab 86, Field 89, Hydrotest 74). */
export const releaseExportTable = (type: string) => type === 'Field' ? 'release-field' : type === 'Hydrotest' ? 'release-hydrotest' : 'release-prefab';
/** Export welds (Weld Pilot → Welding data → Export weld data). */
export const EXPORT_WELDS_AREA = '81';
export const PICKLIST_ARCHIVE_EXPORT_AREA = '21';

/** Whether the account holds the Export (or Print) right of an area; an area without that box follows its Show box. */
export function areaRight(user: User, area: string, verb: Extract<PermissionVerb, 'export' | 'print'> = 'export'): boolean {
  return canScope(user, area, scopeOperation(area, verb));
}
/** The verb to ask `canArea` for, so the browser asks exactly what the server asks. */
export const areaVerb = (area: string, verb: Extract<PermissionVerb, 'export' | 'print'> = 'export'): PermissionVerb => scopeOperation(area, verb);
export const canExportTable = (user: User, table: string): boolean => Boolean(EXPORT_TABLES[table]) && areaRight(user, EXPORT_TABLES[table].area);

/** A CSV of a table: a byte order mark for Excel, every cell quoted, cells that would start a formula quoted as text. */
export function tableCsv(columns: readonly string[], lines: readonly (readonly unknown[])[]): string {
  const cell = (value: unknown) => { let text = String(value ?? ''); if (/^\s*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
  return '﻿' + [columns.map(cell).join(','), ...lines.map(line => columns.map((_, index) => cell(line[index])).join(','))].join('\r\n');
}
