'use client';

import { useState } from 'react';

// Copies the full invitation link (origin is known on the client).
export default function CopyInviteLink({ path }: { path: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle');
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}${path}`); setState('done'); }
    catch { setState('fail'); }
    setTimeout(() => setState('idle'), 2500);
  };
  return (
    <button type="button" onClick={copy} className="rounded-lg bg-mosque-ink/10 px-3 py-1.5 text-xs font-bold hover:bg-mosque-ink/15">
      {state === 'done' ? 'Kopierad' : state === 'fail' ? 'Kunde inte kopiera' : 'Kopiera länk'}
    </button>
  );
}
