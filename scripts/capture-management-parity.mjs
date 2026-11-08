// Execute reviewed Management source at the pinned commit against synthetic
// fixtures. The VM has only the fake database and provider supplied below.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const { transformSync } = createRequire(import.meta.url)('esbuild');
const revision = 'f8da43c294545cd3f04bcc063fc9c84ad64223c3';
if (process.argv.length !== 3) throw new Error('Supply the local Management checkout path.');
const source = resolve(process.argv[2]);
if (execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== revision) {
  throw new Error('The Management checkout must match the audited source revision.');
}

const fixture = JSON.parse(readFileSync(new URL('../tests/fixtures/management-parity-input.json', import.meta.url), 'utf8'));
const catalog = fixture.catalog;
const mirrored = new Map();
const invoices = fixture.invoices.map(item => item.zoho);
const calls = [];
const itemLookups = catalog.itemLookups;
const read = path => execFileSync('git', ['-C', source, 'show', revision + ':' + path], { encoding: 'utf8' });

class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixture.now])); }
  static now() { return Date.parse(fixture.now); }
}

async function zoho(path, pdf = false) {
  if (pdf) throw new Error('The reference fixture has OCR disabled.');
  calls.push(path);
  if (path.startsWith('invoices?')) {
    return { invoices: [...invoices].sort((a, b) => b.date.localeCompare(a.date)), page_context: { has_more_page: false } };
  }
  if (path.startsWith('invoices/')) {
    const invoice = invoices.find(row => row.invoice_id === path.slice('invoices/'.length));
    if (invoice) return { invoice };
  }
  if (path.startsWith('items/')) {
    const sku = itemLookups[path.slice('items/'.length)];
    if (sku) return { item: { sku } };
  }
  throw new Error('Unexpected mock provider read.');
}

function sql(parts, ...values) {
  if (Array.isArray(parts) && !Object.hasOwn(parts, 'raw')) return parts;
  const query = parts.join('?');
  if (query.startsWith('UPDATE sync_state SET locked_until=NOW()')) return [{ id: 1 }];
  if (query.startsWith('SELECT item_id,sku FROM item_costs')) return catalog.items;
  if (query.startsWith('SELECT sku,cost FROM products')) return catalog.products.filter(row => values[0].includes(row.sku));
  if (query.startsWith('SELECT item_id,cost FROM item_costs')) return catalog.items.filter(row => values[0].includes(row.item_id));
  if (query.startsWith('SELECT match_key,cost FROM named_costs')) return catalog.names.filter(row => values[0].includes(row.match_key));
  if (query.startsWith('SELECT reference,cost FROM invoice_line_costs')) return catalog.lines.filter(row => values[0].includes(row.reference));
  if (query.startsWith('INSERT INTO invoices(')) {
    const [id, number, customer, date, currency, sales, cost, , , , lines, sales_rep, status] = values;
    mirrored.set(id, { id, number, customer, date, currency, sales, cost, lines, sales_rep, status });
    return [];
  }
  if (query.startsWith('DELETE FROM invoices')) { mirrored.delete(values[0]); return []; }
  if (/^(?:SELECT modified,ocr_status|CREATE TABLE IF NOT EXISTS|ALTER TABLE invoices|UPDATE sync_state SET)/.test(query)) {
    return [];
  }
  throw new Error('Unexpected mock database statement.');
}
sql.json = value => value;

const modules = new Map(Object.entries({
  './db': { init: async () => undefined, db: () => sql },
  './zoho': { zoho },
  './ocr': { extractInvoice: () => { throw new Error('OCR disabled in the capture.'); } },
}));
const reviewedModules = new Set(['./sync', './invoice-sales', './invoice-filters', './sync-policy', './costs',
  './product-match', './sample-parser']);

function executeTypeScript(sourceText, filename, sandbox = {}) {
  const { code } = transformSync(sourceText, { loader: 'ts', format: 'cjs', sourcefile: filename });
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, require: load, Date: FixtureDate,
    process: { env: {} }, ...sandbox }, { filename, timeout: 1000 });
  return module.exports;
}

function load(name) {
  if (!modules.has(name)) {
    if (!reviewedModules.has(name)) throw new Error('Unreviewed dependency in reference capture.');
    const file = 'lib/' + name.slice(2) + '.ts';
    modules.set(name, executeTypeScript(read(file), file));
  }
  return modules.get(name);
}

const { invoiceStatus, matchesInvoiceFilters } = load('./invoice-filters');
const { isEligibleInvoiceDate, invoiceEndDate } = load('./sync-policy');
const { sampleEntriesFromLine } = load('./sample-parser');
const { calculateCost } = load('./costs');
const { productMatchKey } = load('./product-match');
await load('./sync').sync();

const dashboard = read('app/ui.tsx');
const calculations = dashboard.match(/const sales=rows\.reduce[\s\S]+?(?=const money=)/)?.[0];
if (!calculations) throw new Error('Reviewed dashboard calculations not found.');
const summarize = rows => executeTypeScript(
  calculations + 'module.exports = {sales, knownSales, cost, profit, margin, count:rows.length, matchedCount:complete.length};',
  'app/ui.tsx', { rows },
);

const filters = Object.fromEntries(['all', 'open', 'closed'].map(filter => {
  const rows = [...mirrored.values()].filter(row => matchesInvoiceFilters(row, fixture.start, fixture.end, '', filter));
  return [filter, { ids: rows.map(row => row.id).sort(), ...summarize(rows) }];
}));
const rows = [...mirrored.values()].map(({ id, sales, cost, lines }) => ({ id, sales, cost, lines }))
  .sort((a, b) => a.id.localeCompare(b.id));

const paid = mirrored.get('5002');
const first = paid.lines[0];
const costCases = {
  override: await calculateCost([first]),
  item: await calculateCost([{ ...first, reference: undefined }]),
  sku: await calculateCost([{ ...first, reference: undefined, itemId: undefined }]),
  exactName: await calculateCost([paid.lines[3]]),
  unknownSku: await calculateCost([{ ...paid.lines[3], sku: 'UNKNOWN' }]),
  empty: await calculateCost([]),
  negativeQuantity: await calculateCost([{ ...first, quantity: -1 }]),
  roundOnce: await calculateCost([{ ...first, quantity: 0.111 }, { ...first, quantity: 0.111 }]),
};
console.log(JSON.stringify({
  revision, filters, rows, costCases,
  statusLabels: [null, 'PAID', 'partially_paid', 'sent', 'void', 'draft'].map(invoiceStatus),
  invoiceEndDate: invoiceEndDate(),
  dateEligibility: ['2026-09-30', '2026-10-01', '2026-11-07', '2026-11-08'].map(isEligibleInvoiceDate),
  productKey: productMatchKey(' Named   PRODUCT ', ' Batch  A ', 'Case'),
  samples: fixture.sampleLines.map(sampleEntriesFromLine),
  providerItemReads: calls.filter(path => path.startsWith('items/')),
}, null, 2));
