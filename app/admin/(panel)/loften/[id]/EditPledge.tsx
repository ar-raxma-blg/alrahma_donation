'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Card } from '@/components/admin/ui';
import { adminPanelInput, adminPanelPrimaryButton, adminPanelSecondaryButton } from '@/components/admin/PanelHeader';
import { fmtSEK } from '@/lib/format';
import { editPledge } from '../actions';

type Row = { key: string; id: string | null; due_on: string; amount: string; locked: boolean };
export default function EditPledge({ id, installments }: { id: string; installments: { id: string; due_on: string; amount_sek: number; locked: boolean }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<Row[]>(() => installments.map(i => ({ key: i.id, id: i.id, due_on: i.due_on, amount: String(i.amount_sek), locked: i.locked })));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const change = (key: string, patch: Partial<Row>) => { setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r)); setSaved(false); };
  const add = () => { const last = rows[rows.length - 1]; setRows(rs => [...rs, { key: crypto.randomUUID(), id: null, due_on: last?.due_on ?? '', amount: '', locked: false }]); setSaved(false); };
  const save = () => start(async () => {
    setError(''); setSaved(false);
    const res = await editPledge(id, rows.map(r => ({ id: r.id, due_on: r.due_on, amount_sek: r.amount })));
    if (!res.ok) return setError(res.error);
    setSaved(true); router.refresh();
  });
  return <Card className="max-w-3xl">
    <p className="mb-4 text-sm text-mosque-ink/75">Ändra datum och belopp, lägg till eller ta bort delbetalningar. Totalbeloppet är summan. Delbetalningar med registrerade betalningar behåller sitt belopp och kan inte tas bort, men datumet kan flyttas.</p>
    <div className="space-y-3">
      {rows.map((r, n) => <div key={r.key} className="flex flex-wrap items-end gap-3">
        <span className="w-6 pb-3 text-sm font-bold text-mosque-ink/60">{n + 1}</span>
        <label className="block text-sm font-semibold">Förfaller<input type="date" required value={r.due_on} onChange={e => change(r.key, { due_on: e.target.value })} className={`${adminPanelInput} !mt-1 !w-44 !text-mosque-ink`} /></label>
        <label className="block text-sm font-semibold">Belopp (kr)<input type="number" min={1} step={1} inputMode="numeric" required disabled={r.locked} value={r.amount} onChange={e => change(r.key, { amount: e.target.value })} className={`${adminPanelInput} !mt-1 !w-36 !text-mosque-ink disabled:!text-mosque-ink/70`} /></label>
        {r.locked ? <span className="pb-3 text-xs font-semibold text-mosque-ink/70">Har betalningar – låst belopp</span>
          : <button type="button" disabled={rows.length <= 1} onClick={() => { setRows(rs => rs.filter(x => x.key !== r.key)); setSaved(false); }} className="pb-3 text-sm font-bold text-red-700 underline disabled:opacity-40">Ta bort</button>}
      </div>)}
    </div>
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button type="button" onClick={add} className={adminPanelSecondaryButton}>Lägg till delbetalning</button>
      <span className="text-sm font-bold">Nytt totalbelopp: {fmtSEK(total)}</span>
    </div>
    <div className="mt-5 flex items-center gap-3">
      <button type="button" disabled={pending} onClick={save} className={adminPanelPrimaryButton}>{pending ? 'Sparar…' : 'Spara ändringar'}</button>
      {saved && <span role="status" className="text-sm font-bold text-emerald-800">Löftet är uppdaterat.</span>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
  </Card>;
}
