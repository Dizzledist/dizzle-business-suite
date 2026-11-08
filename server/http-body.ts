import type { IncomingMessage } from 'node:http';
import { ApiError } from './workflow';

export async function readBody(req: IncomingMessage, limit: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new ApiError(413, 'Request too large.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readJsonBody(req: IncomingMessage) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, 'JSON body required.');
  const content = await readBody(req, 16_384);
  try { return JSON.parse(content) as unknown; } catch { throw new ApiError(400, 'Invalid JSON.'); }
}
