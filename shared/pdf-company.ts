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
