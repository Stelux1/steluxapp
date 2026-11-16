import { runMtoStock } from './mto-stock.ts';
import type { Actor, Store } from './store.ts';

type Input = Record<string, unknown>;

/**
 * Sample storehouses, inventory operations and transfer orders for the local sample workspace (runs once with
 * the sample seed; never for a connected database). Quantities build on the opening balances of the seed.
 */
export function seedMtoStock(store: Store, actor: Actor) {
  const run = (key: string, data: Input) => runMtoStock(store, key, data, actor);
  const patch = (id: string, data: Input) => { const row = store.get('warehouses', id); store.update('warehouses', id, data, row._version, actor); };
  patch('warehouse-main', { address: '18 Foundry Road', zip: '3089', description: 'Covered storage for pipe, fittings and flanges. Heat numbers are kept per line.' });
  patch('warehouse-field', { address: '42 Harbour Lane', zip: '2000', description: 'Container store at the riverside installation for material released to site.' });
  store.create('warehouses', { name: 'Prefab yard store', siteId: 'site-north', companyId: 'company-stelux', use: 'Materials', address: '20 Foundry Road', zip: '3089', residence: 'Rotterdam', description: 'Open-air racks next to the prefab bay for heavy pipe and finished spools.' }, actor, 'warehouse-yard');
  const line = (warehouseId: string, materialId: string, chargeNo: string) => store.list('stock').find(row => row.warehouseId === warehouseId && row.materialId === materialId && row.chargeNo === chargeNo)!;
  run('stock-add', { warehouseId: 'warehouse-yard', materialId: 'material-1', chargeNo: 'H-2207', quantity: 36, date: '2026-10-12' });
  run('stock-add', { warehouseId: 'warehouse-yard', materialId: 'material-3', chargeNo: 'H-2211', quantity: 14, date: '2026-10-12' });
  run('stock-add', { warehouseId: 'warehouse-yard', materialId: 'material-4', chargeNo: 'H-3310', quantity: 18.5, date: '2026-10-13' });
  run('stock-to-project', { siteId: 'site-north', items: [{ stockId: line('warehouse-main', 'material-1', 'H-1042').id, quantity: 12 }], date: '2026-10-19', note: 'Cooling loop prefab, area 1' });
  run('stock-return', { stockId: line('warehouse-main', 'material-1', 'H-1042').id, siteId: 'site-north', quantity: 2, date: '2026-10-21', note: 'Cut-offs returned from the prefab bay' });
  run('stock-move', { stockId: line('warehouse-main', 'material-2', 'H-1042').id, toWarehouseId: 'warehouse-field', quantity: 6, date: '2026-10-20' });
  run('stock-correct', { stockId: line('warehouse-main', 'material-5', 'H-1042').id, materialGroup: 'Tee', articleNo: 'ART-1005', uom: 'EA', description: 'Equal tee, stainless steel 316L, butt weld', dia: '4', lbs: 'SCH 10S', reason: 'Name correction', reasonText: 'Description imported without the end connection.', chargeNo: 'H-1042', date: '2026-10-21' });
  run('stock-adjust', { stockId: line('warehouse-main', 'material-6', 'H-1042').id, quantity: 66, reasonText: 'Two gate valves rejected at the cycle count.', date: '2026-10-22' });
  const order = (data: Input) => run('transfer-order-create', { date: '2026-10-22', ...data }).record!;
  order({ type: 'Storehouse → Storehouse', priority: 'Urgent', fromWarehouseId: 'warehouse-main', toWarehouseId: 'warehouse-field', notes: 'Fittings for the riverside steam network.', items: [{ materialNo: 'SS-E114', description: '90° elbow, stainless steel 316L', quantity: 10, uom: 'EA' }, { materialNo: 'CS-E090', description: '90° long radius elbow', quantity: 4, uom: 'EA' }] });
  order({ type: 'Inventory - Project', fromWarehouseId: 'warehouse-main', siteId: 'site-river', notes: 'Flanges for the first hydrotest loop.', items: [{ stockId: line('warehouse-main', 'material-3', 'H-1042').id, materialNo: 'CS-F150', description: 'Weld neck flange, class 150', quantity: 2, uom: 'EA' }] });
  const done = order({ type: 'Storehouse → Project', fromWarehouseId: 'warehouse-main', siteId: 'site-north', notes: 'Elbows for the cooling loop.', items: [{ materialNo: 'CS-E090', description: '90° long radius elbow', quantity: 3, uom: 'EA' }] });
  run('transfer-order-complete', { orderId: done.id, date: '2026-10-23' });
}
