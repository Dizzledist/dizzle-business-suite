import { z } from 'zod';
import type { InvoiceLine } from '../../../shared/reporting';

const text = z.string().trim().max(4000).nullish().transform(value => value || null);
const identifier = z.union([z.string().regex(/^[1-9]\d{0,39}$/),
  z.number().int().positive().refine(Number.isSafeInteger).transform(String)]).or(z.literal('').transform(() => null))
  .nullish().transform(value => value ?? null);
const amount = z.union([
  z.string().trim(),
  z.number().transform(String).refine(value => value.replace(/[^0-9]/g, '').replace(/^0+/, '').length <= 15),
])
  .pipe(z.string().regex(/^-?\d{1,13}(?:\.\d{1,6})?$/));
const optionalAmount = amount.or(z.literal('').transform(() => null)).nullish().transform(value => value ?? null);
export function optionalLineAmount(value: unknown) {
  const result = optionalAmount.safeParse(value);
  return result.success ? result.data : null;
}

const sourceLine = z.object({
  line_item_id: identifier, item_id: identifier, sku: text, name: text, description: text,
  quantity: amount, unit: text, rate: amount, item_total: amount, discount: z.union([text, z.number().transform(String)]),
  discount_amount: optionalAmount, tax_id: identifier, tax_name: text, tax_type: text,
  tax_percentage: optionalAmount, tax_amount: optionalAmount, category_id: identifier, category_name: text,
});

export function normalizeInvoiceLines(source: unknown): InvoiceLine[] | null {
  const result = z.array(sourceLine).max(5000).safeParse(source);
  if (!result.success) return null;
  const seen = new Set<string>();
  const lines: InvoiceLine[] = [];
  for (const row of result.data) {
    if (row.line_item_id !== null) {
      if (seen.has(row.line_item_id)) return null;
      seen.add(row.line_item_id);
    }
    lines.push({
      lineId: row.line_item_id, productId: row.item_id, sku: row.sku, name: row.name,
      description: row.description, quantity: row.quantity, unit: row.unit, unitPrice: row.rate,
      discount: row.discount, discountAmount: row.discount_amount, amount: row.item_total,
      taxId: row.tax_id, taxName: row.tax_name, taxType: row.tax_type, taxPercentage: row.tax_percentage,
      taxAmount: row.tax_amount, categoryId: row.category_id, category: row.category_name,
    });
  }
  return lines;
}
