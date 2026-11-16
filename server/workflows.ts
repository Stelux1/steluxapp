import { ACTIONS } from '../shared/actions.ts';
import { phaseFields, RESOURCE_MAP } from '../shared/resources.ts';
import { availableWps } from '../shared/welding.ts';
import { MATERIAL_FIELDS } from '../shared/materials.ts';
import { Store, AppError, positive, qty, validDate, today, type Actor } from './store.ts';
import type { Row } from '../shared/types.ts';
import { requirementExecution } from '../shared/materials.ts';
import { runHydrotestAction } from './hydrotest.ts';
import { WELD_ENTRY_ACTIONS, runWeldEntryAction } from './weld-entry.ts';
import { INSPECTION_ACTION_KEYS } from '../shared/inspections.ts';
import { inspectionRules } from './inspections.ts';
import { assignFieldPackage, releaseIsometrics, reopenRelease } from './releases.ts';
import { runPunchAction } from './punch.ts';
import { MTO_MATERIAL_ACTIONS, runMtoMaterialAction } from './mto-materials.ts';
import { correctReceipt, receivingWarehouseId, recordReceipt, type ProcurementContext } from './mto-procurement.ts';
import { isMtoStockAction } from '../shared/mto-stock.ts';
import { runMtoStock } from './mto-stock.ts';
import { MTO_ACTION_KEYS } from '../shared/mto-logistics.ts';
import { runMtoLogisticsAction } from './mto-logistics.ts';
import { createSpoolServiceRequest, moveSpoolsToLaydown, nextNumber } from './spool-logistics.ts';
import { duplicateSite } from './site-duplicate.ts';
import { reorderAttachmentNames } from './attachment-names.ts';

type Input = Record<string, unknown>;
const str = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const ids = (v: unknown, label: string) => {
  if (!Array.isArray(v) || !v.length || v.length > 500 || v.some(x => typeof x !== 'string' || !x)) throw new AppError(422, `Select at least one ${label}.`);
  return [...new Set(v)] as string[];
};
export function weldLength(store: Store, weld: Row) {
  if (weld.lengthMode === 'Length in mm') return Number(weld.dialen) || 0;
  return weld.diameterId ? Number(store.get('diameters', weld.diameterId, true).outline) || 0 : 0;
}
/** `inspectionRules`: the profile delivers the inspections flow (hosted), so a not-accepted NDT result also creates its repair weld. */
export function runAction(store: Store, key: string, data: Input, actor: Actor, options: { inspectionRules?: boolean; hosted?: boolean } = {}) {
  if (!ACTIONS[key]) throw new AppError(404, 'This action does not exist.');
  if (key.startsWith('hydrotest-')) return runHydrotestAction(store, key, data, actor);
  if (WELD_ENTRY_ACTIONS.has(key)) return runWeldEntryAction(store, key, data, actor);
  if (isMtoStockAction(key)) return store.transaction(() => runMtoStock(store, key, data, actor));
  return store.transaction(() => {
    if (INSPECTION_ACTION_KEYS.includes(key)) return inspectionRules(store, actor).run(key, data);
    const date = data.date ? validDate(data.date) : today();
    const note = str(data.note);
    const ensure = (resource: string, id: unknown) => store.get(resource, id);
    const add = (resource: string, input: Input) => store.create(resource, input, actor);
    const patch = (resource: string, row: Row, input: Input) => store.update(resource, row.id, input, row._version, actor);
    if (key === 'duplicate-site') return duplicateSite(store, data, actor);
    if (key === 'reorder-attachment-names') return reorderAttachmentNames(store, data, actor);
    if (key.startsWith('punch-')) return { resource: 'punchlists', record: runPunchAction(store, key, data, actor).record };
    const warehouse = (id: unknown, tool: boolean) => {
      const row = ensure('warehouses', id);
      if (row.use === (tool ? 'Materials' : 'Tools')) throw new AppError(422, `Choose a warehouse that holds ${tool ? 'tools' : 'materials'}.`);
      return row;
    };
    const materialOf=(input:Input)=>{if(Boolean(input.materialId)===Boolean(input.customMaterialId))throw new AppError(422,'Choose one catalog or custom material.');const custom=Boolean(input.customMaterialId);const record=ensure(custom?'custom_materials':'materials',custom?input.customMaterialId:input.materialId);return {record,custom,refs:{materialId:custom?'':record.id,customMaterialId:custom?record.id:''}};};
    const balance = (tool: boolean, itemId: string, warehouseId: string, chargeNo: string, delta: number, custom=false) => {
      const resource = tool ? 'tool_stock' : 'stock';
      const itemKey = tool ? 'articleId' : custom?'customMaterialId':'materialId';
      const existing = store.list(resource).find(r => r[itemKey] === itemId && r.warehouseId === warehouseId && (tool || (r.chargeNo || '') === chargeNo));
      const next = qty(Number(existing?.quantity || 0) + delta);
      if (next < 0) throw new AppError(409, `Insufficient stock. Available: ${Number(existing?.quantity || 0)}.`);
      return existing ? patch(resource, existing, { quantity: next }) : add(resource, { [itemKey]: itemId, warehouseId, chargeNo, quantity: next });
    };
    const movement = (tool: boolean, type: string, itemId: string, warehouseId: string, amount: number, extra: Input = {},custom=false) => add(tool ? 'tool_movements' : 'movements', { number: store.next(tool ? 'TM' : 'MM'), [tool ? 'articleId' : custom?'customMaterialId':'materialId']: itemId, warehouseId, quantity: qty(amount), type, date, note, ...extra });
    if (MTO_ACTION_KEYS.includes(key)) return runMtoLogisticsAction(key, { store, actor, data, date, note, ensure, add, patch, balance, movement });
    if (MTO_MATERIAL_ACTIONS.includes(key)) { const mto = runMtoMaterialAction(store, key, data, actor)!; return mto.records ? { resource: mto.resource, records: mto.records } : { resource: mto.resource, record: mto.record! }; }
    const procurement: ProcurementContext = { store, date, note, ensure, add, patch, balance, movement };
    if (key === 'correct-receipt') { const done = correctReceipt(procurement, data); return { resource: done.resource, record: done.record }; }
    if (key === 'order'||key==='order-requirements') {
      if(data.supplierId)ensure('suppliers', data.supplierId); if (data.projectId) ensure('projects', data.projectId);
      let items:Input[]=[];let projectId=str(data.projectId);
      if(key==='order-requirements'){
        const selected=ids(data.requirementIds,'material requirement');const rows=Object.fromEntries(['isometrics','iso_materials','orders','order_lines','picklists','stock','materials','custom_materials'].map(k=>[k,store.list(k)]));const execution=requirementExecution(rows);
        const requirements=selected.map(id=>{const entry=execution.find(e=>e.requirement.id===id);if(!entry)throw new AppError(404,'A selected material requirement is unavailable.');if(!entry.toOrder)throw new AppError(409,'A selected requirement is already fully ordered.');return entry;});
        const projects=[...new Set(requirements.map(r=>String(r.iso.projectId)))];projectId=projects.length===1?projects[0]:'';
        items=requirements.map(r=>({materialId:r.requirement.materialId||'',customMaterialId:r.requirement.customMaterialId||'',requirementId:r.requirement.id,isoId:r.iso.id,quantity:r.toOrder}));
      }else{if (!Array.isArray(data.items) || !data.items.length || data.items.length > 500) throw new AppError(422, 'Add at least one material to this order.');items=data.items as Input[];}
      const order = add('orders', { number: store.next('PO'), supplierId: data.supplierId||'', projectId, date, status: 'Pending', note });
      for (const item of items) {const material=materialOf(item);const snapshot=Object.fromEntries(['materialNo','description','uom','dia','lbs'].map(k=>[k,material.record[k]||'']));add('order_lines', { ...snapshot,orderId: order.id,...material.refs,requirementId:item.requirementId||'',isoId:item.isoId||'', quantity: positive(item.quantity), received: 0 }); }
      return { resource: 'orders', record: order };
    }
    if (key === 'receive') {
      const order = ensure('orders', data.orderId); const wh = warehouse(receivingWarehouseId(store, data.warehouseId), false);
      const supplierId=str(data.supplierId)||String(order.supplierId||'');if(!supplierId)throw new AppError(422,'Choose the delivery supplier.');ensure('suppliers',supplierId);
      if (order.status === 'Cancelled' || order.status === 'Received') throw new AppError(409, 'This order has no outstanding deliveries.');
      if (!Array.isArray(data.items) || !data.items.length) throw new AppError(422, 'Enter at least one received quantity.');
      const seen = new Set<string>();
      for (const raw of data.items) {
        const item = raw as Input; const line = ensure('order_lines', item.lineId);
        const material=materialOf(line);
        if (line.orderId !== order.id || seen.has(line.id)) throw new AppError(422, 'Each delivery line must belong to this order and appear once.');
        seen.add(line.id); const amount = positive(item.quantity);
        if (qty(Number(line.received) + amount) > Number(line.quantity)) throw new AppError(409, 'Received quantity exceeds the outstanding quantity.');
        patch('order_lines', line, { received: qty(Number(line.received) + amount) });
        const chargeNo = str(item.chargeNo);
        balance(false, material.record.id, wh.id, chargeNo, amount,material.custom);
        movement(false, 'Receipt', material.record.id, wh.id, amount, { chargeNo,requirementId:line.requirementId||'',isoId:line.isoId||'', note: `${order.number}${note ? ' · ' + note : ''}` },material.custom);
        recordReceipt(procurement, { order, line, warehouseId: wh.id, supplierId, chargeNo, quantity: amount });
      }
      const lines = store.list('order_lines').filter(l => l.orderId === order.id);
      const status = lines.every(l => Number(l.received) >= Number(l.quantity)) ? 'Received' : 'Partially received';
      return { resource: 'orders', record: patch('orders', order, { status,supplierId }) };
    }
    if (key.startsWith('adjust-') || key.startsWith('transfer-')) {
      const tool = key.endsWith('tool');const material=tool?null:materialOf(data); const item = tool?ensure('articles',data.articleId):material!.record;const custom=material?.custom||false;
      const transfer = key.startsWith('transfer-');
      const amount = transfer ? positive(data.quantity) : Number(data.quantity);
      if (!Number.isFinite(amount) || amount === 0 || (tool && !Number.isInteger(amount))) throw new AppError(422, tool ? 'Enter a non-zero whole quantity.' : 'Enter a non-zero quantity.');
      const chargeNo = str(data.chargeNo);
      if (transfer) {
        const from = warehouse(data.fromId, tool); const to = warehouse(data.toId, tool);
        if (from.id === to.id) throw new AppError(422, 'Choose two different warehouses.');
        balance(tool, item.id, from.id, chargeNo, -amount,custom); balance(tool, item.id, to.id, chargeNo, amount,custom);
        movement(tool, 'Transfer out', item.id, from.id, -amount, { chargeNo, note: `To ${to.name}${note ? ' · ' + note : ''}` },custom);
        movement(tool, 'Transfer in', item.id, to.id, amount, { chargeNo, note: `From ${from.name}${note ? ' · ' + note : ''}` },custom);
      } else {
        if (!note) throw new AppError(422, 'Enter a reason for this adjustment.');
        const wh = warehouse(data.warehouseId, tool);
        balance(tool, item.id, wh.id, chargeNo, amount,custom); movement(tool, 'Adjustment', item.id, wh.id, amount, { chargeNo },custom);
      }
      return { resource: tool ? 'tool_stock' : 'stock' };
    }
    if (key === 'issue-material') {
      const iso = ensure('isometrics', data.isoId); const material = materialOf(data); const wh = warehouse(data.warehouseId, false); const amount = positive(data.quantity); const chargeNo = str(data.chargeNo);
      balance(false, material.record.id, wh.id, chargeNo, -amount,material.custom);
      const pick = add('picklists', { number: store.next('PICK'), isoId: iso.id,...material.refs,requirementId:data.requirementId||'', warehouseId: wh.id, quantity: amount, date, chargeNo });
      movement(false, 'Issue', material.record.id, wh.id, -amount, { isoId: iso.id,requirementId:data.requirementId||'', chargeNo, note: `${pick.number}${note ? ' · ' + note : ''}` },material.custom);
      return { resource: 'picklists', record: pick };
    }
    if (key === 'rent') {
      const article = ensure('articles', data.articleId); const wh = warehouse(data.warehouseId, true); const client = ensure('clients', data.clientId); const amount = positive(data.quantity);
      if (!Number.isInteger(amount)) throw new AppError(422, 'Article quantities must be whole numbers.');
      const dueDate = data.dueDate ? validDate(data.dueDate, 'Due date') : '';
      if (dueDate && dueDate < date) throw new AppError(422, 'Due date cannot be before the rent date.');
      balance(true, article.id, wh.id, '', -amount);
      const rental = add('rentals', { number: store.next(article.returnable ? 'RENT' : 'ISSUE'), articleId: article.id, clientId: client.id, warehouseId: wh.id, quantity: amount, returned: 0, date, dueDate, status: article.returnable ? 'Rented' : 'Consumed', rentedBy: actor.name });
      movement(true, article.returnable ? 'Rental' : 'Consumable issue', article.id, wh.id, -amount, { rentalId: rental.id, note: `${client.name}` });
      return { resource: 'rentals', record: rental };
    }
    if (key === 'return') {
      const rental = ensure('rentals', data.rentalId); const amount = positive(data.quantity);
      if (!Number.isInteger(amount)) throw new AppError(422, 'Article quantities must be whole numbers.');
      if (rental.status === 'Consumed') throw new AppError(409, 'Consumable issues cannot be returned as rentals.');
      if (date < String(rental.date)) throw new AppError(422, 'Return date cannot be before the rent date.');
      const returned = qty(Number(rental.returned) + amount);
      if (returned > Number(rental.quantity)) throw new AppError(409, 'Return quantity exceeds the outstanding rental quantity.');
      balance(true, String(rental.articleId), String(rental.warehouseId), '', amount);
      movement(true, 'Return', String(rental.articleId), String(rental.warehouseId), amount, { rentalId: rental.id });
      return { resource: 'rentals', record: patch('rentals', rental, { returned, status: returned === Number(rental.quantity) ? 'Returned' : 'Partially returned' }) };
    }
    if(key==='move-materials'||key==='service-materials'){
      const updateLocation=(requirement:Row,input:Input)=>{
        const current=store.list('material_locations').find(r=>r.requirementId===requirement.id);
        const fields={...input,date};
        return current?patch('material_locations',current,fields):add('material_locations',{requirementId:requirement.id,...fields});
      };
      const event=(requirement:Row,type:string,input:Input)=>{
        add('material_location_events',{number:store.next('MLOC'),requirementId:requirement.id,type,date,note,...input});
        store.audit('iso_materials',requirement.id,'moved',`${type} · ${date}${note?' · '+note:''}`,actor);
      };
      const requirements=ids(data.requirementIds,'material requirement').map(id=>ensure('iso_materials',id));
      const laydown=key==='move-materials'?ensure('material_laydowns',data.laydownId):data.materialLaydownId?ensure('material_laydowns',data.materialLaydownId):undefined;
      const company=key==='service-materials'?ensure('service_companies',data.companyId):undefined;
      const number=company?nextNumber(store):'';const created=[];
      for(const requirement of requirements){
        ensure('isometrics',requirement.isoId);
        const current=store.list('material_locations').find(r=>r.requirementId===requirement.id);
        const open=store.list('service_requests').filter(r=>r.requirementId===requirement.id&&r.status!=='Completed');
        // Moving a material that is at a service company is its return: the open request closes with the move date.
        if(company&&(current?.companyId||open.length))throw new AppError(409,'This material already has an open service request.');
        if(!company)for(const request of open){if(date<String(request.date))throw new AppError(422,'The move date cannot be before the request date.');patch('service_requests',request,{status:'Completed',completedAt:date});}
        if(company){
          if(!current?.laydownId)throw new AppError(409,'Move the material to a laydown before requesting service.');
          const request=add('service_requests',{number,name:str(data.name),requirementId:requirement.id,companyId:company.id,materialLaydownId:laydown?.id||current.laydownId,date,requestedAt:new Date().toISOString(),addedBy:actor.name,status:'Requested',note});
          created.push(request);updateLocation(requirement,{laydownId:'',companyId:company.id});event(requirement,'Service request',{companyId:company.id,requestId:request.id});
        }else{updateLocation(requirement,{laydownId:laydown!.id,companyId:''});event(requirement,'Move to laydown',{laydownId:laydown!.id});}
      }
      return company?{resource:'service_requests',records:created}:{resource:'material_locations'};
    }
    if (key === 'service') return createSpoolServiceRequest(store, actor, data, { hosted: options.hosted, date: data.date ? date : undefined, note });
    if (key === 'move-spools') return moveSpoolsToLaydown(store, actor, data, { hosted: options.hosted, date: data.date ? date : undefined, note });
    if (key === 'inspection-request') {
      const type = str(data.type); if (!['NDT', 'NDT PRE', 'VI', 'PWHT', 'PRE-HT'].includes(type)) throw new AppError(422, 'Select an inspection type.');
      for (const [field, resource] of [['processId', 'ndt_processes'], ['locationId', 'ndt_locations'], ['pwhtProcessId', 'pwht_processes'], ['pwhtLocationId', 'pwht_locations']]) if (data[field]) ensure(resource, data[field]);
      const number = store.next(type.replaceAll(' ', '-')); const created = [];
      for (const id of ids(data.weldIds, 'weld')) {
        ensure('welds', id);
        if (store.list('inspection_requests').some(r => r.weldId === id && r.type === type && r.status === 'Open')) throw new AppError(409, 'A selected weld already has an open request of this type.');
        created.push(add('inspection_requests', { number, weldId: id, type, processId: data.processId || '', locationId: data.locationId || '', pwhtProcessId: data.pwhtProcessId || '', pwhtLocationId: data.pwhtLocationId || '', date, status: 'Open', note }));
      }
      return { resource: 'inspection_requests', records: created };
    }
    if (key === 'inspection-result') {
      const request = ensure('inspection_requests', data.requestId); const weld = ensure('welds', request.weldId);
      if (request.status === 'Cancelled') throw new AppError(409, 'This request is cancelled.');
      const result = str(data.result); if (!['Accepted', 'Rejected'].includes(result)) throw new AppError(422, 'Choose an inspection result.');
      const reportNo = str(data.reportNo); if (!reportNo) throw new AppError(422, 'Enter a report number.');
      const length = data.examinedLength === undefined || data.examinedLength === '' || data.examinedLength === null ? weldLength(store, weld) : Number(data.examinedLength);
      if (!Number.isFinite(length) || length < 0) throw new AppError(422, 'Examined length must be zero or greater.');
      if (data.naLength !== undefined && data.naLength !== '' && data.naLength !== null && (!Number.isFinite(Number(data.naLength)) || Number(data.naLength) < 0 || Number(data.naLength) > length)) throw new AppError(422, 'Not accepted length must be between zero and the examined length.');
      const record = add('inspection_results', { requestId: request.id, weldId: weld.id, reportNo, type: request.type, result, round: data.round || 'Initial', examinedLength: length, naLength: data.naLength ?? null, defectType: data.defectType || '', date, note });
      patch('inspection_requests', request, { status: result });
      store.audit('welds', weld.id, 'inspected', `${request.type} ${result.toLowerCase()} · ${reportNo}`, actor);
      if (options.inspectionRules) inspectionRules(store, actor).ensureRepair(weld);
      return { resource: 'inspection_results', record };
    }
    if (key === 'repair') {
      const weld = ensure('welds', data.weldId); if (!note) throw new AppError(422, 'Enter repair notes.');
      const result = patch('welds', weld, { repair: true }); store.audit('welds', weld.id, 'repair', `Repair ${date} · ${note}`, actor);
      if (options.inspectionRules) inspectionRules(store, actor).ensureRepair(result);
      return { resource: 'welds', record: result };
    }
    if (key === 'release') return releaseIsometrics(store, data, actor, { date, note });
    if (key === 'reopen-release') return reopenRelease(store, data, actor);
    if (key === 'assign-fwp') return assignFieldPackage(store, data, actor);
    if (key === 'phases') {
      const phases: Input = {};
      for (const f of phaseFields) if (data[f.name] && data[f.name] !== 'Keep current') { if (!['Complete', 'Incomplete'].includes(String(data[f.name]))) throw new AppError(422, 'Select a valid phase value.'); phases[f.name] = data[f.name] === 'Complete'; }
      if (!Object.keys(phases).length) throw new AppError(422, 'Choose at least one phase to change.');
      for (const id of ids(data.isoIds, 'isometric')) patch('isometrics', ensure('isometrics', id), phases);
      return { resource: 'isometrics' };
    }
    if (key === 'copy-isometrics') {
      const flag = (name: string) => { if (data[name] !== undefined && typeof data[name] !== 'boolean') throw new AppError(422, 'Choose whether to copy welds, materials and calculations.'); return data[name] === true; };
      const copyWelds = flag('copyWelds'), copyMaterials = flag('copyMaterials'), copyCalculations = flag('copyCalculations');
      if (copyCalculations && !copyMaterials) throw new AppError(422, 'Calculations refer to materials: tick Copy materials as well, or leave Copy calculations unticked.');
      const target = ensure('projects', data.projectId);
      const sources = ids(data.isoIds, 'isometric').map(id => ensure('isometrics', id));
      // Copy within one main project: every source isometric's project belongs to the same project site as the target.
      for (const source of sources) if (ensure('projects', source.projectId).siteId !== target.siteId) throw new AppError(422, 'Isometrics can only be copied to another subproject of the same main project.');
      // All or nothing: an ISO number that exists in the target (or is chosen twice) stops the copy before anything is written.
      const taken = new Set(store.list('isometrics').filter(row => row.projectId === target.id).map(row => String(row.isoNo).trim().toLowerCase()));
      const clashes: string[] = [];
      for (const source of sources) { const number = String(source.isoNo).trim(); if (taken.has(number.toLowerCase())) clashes.push(number); taken.add(number.toLowerCase()); }
      if (clashes.length) throw new AppError(422, `ISO number${clashes.length === 1 ? '' : 's'} ${clashes.join(', ')} already exist${clashes.length === 1 ? 's' : ''} in project ${target.internnumber}. Nothing was copied.`);
      // What a copy carries: descriptive and technical fields, but not the project-bound assignments, the progress or the phase flags.
      const leftOut = new Set(['projectId', 'testSystemId', 'fieldPackageId', 'itpId', 'itp2Id']);
      const carried = RESOURCE_MAP.isometrics.fields.filter(field => !leftOut.has(field.name) && field.section !== 'Phases' && field.section !== 'Progress').map(field => field.name);
      const wpsRows = Object.fromEntries(['projects', 'wps_projects', 'wps_sites'].map(name => [name, store.list(name)]));
      const copies: Row[] = [];
      // A copy keeps the references its source had, even to catalog records since switched off on the site.
      store.keepingReferences(() => { for (const source of sources) {
        const copy = add('isometrics', { ...Object.fromEntries(carried.map(name => [name, source[name]])), projectId: target.id });
        const counts: string[] = [];
        // Spools are created on the copy when a copied weld or cut-list line names one.
        const spools = new Map<string, string>();
        const spoolFor = (spoolId: unknown) => {
          if (!spoolId) return '';
          const original = ensure('spools', spoolId);
          if (!spools.has(original.id)) spools.set(original.id, add('spools', { name: original.name, isoId: copy.id, diameter: original.diameter ?? '', paintSpec: original.paintSpec ?? '', chemicalClean: original.chemicalClean ?? '', pwht: original.pwht === true }).id);
          return spools.get(original.id)!;
        };
        if (copyWelds) {
          const welds = store.list('welds').filter(weld => weld.isoId === source.id);
          for (const weld of welds) {
            const wps = weld.wpsId ? store.get('wps', weld.wpsId, true) : undefined;
            add('welds', { isoId: copy.id, weldNo: weld.weldNo, typeId: weld.typeId || '', spoolId: spoolFor(weld.spoolId), wpsId: wps && availableWps(wpsRows, wps, target.id) ? wps.id : '', lengthMode: weld.lengthMode, diameterId: weld.diameterId || '', dialen: weld.dialen ?? null, ndtpercent: weld.ndtpercent ?? null, jointType: weld.jointType ?? '', ndoReqPre: weld.ndoReqPre === true, ndoReq: weld.ndoReq === true, pwhtReqPre: weld.pwhtReqPre === true, pwhtReq: weld.pwhtReq === true });
          }
          counts.push(`${welds.length} weld${welds.length === 1 ? '' : 's'}`);
        }
        const requirements = new Map<string, string>();
        if (copyMaterials) {
          for (const requirement of store.list('iso_materials').filter(row => row.isoId === source.id && Number(row.quantity) > 0)) {
            const custom = requirement.customMaterial === true && !requirement.materialId;
            const created = add('iso_materials', { isoId: copy.id, materialId: requirement.materialId || '', quantity: requirement.quantity, phaseId: requirement.phaseId || '', customMaterial: custom, ...(custom ? Object.fromEntries(MATERIAL_FIELDS.map(name => [name, requirement[name] ?? ''])) : {}) });
            requirements.set(requirement.id, created.id);
          }
          counts.push(`${requirements.size} material${requirements.size === 1 ? '' : 's'}`);
        }
        if (copyCalculations) {
          let lines = 0;
          for (const line of store.list('calculation_lines').filter(row => row.isoId === source.id && requirements.has(String(row.requirementId)))) {
            add('calculation_lines', { name: line.name, isoId: copy.id, requirementId: requirements.get(String(line.requirementId)), normId: line.normId, quantity: line.quantity ?? null, description: line.description ?? '' }); lines++;
          }
          for (const line of store.list('cut_list').filter(row => row.isoId === source.id && requirements.has(String(row.requirementId)))) {
            add('cut_list', { name: line.name, isoId: copy.id, requirementId: requirements.get(String(line.requirementId)), spoolId: spoolFor(line.spoolId), quantity: line.quantity, lengthMm: line.lengthMm, description: line.description ?? '' }); lines++;
          }
          counts.push(`${lines} calculation line${lines === 1 ? '' : 's'}`);
        }
        store.audit('isometrics', copy.id, 'copied', `Copied from ${source.isoNo} (${store.display('projects', ensure('projects', source.projectId))})${counts.length ? ' with ' + counts.join(', ') : ''}`, actor);
        copies.push(store.get('isometrics', copy.id));
      } });
      return { resource: 'isometrics', records: copies };
    }
    if (key === 'revision') {
      const iso = ensure('isometrics', data.isoId); const type = str(data.type); if (!['ISO', 'ITP', 'ITP 2'].includes(type)) throw new AppError(422, 'Choose a document type.');
      const revNo = str(data.revNo); if (!revNo) throw new AppError(422, 'Enter a revision number.');
      const field=type==='ISO'?'revNo':type==='ITP'?'itpRevNo':'itp2RevNo';
      const previous = iso[field]??store.list('revisions').filter(r => r.isoId === iso.id && r.type === type)[0]?.revNo??'0';
      if (revNo === previous) throw new AppError(409, 'The new revision must differ from the current revision.');
      const record = add('revisions', { isoId: iso.id, type, revNo, previousRev: previous, date, comment: str(data.comment) });
      patch('isometrics', iso, { [field]:revNo });
      return { resource: 'revisions', record };
    }
    if(key==='remove-material-quantity'){
      const requirement=ensure('iso_materials',data.requirementId),revision=ensure('revisions',data.revisionId);
      if(revision.type!=='ISO'||revision.isoId!==requirement.isoId)throw new AppError(422,'Choose an ISO revision from this material’s isometric.');
      ensure('isometrics',requirement.isoId);
      if(data.expectedVersion!==undefined&&data.expectedVersion!==requirement._version)throw new AppError(409,'This requirement changed since you opened it. Refresh and try again.');
      const amount=positive(data.quantity);
      if(amount<0.01||Math.abs(amount*100-Math.round(amount*100))>0.000001)throw new AppError(422,'Remove a quantity of at least 0.01 in steps of 0.01.');
      if(amount>Number(requirement.quantity))throw new AppError(409,'The removal quantity exceeds the current material requirement.');
      const record=store.update('iso_materials',requirement.id,{quantity:qty(Number(requirement.quantity)-amount)},requirement._version,actor,{revisionId:revision.id,date,note});
      store.audit('iso_materials',requirement.id,'quantity removed',`Removed ${amount} by ISO revision ${revision.revNo} · ${date}${note?' · '+note:''}`,actor);
      return {resource:'iso_materials',record};
    }
    throw new AppError(404, 'This action is not available.');
  });
}
