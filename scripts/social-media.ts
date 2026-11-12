import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { join } from 'node:path';
import { publishingStorage } from '../server/publishing/storage';
import { PublishingQueue } from '../server/publishing/queue';
import { authorizedMedia } from '../server/publishing/media';
if (existsSync('.env')) loadEnvFile('.env');
if (!process.env.SOCIAL_MEDIA_SIGNING_KEY || process.env.SOCIAL_MEDIA_SIGNING_KEY.length < 32) throw new Error('Configure a private SOCIAL_MEDIA_SIGNING_KEY before starting the isolated media origin.');
const queue = new PublishingQueue(join(publishingStorage().directory, 'publishing.sqlite'));
const server = createServer((req, res) => {
  try {
    const bytes = req.method === 'GET' ? authorizedMedia(new URL(req.url ?? '/', 'http://local'), queue, process.env.SOCIAL_MEDIA_SIGNING_KEY!) : null;
    if (!bytes) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(Number(process.env.SOCIAL_MEDIA_PORT ?? 3498), '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => { queue.close(); process.exit(0); }));
