import { supabaseAdmin } from '@/lib/supabase/server';
import { publicRaised } from '@/lib/homepage';
import { stockholmToday } from './dates';
import { readReportPages } from './report-data';

type Balance = { due_on: string; outstanding_sek: number };
type MonthlyPayment = { amount_sek: number };

export async function loadOverviewDashboard(owner: boolean) {
  const db = supabaseAdmin();
  const today = stockholmToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [homepage, operations, broadcasts] = await Promise.allSettled([
    (async () => {
      const { data, error } = await db.from('campaign_totals').select('raised_sek, opening_raised_sek, goal_sek').eq('id', 'main').single();
      if (error || !data) throw new Error('Homepage totals unavailable');
      return { raised: publicRaised(data), goal: Number(data.goal_sek) };
    })(),
    (async () => {
      const [balances, payments, awaiting, recent] = await Promise.all([
        readReportPages<Balance>((from, to) => db.from('installment_balances').select('due_on, outstanding_sek').eq('pledge_status', 'active').gt('outstanding_sek', 0).order('installment_id').range(from, to)),
        readReportPages<MonthlyPayment>((from, to) => db.from('transactions').select('amount_sek').eq('status', 'confirmed').gte('received_on', monthStart).lte('received_on', today).order('id').range(from, to)),
        db.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_approval'),
        db.from('transactions').select('id, amount_sek, received_on, method, status').order('created_at', { ascending: false }).limit(5)
      ]);
      if (awaiting.error || awaiting.count === null || recent.error) throw new Error('Operations unavailable');
      return {
        monthlyPaid: payments.reduce((sum, p) => sum + p.amount_sek, 0),
        outstanding: balances.reduce((sum, b) => sum + b.outstanding_sek, 0),
        overdue: balances.filter(b => b.due_on < today).length,
        awaiting: awaiting.count,
        recent: recent.data ?? []
      };
    })(),
    owner ? (async () => {
      const { data, error } = await db.from('broadcast_log').select('id, channel, status, failed_count, created_at').in('status', ['failed', 'partial']).gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()).order('created_at', { ascending: false }).limit(3);
      if (error) throw new Error('Broadcast history unavailable');
      return data ?? [];
    })() : Promise.resolve(null)
  ]);
  return {
    today, monthStart,
    homepage: homepage.status === 'fulfilled' ? homepage.value : null,
    operations: operations.status === 'fulfilled' ? operations.value : null,
    broadcasts: broadcasts.status === 'fulfilled' ? broadcasts.value : null
  };
}
