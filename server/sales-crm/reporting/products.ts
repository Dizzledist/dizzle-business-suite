import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { InvoiceLine } from '../../../shared/reporting';
import { decimalAmount, moneyUnits } from './model';

type Sale = {
  currency: string; invoiceId: string; customerId: string; customer: string | null;
  salespersonId: string; salesperson: string | null; amount: string;
  discount: string | null; revision: string | null; firstEmailAt: number;
  invoiceNumber: string; line: InvoiceLine | null;
};

type SalesTotal = { id: string; name: string | null; currency: string; subtotal: string; invoices: number };
type ProductTotal = {
  id: string | null; name: string | null; currency: string; unit: string | null; quantity: string;
  allocatedRevenue: string; linesWithoutRevenue: number;
};

export function productReporting(db: DatabaseSync, eligible: string, args: SQLInputValue[]) {
  const sales = db.prepare(`SELECT currency, i.invoice_id AS invoiceId, invoice_number AS invoiceNumber,
    recognized_customer_id AS customerId, recognized_customer_name AS customer,
    credited_user_id AS salespersonId, credited_name AS salesperson, first_email_at AS firstEmailAt,
    CAST(recognized_subtotal AS TEXT) AS amount, recognized_invoice_discount AS discount,
    recognized_line_revision AS revision, l.line_data AS lineData
    FROM (SELECT * FROM reporting_invoices WHERE ${eligible}) i
    LEFT JOIN reporting_invoice_lines l ON l.organization_id = i.organization_id AND l.invoice_id = i.invoice_id
      AND l.snapshot = 'recognized' AND i.recognized_line_revision IS NOT NULL
    ORDER BY first_email_at DESC, i.invoice_id, l.position`).all(...args).map(row => {
    const { lineData, ...invoice } = row;
    return { ...invoice, line: lineData === null ? null : JSON.parse(String(lineData)) } as Sale;
  });
  const invoices = [...new Map(sales.map(sale => [sale.invoiceId, sale])).values()];
  const purchaseHistory = sales.filter(({ line }) => line !== null);
  return {
    customers: summarizeInvoices(invoices, sale => sale.customerId ? [sale.customerId, sale.customer] : null),
    salespeople: summarizeInvoices(invoices, sale => [sale.salespersonId, sale.salesperson]),
    products: summarizeLines(purchaseHistory, line => [line.productId, line.name]),
    skus: summarizeLines(purchaseHistory, line => [line.sku, line.sku]),
    categories: summarizeLines(purchaseHistory, line => [line.categoryId, line.category]),
    invoicesWithoutOriginalLines: invoices.filter(sale => !sale.revision).length,
    invoicesWithoutOriginalCustomer: invoices.filter(sale => !sale.customerId).length,
    invoiceDiscountsUnallocated: invoices.filter(sale => sale.discount !== null && moneyUnits(sale.discount) !== 0n).length,
    purchaseHistory: purchaseHistory.slice(0, 100).map(({ line, invoiceId, invoiceNumber, customerId, customer,
      salesperson, firstEmailAt, currency, discount }) => ({
      invoiceId, invoiceNumber, customerId, customer, salesperson, currency,
      firstEmailAt: new Date(firstEmailAt).toISOString(), line,
      revenueAllocated: discount !== null && moneyUnits(discount) === 0n,
    })),
    purchaseHistoryTruncated: purchaseHistory.length > 100,
  };
}

function summarizeInvoices(
  invoices: readonly Sale[], group: (sale: Sale) => [string, string | null] | null,
): SalesTotal[] {
  const totals = new Map<string, { id: string; name: string | null; currency: string; amount: bigint; invoices: number }>();
  for (const sale of invoices) {
    const dimension = group(sale);
    if (!dimension) continue;
    const [id, name] = dimension;
    const key = JSON.stringify([id, sale.currency]);
    const total = totals.get(key) ?? { id, name, currency: sale.currency, amount: 0n, invoices: 0 };
    total.amount += BigInt(sale.amount);
    total.invoices++;
    totals.set(key, total);
  }
  return [...totals.values()].map(({ amount, ...total }) => ({ ...total, subtotal: decimalAmount(amount) }));
}

function summarizeLines(
  sales: readonly Sale[], group: (line: InvoiceLine) => [string | null, string | null],
): ProductTotal[] {
  const totals = new Map<string, Omit<ProductTotal, 'quantity' | 'allocatedRevenue'> & { quantity: bigint; revenue: bigint }>();
  for (const sale of sales) {
    const line = sale.line!;
    const [id, name] = group(line);
    const key = JSON.stringify([id, sale.currency, line.unit]);
    const total = totals.get(key) ?? {
      id, name: id === null ? null : name, currency: sale.currency, unit: line.unit,
      quantity: 0n, revenue: 0n, linesWithoutRevenue: 0,
    };
    total.quantity += moneyUnits(line.quantity);
    if (sale.discount !== null && moneyUnits(sale.discount) === 0n) total.revenue += moneyUnits(line.amount);
    else total.linesWithoutRevenue++;
    totals.set(key, total);
  }
  return [...totals.values()].map(({ quantity, revenue, ...total }) => ({
    ...total, quantity: decimalAmount(quantity), allocatedRevenue: decimalAmount(revenue),
  }));
}
