'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from './ui';
import { adminPanelInput, adminPanelPrimaryButton } from './PanelHeader';
import { Lang } from '@/lib/types';
import { translations } from '@/lib/i18n';

const LANGS: { code: Lang; label: string }[] = [{ code: 'sv', label: 'Svenska' }, { code: 'en', label: 'English' }, { code: 'ar', label: 'العربية' }];
const FIELDS: { key: string; label: string; long?: boolean }[] = [
  { key: 'projectTitle', label: 'Rubrik: Projektet' },
  { key: 'projectText', label: 'Text: Projektet', long: true },
  { key: 'moneyTitle', label: 'Rubrik: Så används pengarna' },
  { key: 'moneyText', label: 'Text: Så används pengarna', long: true },
  { key: 'projectImageAlt', label: 'Bildbeskrivning (för skärmläsare)' }
];
type Drafts = Record<Lang, Record<string, string>>;

// "The project" block on the homepage: photo + title/text in sv/en/ar.
// Texts are saved as translation overrides; an empty box restores the default.
export default function ProjectEditor() {
  const [url, setUrl] = useState('');
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/project-image', { cache: 'no-store' }).then(async r => ({ ok: r.ok, d: await r.json() })),
      fetch('/api/admin/translations', { cache: 'no-store' }).then(async r => ({ ok: r.ok, d: await r.json() }))
    ]).then(([img, tr]) => {
      if (!img.ok) throw new Error(img.d.error);
      if (!tr.ok) throw new Error(tr.d.error);
      setUrl(img.d.url);
      const next = {} as Drafts;
      for (const l of LANGS) { next[l.code] = {}; for (const f of FIELDS) next[l.code][f.key] = tr.d.overrides?.[l.code]?.[f.key] ?? translations[l.code][f.key] ?? ''; }
      setDrafts(next);
    }).catch(e => setError(e.message || 'Kunde inte läsa.'));
  }, []);

  async function upload(f: File) {
    setError(''); setNotice('');
    if (f.size > 4 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) { setError('Välj PNG, JPG eller WebP, max 4 MB.'); return; }
    setBusy(true);
    try {
      const form = new FormData(); form.append('file', f);
      const r = await fetch('/api/admin/project-image', { method: 'POST', body: form });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Kunde inte ladda upp.');
      setUrl(d.url); setNotice('Bilden är sparad och syns direkt på hemsidan.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Kunde inte ladda upp.'); }
    finally { setBusy(false); if (file.current) file.current.value = ''; }
  }
  async function remove() {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await fetch('/api/admin/project-image', { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).error || 'Kunde inte ta bort.');
      setUrl(''); setNotice('Bilden är borttagen.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Kunde inte ta bort.'); }
    finally { setBusy(false); }
  }
  async function saveTexts() {
    if (!drafts) return;
    setBusy(true); setError(''); setNotice('');
    try {
      for (const l of LANGS) for (const f of FIELDS) {
        const r = await fetch('/api/admin/translations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: l.code, key: f.key, value: drafts[l.code][f.key] }) });
        const d = await r.json(); if (!r.ok) throw new Error(`${l.label}, ${f.label}: ${d.error || 'Kunde inte spara.'}`);
      }
      setNotice('Texterna är sparade och syns direkt på hemsidan.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Kunde inte spara.'); }
    finally { setBusy(false); }
  }

  return <Card>
    <h2 className="text-lg font-extrabold">Projektet på hemsidan</h2>
    <p className="mt-1 text-sm text-mosque-ink/75">Bild och text som visas under betalsätten. Skriv varje språk för sig. Lämna en ruta tom för att använda standardtexten.</p>
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p>}

    <div className="mt-5 rounded-xl border border-mosque-ink/10 p-4">
      <h3 className="font-bold">Bild (foto eller ritning)</h3>
      {url ? <img src={url} alt="Förhandsvisning av projektbilden" className="mt-3 aspect-[3/2] w-full max-w-md rounded-lg border object-cover" /> : <p className="mt-3 rounded-lg bg-mosque-cream p-4 text-sm text-mosque-ink/75">Ingen bild vald ännu. Hemsidan visar bara texten.</p>}
      <label className="mt-3 block text-sm font-semibold">{busy ? 'Arbetar…' : 'Ladda upp bild'}
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-mosque-emerald file:px-3 file:py-2 file:font-bold file:text-white disabled:opacity-50" />
      </label>
      <p className="mt-2 text-xs text-mosque-ink/75">PNG, JPG eller WebP, max 4 MB. Bilden visas i förhållandet 3:2, så välj gärna en liggande bild.</p>
      {url && <button type="button" disabled={busy} onClick={remove} className="mt-3 text-sm font-bold text-mosque-emerald underline">Ta bort bilden</button>}
    </div>

    {!drafts && !error && <p className="mt-4 text-sm">Laddar…</p>}
    {drafts && <div className="mt-5 grid gap-5 lg:grid-cols-3">
      {LANGS.map(l => <fieldset key={l.code} className="min-w-0 rounded-xl border border-mosque-ink/10 p-4" lang={l.code} dir={l.code === 'ar' ? 'rtl' : 'ltr'}>
        <legend className="px-1 font-bold">{l.label}</legend>
        {FIELDS.map(f => <label key={f.key} className="mt-3 block text-sm font-semibold first:mt-0">{f.label}
          {f.long
            ? <textarea rows={5} maxLength={600} value={drafts[l.code][f.key]} onChange={e => setDrafts(d => d && ({ ...d, [l.code]: { ...d[l.code], [f.key]: e.target.value } }))} className={adminPanelInput} />
            : <input maxLength={600} value={drafts[l.code][f.key]} onChange={e => setDrafts(d => d && ({ ...d, [l.code]: { ...d[l.code], [f.key]: e.target.value } }))} className={adminPanelInput} />}
        </label>)}
      </fieldset>)}
    </div>}
    {drafts && <button type="button" disabled={busy} onClick={saveTexts} className={`${adminPanelPrimaryButton} mt-5`}>Spara texter</button>}
  </Card>;
}
