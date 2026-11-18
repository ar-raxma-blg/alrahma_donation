import { headers } from 'next/headers';
import { Card, PageHead, Pill } from '@/components/admin/ui';
import CopyInviteLink from '@/components/admin/CopyInviteLink';
import { adminPanelInput, adminPanelPrimaryButton, adminPanelSecondaryButton } from '@/components/admin/PanelHeader';
import { fmtSEK } from '@/lib/format';
import { supabaseAdmin } from '@/lib/supabase/server';
import { createInviteChannel } from './actions';

type Channel = { id: string; code: string; name: string | null; source: 'admin' | 'public'; created_at: string };
type DonorRow = {
  id: string; full_name: string; created_at: string; invite_channel_id: string;
  donations: { amount_sek: number; payment_plan_id: string | null }[];
  payment_plans: { total_amount_sek: number; months: number }[];
};

const day = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
const pledged = (d: DonorRow) =>
  d.donations.filter((g) => !g.payment_plan_id).reduce((n, g) => n + g.amount_sek, 0) + d.payment_plans.reduce((n, p) => n + p.total_amount_sek, 0);

// Invitation channels: one per person who shares the donation page. The link is
// /?ref=<code>; everyone who registers through it is listed under that channel.
export default async function InvitationsPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParamsPromise).q ?? '').trim().toLowerCase();
  const db = supabaseAdmin();
  const [channelRes, donorRes] = await Promise.all([
    db.from('invite_channels').select('id, code, name, source, created_at').order('created_at', { ascending: false }).limit(500),
    db.from('donors')
      .select('id, full_name, created_at, invite_channel_id, donations(amount_sek, payment_plan_id), payment_plans(total_amount_sek, months)')
      .not('invite_channel_id', 'is', null).order('created_at', { ascending: false }).limit(2000)
  ]);
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const origin = host ? `${h.get('x-forwarded-proto') ?? 'https'}://${host}` : '';

  const channels = (channelRes.data ?? []) as Channel[];
  const donors = (donorRes.data ?? []) as unknown as DonorRow[];
  const byChannel = new Map<string, DonorRow[]>();
  for (const d of donors) byChannel.set(d.invite_channel_id, [...(byChannel.get(d.invite_channel_id) ?? []), d]);

  // Without a search: admin-made channels always show; self-made ones only once someone
  // registered through them. With a search: match channel name, code or a registered person.
  const matches = (c: Channel) => `${c.name ?? ''} ${c.code} ${(byChannel.get(c.id) ?? []).map((d) => d.full_name).join(' ')}`.toLowerCase().includes(q);
  const shown = channels.filter((c) => q ? matches(c) : c.source === 'admin' || byChannel.has(c.id))
    .sort((a, b) => (byChannel.get(b.id)?.length ?? 0) - (byChannel.get(a.id)?.length ?? 0) || b.created_at.localeCompare(a.created_at));
  const quiet = q ? 0 : channels.length - shown.length;

  return (
    <div>
      <PageHead title="Inbjudningar" category="Givare" sub="Skapa en länk åt en person som ska dela insamlingen, t.ex. Ali. Här ser du vilka som registrerat sig via var och ens länk." />

      <Card className="mb-6">
        <form action={createInviteChannel} className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 text-sm font-bold">Namn på personen som delar
            <input name="name" required maxLength={80} placeholder="t.ex. Ali" className={adminPanelInput} />
          </label>
          <button className={adminPanelPrimaryButton}>Skapa inbjudningslänk</button>
        </form>
      </Card>

      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Sök delare eller person som registrerat sig" aria-label="Sök inbjudningar" className={`${adminPanelInput} mt-0 min-w-0 flex-1`} />
        <button className={adminPanelPrimaryButton}>Sök</button>
        {q && <a href="/admin/inbjudningar" className={adminPanelSecondaryButton}>Rensa</a>}
      </form>

      {(channelRes.error || donorRes.error) ? <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Kunde inte läsa inbjudningarna. Har migreringen 202611160001 körts?</p>
        : shown.length === 0 ? <Card className="text-center"><p className="font-bold">{q ? 'Ingen träff' : 'Inga inbjudningslänkar än'}</p>{!q && <p className="mt-1 text-sm text-mosque-ink/70">Skriv ett namn ovan för att skapa den första.</p>}</Card>
        : <div className="space-y-4">{shown.map((c) => {
          const people = byChannel.get(c.id) ?? [];
          const path = `/?ref=${c.code}`;
          return (
            <Card key={c.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-extrabold">{c.name ?? 'Anonym delare'} <Pill tone={c.source === 'admin' ? 'green' : 'grey'}>{c.source === 'admin' ? 'Skapad av admin' : 'Själv-skapad'}</Pill></h2>
                  <p className="mt-1 break-all font-mono text-xs text-mosque-ink/70" dir="ltr">{origin}{path}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold tabular-nums">{people.length}</div>
                  <div className="text-xs text-mosque-ink/70">registrerade{people.length > 0 && <> · {fmtSEK(people.reduce((n, d) => n + pledged(d), 0))} utlovat</>}</div>
                </div>
              </div>
              <div className="mt-3"><CopyInviteLink path={path} /></div>
              {people.length > 0 && <details className="mt-3" open={!!q}>
                <summary className="cursor-pointer text-sm font-bold">Visa vem som registrerat sig</summary>
                <table className="mt-2 w-full text-sm">
                  <tbody>{people.map((d) => (
                    <tr key={d.id} className="border-t border-mosque-ink/10">
                      <td className="py-2 font-semibold">{d.full_name}</td>
                      <td className="py-2 tabular-nums">{fmtSEK(pledged(d))}{d.payment_plans.length > 0 && <span className="text-xs text-mosque-ink/70"> · {d.payment_plans[0].months} mån</span>}</td>
                      <td className="py-2 text-right whitespace-nowrap">{day(d.created_at)}</td>
                    </tr>))}
                  </tbody>
                </table>
              </details>}
            </Card>);
        })}</div>}
      {quiet > 0 && <p className="mt-3 text-xs text-mosque-ink/70">{quiet} självskapade länkar utan registreringar visas inte.</p>}
      <p className="mt-3 text-xs text-mosque-ink/70">Besökare kan också skapa en egen länk under &quot;Dela&quot; på hemsidan. De dyker upp här när någon registrerat sig via dem. Beloppen är utlovade, inte bekräftade.</p>
    </div>
  );
}
