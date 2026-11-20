import multer from 'multer';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Response } from 'express';
import { AppError, type Store } from './store.ts';

export type DocumentStorage = 'disk' | 'database';
export function initializeDocumentStorage(store: Store) {
  store.db.exec('CREATE TABLE IF NOT EXISTS upload_blobs(attachment_id TEXT PRIMARY KEY REFERENCES attachments(id), content TEXT NOT NULL)');
  if (store.db.dialect === 'postgres') store.db.exec('ALTER TABLE upload_blobs ENABLE ROW LEVEL SECURITY; REVOKE ALL ON upload_blobs FROM PUBLIC');
}

// Cloud documents share the database transaction with their attachment record.
// Local workspaces retain their existing files and upload_paths mapping.
export function documentStorage(store: Store, dataDir: string, mode: DocumentStorage, initialize = true) {
  const uploadsDir = join(dataDir, 'uploads');
  if (mode === 'disk') {
    mkdirSync(uploadsDir, { recursive: true });
    store.db.exec('CREATE TABLE IF NOT EXISTS upload_paths(attachment_id TEXT PRIMARY KEY REFERENCES attachments(id), filename TEXT NOT NULL)');
  } else if (initialize) initializeDocumentStorage(store);
  return {
    upload: multer({ ...(mode === 'database' ? { storage: multer.memoryStorage() } : { dest: uploadsDir }), limits: { fileSize: 20 * 1024 * 1024, files: 1 } }),
    /** The same storage for the few requests that carry several files at once (Options → Attachments of an isometric). */
    uploadMany: multer({ ...(mode === 'database' ? { storage: multer.memoryStorage() } : { dest: uploadsDir }), limits: { fileSize: 20 * 1024 * 1024, files: 20 } }),
    save(id: string, file: Express.Multer.File) {
      if (mode === 'database') store.db.prepare('INSERT INTO upload_blobs VALUES (?,?)').run(id, file.buffer.toString('base64'));
      else store.db.prepare('INSERT INTO upload_paths VALUES (?,?)').run(id, file.filename);
    },
    /** Store bytes made by the server itself (a generated document) for an attachment record, the way an upload is stored. */
    saveBytes(id: string, bytes: Uint8Array) {
      if (mode === 'database') store.db.prepare('INSERT INTO upload_blobs VALUES (?,?)').run(id, Buffer.from(bytes).toString('base64'));
      else { const filename = randomUUID(); writeFileSync(join(uploadsDir, filename), bytes); store.db.prepare('INSERT INTO upload_paths VALUES (?,?)').run(id, filename); }
    },
    /** A copy of an attachment's stored file for another attachment record (its own bytes, so deleting one never touches the other); false when the original file is unavailable. */
    copy(fromId: string, toId: string): boolean {
      const bytes = this.read(fromId);
      if (!bytes) return false;
      this.saveBytes(toId, bytes);
      return true;
    },
    discard(file?: Express.Multer.File) { if (file?.path && existsSync(file.path)) unlinkSync(file.path); },
    /** The stored bytes of an attachment, or null when the file is unavailable (server-side use, e.g. documents that print signatures). */
    read(id: string): Buffer | null {
      if (mode === 'database') { const blob = store.db.prepare('SELECT content FROM upload_blobs WHERE attachment_id=?').get(id) as { content: string } | undefined; return blob ? Buffer.from(blob.content, 'base64') : null; }
      const path = store.db.prepare('SELECT filename FROM upload_paths WHERE attachment_id=?').get(id) as { filename: string } | undefined;
      return path && existsSync(join(uploadsDir, path.filename)) ? readFileSync(join(uploadsDir, path.filename)) : null;
    },
    /** Send an attachment. A PDF or a PNG/JPEG/GIF/WEBP image (decided by its bytes, never its name) opens inline for a preview; everything else, and `?download=1`, is an attachment. */
    download(id: string, name: string, res: Response, forceDownload = false) {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); const bytes = this.read(id); if (!bytes) throw new AppError(404, 'This file is unavailable.');
      const inline = inlineType(bytes);
      // Chrome's PDF viewer does not run inside a CSP sandbox, so a PDF gets the same policy without that one directive.
      res.setHeader('Content-Security-Policy', `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'${inline === 'application/pdf' && !forceDownload ? '' : '; sandbox'}`);
      if (inline && !forceDownload) { res.attachment(name); res.setHeader('Content-Disposition', String(res.getHeader('Content-Disposition')).replace(/^attachment/, 'inline')); res.type(inline).send(bytes); }
      else res.attachment(name).type('application/octet-stream').send(bytes);
    },
  };
}

/** The content type a file may be previewed as, from its first bytes (PDF, PNG, JPEG, GIF, WEBP); null for anything else. */
export function inlineType(bytes: Buffer): string | null {
  const head = bytes.subarray(0, 16);
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(head.subarray(0, 6).toString('latin1'))) return 'image/gif';
  if (head.length >= 12 && head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
