const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const ExcelJS = require('exceljs');
const { PGlite } = require('@electric-sql/pglite');

function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const resolve = id => {
    if (id in mocks) return mocks[id];
    if (id.startsWith('.')) { const target = path.resolve(path.dirname(file), id); return load(`${target}.${fs.existsSync(`${target}.ts`) ? 'ts' : 'tsx'}`, mocks); }
    if (id.startsWith('@/')) {
      const target = id.slice(2);
      return load(`${target}.${fs.existsSync(`${target}.ts`) ? 'ts' : 'tsx'}`, mocks);
    }
    return require(id);
  };
  new Function('require', 'exports', 'module', code)(resolve, mod.exports, mod);
  return mod.exports;
}
const { buildReport, parseReportFilters, parseBankOre, reportSEK } = load('lib/admin/reports.ts');
const { reportExcel } = load('lib/admin/report-excel.ts');
const { readReportPages } = load('lib/admin/report-data.ts', { '@/lib/supabase/server': {} });
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const filters = parseReportFilters({}, '2026-11-07');
assert.equal(filters.from, '2026-11-01');
assert.equal(filters.to, '2026-11-07');
for (const invalid of [{ from: '2026-02-30' }, { from: '2026-12-01' }, { method: '__proto__' }, { fund: 'no' }, { campaign: 'bad' }, { from: ['2026-11-01'] }]) assert.throws(() => parseReportFilters(invalid, '2026-11-07'));
assert.equal(parseBankOre('12 500,50'), 1250050);
assert.equal(parseBankOre('-0,01'), -1);
assert.equal(parseBankOre('0'), 0);
assert.equal(parseBankOre(''), null);
for (const invalid of ['1.001', '1e3', '12kr', 'Infinity', [], '9999999999999']) assert.throws(() => parseBankOre(invalid));
assert.match(reportSEK(0.5), /0,50/);
const campaigns = [{ id: A, title: 'Insamling', fund_type: 'building' }, { id: B, title: 'Insamling', fund_type: 'zakat' }];
const tx = (id, amount, status, extra = {}) => ({ id, campaign_id: A, amount_sek: amount, received_on: '2026-11-01', method: 'swish', status, display_name: 'PRIVATE DONOR', donor_id: 'PRIVATE-ID', receipt_no: 'PRIVATE-RECEIPT', provider_ref: 'PRIVATE-PROVIDER', received_by_name: 'PRIVATE VOLUNTEER', ...extra });
const transactions = [tx('a', 100, 'confirmed'), tx('b', 250, 'confirmed', { campaign_id: B, method: 'cash', received_on: '2026-11-07' }), tx('c', 50, 'refunded'), tx('d', 999, 'awaiting_approval'), tx('e', 888, 'pending_provider'), tx('f', 777, 'rejected'), tx('g', 80, 'confirmed', { received_on: '2026-10-31' }), tx('h', 60, 'confirmed', { received_on: '2026-11-08' })];
const balances = [
  { campaign_id: A, due_on: '2026-11-01', outstanding_sek: 80, pledge_status: 'active' },
  { campaign_id: B, due_on: '2026-11-07', outstanding_sek: 110, pledge_status: 'active' },
  { campaign_id: A, due_on: '2026-11-01', outstanding_sek: 999, pledge_status: 'cancelled' },
  { campaign_id: A, due_on: '2026-12-01', outstanding_sek: 888, pledge_status: 'active' }
];
const report = buildReport(filters, campaigns, transactions, balances);
assert.deepEqual(report.totals, { received: 400, refunded: 50, net: 350 });
assert.equal(report.outstanding, 190);
assert.equal(report.campaigns.length, 2, 'different campaigns with identical titles stay separate');
for (const groups of [report.months, report.methods, report.funds, report.campaigns]) {
  for (const field of ['received', 'refunded', 'net']) assert.equal(groups.reduce((s, g) => s + g[field], 0), report.totals[field]);
}
assert.equal(buildReport({ ...filters, method: 'swish' }, campaigns, transactions, balances).totals.net, 100);
assert.equal(buildReport({ ...filters, method: 'swish' }, campaigns, transactions, balances).outstanding, 190, 'pledges do not have a payment method');
assert.equal(buildReport({ ...filters, fund: 'zakat' }, campaigns, transactions, balances).totals.net, 250);
assert.equal(buildReport({ ...filters, campaign: A }, campaigns, transactions, balances).outstanding, 80);
assert.equal(buildReport({ ...filters, from: '', to: '' }, campaigns, transactions, balances).totals.net, 490);
assert.equal(buildReport(filters, campaigns, [], []).totals.net, 0);

(async () => {
  const records = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const pages = [];
  assert.equal((await readReportPages(async (from, to) => { pages.push([from, to]); return { data: records.slice(from, to + 1), error: null }; })).length, 1201);
  assert.deepEqual(pages, [[0, 499], [500, 999], [1000, 1499]]);
  await assert.rejects(readReportPages(async from => from ? { data: null, error: { message: 'failure' } } : { data: records.slice(0, 500), error: null }), /hela rapportunderlaget/);

  // Reopen the real XLSX and inspect numeric cells, reconciliation and privacy.
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await reportExcel(report, 35050, 'Alla kampanjer', new Date('2026-11-07T12:00:00Z')));
  assert.equal(workbook.worksheets.length, 6);
  assert.equal(workbook.getWorksheet('Sammanfattning').getCell('B12').value, 350);
  assert.equal(workbook.getWorksheet('Sammanfattning').getCell('B18').value, 0.5);
  assert.equal(workbook.getWorksheet('Transaktioner').rowCount, 4);
  const contents = JSON.stringify(workbook.model);
  for (const sensitive of ['PRIVATE DONOR', 'PRIVATE-ID', 'PRIVATE-RECEIPT', 'PRIVATE-PROVIDER', 'PRIVATE VOLUNTEER']) assert.ok(!contents.includes(sensitive));
  const malicious = buildReport(filters, [{ ...campaigns[0], title: '=HYPERLINK("https://example.invalid")' }], transactions, []);
  const safeWorkbook = new ExcelJS.Workbook();
  await safeWorkbook.xlsx.load(await reportExcel(malicious, null, 'Alla kampanjer'));
  const campaignCell = safeWorkbook.getWorksheet('Transaktioner').getCell('B2');
  assert.equal(campaignCell.type, ExcelJS.ValueType.String, 'campaign text must never become an Excel formula');
  const empty = new ExcelJS.Workbook();
  await empty.xlsx.load(await reportExcel(buildReport(filters, [], [], []), null, 'Alla kampanjer'));
  assert.equal(empty.getWorksheet('Sammanfattning').getCell('B18').value, 'Ej beräknad');

  // Validate against the actual overview view in an isolated PostgreSQL database.
  const db = new PGlite();
  try {
    await db.exec('create schema storage; create table storage.buckets(id text primary key, name text, public boolean);');
    await db.exec(fs.readFileSync('supabase/migrations/202610140002_admin_phase1.sql', 'utf8'));
    await db.exec(`insert into campaigns(id,title,slug,goal_sek,fund_type) values ('${A}','Insamling','test-a',10000,'building'), ('${B}','Insamling','test-b',10000,'zakat');`);
    for (const t of transactions) {
      await db.query('insert into transactions(campaign_id,amount_sek,received_on,method,status,approved_by,refund_reason) values ($1,$2,$3,$4,$5,$6,$7)', [t.campaign_id, t.amount_sek, t.received_on, t.method, t.status, B, t.status === 'refunded' ? 'Test' : null]);
    }
    const overview = (await db.query('select sum(confirmed_sek)::int as total from campaign_stats')).rows[0].total;
    assert.equal(buildReport({ ...filters, from: '', to: '' }, campaigns, transactions, []).totals.net, overview);
  } finally { await db.close(); }

  // Route rejects unauthenticated callers before any report query or generation.
  const { NextRequest, NextResponse } = require('next/server');
  let reads = 0;
  const route = load('app/api/admin/reports/excel/route.ts', {
    '@/lib/auth': { requireAdmin: async () => NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) },
    '@/lib/admin/report-data': { loadAdminReport: async () => { reads++; throw new Error('must not run'); } }
  });
  assert.equal((await route.GET(new NextRequest('http://localhost/api/admin/reports/excel'))).status, 401);
  assert.equal(reads, 0);
  const allowed = load('app/api/admin/reports/excel/route.ts', {
    '@/lib/auth': { requireAdmin: async () => null },
    '@/lib/admin/report-data': { loadAdminReport: async f => ({ report: buildReport(f, campaigns, transactions, balances), campaigns }) }
  });
  assert.equal((await allowed.GET(new NextRequest('http://localhost/api/admin/reports/excel?from=2026-02-30'))).status, 400);
  assert.equal((await allowed.GET(new NextRequest('http://localhost/api/admin/reports/excel?bank=1&bank=2'))).status, 400);
  const response = await allowed.GET(new NextRequest('http://localhost/api/admin/reports/excel?from=2026-11-01&to=2026-11-07&bank=350.50'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-type'), /spreadsheetml/);
  const exported = new ExcelJS.Workbook();
  await exported.xlsx.load(Buffer.from(await response.arrayBuffer()));
  assert.equal(exported.getWorksheet('Sammanfattning').getCell('B18').value, 0.5);

  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const reportPage = (user, reportData) => load('app/admin/(panel)/rapporter/page.tsx', {
    '@/lib/auth': { getAdminUser: async () => user },
    '@/lib/admin/report-data': { loadAdminReport: reportData }
  }).default;
  const renderPage = async page => renderToStaticMarkup(await page({ searchParams: Promise.resolve({ from: filters.from, to: filters.to }) }));
  const html = await renderPage(reportPage({ id: A }, async () => ({ report, campaigns })));
  for (const name of ['from', 'to', 'method', 'fund', 'campaign']) assert.ok(html.includes(`name="${name}"`));
  for (const text of ['Manuell bankavstämning', 'Exportera till Excel', 'Per månad', 'Per betalsätt', 'Per ändamål', 'Per kampanj', 'Obetalda delbetalningar']) assert.ok(html.includes(text));
  assert.ok(!html.includes('PRIVATE DONOR'));
  const emptyHtml = await renderPage(reportPage({ id: A }, async () => ({ report: buildReport(filters, campaigns, [], []), campaigns })));
  assert.ok(emptyHtml.includes('Inga mottagna betalningar matchar filtren.'));
  const errorHtml = await renderPage(reportPage({ id: A }, async () => { throw new Error('Kunde inte hämta hela rapportunderlaget.'); }));
  assert.ok(errorHtml.includes('role="alert"'));
  assert.equal(await renderPage(reportPage(null, async () => { throw new Error('Unauthorized query'); })), '');
  console.log('Reports: totals match PostgreSQL overview; filters, pagination, auth, reconciliation and private XLSX export passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
