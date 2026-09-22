import type { FastifyInstance } from 'fastify';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { db, tx } from '../db.js';
import { config } from '../config.js';
import { uuid, hash, requireValue } from '../security.js';
export async function localUploadRoutes(app: FastifyInstance) {
  if (config.production) return;
  await mkdir(resolve('data/uploads'), { recursive: true });
  app.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp'],
    { parseAs: 'buffer', bodyLimit: 8 * 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );
  app.put('/uploads/local/:id', { bodyLimit: 8 * 1024 * 1024 }, async (req) => {
    const uploadId = uuid.parse((req.params as any).id),
      token = z
        .string()
        .min(30)
        .max(100)
        .parse((req.query as any).token),
      buffer = req.body as Buffer;
    return tx(async (c) => {
      const [upload] = await c.query('SELECT * FROM media_uploads WHERE id=$1 FOR UPDATE', [
        uploadId,
      ]);
      requireValue(
        upload &&
          upload.token_hash === hash(token) &&
          new Date(upload.expires_at) > new Date() &&
          !upload.completed_at,
        403,
        'Upload authorization is invalid or expired',
      );
      requireValue(
        Buffer.isBuffer(buffer) &&
          buffer.length === upload.expected_size &&
          req.headers['content-type'] === upload.content_type,
        400,
        'Upload size or content type mismatch',
      );
      const valid =
        upload.content_type === 'image/jpeg'
          ? buffer[0] === 255 && buffer[1] === 216
          : upload.content_type === 'image/png'
            ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : buffer.subarray(0, 4).toString() === 'RIFF' &&
              buffer.subarray(8, 12).toString() === 'WEBP';
      requireValue(valid, 400, 'File is not a supported image');
      await writeFile(resolve('data/uploads', upload.storage_key), buffer, { flag: 'wx' });
      await c.query('UPDATE media_uploads SET completed_at=now() WHERE id=$1', [uploadId]);
      return { ok: true };
    });
  });
}
