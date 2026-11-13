import { supabaseAdmin } from '@/lib/supabase/server';
import { buildReport, ReportBalance, ReportCampaign, ReportFilters, ReportTransaction } from './reports';

// Never accept a silently truncated PostgREST response as a complete report.
// Ordering by a unique key makes pagination deterministic.
export async function readReportPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1);
    if (error || !data) throw new Error('Kunde inte hämta hela rapportunderlaget. Försök igen.');
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

export async function loadAdminReport(filters: ReportFilters) {
  const db = supabaseAdmin();
  const campaigns = await readReportPages<ReportCampaign>((from, to) => db.from('campaigns').select('id, title, fund_type').order('id').range(from, to));
  if (filters.campaign && !campaigns.some(c => c.id === filters.campaign)) throw new Error('Kampanjen finns inte.');
  const [transactions, balances] = await Promise.all([
    readReportPages<ReportTransaction>((from, to) => {
      let q = db.from('transactions').select('id, campaign_id, amount_sek, received_on, method, status').in('status', ['confirmed', 'refunded']).order('id').range(from, to);
      if (filters.from) q = q.gte('received_on', filters.from);
      if (filters.to) q = q.lte('received_on', filters.to);
      if (filters.method) q = q.eq('method', filters.method);
      if (filters.campaign) q = q.eq('campaign_id', filters.campaign);
      return q;
    }),
    readReportPages<ReportBalance>((from, to) => {
      let q = db.from('installment_balances').select('campaign_id, due_on, outstanding_sek, pledge_status').eq('pledge_status', 'active').gt('outstanding_sek', 0).order('installment_id').range(from, to);
      if (filters.from) q = q.gte('due_on', filters.from);
      if (filters.to) q = q.lte('due_on', filters.to);
      if (filters.campaign) q = q.eq('campaign_id', filters.campaign);
      return q;
    })
  ]);
  return { report: buildReport(filters, campaigns, transactions, balances), campaigns };
}
