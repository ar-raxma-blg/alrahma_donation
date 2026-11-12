import Link from 'next/link';
import { ButtonLink, Card, PageHead, Pill } from '@/components/admin/ui';
import { fmtDate, stockholmToday } from '@/lib/admin/dates';
import { InstallmentBalance, PLEDGE_STATE_SV, PledgeState, pledgeState } from '@/lib/admin/pledges';
import { fmtSEK } from '@/lib/format';
import { supabaseAdmin } from '@/lib/supabase/server';

const TONE: Record<PledgeState, 'green' | 'amber' | 'red' | 'grey'> = { on_plan: 'green', overdue: 'red', fulfilled: 'grey', cancelled: 'grey' };

export default async function Pledges({ searchParams: searchParamsPromise }: { searchParams: Promise<{ status?: string }> }) {
  const searchParams = await searchParamsPromise;
  const db = supabaseAdmin();
  const today = stockholmToday();
  const [{ data: pledges, error }, { data: bal, error: balanceError }] = await Promise.all([
    db.from('pledges').select('id, total_sek, status, created_at, campaign:campaigns(title), donor:donor_profiles(full_name, phone, email)').order('created_at', { ascending: false }),
    db.from('installment_balances').select('installment_id, pledge_id, seq, due_on, amount_sek, paid_sek, outstanding_sek')
  ]);

  const byPledge = new Map<string, InstallmentBalance[]>();
  for (const b of (bal ?? []) as InstallmentBalance[]) byPledge.set(b.pledge_id, [...(byPledge.get(b.pledge_id) ?? []), b]);

  const rows = (pledges ?? []).map((p) => {
    const inst = (byPledge.get(p.id) ?? []).sort((a, b) => a.seq - b.seq);
    const paid = inst.reduce((s, i) => s + i.paid_sek, 0);
    const next = inst.find((i) => i.outstanding_sek > 0);
    return { p, paid, next, state: pledgeState(p.status, inst, today) };
  });
  const filter = searchParams.status;
  const shown = filter ? rows.filter((r) => r.state === filter) : rows;

  const tabs: [string, string][] = [['', 'Alla'], ['on_plan', 'Enligt plan'], ['overdue', 'Försenad'], ['fulfilled', 'Uppfyllt'], ['cancelled', 'Avbruten']];

  return (
    <div>
      <PageHead title="Löften" sub="Ett löfte är ett löfte, inte pengar. Betalningarna är egna transaktioner kopplade till delbetalningar." action={<ButtonLink href="/admin/loften/ny" primary>Nytt löfte</ButtonLink>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([k, l]) => (
          <Link key={k} href={k ? `/admin/loften?status=${k}` : '/admin/loften'} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${(filter ?? '') === k ? 'bg-mosque-ink text-white' : 'bg-mosque-ink/10'}`}>{l}</Link>
        ))}
      </div>
      {error || balanceError ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Kunde inte hämta löftena och deras saldon. Ladda om sidan och försök igen.</div>
      ) : shown.length === 0 ? (
        <Card className="text-center"><p className="font-bold">{filter ? 'Inga löften med den statusen' : 'Inga löften än'}</p><p className="mt-1 text-sm text-mosque-ink/60">Skapa ett löfte när någon vill betala en större summa i delar.</p></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-mosque-cream text-left text-xs text-mosque-ink/60"><tr><th className="p-3">Givare</th><th className="p-3">Totalt</th><th className="p-3">Betalt</th><th className="p-3">Kvar</th><th className="p-3">Nästa förfallo</th><th className="p-3">Status</th></tr></thead>
            <tbody>
              {shown.map(({ p, paid, next, state }) => {
                const donor = p.donor as unknown as { full_name: string };
                return (
                  <tr key={p.id} className="border-t border-mosque-ink/10">
                    <td className="p-3 font-bold"><Link href={`/admin/loften/${p.id}`} className="hover:underline">{donor?.full_name}</Link></td>
                    <td className="p-3 tabular-nums">{fmtSEK(p.total_sek)}</td>
                    <td className="p-3 tabular-nums">{fmtSEK(paid)}</td>
                    <td className="p-3 tabular-nums">{fmtSEK(Math.max(p.total_sek - paid, 0))}</td>
                    <td className="p-3">{state === 'cancelled' || !next ? '–' : <span className={next.due_on < today ? 'font-bold text-red-700' : ''}>{fmtDate(next.due_on)}</span>}</td>
                    <td className="p-3"><Pill tone={TONE[state]}>{PLEDGE_STATE_SV[state]}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
