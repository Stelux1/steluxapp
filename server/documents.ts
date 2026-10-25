import multer from 'multer';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
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
    save(id: string, file: Express.Multer.File) {
      if (mode === 'database') store.db.prepare('INSERT INTO upload_blobs VALUES (?,?)').run(id, file.buffer.toString('base64'));
      else store.db.prepare('INSERT INTO upload_paths VALUES (?,?)').run(id, file.filename);
    },
    discard(file?: Express.Multer.File) { if (file?.path && existsSync(file.path)) unlinkSync(file.path); },
    download(id: string, name: string, res: Response) {
      res.setHeader('Cache-Control', 'no-store');
      if (mode === 'database') {
        const blob = store.db.prepare('SELECT content FROM upload_blobs WHERE attachment_id=?').get(id) as { content: string } | undefined;
        if (!blob) throw new AppError(404, 'This file is unavailable.');
        res.attachment(name).type('application/octet-stream').send(Buffer.from(blob.content, 'base64'));
      } else {
        const path = store.db.prepare('SELECT filename FROM upload_paths WHERE attachment_id=?').get(id) as { filename: string } | undefined;
        if (!path || !existsSync(join(uploadsDir, path.filename))) throw new AppError(404, 'This file is unavailable.');
        res.download(join(uploadsDir, path.filename), name);
      }
    },
  };
}
