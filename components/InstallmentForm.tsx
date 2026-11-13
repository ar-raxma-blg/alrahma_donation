'use client';
import { useRef, useState } from 'react';
import { Donation, PaymentPlan } from '@/lib/types';
import { paymentMethods } from '@/lib/donors';
import { installmentError } from '@/lib/installments';
import { fmtSEK } from '@/lib/format';

export default function InstallmentForm({ plan, donations, onSaved }: { plan: PaymentPlan; donations: Donation[]; onSaved: () => void }) {
  const paid = donations.filter(d => d.payment_plan_id === plan.id && d.status === 'confirmed').reduce((sum, d) => sum + d.amount_sek, 0);
  const remaining = Math.max(0, plan.total_amount_sek - paid);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(Math.min(remaining, plan.amount_per_month_sek)));
  const [paidOn, setPaidOn] = useState(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' }));
  const [method, setMethod] = useState(plan.method || 'swish');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState('');
  const requestId = useRef<string | undefined>(undefined);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    requestId.current ||= crypto.randomUUID();
    const payload = { amountSek: Number(amount), paidOn, method, verified, requestId: requestId.current };
    const invalid = installmentError(payload);
    if (invalid) { setNotice(invalid); return; }
    if (payload.amountSek > remaining) { setNotice(`Beloppet överstiger återstående ${fmtSEK(remaining)}.`); return; }
    setBusy(true); setNotice('');
    try {
      const res = await fetch(`/api/admin/plans/${plan.id}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      if (!res.ok) { setNotice(result.error); if (res.status < 500) setUncertain(false); return; }
      setNotice('Betalningen är registrerad.'); setOpen(false); setVerified(false); setUncertain(false); requestId.current = undefined; onSaved();
    } catch { setUncertain(true); setNotice('Anslutningen bröts. Försök igen med samma uppgifter; samma betalning registreras bara en gång.'); }
    finally { setBusy(false); }
  }
  return <div className="mt-3">
    {plan.status === 'active' && remaining > 0 && <button type="button" onClick={() => setOpen(!open)} className="rounded-lg bg-mosque-emerald px-3 py-2 text-white">Registrera mottagen betalning</button>}
    {open && <form noValidate onSubmit={save} className="mt-3 space-y-3 rounded-xl bg-mosque-cream p-4">
      <fieldset disabled={busy || uncertain} className="space-y-3">
      <p>Registrera bara pengar som moskén redan har tagit emot. Kvar: {fmtSEK(remaining)}.</p>
      <label className="block">Belopp (kr)<input type="number" value={amount} onChange={e => { setAmount(e.target.value); requestId.current = undefined; }} className="mt-1 block w-full rounded-lg border p-2" /></label>
      <label className="block">Betalningsdatum<input type="date" value={paidOn} onChange={e => { setPaidOn(e.target.value); requestId.current = undefined; }} className="mt-1 block w-full rounded-lg border p-2" /></label>
      <label className="block">Betalningsmetod<select value={method} onChange={e => { setMethod(e.target.value as typeof method); requestId.current = undefined; }} className="mt-1 block w-full rounded-lg border p-2">{Object.entries(paymentMethods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="flex items-start gap-2"><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} />Jag har kontrollerat att betalningen har kommit in.</label>
      </fieldset>
      <button disabled={busy} className="rounded-lg bg-mosque-deep px-3 py-2 text-white disabled:opacity-50">{busy ? 'Sparar…' : 'Spara betalningen'}</button>
    </form>}
    {notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
  </div>;
}
