import { apiBlob } from './api.ts';
import { EXPORT_TABLES, areaVerb } from '../shared/export-tables.ts';
import { useWorkspace } from './context.tsx';

/** Saves a file the server wrote (or any blob) under a name. */
export function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * CSV or Excel of a table the page lists. The server decides: it checks the Export right of the table's area
 * (`EXPORT_TABLES`, shared/export-tables.ts) and writes the file, so a profile without the right is refused
 * even when a button is shown by mistake.
 */
export async function exportTable(table: string, format: 'csv' | 'xlsx', columns: readonly string[], lines: readonly (readonly unknown[])[], fileName: string) {
  const blob = await apiBlob('/export/table', { method: 'POST', body: JSON.stringify({ table, format, columns, rows: lines }) });
  saveBlob(`${fileName}.${format}`, blob);
}

/** Whether the account may export or print a table: the Export / Print box of its area, as the server asks it. */
export function useTableRights() {
  const { canArea } = useWorkspace();
  const area = (table: string) => EXPORT_TABLES[table]?.area;
  return {
    canExport: (table: string) => { const key = area(table); return Boolean(key) && canArea(key!, areaVerb(key!, 'export')); },
    canPrint: (table: string) => { const key = area(table); return Boolean(key) && canArea(key!, areaVerb(key!, 'print')); },
  };
}
