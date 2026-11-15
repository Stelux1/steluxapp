import { closeSync, openSync, readSync } from 'node:fs';
import { AppError, type Store } from './store.ts';
import type { documentStorage } from './documents.ts';
import { SIGNATURE_MAX_BYTES, signatureImageValid, type SignatureKind } from '../shared/signatures.ts';
import type { Row } from '../shared/types.ts';

type Documents = ReturnType<typeof documentStorage>;

/** First bytes of an uploaded file, from memory (database storage) or from its temporary file (disk storage). */
function head(file: Express.Multer.File, length = 16): Uint8Array {
  if (file.buffer) return file.buffer.subarray(0, length);
  const fd = openSync(file.path, 'r');
  try { const bytes = Buffer.alloc(length); const read = readSync(fd, bytes, 0, length, 0); return bytes.subarray(0, read); }
  finally { closeSync(fd); }
}
/** A signature image must be a PNG or JPEG up to 1 MB whose declared type, name and content agree. */
export function assertSignatureImage(file: Express.Multer.File) {
  if (file.size > SIGNATURE_MAX_BYTES) throw new AppError(422, 'A signature image can be at most 1 MB.');
  if (!signatureImageValid(file.mimetype, file.originalname, head(file))) throw new AppError(422, 'Choose a PNG or JPEG image for the signature.');
}
/**
 * A user's current full or short signature: its record, its newest attachment (earlier images stay as history)
 * and the image bytes. Null when the user has not saved that signature. For documents that print signatures.
 */
export function currentSignature(store: Store, documents: Documents, userId: string, kind: SignatureKind): { signature: Row; file: Row; content: Buffer; name: string; nameUnder: boolean } | null {
  const signature = store.list('signatures').find(row => row.userId === userId && row.kind === kind);
  if (!signature) return null;
  const file = store.list('attachments').filter(row => row.entityType === 'signatures' && row.entityId === signature.id).sort((a, b) => b._createdAt.localeCompare(a._createdAt) || b.id.localeCompare(a.id))[0];
  const content = file ? documents.read(file.id) : null;
  if (!file || !content) return null;
  return { signature, file, content, name: String(store.get('users', userId, true).name), nameUnder: signature.nameUnder === true };
}
