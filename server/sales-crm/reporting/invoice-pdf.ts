import type { ServerResponse } from 'node:http';
import { ApiError } from '../../workflow';

export const maxInvoicePdfBytes = 5 * 1024 * 1024;

// Fixture-only. There is no provider transport, token access or live binding here.
export function syntheticInvoicePdf(id: string, evidenceLines?: readonly string[]) {
  if (!/^100[1-5]$|^1010$/.test(id)) return null;
  const content = [
    'BT /F1 20 Tf 48 752 Td (Dizzle Business Suite) Tj',
    '/F1 14 Tf 0 -38 Td (Synthetic invoice DEMO-' + id + ') Tj',
    '/F1 11 Tf 0 -22 Td (Local invoice viewer fixture) Tj' + (evidenceLines ? '' : ' ET'),
    ...(evidenceLines ? [...evidenceLines.map(line => '0 -18 Td (' + line.replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '\\$&') + ') Tj'), 'ET'] : []),
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + Buffer.byteLength(content) + ' >>\nstream\n' + content + '\nendstream',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(pdf);
    pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
    return String(offset).padStart(10, '0') + ' 00000 n \n';
  });
  const xref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.join('') +
    'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(pdf, 'ascii');
}

export async function sendInvoicePdf(res: ServerResponse, source: Response) {
  if (source.status === 404) {
    await source.body?.cancel().catch(() => undefined);
    throw new ApiError(404, 'Invoice PDF is unavailable.');
  }
  const mediaType = source.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  const advertised = Number(source.headers.get('content-length'));
  if (source.status !== 200 || mediaType !== 'application/pdf' ||
      advertised > maxInvoicePdfBytes || !source.body) {
    await source.body?.cancel().catch(() => undefined);
    throw new ApiError(502, 'Invoice PDF could not be validated.');
  }
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxInvoicePdfBytes) throw new Error('PDF exceeds the size limit.');
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    throw new ApiError(502, 'Invoice PDF could not be validated.');
  } finally {
    reader.releaseLock();
  }

  const pdf = Buffer.concat(chunks, length);
  if (pdf.subarray(0, 5).toString() !== '%PDF-' ||
      !pdf.subarray(-1024).toString('ascii').trimEnd().endsWith('%%EOF')) {
    throw new ApiError(502, 'Invoice PDF could not be validated.');
  }
  res.writeHead(200, {
    'Content-Type': 'application/pdf', 'Content-Length': pdf.length,
    'Content-Disposition': 'inline; filename="invoice.pdf"',
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "frame-ancestors 'self'",
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  res.end(pdf);
}
