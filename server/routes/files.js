/**
 * ファイル配信エンドポイント。
 * /api/files/<token> でアクセスすると、JWT を検証して該当ファイルを返す。
 * <video> タグ等で直接参照できるよう Authorization ヘッダ不要に設計。
 */
import { Hono } from 'hono';
import fs from 'node:fs';
import { verifyFileToken } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { resolveStoragePath, fileExists } from '../lib/storage.js';

const router = new Hono();

router.get('/:token', async (c) => {
  const token = c.req.param('token');
  const decoded = await verifyFileToken(token);
  if (!decoded) {
    return c.text('Invalid or expired file token', 403);
  }
  const asset = db.prepare('SELECT * FROM brain_source_assets WHERE id = ?').get(decoded.assetId);
  if (!asset) {
    return c.text('Asset not found', 404);
  }
  const abs = resolveStoragePath(asset.storage_path);
  if (!fileExists(abs)) {
    return c.text('File missing on disk', 404);
  }

  // Range リクエスト対応（動画再生のため）
  const stat = fs.statSync(abs);
  const total = stat.size;
  const range = c.req.header('range');
  const mime = asset.mime_type || 'application/octet-stream';

  if (range) {
    const m = range.match(/bytes=(\d+)-(\d+)?/);
    const start = m ? Number(m[1]) : 0;
    const end = m && m[2] ? Number(m[2]) : total - 1;
    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(abs, { start, end });
    return new Response(stream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': mime,
        'Cache-Control': 'private, no-cache',
      },
    });
  }

  const stream = fs.createReadStream(abs);
  return new Response(stream, {
    headers: {
      'Content-Length': String(total),
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-cache',
    },
  });
});

export default router;
