import { z } from 'zod';
import { optionalId, optionalText, optionalDecimal, zohoId } from './invoice';

export const pageContext = z.object({ page: z.number().int().positive(), has_more_page: z.boolean() });

export const organizations = z.object({
  organizations: z.array(z.object({
    organization_id: zohoId,
    name: z.string().trim().min(1).max(200),
    is_org_active: z.boolean().optional(),
  })),
});

const contact = z.object({
  contact_id: zohoId,
  contact_name: optionalText,
  company_name: optionalText,
  contact_type: z.literal('customer'),
  status: optionalText,
});

const item = z.object({
  item_id: zohoId,
  name: optionalText,
  sku: optionalText,
  status: optionalText,
});

export const contactPage = z.object({ contacts: z.array(contact).max(200), page_context: pageContext });
export const itemPage = z.object({ items: z.array(item).max(200), page_context: pageContext });
export const contactDetail = z.object({ contact });
export const itemDetail = z.object({ item });
export const invoicePayments = z.object({
  payments: z.array(z.object({
    payment_id: zohoId,
    invoice_id: optionalId,
    invoice_payment_id: optionalId,
    amount: optionalDecimal,
    date: optionalText,
  })),
});
