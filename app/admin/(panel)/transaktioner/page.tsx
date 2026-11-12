import Link from 'next/link';
import { ButtonLink, Card, PageHead, Pill } from '@/components/admin/ui';
import { addDays, fmtDate, stockholmToday } from '@/lib/admin/dates';
import { METHOD_SV, TX_STATUS_SV } from '@/lib/admin/labels';
import { getAdminNames } from '@/lib/admin/queries';
import { getAdminUser } from '@/lib/auth';
import { fmtSEK } from '@/lib/format';
import { supabaseAdmin } from '@/lib/supabase/server';
import RowActions from './RowActions';

type Params = { status?: string; method?: string; campaign?: string; period?: string; q?: string };
const TONE: Record<string, 'green' | 'amber' | 'red' | 'grey'> = { confirmed: 'green', awaiting_approval: 'amber', pending_provider: 'amber', rejected: 'grey', refunded: 'grey' };
const select = 'rounded-xl border border-mosque-ink/15 bg-mosque-cream/40 px-4 py-3 text-sm outline-none focus:border-mosque-emerald focus:bg-white';

export default async function Transactions({ searchParams }: { searchParams: Promise<Params> }) {
  const db = supabaseAdmin();
  const user = await getAdminUser();
  const today = stockholmToday();
  const p = await searchParams;

  let q = db
    .from('transactions')
    .select('id, amount_sek, received_on, method, status, display_name, receipt_no, registered_by, installment_id, created_at, campaign:campaigns(title), donor:donor_profiles(full_name)', { count: 'exact' })
    .order('received_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);
  if (p.status) q = q.eq('status', p.status);
  if (p.method) q = q.eq('method', p.method);
  if (p.campaign) q = q.eq('campaign_id', p.campaign);
  if (p.period === 'today') q = q.gte('received_on', today);
  if (p.period === '7') q = q.gte('received_on', addDays(today, -6));
  if (p.period === '30') q = q.gte('received_on', addDays(today, -29));
  const term = (p.q ?? '').replace(/[,()%*]/g, ' ').trim();
  if (term) q = q.or(`display_name.ilike.%${term}%,receipt_no.ilike.%${term}%,provider_ref.ilike.%${term}%`);

  const [{ data, count, error }, { data: campaigns }, names] = await Promise.all([q, db.from('campaigns').select('id, title').order('created_at', { ascending: false }), getAdminNames()]);
  const rows = (data ?? []) as unknown as {
    id: string; amount_sek: number; received_on: string; method: string; status: string; display_name: string | null;
    receipt_no: string | null; registered_by: string | null; installment_id: string | null;
    campaign: { title: string } | null; donor: { full_name: string } | null;
  }[];
  const filtered = Object.values(p).some(Boolean);
  const total = rows.filter((r) => r.status === 'confirmed').reduce((s, r) => s + r.amount_sek, 0);

  return (
    <div>
      <PageHead
        title="Transaktioner"
        sub="All inkommen betalning, online och offline. Manuella och importerade rader räknas inte med förrän en annan admin godkänt dem."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/transaktioner/import">Importera CSV</ButtonLink>
            <ButtonLink href="/admin/transaktioner/ny" primary>Registrera gåva</ButtonLink>
          </div>
        }
      />

      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6" method="get">
        <select name="period" defaultValue={p.period ?? ''} className={select} aria-label="Period">
          <option value="">Alla datum</option><option value="today">Idag</option><option value="7">7 dagar</option><option value="30">30 dagar</option>
        </select>
        <select name="status" defaultValue={p.status ?? ''} className={select} aria-label="Status">
          <option value="">Alla statusar</option>
          {Object.entries(TX_STATUS_SV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="method" defaultValue={p.method ?? ''} className={select} aria-label="Betalsätt">
          <option value="">Alla betalsätt</option>
          {Object.entries(METHOD_SV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="campaign" defaultValue={p.campaign ?? ''} className={select} aria-label="Kampanj">
          <option value="">Alla kampanjer</option>
          {(campaigns ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <input name="q" defaultValue={p.q ?? ''} placeholder="Sök namn eller kvitto" className={select} aria-label="Sök" />
        <div className="flex gap-2">
          <button className="flex-1 rounded-lg bg-mosque-ink px-3 py-2 text-sm font-bold text-white">Filtrera</button>
          {filtered && <Link href="/admin/transaktioner" className="rounded-lg bg-mosque-ink/10 px-3 py-2 text-sm font-bold">Rensa</Link>}
        </div>
      </form>

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Kunde inte hämta transaktionerna: {error.message}</div>
      ) : rows.length === 0 ? (
        <Card className="text-center">
          <p className="font-bold">{filtered ? 'Inga transaktioner matchar' : 'Inga transaktioner än'}</p>
          <p className="mt-1 text-sm text-mosque-ink/60">{filtered ? 'Ändra eller rensa filtren.' : 'Online-gåvor dyker upp här automatiskt. Kontanter och banköverföringar lägger du in med “Registrera gåva”.'}</p>
        </Card>
      ) : (
        <>
          <p className="mb-2 text-sm text-mosque-ink/60" aria-live="polite">
            {count} transaktioner{(count ?? 0) > rows.length && ` (visar de ${rows.length} senaste)`} · bekräftat i listan: <b className="tabular-nums text-mosque-ink">{fmtSEK(total)}</b>
          </p>
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-mosque-cream text-left text-xs text-mosque-ink/60">
                <tr><th className="p-3">Datum</th><th className="p-3">Belopp</th><th className="p-3">Kampanj</th><th className="p-3">Betalsätt</th><th className="p-3">Givare</th><th className="p-3">Status</th><th className="p-3" /></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-mosque-ink/10 align-middle">
                    <td className="whitespace-nowrap p-3 text-mosque-ink/70">{fmtDate(r.received_on)}</td>
                    <td className="whitespace-nowrap p-3 font-bold tabular-nums"><Link href={`/admin/transaktioner/${r.id}`} className="hover:underline">{fmtSEK(r.amount_sek)}</Link></td>
                    <td className="p-3">{r.campaign?.title}{r.installment_id && <div className="text-xs text-mosque-ink/50">Löftesbetalning</div>}</td>
                    <td className="p-3">{METHOD_SV[r.method]}{r.receipt_no && <div className="text-xs text-mosque-ink/50">Kvitto {r.receipt_no}</div>}</td>
                    <td className="p-3">{r.display_name ?? 'Anonym'}{r.donor && <div className="text-xs text-mosque-ink/50">{r.donor.full_name}</div>}</td>
                    <td className="p-3"><Pill tone={TONE[r.status]}>{TX_STATUS_SV[r.status]}</Pill>{r.registered_by && r.status === 'awaiting_approval' && <div className="mt-1 text-xs text-mosque-ink/50">av {names.get(r.registered_by) ?? 'admin'}</div>}</td>
                    <td className="p-3 text-right">{r.status === 'awaiting_approval' && <RowActions id={r.id} own={r.registered_by === user?.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
