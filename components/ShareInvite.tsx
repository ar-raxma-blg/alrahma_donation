'use client';

import { useEffect, useState } from 'react';
import { Lang } from '@/lib/types';
import { useT } from '@/components/TranslationProvider';
import { inviteUrl } from '@/lib/invites';

const KEY = 'alrahma-invite-code';

// "Dela": a visitor can get a personal invitation link, optionally with their
// name, so the mosque can see who invited whom. The code is remembered in this
// browser (functional only) so the same person keeps the same link.
export default function ShareInvite({ lang }: { lang: Lang }) {
  const t = useT();
  const [name, setName] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try { const saved = window.localStorage.getItem(KEY); if (saved) setCode(saved); } catch { /* storage blocked */ }
  }, []);

  const link = code ? `${inviteUrl(window.location.origin, code)}&lang=${lang}` : '';

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(false);
    try {
      const res = await fetch('/api/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const data = await res.json();
      if (!res.ok || !data.code) throw new Error('failed');
      setCode(data.code);
      try { window.localStorage.setItem(KEY, data.code); } catch { /* storage blocked */ }
    } catch { setError(true); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* link is visible and selectable */ }
  };
  const share = async () => {
    try { await navigator.share({ text: t(lang, 'shareMessage'), url: link }); } catch { /* cancelled */ }
  };

  return (
    <section aria-labelledby="share-title" className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur sm:mt-6 sm:p-8">
      <h2 id="share-title" className="text-2xl font-extrabold sm:text-3xl">{t(lang, 'shareTitle')}</h2>
      <p className="mx-auto mt-2 max-w-xl text-base text-mosque-muted">{t(lang, 'shareText')}</p>

      {!code ? (
        <form onSubmit={create} className="mx-auto mt-5 flex max-w-md flex-col gap-3 text-start">
          <label>
            <span className="mb-1.5 block text-base font-bold text-mosque-mint">{t(lang, 'shareNameLabel')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name"
              className="w-full rounded-lg border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-base text-mosque-cream" />
            <span className="mt-1.5 block text-sm text-mosque-muted">{t(lang, 'shareNameHint')}</span>
          </label>
          {error && <div role="alert" className="text-base font-semibold text-red-300">{t(lang, 'shareFailed')}</div>}
          <button disabled={busy} className="rounded-xl bg-mosque-gold py-3.5 font-extrabold text-mosque-deep disabled:opacity-40">{busy ? '…' : t(lang, 'shareCreate')}</button>
        </form>
      ) : (
        <div className="mx-auto mt-5 max-w-md">
          <p role="status" className="mb-3 text-base font-semibold text-mosque-mint">{t(lang, 'shareReady')}</p>
          <div className="break-all rounded-lg bg-white/[0.06] p-3 font-mono text-sm" dir="ltr">{link}</div>
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={copy} className="min-h-[44px] rounded-xl bg-mosque-gold px-5 font-extrabold text-mosque-deep">{copied ? t(lang, 'shareCopied') : t(lang, 'shareCopy')}</button>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button type="button" onClick={share} className="min-h-[44px] rounded-xl border border-white/30 px-5 font-bold">{t(lang, 'shareNative')}</button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
