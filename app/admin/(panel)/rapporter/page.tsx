import Link from 'next/link';
import { Card } from '@/components/admin/ui';
import PanelHeader, { adminPanelInput, adminPanelLayout, adminPanelPrimaryButton, adminPanelSecondaryButton } from '@/components/admin/PanelHeader';
import ReportReconciliation from '@/components/admin/ReportReconciliation';
import { getAdminUser } from '@/lib/auth';
import { stockholmToday } from '@/lib/admin/dates';
import { FUND_SV, METHOD_SV } from '@/lib/admin/labels';
import { loadAdminReport } from '@/lib/admin/report-data';
import { parseReportFilters, PLEDGE_BASIS, REPORT_BASIS, ReportGroup, reportSEK as fmtSEK } from '@/lib/admin/reports';

const input = adminPanelInput;
const description = 'Underlag för bokföring och uppföljning. Alla belopp visas i SEK. Välj period och avgränsa rapporten nedan.';

function Breakdown({ title, rows, first }: { title: string; rows: ReportGroup[]; first: string }) {
  return <Card className="overflow-x-auto">
    <h2 className="mb-3 text-lg font-extrabold">{title}</h2>
    {rows.length === 0 ? <p className="text-sm text-mosque-ink/60">Inga mottagna betalningar i urvalet.</p> : <table className="w-full min-w-[530px] text-sm">
      <caption className="sr-only">{title}, belopp i SEK</caption>
      <thead><tr className="border-b border-mosque-ink/10 bg-mosque-cream/60 text-left text-xs text-mosque-ink/60">{[first, 'Antal', 'Mottaget', 'Återbetalt', 'Netto'].map((h, i) => <th key={h} scope="col" className={`px-3 py-3 ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, index) => <tr key={index} className="border-b border-mosque-ink/10 last:border-0 hover:bg-mosque-cream/60"><th scope="row" className="p-3 text-left font-semibold">{r.label}</th><td className="px-3 text-right tabular-nums">{r.count}</td>{[r.received, r.refunded, r.net].map((n, i) => <td key={i} className="whitespace-nowrap p-3 text-right tabular-nums">{fmtSEK(n)}</td>)}</tr>)}</tbody>
      <tfoot><tr className="border-t border-mosque-ink/10 font-bold text-mosque-deep"><th className="p-3 text-left">Totalt</th><td className="px-3 text-right tabular-nums">{rows.reduce((s, r) => s + r.count, 0)}</td>{(['received', 'refunded', 'net'] as const).map(k => <td key={k} className="whitespace-nowrap px-3 text-right tabular-nums">{fmtSEK(rows.reduce((s, r) => s + r[k], 0))}</td>)}</tr></tfoot>
    </table>}
  </Card>;
}

export default async function Reports({ searchParams: searchParamsPromise }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Parent layouts may render concurrently with their pages.
  if (!await getAdminUser()) return null;
  let data;
  try {
    data = await loadAdminReport(parseReportFilters(await searchParamsPromise, stockholmToday()));
  } catch (error) {
    return <section className={adminPanelLayout}><PanelHeader category="Ekonomi" title="Rapporter & avstämning" description={description} /><Card><p role="alert" className="font-semibold text-red-700">{error instanceof Error ? error.message : 'Kunde inte hämta rapporten.'}</p><Link href="/admin/rapporter" className="mt-3 inline-block font-bold text-mosque-emerald underline underline-offset-2">Återställ rapporten</Link></Card></section>;
  }
  const { report: r, campaigns } = data;
  const f = r.filters;
  return <section className={adminPanelLayout}>
    <PanelHeader category="Ekonomi" title="Rapporter & avstämning" description={description} />
    <Card>
      <h2 className="text-lg font-extrabold">Rapporturval</h2>
      <p className="mt-1 text-xs text-mosque-ink/60">Välj vilka betalningar rapporten ska omfatta.</p>
      <form method="get" className="mt-4 grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm font-semibold">Från<input type="date" name="from" defaultValue={f.from} className={input} /></label>
        <label className="text-sm font-semibold">Till<input type="date" name="to" defaultValue={f.to} className={input} /></label>
        <label className="text-sm font-semibold">Betalsätt<select name="method" defaultValue={f.method} className={input}><option value="">Alla betalsätt</option>{Object.entries(METHOD_SV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="text-sm font-semibold">Ändamål<select name="fund" defaultValue={f.fund} className={input}><option value="">Alla ändamål</option>{Object.entries(FUND_SV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="text-sm font-semibold">Kampanj<select name="campaign" defaultValue={f.campaign} className={input}><option value="">Alla kampanjer</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <div className="flex flex-wrap gap-3"><button className={adminPanelPrimaryButton}>Visa rapport</button><Link href="/admin/rapporter" className={adminPanelSecondaryButton}>Denna månad</Link></div>
      </form>
      <p className="mt-3 text-xs text-mosque-ink/60">Lämna ett datum tomt för att ta med alla datum i den riktningen. Perioden omfattar både från- och till-datum.</p>
    </Card>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ['Mottaget inkl. återbetalda', r.totals.received], ['Återbetalt', r.totals.refunded], ['Netto mottaget', r.totals.net], ['Obetalda delbetalningar', r.outstanding]
    ].map(([label, amount]) => <div key={label} className={`min-w-0 rounded-2xl border px-5 py-4 ${label === 'Netto mottaget' ? 'border-mosque-emerald bg-mosque-emerald text-white shadow-sm' : 'border-mosque-ink/10 bg-white'}`}><p className={`text-sm font-bold ${label === 'Netto mottaget' ? 'text-white/75' : 'text-mosque-ink/60'}`}>{label}</p><p className={`mt-2 break-words text-2xl font-extrabold tabular-nums ${label === 'Netto mottaget' ? 'text-white' : 'text-mosque-deep'}`}>{fmtSEK(Number(amount))}</p></div>)}</div>
    <Card><h2 className="text-lg font-extrabold">Så räknas rapporten</h2><p className="mt-2 text-sm leading-6 text-mosque-ink/70">{REPORT_BASIS} Väntande och avvisade betalningar ingår inte.</p><p className="mt-2 text-sm leading-6 text-mosque-ink/70">{PLEDGE_BASIS}</p><p className="mt-2 text-sm leading-6 text-mosque-ink/70">Ändamål följer kampanjens nuvarande inställning. Zakat visas separat i sammanställningen per ändamål.</p></Card>
    <ReportReconciliation key={JSON.stringify(f)} filters={f} net={r.totals.net} />
    {r.rows.length === 0 && <Card><p className="font-bold">Inga mottagna betalningar matchar filtren.</p><p className="mt-1 text-sm text-mosque-ink/60">Ändra perioden eller filtren. Du kan fortfarande exportera en tom rapport och jämföra med banken.</p></Card>}
    <Breakdown title="Per månad" first="Månad" rows={r.months} />
    <Breakdown title="Per betalsätt" first="Betalsätt" rows={r.methods} />
    <Breakdown title="Per ändamål" first="Ändamål" rows={r.funds} />
    <Breakdown title="Per kampanj" first="Kampanj" rows={r.campaigns} />
  </section>;
}
