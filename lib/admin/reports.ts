import { FUND_SV, METHOD_SV } from './labels';

export type ReportFilters = { from: string; to: string; method: string; fund: string; campaign: string };
export type ReportCampaign = { id: string; title: string; fund_type: string };
export type ReportTransaction = { id: string; campaign_id: string; amount_sek: number; received_on: string; method: string; status: string };
export type ReportBalance = { campaign_id: string; due_on: string; outstanding_sek: number; pledge_status: string };
export type ReportLine = { date: string; campaignId: string; campaign: string; fund: string; method: string; status: string; received: number; refunded: number; net: number };
export type ReportGroup = { label: string; count: number; received: number; refunded: number; net: number };

export const REPORT_BASIS = 'Aktuell status, grupperad efter ursprungligt betalningsdatum. Återbetalda gåvor ingår i mottaget och dras av en gång. Återbetalningsdatum saknas; tidigare perioder kan därför ändras. Netto motsvarar bekräftade transaktioner i Översikt.';
export const PLEDGE_BASIS = 'Obetalda delbetalningar i aktiva löften med förfallodatum inom perioden och valda kampanjer/ändamål, beräknade med dagens betalningsstatus. Betalsättsfiltret gäller inte löften. Beloppet ingår inte i mottagna pengar.';

export function reportSEK(value: number): string {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function parseReportFilters(params: Record<string, unknown>, today: string): ReportFilters {
  const read = (key: string, fallback = '') => {
    const value = params[key] === undefined ? fallback : params[key];
    if (typeof value !== 'string') throw new Error('Ogiltigt rapportfilter.');
    return value;
  };
  const f = { from: read('from', `${today.slice(0, 7)}-01`), to: read('to', today), method: read('method'), fund: read('fund'), campaign: read('campaign') };
  if ((f.from && !validDate(f.from)) || (f.to && !validDate(f.to))) throw new Error('Ange giltiga datum.');
  if (f.from && f.to && f.from > f.to) throw new Error('Från-datum får inte vara efter till-datum.');
  if (f.method && !Object.hasOwn(METHOD_SV, f.method)) throw new Error('Välj ett giltigt betalsätt.');
  if (f.fund && !Object.hasOwn(FUND_SV, f.fund)) throw new Error('Välj ett giltigt ändamål.');
  if (f.campaign && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(f.campaign)) throw new Error('Välj en giltig kampanj.');
  return f;
}

// Integer öre avoids floating point differences during bank reconciliation.
export function parseBankOre(value: unknown): number | null {
  if (value === '' || value === undefined) return null;
  if (typeof value !== 'string') throw new Error('Ange bankens netto i kronor.');
  const normalized = value.replace(/[\s\u00a0]/g, '').replace(',', '.');
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(normalized)) throw new Error('Ange bankens netto med högst två decimaler.');
  return Math.round(Number(normalized) * 100);
}

export function buildReport(filters: ReportFilters, campaigns: ReportCampaign[], transactions: ReportTransaction[], balances: ReportBalance[]) {
  const selected = campaigns.filter(c => (!filters.campaign || c.id === filters.campaign) && (!filters.fund || c.fund_type === filters.fund));
  const byId = new Map(selected.map(c => [c.id, c]));
  const inPeriod = (date: string) => (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to);
  const rows: ReportLine[] = transactions.filter(t => byId.has(t.campaign_id) && inPeriod(t.received_on) && (!filters.method || t.method === filters.method) && ['confirmed', 'refunded'].includes(t.status)).map(t => {
    const c = byId.get(t.campaign_id)!;
    return { date: t.received_on, campaignId: c.id, campaign: c.title, fund: FUND_SV[c.fund_type] ?? c.fund_type, method: METHOD_SV[t.method] ?? t.method, status: t.status === 'confirmed' ? 'Bekräftad' : 'Återbetald', received: t.amount_sek, refunded: t.status === 'refunded' ? t.amount_sek : 0, net: t.status === 'confirmed' ? t.amount_sek : 0 };
  }).sort((a, b) => a.date.localeCompare(b.date));
  const group = (key: (row: ReportLine) => string, labelFor = key): ReportGroup[] => {
    const groups = new Map<string, ReportGroup>();
    for (const row of rows) {
      const id = key(row);
      const g = groups.get(id) ?? { label: labelFor(row), count: 0, received: 0, refunded: 0, net: 0 };
      g.count++; g.received += row.received; g.refunded += row.refunded; g.net += row.net;
      groups.set(id, g);
    }
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'sv'));
  };
  return {
    filters, rows,
    totals: rows.reduce((s, r) => ({ received: s.received + r.received, refunded: s.refunded + r.refunded, net: s.net + r.net }), { received: 0, refunded: 0, net: 0 }),
    outstanding: balances.filter(b => byId.has(b.campaign_id) && b.pledge_status === 'active' && inPeriod(b.due_on)).reduce((s, b) => s + b.outstanding_sek, 0),
    months: group(r => r.date.slice(0, 7)), methods: group(r => r.method), funds: group(r => r.fund), campaigns: group(r => r.campaignId, r => r.campaign)
  };
}
export type AdminReport = ReturnType<typeof buildReport>;
