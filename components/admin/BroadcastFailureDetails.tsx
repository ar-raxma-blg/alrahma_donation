import { BroadcastDiagnostics, FAILURE_INFO } from '@/lib/broadcast-diagnostics';

export default function BroadcastFailureDetails({ diagnostics, showBalance = true }: { diagnostics: BroadcastDiagnostics; showBalance?: boolean }) {
  return <div className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
    {diagnostics.failures.map(f => <div key={`${f.code}-${f.httpStatus ?? ''}`}>
      <p className="font-bold">{FAILURE_INFO[f.code].title} · {f.count} mottagare{f.httpStatus ? ` (HTTP ${f.httpStatus})` : ''}</p>
      <p className="mt-1 leading-6">{FAILURE_INFO[f.code].action}</p>
    </div>)}
    {showBalance && (diagnostics.balanceAfter ? <p className="border-t border-amber-200 pt-3 leading-6"><strong>46elks-saldo efter försöket: {new Intl.NumberFormat('sv-SE', { style: 'currency', currency: diagnostics.balanceAfter.currency }).format(diagnostics.balanceAfter.balance / 10000)}</strong><span className="block text-xs">Kontrollerat {new Date(diagnostics.balanceAfter.checkedAt).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}. Saldot visar läget vid kontrollen och bevisar inte orsaken till felet.</span></p> : <p className="text-xs">Inget saldo sparades för detta försök. Du kan kontrollera det aktuella SMS-saldot högre upp på sidan.</p>)}
  </div>;
}
