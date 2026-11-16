import { useState } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { exportTable, useTableRights } from './table-export.ts';

/**
 * CSV, Excel and Print of a table, as the reference's table buttons. The Export right of the table's area decides whether
 * CSV and Excel show (the server asks the same when it writes the file); Print follows the area's Print box.
 */
export function TableExportButtons({ table, name, header, lines }: { table: string; name: string; header: readonly string[]; lines: readonly (readonly unknown[])[] }) {
  const { canExport, canPrint } = useTableRights(); const [busy, setBusy] = useState<'csv' | 'xlsx' | ''>(''); const [error, setError] = useState('');
  async function save(format: 'csv' | 'xlsx') { setBusy(format); setError(''); try { await exportTable(table, format, header, lines, name); } catch (problem) { setError((problem as Error).message || 'The file could not be created.'); } finally { setBusy(''); } }
  if (!canExport(table) && !canPrint(table)) return null;
  return <div className="table-utilities" role="group" aria-label="Export">
    {canExport(table) && <>
      <button type="button" className="btn subtle small" onClick={() => void save('csv')} disabled={!lines.length || Boolean(busy)}>{busy === 'csv' ? <Loader2 size={14} className="spin"/> : <Download size={14}/>}CSV</button>
      <button type="button" className="btn subtle small" onClick={() => void save('xlsx')} disabled={!lines.length || Boolean(busy)}>{busy === 'xlsx' ? <Loader2 size={14} className="spin"/> : <Download size={14}/>}Excel</button></>}
    {canPrint(table) && <button type="button" className="btn subtle small" onClick={() => window.print()} aria-label="Print"><Printer size={14}/>Print</button>}
    {error && <span className="field-error" role="alert">{error}</span>}
  </div>;
}
