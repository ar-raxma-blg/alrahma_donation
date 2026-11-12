'use client';

import { useState } from 'react';
import { parseBankOre, reportSEK as fmtSEK, ReportFilters } from '@/lib/admin/reports';
import { adminPanelInput, adminPanelPrimaryButton } from '@/components/admin/PanelHeader';

export default function ReportReconciliation({ filters, net }: { filters: ReportFilters; net: number }) {
  const [bank, setBank] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  let bankOre: number | null = null;
  let inputError = '';
  try { bankOre = parseBankOre(bank); } catch (error) { inputError = (error as Error).message; }
  const difference = bankOre === null ? null : (bankOre - net * 100) / 100;
  async function download() {
    setBusy(true); setDownloadError('');
    try {
      const query = new URLSearchParams({ ...filters, bank });
      const res = await fetch(`/api/admin/reports/excel?${query}`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json()).error || 'Kunde inte exportera rapporten.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `alrahma-rapport-${filters.from || 'alla'}-${filters.to || 'alla'}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) { setDownloadError(error instanceof Error ? error.message : 'Kunde inte exportera rapporten.'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-mosque-ink/10 bg-white p-5" aria-labelledby="reconciliation-heading">
    <h2 id="reconciliation-heading" className="text-lg font-extrabold">Manuell bankavstämning</h2>
    <p className="mt-1 max-w-3xl text-sm leading-6 text-mosque-ink/60">Ange nettot från banken för samma period, kampanjer och betalsätt som rapporten. Välj ett betalsätt om kontanter eller andra betalningar ska uteslutas. Avgifter och olika bokföringsdatum kan ge en skillnad.</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-3">
      <label className="text-sm font-semibold">Bankens netto (SEK)
        <input value={bank} onChange={e => setBank(e.target.value)} inputMode="decimal" placeholder="Exempel: 12 500,50" aria-invalid={!!inputError} aria-describedby="bank-help" className={adminPanelInput} />
      </label>
      <div><p className="text-sm text-mosque-ink/60">Systemets netto</p><p className="mt-2 text-xl font-bold tabular-nums">{fmtSEK(net)}</p></div>
      <div aria-live="polite"><p className="text-sm text-mosque-ink/60">Skillnad (bank − system)</p><p className={`mt-2 text-xl font-bold tabular-nums ${difference === 0 ? 'text-emerald-700' : difference !== null ? 'text-amber-700' : ''}`}>{inputError ? '—' : difference === null ? 'Ange bankens netto' : fmtSEK(difference)}</p>{difference === 0 && <p className="text-sm text-emerald-700">Beloppen stämmer överens.</p>}</div>
    </div>
    <p id="bank-help" className={`mt-2 text-sm ${inputError ? 'text-red-700' : 'text-mosque-ink/60'}`}>{inputError || 'Jämförelsen sparas inte i systemet. Den följer med i Excel-exporten om du anger ett bankbelopp.'}</p>
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button onClick={download} disabled={busy || !!inputError} className={adminPanelPrimaryButton}>{busy ? 'Skapar Excel…' : 'Exportera till Excel'}</button>
      <p className="text-sm text-mosque-ink/60">Sammanställningar och transaktioner utan givaruppgifter. Exporten hämtar aktuella uppgifter på nytt.</p>
    </div>
    {downloadError && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{downloadError}</p>}
  </section>;
}
