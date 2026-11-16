import { isoMaterialInputErrors } from '../shared/mto-materials.ts';
import type { Row } from '../shared/types.ts';
import { AppError, qty, type Actor, type Store } from './store.ts';

type Input = Record<string, unknown>;
const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const CUSTOM_FIELDS = ['materialNo', 'description', 'materialGroup', 'articleNo', 'legacyNo', 'dia', 'lbs', 'uom', 'price'] as const;
interface MtoResult { resource: string; record?: Row; records?: Row[] }
export const MTO_MATERIAL_ACTIONS = ['add-iso-material', 'set-material-type', 'archive-iso-materials'];

function requirementIds(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 500 || value.some(id => typeof id !== 'string' || !id)) throw new AppError(422, 'Check at least one material.');
  return [...new Set(value)] as string[];
}

/**
 * Add a material to an isometric, from the catalog or as a custom material (optionally also saved to the
 * catalog). The group chosen in the form must match the catalog material; the revision must be one of the
 * isometric's ISO revisions.
 */
function addIsoMaterial(store: Store, data: Input, actor: Actor): MtoResult {
  const iso = store.get('isometrics', data.isoId);
  const phase = data.phaseId ? store.get('operation_phases', data.phaseId) : undefined;
  const errors = isoMaterialInputErrors(data, { requireGroup: data.addToDB === true });
  if (!errors.quantity && qty(data.quantity) <= 0) errors.quantity = 'The quantity is too small.';
  if (data.addToDB !== undefined && typeof data.addToDB !== 'boolean') errors.addToDB = 'Choose whether to add this material to the catalog.';
  if (Object.keys(errors).length) throw new AppError(422, 'Please check the highlighted fields.', errors);
  let revisionId = '';
  if (str(data.revisionId)) {
    const revision = store.get('revisions', data.revisionId);
    if (revision.type !== 'ISO' || revision.isoId !== iso.id) throw new AppError(422, 'Choose an ISO revision of this isometric.', { revisionId: 'Choose an ISO revision of this isometric.' });
    revisionId = revision.id;
  }
  const base = { isoId: iso.id, quantity: qty(data.quantity), phaseId: phase?.id || '', chargeNo: str(data.chargeNo), revisionId };
  if (data.source === 'Catalog') {
    const material = store.get('materials', data.materialId);
    if (str(data.materialGroup) && str(data.materialGroup) !== str(material.materialGroup)) throw new AppError(422, 'This material is not in the chosen group.', { materialId: 'Choose a material from the chosen group.' });
    return { resource: 'iso_materials', record: store.create('iso_materials', { ...base, materialId: material.id, customMaterial: false }, actor) };
  }
  const custom = Object.fromEntries(CUSTOM_FIELDS.map(name => [name, data[name] ?? '']));
  const classification = { componentCode: str(data.componentCode), progressClass: str(data.progressClass) };
  const material = data.addToDB ? store.create('materials', { ...custom, ...classification }, actor) : null;
  return { resource: 'iso_materials', record: store.create('iso_materials', { ...base, ...custom, ...classification, customMaterial: !material, materialId: material?.id || '' }, actor) };
}

/** Set the operation phase ("Type") of the checked requirements, all or nothing. */
function setMaterialType(store: Store, data: Input, actor: Actor): MtoResult {
  const phase = store.get('operation_phases', data.phaseId);
  const records: Row[] = requirementIds(data.requirementIds).map(id => {
    const row = store.get('iso_materials', id);
    return row.phaseId === phase.id ? row : store.update('iso_materials', row.id, { phaseId: phase.id }, row._version, actor);
  });
  return { resource: 'iso_materials', records };
}

/** Delete the checked requirements: they are archived and can be restored from the Isometric materials page. */
function archiveIsoMaterials(store: Store, data: Input, actor: Actor): MtoResult {
  const records = requirementIds(data.requirementIds).map(id => { const row = store.get('iso_materials', id); return store.archive('iso_materials', row.id, row._version, actor); });
  return { resource: 'iso_materials', records };
}

/** Runs the MTO materials actions; undefined for any other action. Called from `runAction`, inside its transaction. */
export function runMtoMaterialAction(store: Store, key: string, data: Input, actor: Actor): MtoResult | undefined {
  if (key === 'add-iso-material') return addIsoMaterial(store, data, actor);
  if (key === 'set-material-type') return setMaterialType(store, data, actor);
  if (key === 'archive-iso-materials') return archiveIsoMaterials(store, data, actor);
  return undefined;
}
