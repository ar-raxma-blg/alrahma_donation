import Link from 'next/link';
import { Card, PageHead, Pill } from '@/components/admin/ui';
import { adminPanelLayout, adminPanelPrimaryButton, adminPanelSecondaryButton } from '@/components/admin/PanelHeader';
import OverviewFundraising from '@/components/admin/OverviewFundraising';
import { loadOverviewDashboard } from '@/lib/admin/overview';
import { getAdminUser } from '@/lib/auth';
import { fmtDate } from '@/lib/admin/dates';
import { METHOD_SV, TX_STATUS_SV } from '@/lib/admin/labels';
import { fmtSEK } from '@/lib/format';

export default async function Overview() {
  const owner = !!await getAdminUser('owner');
  const d = await loadOverviewDashboard(owner);
  const reportHref = `/admin/rapporter?from=${d.monthStart}&to=${d.today}`;
  const shortcuts = [
    { title: 'Hemsidan', description: 'Se insamlingen som besökarna ser den.', href: '/', action: 'Visa hemsidan', external: true },
    ...(owner ? [
      { title: 'Betalsätt & QR-koder', description: 'Ändra Swish, PayPal och bankuppgifter.', href: '/admin/betalsatt#betaluppgifter', action: 'Ändra betaluppgifter' },
      { title: 'Utskick', description: 'Öppna anslutna kanaler och följ upp meddelanden.', href: '/admin/utskick', action: 'Öppna Utskick' }
    ] : []),
    { title: 'Rapporter & avstämning', description: 'Följ betalningar, jämför banken och exportera Excel.', href: reportHref, action: 'Öppna rapporter' }
  ];
  return <section className={adminPanelLayout}>
    <PageHead title="Översikt" category="Administration" sub="Insamlingen, viktiga uppgifter och genvägar till det du vill ändra." />

    <section aria-labelledby="homepage-heading" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="homepage-heading" className="text-xl font-extrabold">Hemsidans insamling</h2><p className="mt-1 text-sm text-mosque-ink/60">Samma total, mål och procent som på hemsidan. Uppdateras automatiskt.</p></div>
        {owner && <Link href="/admin/betalsatt#insamling" className={adminPanelPrimaryButton}>Ändra total och mål</Link>}
      </div>
      {d.homepage ? <OverviewFundraising {...d.homepage} /> : <Card><p role="alert" className="text-sm text-red-700">Kunde inte läsa hemsidans insamling. Ladda om sidan för aktuella belopp.</p></Card>}
      <p className="text-xs leading-5 text-mosque-ink/60">Hemsidans total kan innehålla en manuell del efter bankavstämning. Registrerade betalningar nedan och i Rapporter redovisas separat. Obetalda löften ingår inte i mottagna pengar.</p>
    </section>

    <nav aria-label="Genvägar" className="grid gap-4 sm:grid-cols-2">
      {shortcuts.map(s => <Link key={s.href} href={s.href} target={s.external ? '_blank' : undefined} rel={s.external ? 'noreferrer' : undefined} className="group min-w-0 rounded-2xl border border-mosque-ink/10 bg-white p-5 shadow-sm transition-colors hover:border-mosque-emerald focus-visible:outline focus-visible:outline-2 focus-visible:outline-mosque-emerald"><h2 className="text-lg font-extrabold">{s.title}</h2><p className="mt-2 text-sm leading-6 text-mosque-ink/60">{s.description}</p><span className="mt-4 inline-block text-sm font-bold text-mosque-emerald group-hover:underline">{s.action} →</span></Link>)}
    </nav>

    <section aria-labelledby="followup-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="followup-heading" className="text-xl font-extrabold">Betalningar och löften</h2><Link href="/admin/loften/ny" className={adminPanelSecondaryButton}>Nytt löfte</Link></div>
      {!d.operations ? <Card><p role="alert" className="text-sm text-red-700">Kunde inte läsa betalningar och löften. Ladda om sidan för aktuellt underlag.</p></Card> : <>
        <div className="grid gap-3 sm:grid-cols-2">{[
          { label: 'Bekräftat denna månad', value: fmtSEK(d.operations.monthlyPaid), href: reportHref },
          { label: 'Kvar på aktiva löften', value: fmtSEK(d.operations.outstanding), href: '/admin/loften' },
          { label: 'Betalningar att godkänna', value: String(d.operations.awaiting), href: '/admin/transaktioner?status=awaiting_approval' },
          { label: 'Förfallna delbetalningar', value: String(d.operations.overdue), href: '/admin/loften?status=overdue' }
        ].map(s => <Link key={s.label} href={s.href} className="min-w-0 rounded-2xl border border-mosque-ink/10 bg-white p-5 shadow-sm hover:border-mosque-emerald"><p className="text-sm font-semibold text-mosque-ink/60">{s.label}</p><p className="mt-2 break-words text-3xl font-extrabold tabular-nums text-mosque-emerald">{s.value}</p></Link>)}</div>
        {(d.operations.awaiting > 0 || d.operations.overdue > 0) && <Card className="border-amber-200 bg-amber-50"><h3 className="font-extrabold text-amber-950">Behöver följas upp</h3><div className="mt-3 flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-amber-900">{d.operations.awaiting > 0 && <Link href="/admin/transaktioner?status=awaiting_approval" className="underline">Granska {d.operations.awaiting} väntande betalningar</Link>}{d.operations.overdue > 0 && <Link href="/admin/loften?status=overdue" className="underline">Öppna försenade löften</Link>}</div></Card>}
        <Card><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-extrabold">Senaste betalningarna</h3><Link href="/admin/transaktioner" className="text-sm font-bold text-mosque-emerald underline">Alla transaktioner</Link></div>{d.operations.recent.length === 0 ? <p className="text-sm text-mosque-ink/60">Inga registrerade betalningar än.</p> : <ul className="divide-y divide-mosque-ink/10">{d.operations.recent.map(t => <li key={t.id}><Link href={`/admin/transaktioner/${t.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm hover:text-mosque-emerald"><span><strong>{fmtSEK(t.amount_sek)}</strong><span className="ml-3 text-mosque-ink/60">{fmtDate(t.received_on)} · {METHOD_SV[t.method]}</span></span><Pill tone={t.status === 'confirmed' ? 'green' : t.status === 'awaiting_approval' ? 'amber' : 'grey'}>{TX_STATUS_SV[t.status]}</Pill></Link></li>)}</ul>}</Card>
      </>}
    </section>

    {owner && <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold">Utskick att följa upp</h2><p className="mt-1 text-xs text-mosque-ink/60">Senaste 7 dagarna · högst 3 senaste utskick med fel</p></div><Link href="/admin/utskick" className={adminPanelSecondaryButton}>Öppna Utskick</Link></div>{d.broadcasts === null ? <p role="alert" className="mt-4 text-sm text-red-700">Kunde inte läsa utskickshistoriken. Öppna Utskick för att kontrollera den.</p> : d.broadcasts.length === 0 ? <p className="mt-4 text-sm text-mosque-ink/60">Inga registrerade misslyckade eller delvis misslyckade utskick under perioden.</p> : <ul className="mt-4 divide-y divide-mosque-ink/10">{d.broadcasts.map(b => <li key={b.id}><Link href="/admin/utskick" className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span className="font-bold">{b.channel.toUpperCase()} · {b.status === 'partial' ? 'Delvis misslyckat' : 'Misslyckat'}</span><span>{b.failed_count} misslyckade eller okända</span><time className="text-xs text-mosque-ink/60" dateTime={b.created_at}>{new Date(b.created_at).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}</time></Link></li>)}</ul>}</Card>}
  </section>;
}
