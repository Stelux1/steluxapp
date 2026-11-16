import type { Store } from '../store.ts';
import type { documentStorage } from '../documents.ts';
import { COMPANY_RESOURCE, companyFromRow, type CompanyData } from '../../shared/pdf-company.ts';

type Documents = ReturnType<typeof documentStorage>;
export interface CompanyForDocuments { company: CompanyData; /** The newest logo image bytes (PNG or JPEG), when one is stored. */ logo: Buffer | null }

/**
 * The workspace's company data for documents: the single company record and its newest logo, or null when no
 * company data is set (a document then omits the company block without any placeholder text).
 */
export function companyForDocuments(store: Store, documents: Documents): CompanyForDocuments | null {
  const record = store.list(COMPANY_RESOURCE).find(row => companyFromRow(row));
  const company = companyFromRow(record);
  if (!record || !company) return null;
  const file = store.list('attachments').filter(row => row.entityType === COMPANY_RESOURCE && row.entityId === record.id).sort((a, b) => b._createdAt.localeCompare(a._createdAt) || b.id.localeCompare(a.id))[0];
  return { company, logo: file ? documents.read(file.id) : null };
}
