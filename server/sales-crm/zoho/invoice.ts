import { z } from 'zod';

export const zohoId = z.union([
  z.string().regex(/^[1-9]\d*$/),
  z.number().int().positive().refine(Number.isSafeInteger).transform(String),
]);

export const optionalId = z.union([zohoId, z.string().trim().length(0).transform(() => null)])
  .nullish().transform(value => value ?? null);
export const optionalText = z.string().trim().nullish().transform(value => value || null);
const decimal = z.union([z.string().trim(), z.number().transform(String)])
  .pipe(z.string().regex(/^-?\d+(?:\.\d+)?$/));
export const optionalDecimal = z.union([decimal, z.string().trim().length(0).transform(() => null)])
  .nullish().transform(value => value ?? null);

export const invoicePage = z.object({
  invoices: z.array(z.object({ invoice_id: zohoId })).max(200),
  page_context: z.object({ page: z.number().int().positive(), has_more_page: z.boolean() }),
});

export const invoiceDetail = z.object({
  invoice: z.object({
    organization_id: optionalId,
    invoice_id: zohoId,
    invoice_number: z.string().trim().min(1),
    customer_id: zohoId,
    customer_name: optionalText,
    salesperson_id: optionalId,
    salesperson_name: optionalText,
    currency_code: z.string().regex(/^[A-Z]{3}$/),
    sub_total: decimal,
    total: decimal,
    balance: decimal,
    status: z.string().trim().toLowerCase().min(1),
    is_emailed: z.boolean().nullish().transform(value => value ?? null),
    date: optionalText,
    created_time: optionalText,
    last_modified_time: optionalText,
    payment_made: optionalDecimal,
    credits_applied: optionalDecimal,
    write_off_amount: optionalDecimal,
  }),
});

export const invoiceHistory = z.object({
  comments: z.array(z.object({
    comment_id: zohoId,
    invoice_id: optionalId,
    comment_type: optionalText,
    operation_type: optionalText,
    date: optionalText,
    time: optionalText,
  })),
});

type InvoiceDetail = z.infer<typeof invoiceDetail>['invoice'];

export function mirrorInvoice(organizationId: string, source: InvoiceDetail) {
  return {
    organizationId,
    invoiceId: source.invoice_id,
    invoiceNumber: source.invoice_number,
    customerId: source.customer_id,
    customerName: source.customer_name,
    sourceSalespersonId: source.salesperson_id,
    sourceSalespersonName: source.salesperson_name,
    currency: source.currency_code,
    subtotal: source.sub_total,
    total: source.total,
    balance: source.balance,
    status: source.status,
    emailed: source.is_emailed,
    invoiceDate: source.date,
    createdAt: source.created_time,
    sourceModifiedAt: source.last_modified_time,
    paymentMade: source.payment_made,
    creditsApplied: source.credits_applied,
    writeOffAmount: source.write_off_amount,
  };
}

export type ZohoInvoice = ReturnType<typeof mirrorInvoice>;
