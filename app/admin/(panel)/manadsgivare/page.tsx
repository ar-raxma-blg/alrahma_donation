import Link from 'next/link';
import { Card, PageHead, Pill } from '@/components/admin/ui';
import { fmtDate, stockholmToday } from '@/lib/admin/dates';
import { InstallmentBalance, PLEDGE_STATE_SV, PledgeState, pledgeState } from '@/lib/admin/pledges';
import { fmtSEK } from '@/lib/format';
import { supabaseAdmin } from '@/lib/supabase/server';

const TONE: Record<PledgeState, 'green' | 'amber' | 'red' | 'grey'> = { on_plan: 'green', overdue: 'red', fulfilled: 'grey', cancelled: 'grey' };
const TABS: [string, string][] = [['', 'Alla'], ['on_plan', 'Enligt plan'], ['overdue', 'Försenad'], ['fulfilled', 'Uppfyllt'], ['cancelled', 'Avbruten']];

// Everyone who pays in monthly instalments: a pledge split over two or more payments.
// Only approved payments count as paid; the promise alone is shown as "kvar".
export default async function MonthlyPayers({ searchParams: searchParamsPromise }: { searchParams: Promise<{ status?: string }> }) {
  const filter = (await searchParamsPromise).status;
  const db = supabaseAdmin();
  const today = stockholmToday();
  const [{ data: pledges, error }, { data: bal, error: balanceError }] = await Promise.all([
    db.from('pledges').select('id, total_sek, status, created_at, donor:donor_profiles(full_name, phone, email)').order('created_at', { ascending: false }),
    db.from('installment_balances').select('installment_id, pledge_id, seq, due_on, amount_sek, paid_sek, outstanding_sek')
  ]);

  const byPledge = new Map<string, InstallmentBalance[]>();
  for (const b of (bal ?? []) as InstallmentBalance[]) byPledge.set(b.pledge_id, [...(byPledge.get(b.pledge_id) ?? []), b]);

  const rows = (pledges ?? [])
    .map((p) => {
      const inst = (byPledge.get(p.id) ?? []).sort((a, b) => a.seq - b.seq);
      const paid = inst.reduce((s, i) => s + i.paid_sek, 0);
      return {
        p, inst, paid,
        paidCount: inst.filter((i) => i.outstanding_sek === 0).length,
        monthly: inst.length ? Math.max(...inst.map((i) => i.amount_sek)) : 0,
        next: inst.find((i) => i.outstanding_sek > 0),
        state: pledgeState(p.status, inst, today),
        donor: p.donor as unknown as { full_name: string; phone: string | null; email: string | null } | null
      };
    })
    .filter((r) => r.inst.length >= 2);
  const shown = filter ? rows.filter((r) => r.state === filter) : rows;
  const live = rows.filter((r) => r.state === 'on_plan' || r.state === 'overdue');

  const stats: [string, string][] = [
    ['Månadsgivare', String(live.length)],
    ['Utlovat per månad', fmtSEK(live.reduce((s, r) => s + r.monthly, 0))],
    ['Betalt hittills', fmtSEK(rows.filter((r) => r.state !== 'cancelled').reduce((s, r) => s + r.paid, 0))],
    ['Kvar att betala', fmtSEK(live.reduce((s, r) => s + Math.max(r.p.total_sek - r.paid, 0), 0))]
  ];

  return (
    <div>
      <PageHead title="Månadsgivare" category="Givare" sub="Alla som betalar i delar. Ett löfte räknas först som betalt när betalningen är godkänd i Transaktioner." />
      {error || balanceError ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Kunde inte hämta månadsgivarna. Ladda om sidan och försök igen.</div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map(([label, value]) => (
              <Card key={label}><div className="text-xs font-semibold text-mosque-ink/60">{label}</div><div className="mt-1 text-xl font-extrabold tabular-nums">{value}</div></Card>
            ))}
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {TABS.map(([k, l]) => (
              <Link key={k} href={k ? `/admin/manadsgivare?status=${k}` : '/admin/manadsgivare'} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${(filter ?? '') === k ? 'bg-mosque-ink text-white' : 'bg-mosque-ink/10'}`}>{l}</Link>
            ))}
          </div>
          {shown.length === 0 ? (
            <Card className="text-center"><p className="font-bold">{filter ? 'Inga månadsgivare med den statusen' : 'Inga månadsgivare än'}</p><p className="mt-1 text-sm text-mosque-ink/60">De dyker upp här när någon registrerar en månadsplan eller ett löfte med flera delbetalningar.</p></Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-mosque-cream text-left text-xs text-mosque-ink/60"><tr><th className="p-3">Givare</th><th className="p-3">Kontakt</th><th className="p-3">Per månad</th><th className="p-3">Betalda delar</th><th className="p-3">Betalt / totalt</th><th className="p-3">Nästa förfallo</th><th className="p-3">Status</th></tr></thead>
                <tbody>
                  {shown.map(({ p, inst, paid, paidCount, monthly, next, state, donor }) => (
                    <tr key={p.id} className="border-t border-mosque-ink/10">
                      <td className="p-3 font-bold"><Link href={`/admin/loften/${p.id}`} className="hover:underline">{donor?.full_name ?? 'Okänd givare'}</Link></td>
                      <td className="p-3 text-xs leading-5 text-mosque-ink/70">{donor?.phone && <div>{donor.phone}</div>}{donor?.email && <div className="break-all">{donor.email}</div>}</td>
                      <td className="p-3 tabular-nums">{fmtSEK(monthly)}</td>
                      <td className="p-3 tabular-nums">{paidCount} av {inst.length}</td>
                      <td className="p-3 tabular-nums">{fmtSEK(paid)} / {fmtSEK(p.total_sek)}</td>
                      <td className="p-3">{state === 'cancelled' || !next ? '–' : <span className={next.due_on < today ? 'font-bold text-red-700' : ''}>{fmtDate(next.due_on)}</span>}</td>
                      <td className="p-3"><Pill tone={TONE[state]}>{PLEDGE_STATE_SV[state]}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
