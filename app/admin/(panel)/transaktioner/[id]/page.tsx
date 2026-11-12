import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, PageHead, Pill } from '@/components/admin/ui';
import { fmtDate } from '@/lib/admin/dates';
import { METHOD_SV, TX_STATUS_SV } from '@/lib/admin/labels';
import { getAdminNames } from '@/lib/admin/queries';
import { getAdminUser } from '@/lib/auth';
import { fmtSEK } from '@/lib/format';
import { supabaseAdmin } from '@/lib/supabase/server';
import RowActions from '../RowActions';
import RefundForm from './RefundForm';

const when = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'medium', timeStyle: 'short' });

export default async function TransactionDetail({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  if (!/^[0-9a-f-]{36}$/.test(params.id)) notFound();
  const db = supabaseAdmin();
  const [{ data: t }, names, user] = await Promise.all([
    db.from('transactions').select('*, campaign:campaigns(id, title), donor:donor_profiles(id, full_name), installment:pledge_installments(seq, pledge_id)').eq('id', params.id).maybeSingle(),
    getAdminNames(),
    getAdminUser()
  ]);
  if (!t) notFound();

  const online = ['swish', 'card', 'paypal'].includes(t.method);
  const campaign = t.campaign as { id: string; title: string } | null;
  const donor = t.donor as { id: string; full_name: string } | null;
  const inst = t.installment as { seq: number; pledge_id: string } | null;
  const who = (id: string | null) => (id ? names.get(id) ?? 'Admin' : '–');

  // Timeline is derived from the row's own timestamps.
  const events: { at: string; text: string }[] = [
    { at: t.created_at, text: online ? `Betalning påbörjad via ${METHOD_SV[t.method]}` : `Registrerad av ${who(t.registered_by)}` }
  ];
  if (t.approved_at) events.push({ at: t.approved_at, text: `Godkänd av ${who(t.approved_by)}` });
  else if (t.status === 'confirmed') events.push({ at: t.created_at, text: 'Bekräftad av betalleverantören' });
  if (t.status === 'rejected') events.push({ at: t.created_at, text: 'Avvisad' });
  if (t.status === 'refunded') events.push({ at: t.created_at, text: `Återbetald: ${t.refund_reason}` });

  const rows: [string, React.ReactNode][] = [
    ['Belopp', <b key="a" className="tabular-nums">{fmtSEK(t.amount_sek)}</b>],
    ['Datum', fmtDate(t.received_on)],
    ['Kampanj', campaign ? <span key="c">{campaign.title}</span> : '–'],
    ['Betalsätt', METHOD_SV[t.method]],
    ['Givare', t.display_name ?? 'Anonym'],
    ['Kopplad givare', donor?.full_name ?? '–'],
    ['Löftesbetalning', inst ? <Link key="p" href={`/admin/loften/${inst.pledge_id}`} className="underline">Delbetalning {inst.seq}</Link> : '–'],
    ['Kvittonummer', t.receipt_no ?? '–'],
    ['Mottagen av', t.received_by_name ?? '–'],
    ['Leverantörsreferens', t.provider_ref ?? '–']
  ];

  return (
    <div>
      <PageHead title="Transaktion" sub={online ? 'Onlinebetalning. Raden är låst och kan inte ändras.' : undefined} action={<Link href="/admin/transaktioner" className="text-sm font-bold underline">Tillbaka</Link>} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3"><Pill tone={t.status === 'confirmed' ? 'green' : t.status === 'rejected' || t.status === 'refunded' ? 'grey' : 'amber'}>{TX_STATUS_SV[t.status]}</Pill></div>
          <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="text-mosque-ink/60">{k}</dt><dd className="break-words">{v}</dd></div>))}
          </dl>
          {t.status === 'awaiting_approval' && <div className="mt-5 flex justify-end"><RowActions id={t.id} own={t.registered_by === user?.id} /></div>}
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-3 text-base font-extrabold">Tidslinje</h2>
            <ol className="flex flex-col gap-3 border-l-2 border-mosque-ink/10 pl-4">
              {events.map((e, i) => (<li key={i} className="relative text-sm"><span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-mosque-emerald" />{e.text}<div className="text-xs text-mosque-ink/50">{when(e.at)}</div></li>))}
            </ol>
          </Card>
          {online && t.status === 'pending_provider' && (
            <Card className="text-sm text-mosque-ink/70">
              <b className="text-mosque-ink">Kontrollera status igen</b> är inte tillgängligt än. Ingen betalleverantör är ansluten i den nya admin, så statusen kan inte hämtas härifrån.
            </Card>
          )}
          {t.status === 'confirmed' && <RefundForm id={t.id} />}
        </div>
      </div>
    </div>
  );
}
