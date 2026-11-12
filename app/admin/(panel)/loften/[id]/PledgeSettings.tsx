'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Card } from '@/components/admin/ui';
import { cancelPledge } from '../actions';

export default function PledgeSettings({ id, reminders, cancelled, cancelReason, contact }: { id: string; reminders: boolean; cancelled: boolean; cancelReason: string | null; contact: { phone: string | null; email: string | null } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error ?? 'Något gick fel.');
      setError(null);
      router.refresh();
    });

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <p className="text-sm text-mosque-ink/60">Betalningar följs upp manuellt. Inga automatiska påminnelser skickas för nya löften.</p>

      <Card>
        <h2 className="mb-2 text-base font-extrabold">Avbryt löftet</h2>
        {cancelled ? (
          <p className="text-sm">Avbrutet. Anledning: {cancelReason}</p>
        ) : !open ? (
          <>
            <p className="mb-3 text-sm text-mosque-ink/60">Löften tas aldrig bort, bara avbryts. Redan gjorda betalningar ligger kvar.</p>
            <button onClick={() => setOpen(true)} className="rounded-lg bg-red-100 px-4 py-2 text-sm font-bold text-red-700">Avbryt löftet…</button>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <label htmlFor="cancel-reason" className="text-xs font-bold text-mosque-ink/60">Anledning (krävs)</label>
            <textarea id="cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-lg border border-mosque-ink/15 px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button disabled={pending} onClick={() => run(() => cancelPledge(id, reason))} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">Avbryt löftet</button>
              <button onClick={() => setOpen(false)} className="rounded-lg bg-mosque-ink/10 px-4 py-2 text-sm font-bold">Nej, behåll</button>
            </div>
          </div>
        )}
        {error && <div role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</div>}
      </Card>
    </div>
  );
}
