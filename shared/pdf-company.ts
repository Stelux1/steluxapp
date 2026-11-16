import type { Row } from './types.ts';

/** Workspace-wide company data printed on documents (hosted profile; administrators only). One record. */
export const COMPANY_RESOURCE = 'company_data';
/** Resources of the document features. Their hosted tables come from the general preparation (server/hosted-schema.ts). */
export const DOCUMENT_RESOURCES = [COMPANY_RESOURCE];
export const LOGO_HEIGHT_DEFAULT = 18, LOGO_HEIGHT_MIN = 5, LOGO_HEIGHT_MAX = 40;

export interface CompanyData {
  name: string;
  /** Address lines in print order: street lines, then "postal code city". */
  addressLines: string[];
  phone: string;
  /** Largest height of the logo on a page, in millimetres. */
  logoHeightMm: number;
}
const text = (row: Row, key: string) => typeof row[key] === 'string' ? String(row[key]).trim() : '';
/** The company block of a record; null when there is no record or it has no name (documents then omit the block). */
export function companyFromRow(row?: Row | null): CompanyData | null {
  if (!row || row._archived || !text(row, 'name')) return null;
  const height = Number(row.logoHeight);
  return {
    name: text(row, 'name'),
    addressLines: [text(row, 'address'), text(row, 'address2'), [text(row, 'zip'), text(row, 'residence')].filter(Boolean).join(' ')].filter(Boolean),
    phone: text(row, 'phone'),
    logoHeightMm: Number.isFinite(height) && height > 0 ? Math.min(Math.max(height, LOGO_HEIGHT_MIN), LOGO_HEIGHT_MAX) : LOGO_HEIGHT_DEFAULT,
  };
}

/**
 * The logo sizing of the Company data form, in pixels (reference: Logo max height 32 to 400, padding top / bottom 0 to 200). It
 * applies on the application selector; the document logo keeps its own height in millimetres (`logoHeight`).
 */
export const LOGO_PX = { maxHeight: { min: 32, max: 400, default: 286 }, padding: { min: 0, max: 200, default: 16 } };
export interface LogoSizing { maxHeight: number; paddingTop: number; paddingBottom: number }
const clamp = (value: unknown, range: { min: number; max: number; default: number }) => { const number = Number(value); return value === '' || value === null || value === undefined || !Number.isFinite(number) ? range.default : Math.round(Math.min(Math.max(number, range.min), range.max)); };
/** The sizing of a company record as every reader uses it: a record saved before the fields existed gets the reference defaults. */
export const logoSizing = (row?: { readonly [name: string]: unknown } | null): LogoSizing => ({ maxHeight: clamp(row?.logoMaxHeight, LOGO_PX.maxHeight), paddingTop: clamp(row?.logoPaddingTop, LOGO_PX.padding), paddingBottom: clamp(row?.logoPaddingBottom, LOGO_PX.padding) });
/** The labels of the Company data form in order: the visible fields, with the Logo file chosen after Fax. */
export const companyFormLabels = (fields: { name: string; label: string; hidden?: boolean }[]) => fields.filter(field => !field.hidden).flatMap(field => field.name === 'fax' ? [field.label, 'Logo'] : [field.label]);
