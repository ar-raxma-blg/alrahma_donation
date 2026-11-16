import { Card, PageHead, Pill } from '@/components/admin/ui';
import { adminPanelInput, adminPanelPrimaryButton, adminPanelSecondaryButton } from '@/components/admin/PanelHeader';
import { fmtSEK } from '@/lib/format';
import { supabaseAdmin } from '@/lib/supabase/server';
import { setPublicAnonymity } from './actions';

type Row = {
  id: string; display_name: string; is_anonymous: boolean; amount_sek: number; created_at: string; donor_id: string | null;
  donor: { full_name: string; phone: string | null } | null;
};

// Everything shown in the public "Live donations" list, with the real name next to
// what the public sees. Search a person and hide their name there; admins always see it.
export default async function LiveListManager({ searchParams: searchParamsPromise }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParamsPromise).q ?? '').trim().toLowerCase();
  const { data, error } = await supabaseAdmin()
    .from('donations')
    .select('id, display_name, is_anonymous, amount_sek, created_at, donor_id, donor:donors(full_name, phone)')
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .limit(500);
  const rows = ((data ?? []) as unknown as Row[]).filter((r) =>
    !q || `${r.donor?.full_name ?? ''} ${r.display_name} ${r.donor?.phone ?? ''}`.toLowerCase().includes(q));

  return (
    <div>
      <PageHead title="Live-lista" category="Givare" sub="Det här är listan på hemsidan. Sök en person och dölj namnet för besökarna. Du ser alltid det riktiga namnet här." />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Sök namn eller telefon" aria-label="Sök givare" className={`${adminPanelInput} min-w-0 flex-1`} />
        <button className={adminPanelPrimaryButton}>Sök</button>
        {q && <a href="/admin/live-lista" className={adminPanelSecondaryButton}>Rensa</a>}
      </form>
      {error ? <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Kunde inte läsa listan. Ladda om sidan.</p>
        : rows.length === 0 ? <Card className="text-center"><p className="font-bold">{q ? 'Ingen träff' : 'Inga bekräftade donationer i listan än'}</p></Card>
        : <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-mosque-cream text-left text-xs text-mosque-ink/70"><tr><th className="p-3">Givare (endast admin)</th><th className="p-3">Visas publikt som</th><th className="p-3">Belopp</th><th className="p-3">Datum</th><th className="p-3"><span className="sr-only">Åtgärd</span></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-t border-mosque-ink/10">
                <td className="p-3 font-bold">{r.donor?.full_name ?? r.display_name}{r.donor?.phone && <div className="text-xs font-normal text-mosque-ink/70">{r.donor.phone}</div>}</td>
                <td className="p-3">{r.is_anonymous ? <Pill tone="grey">Anonym</Pill> : r.display_name}</td>
                <td className="p-3 tabular-nums">{fmtSEK(r.amount_sek)}</td>
                <td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })}</td>
                <td className="p-3 text-right">{r.donor_id && <form action={setPublicAnonymity}>
                  <input type="hidden" name="donor_id" value={r.donor_id} />
                  <input type="hidden" name="hide" value={r.is_anonymous ? '0' : '1'} />
                  <button className={r.is_anonymous ? adminPanelSecondaryButton : adminPanelPrimaryButton}>{r.is_anonymous ? 'Visa namn' : 'Dölj namn'}</button>
                </form>}</td>
              </tr>))}
            </tbody>
          </table>
        </Card>}
      <p className="mt-3 text-xs text-mosque-ink/70">Ändringen gäller personens alla donationer och månadsbetalningar. Ett dolt namn kan bara visas igen om givaren samtyckte till det vid registreringen.</p>
    </div>
  );
}
