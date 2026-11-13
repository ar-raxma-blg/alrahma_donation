'use client';

import { adminPanelInput, adminPanelPrimaryButton, adminPanelSecondaryButton } from '@/components/admin/PanelHeader';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createManualTransaction } from '../actions';

const input = adminPanelInput;
const label = 'mb-1.5 block text-xs font-bold text-mosque-ink/60';

export default function NewTransactionForm({
  donors,
  installments,
  today,
  me,
  initialInstallment = ''
}: {
  donors: { id: string; full_name: string }[];
  installments: { id: string; pledge_id: string; donor_id: string; campaign_id: string; outstanding_sek: number; label: string }[];
  today: string;
  me: string;
  initialInstallment?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [donorId, setDonorId] = useState('');
  const [installmentId, setInstallmentId] = useState(initialInstallment);
  const selected = installments.find(i => i.id === installmentId);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createManualTransaction(fd);
      if (!res.ok) return setError(res.error);
      router.push(selected ? `/admin/loften/${selected.pledge_id}?tab=betalningar&registered=1` : '/admin/transaktioner?status=awaiting_approval');
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-4 rounded-2xl border border-mosque-ink/10 bg-white p-5 sm:p-6">
      <input type="hidden" name="campaign_id" value={selected?.campaign_id ?? ''} />
      <p className="text-sm text-mosque-ink/60">{selected ? selected.label : 'Gåvan hör till huvudinsamlingen.'}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="amount_sek">Belopp (kr)</label>
          <input key={installmentId} id="amount_sek" name="amount_sek" type="number" defaultValue={selected?.outstanding_sek} max={selected?.outstanding_sek} min={1} step={1} inputMode="numeric" required className={input} />
        </div>
        <div>
          <label className={label} htmlFor="received_on">Mottagen</label>
          <input id="received_on" name="received_on" type="date" required defaultValue={today} max={today} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="method">Betalsätt</label>
          <select id="method" name="method" required className={input} defaultValue="bank_transfer">
            <option value="cash">Kontant</option>
            <option value="bank_transfer">Banköverföring</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="receipt_no">Kvittonummer</label>
          <input id="receipt_no" name="receipt_no" maxLength={40} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="received_by_name">Mottagen av</label>
          <input id="received_by_name" name="received_by_name" maxLength={60} defaultValue={me} className={input} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="display_name">Förnamn (visas publikt)</label>
          <input id="display_name" name="display_name" maxLength={40} placeholder="Lämna tomt för Anonym" className={input} />
          <p className="mt-1 text-xs text-mosque-ink/50">Bara förnamn. Efternamn sparas aldrig här.</p>
        </div>
        <div>
          <label className={label} htmlFor="donor_id">{selected ? 'Givare kopplas från löftet' : 'Givare (valfritt)'}</label>
          <select id="donor_id" name="donor_id" disabled={!!selected} className={input} value={selected?.donor_id ?? donorId} onChange={e => setDonorId(e.target.value)}>
            <option value="">Ingen kopplad givare</option>
            {donors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={label} htmlFor="installment_id">Gäller delbetalning på ett löfte (valfritt)</label>
        <select id="installment_id" name="installment_id" className={input} value={installmentId} onChange={e => setInstallmentId(e.target.value)}>
          <option value="">Nej, vanlig gåva</option>
          {installments.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
      </div>

      {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{error}</div>}
      <div className="flex flex-wrap gap-3">
        <button disabled={pending} className={adminPanelPrimaryButton}>{pending ? 'Sparar…' : 'Skicka för godkännande'}</button>
        <button type="button" onClick={() => router.push('/admin/transaktioner')} className={adminPanelSecondaryButton}>Avbryt</button>
      </div>
    </form>
  );
}
