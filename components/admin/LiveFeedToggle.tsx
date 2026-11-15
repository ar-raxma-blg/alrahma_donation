'use client';

import { useEffect, useState } from 'react';
import { Card } from './ui';

export default function LiveFeedToggle() {
  const [show, setShow] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/admin/live-feed', { cache: 'no-store' }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setShow(d.show); }).catch(e => setError(e.message));
  }, []);
  async function toggle() {
    if (show === null || busy) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/admin/live-feed', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ show: !show }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Kunde inte spara.');
      setShow(!show);
    } catch (e) { setError(e instanceof Error ? e.message : 'Kunde inte spara.'); }
    finally { setBusy(false); }
  }
  return <Card>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 flex-1 basis-64">
        <h2 className="text-base font-extrabold">Live-donationer på hemsidan</h2>
        <p className="mt-1 text-sm text-mosque-ink/75">Listan med de senaste gåvorna. Av: listan döljs för besökare. Ändringen gäller direkt.</p>
      </div>
      <button type="button" role="switch" aria-checked={show === true} aria-label="Visa live-donationer" disabled={show === null || busy} onClick={toggle}
        className={`relative inline-flex h-8 w-14 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mosque-emerald ${show ? 'bg-mosque-emerald' : 'bg-mosque-ink/30'}`}>
        <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${show ? 'translate-x-7' : 'translate-x-1'}`} />
      </button>
    </div>
    <p className="mt-2 text-sm font-bold" aria-live="polite">{show === null ? (error ? '' : 'Laddar…') : show ? 'På – visas för besökare' : 'Av – dold'}</p>
    {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
  </Card>;
}
