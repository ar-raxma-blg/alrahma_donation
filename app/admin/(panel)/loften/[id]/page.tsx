import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, PageHead, Pill } from '@/components/admin/ui';
import { fmtDate, stockholmToday } from '@/lib/admin/dates';
import { METHOD_SV, TX_STATUS_SV } from '@/lib/admin/labels';
import { InstallmentBalance, PLEDGE_STATE_SV, pledgeState } from '@/lib/admin/pledges';
import { fmtSEK } from '@/lib/format';
import { supabaseAdmin } from '@/lib/supabase/server';
import PledgeSettings from './PledgeSettings';
import RowActions from '../../transaktioner/RowActions';
import { getAdminUser } from '@/lib/auth';

const TABS: [string, string][] = [['delbetalningar', 'Delbetalningar'], ['betalningar', 'Betalningar'], ['installningar', 'Inställningar']];

export default async function PledgeDetail({ params: paramsPromise, searchParams: searchParamsPromise }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; registered?: string }> }) {
  const [params, searchParams] = await Promise.all([paramsPromise, searchParamsPromise]);
  if (!/^[0-9a-f-]{36}$/.test(params.id)) notFound();
  const db = supabaseAdmin();
  const today = stockholmToday();
  const user = await getAdminUser();
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : 'delbetalningar';

  const [{ data: p }, { data: bal, error: balanceError }] = await Promise.all([
    db.from('pledges').select('*, campaign:campaigns(id, title, slug), donor:donor_profiles(full_name, phone, email)').eq('id', params.id).maybeSingle(),
    db.from('installment_balances').select('installment_id, pledge_id, seq, due_on, amount_sek, paid_sek, outstanding_sek').eq('pledge_id', params.id).order('seq')
  ]);
  if (!p) notFound();

  if (balanceError) return <p role="alert">Kunde inte läsa delbetalningarna. Ladda om sidan och försök igen.</p>;
  const inst = (bal ?? []) as InstallmentBalance[];
  const state = pledgeState(p.status, inst, today);
  const paid = inst.reduce((s, i) => s + i.paid_sek, 0);
  const campaign = p.campaign as { id: string; title: string; slug: string };
  const donor = p.donor as { full_name: string; phone: string | null; email: string | null };

  const { data: txs, error: transactionError } = inst.length
    ? await db.from('transactions').select('id, amount_sek, received_on, method, status, installment_id, registered_by').in('installment_id', inst.map((i) => i.installment_id)).order('received_on', { ascending: false })
    : { data: [], error: null };
  if (transactionError) return <p role="alert">Kunde inte läsa betalningarna. Ladda om sidan och försök igen.</p>;
  const pending = (txs ?? []).filter(t => t.status === 'awaiting_approval').reduce((sum, t) => sum + t.amount_sek, 0);
  const seqOf = new Map(inst.map((i) => [i.installment_id, i.seq]));

  return (
    <div>
      <PageHead
        title={donor.full_name}
        sub={`${campaign.title} · ${fmtSEK(paid)} av ${fmtSEK(p.total_sek)} betalt`}
        action={<div className="flex items-center gap-3"><Pill tone={state === 'overdue' ? 'red' : state === 'on_plan' ? 'green' : 'grey'}>{PLEDGE_STATE_SV[state]}</Pill><Link href="/admin/loften" className="text-sm font-bold underline">Tillbaka</Link></div>}
      />
      {searchParams.registered === '1' && <p role="status" className="mb-4 rounded-xl border border-mosque-emerald/20 bg-mosque-emerald/5 p-4 text-sm">Betalningen är registrerad och väntar på en annan admins godkännande.</p>}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">{[['Löftets belopp', p.total_sek], ['Bekräftat betalt', paid], ['Kvar att betala', Math.max(0, p.total_sek - paid)]].map(([label, value]) => <Card key={String(label)}><p className="text-xs font-bold text-mosque-ink/60">{label}</p><p className="mt-2 break-words text-2xl font-extrabold text-mosque-deep">{fmtSEK(Number(value))}</p></Card>)}</div>
      {pending > 0 && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">{fmtSEK(pending)} väntar på godkännande och ingår inte i betalt belopp.</p>}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-mosque-ink/10" role="tablist">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/admin/loften/${p.id}?tab=${k}`} role="tab" aria-selected={tab === k} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-bold ${tab === k ? 'border-mosque-emerald text-mosque-emerald' : 'border-transparent text-mosque-ink/60'}`}>{l}</Link>
        ))}
      </div>

      {tab === 'delbetalningar' && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-mosque-cream text-left text-xs text-mosque-ink/60"><tr><th className="p-3">#</th><th className="p-3">Förfaller</th><th className="p-3">Belopp</th><th className="p-3">Betalt</th><th className="p-3">Kvar</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
            <tbody>
              {inst.map((i) => {
                const late = i.outstanding_sek > 0 && i.due_on < today && p.status === 'active';
                const link = `/admin/transaktioner/ny?installment=${i.installment_id}`;
                return (
                  <tr key={i.installment_id} className="border-t border-mosque-ink/10">
                    <td className="p-3 text-mosque-ink/50">{i.seq}</td>
                    <td className={`p-3 ${late ? 'font-bold text-red-700' : ''}`}>{fmtDate(i.due_on)}</td>
                    <td className="p-3 tabular-nums">{fmtSEK(i.amount_sek)}</td>
                    <td className="p-3 tabular-nums">{fmtSEK(i.paid_sek)}</td>
                    <td className="p-3 tabular-nums">{fmtSEK(i.outstanding_sek)}</td>
                    <td className="p-3"><Pill tone={i.outstanding_sek === 0 ? 'green' : late ? 'red' : 'grey'}>{i.outstanding_sek === 0 ? 'Betald' : late ? 'Försenad' : i.paid_sek > 0 ? 'Delvis betald' : 'Kommande'}</Pill></td>
                    <td className="p-3 text-right">{i.outstanding_sek > 0 && p.status === 'active' && <Link href={link} className="font-bold text-mosque-emerald underline">Registrera betalning</Link>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'betalningar' && (
        (txs ?? []).length === 0 ? (
          <Card className="text-sm text-mosque-ink/60">Inga betalningar än. Öppna fliken Delbetalningar och välj Registrera betalning.</Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[480px] text-sm">
              <tbody>
                {(txs ?? []).map((t) => (
                  <tr key={t.id} className="border-t border-mosque-ink/10 first:border-0">
                    <td className="p-3">{fmtDate(t.received_on)}</td>
                    <td className="p-3 font-bold tabular-nums"><Link href={`/admin/transaktioner/${t.id}`} className="hover:underline">{fmtSEK(t.amount_sek)}</Link></td>
                    <td className="p-3">{METHOD_SV[t.method]}</td>
                    <td className="p-3">Delbetalning {seqOf.get(t.installment_id)}</td>
                    <td className="p-3"><Pill tone={t.status === 'confirmed' ? 'green' : 'amber'}>{TX_STATUS_SV[t.status]}</Pill></td>
                    <td className="p-3">{t.status === 'awaiting_approval' && <RowActions id={t.id} own={t.registered_by === user?.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {tab === 'installningar' && (
        <PledgeSettings id={p.id} reminders={p.reminders} cancelled={p.status === 'cancelled'} cancelReason={p.cancel_reason} contact={{ phone: donor.phone, email: donor.email }} />
      )}
    </div>
  );
}
