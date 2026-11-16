import { runMtoStock } from './mto-stock.ts';
import { runAction } from './workflows.ts';
import type { Actor, Store } from './store.ts';

type Input = Record<string, unknown>;

/**
 * Sample storehouses, project site inventories, storehouse operations and transfer orders for the local sample
 * workspace (runs once with the sample seed; never for a connected database). Quantities build on the opening
 * balances of the seed, which lie in the Main warehouse; the take-ins of the seed went into the project sites' inventories.
 */
export function seedMtoStock(store: Store, actor: Actor) {
  const run = (key: string, data: Input) => runMtoStock(store, key, data, actor);
  const patch = (id: string, data: Input) => { const row = store.get('warehouses', id); store.update('warehouses', id, data, row._version, actor); };
  // Storehouses are company records that every project site uses: no project site of their own.
  patch('warehouse-main', { siteId: '', location: 'Rotterdam, 18 Foundry Road', address: '18 Foundry Road', zip: '3089', description: 'Covered storage for pipe, fittings and flanges. Heat numbers are kept per line.' });
  patch('warehouse-field', { siteId: '', location: 'Antwerp, 42 Harbour Lane', address: '42 Harbour Lane', zip: '2000', description: 'Container store at the riverside installation for material released to site.' });
  store.create('warehouses', { name: 'Prefab yard store', location: 'Rotterdam, prefab bay', companyId: 'company-stelux', use: 'Materials', address: '20 Foundry Road', zip: '3089', residence: 'Rotterdam', description: 'Open-air racks next to the prefab bay for heavy pipe and finished spools.' }, actor, 'warehouse-yard');
  const line = (warehouseId: string, materialId: string, chargeNo: string) => store.list('stock').find(row => row.locationKind !== 'site' && row.warehouseId === warehouseId && row.materialId === materialId && row.chargeNo === chargeNo)!;
  // Storehouse lines of the yard (opening balances of the storehouse itself).
  for (const [materialId, chargeNo, quantity] of [['material-1', 'H-2207', 36], ['material-3', 'H-2211', 14], ['material-4', 'H-3310', 18.5]] as const)
    runAction(store, 'adjust-material', { materialId, warehouseId: 'warehouse-yard', chargeNo, quantity, date: '2026-10-12', note: 'Sample opening balance' }, actor);
  // Material handed from the storehouses to the project sites' inventories (what their isometrics count and pick from).
  run('stock-to-project', { siteId: 'site-north', items: [['material-1', 16], ['material-2', 12], ['material-4', 12], ['material-5', 6], ['material-6', 8], ['material-8', 10]].map(([materialId, quantity]) => ({ stockId: line('warehouse-main', String(materialId), 'H-1042').id, quantity })), date: '2026-10-19', note: 'Cooling loop prefab, area 1' });
  run('stock-to-project', { siteId: 'site-river', items: [{ stockId: line('warehouse-main', 'material-1', 'H-1042').id, quantity: 4 }, ...[['material-4', 20], ['material-5', 16], ['material-6', 8], ['material-7', 12]].map(([materialId, quantity]) => ({ stockId: line('warehouse-main', String(materialId), 'H-1042').id, quantity }))], date: '2026-10-19', note: 'Riverside steam network, first issue' });
  run('stock-return', { stockId: line('warehouse-yard', 'material-1', 'H-2207').id, siteId: 'site-north', quantity: 2, date: '2026-10-21', note: 'Cut-offs for the prefab bay' });
  run('stock-move', { stockId: line('warehouse-main', 'material-2', 'H-1042').id, toWarehouseId: 'warehouse-field', quantity: 6, date: '2026-10-20' });
  run('stock-correct', { stockId: line('warehouse-main', 'material-5', 'H-1042').id, materialGroup: 'Tee', articleNo: 'ART-1005', uom: 'EA', description: 'Equal tee, stainless steel 316L, butt weld', dia: '4', lbs: 'SCH 10S', reason: 'Name correction', reasonText: 'Description imported without the end connection.', chargeNo: 'H-1042', date: '2026-10-21' });
  run('stock-adjust', { stockId: line('warehouse-main', 'material-6', 'H-1042').id, quantity: 50, reasonText: 'Two gate valves rejected at the cycle count.', date: '2026-10-22' });
  const order = (data: Input) => run('transfer-order-create', { date: '2026-10-22', ...data }).record!;
  order({ type: 'Storehouse → Storehouse', priority: 'Urgent', fromWarehouseId: 'warehouse-main', toWarehouseId: 'warehouse-field', notes: 'Fittings for the riverside steam network.', items: [{ materialNo: 'SS-E114', description: '90° elbow, stainless steel 316L', quantity: 10, uom: 'EA' }, { materialNo: 'CS-E090', description: '90° long radius elbow', quantity: 4, uom: 'EA' }] });
  order({ type: 'Inventory - Project', fromSiteId: 'site-north', siteId: 'site-river', notes: 'Pipe for the first hydrotest loop.', items: [{ materialNo: 'CS-P060', description: 'Seamless carbon steel pipe', quantity: 2, uom: 'M' }] });
  const done = order({ type: 'Storehouse → Project', fromWarehouseId: 'warehouse-main', siteId: 'site-north', notes: 'Elbows for the cooling loop.', items: [{ materialNo: 'CS-E090', description: '90° long radius elbow', quantity: 3, uom: 'EA' }] });
  run('transfer-order-complete', { orderId: done.id, date: '2026-10-23' });
}
