// Adapted from Dizzle Management lib/sync.ts at f8da43c.
export function managementInvoiceLineName(name: string | null, description: string | null) {
  return name || description || 'Unnamed invoice line';
}
