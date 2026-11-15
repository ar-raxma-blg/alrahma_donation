'use client';

import { useEffect, useState } from 'react';
import PanelHeader, { adminPanelInput, adminPanelLayout, adminPanelPrimaryButton, adminPanelSecondaryButton } from './PanelHeader';
import { Card } from './ui';
import { Lang } from '@/lib/types';
import { Controller, EMPTY_CONTROLLER, POLICY_DEFAULTS, PolicyLang, PrivacyStored } from '@/lib/privacy-policy';

const LANGS: { code: Lang; label: string }[] = [{ code: 'sv', label: 'Svenska' }, { code: 'en', label: 'English' }, { code: 'ar', label: 'العربية' }];
const CONTROLLER_FIELDS: { key: keyof Controller; label: string; type?: string }[] = [
  { key: 'name', label: 'Föreningens fullständiga namn' }, { key: 'orgNumber', label: 'Organisationsnummer' },
  { key: 'address', label: 'Adress' }, { key: 'email', label: 'Kontakt-e-post', type: 'email' }, { key: 'phone', label: 'Telefon', type: 'tel' }
];

export default function PrivacyEditor() {
  const [controller, setController] = useState<Controller>(EMPTY_CONTROLLER);
  const [langs, setLangs] = useState<Record<Lang, PolicyLang> | null>(null);
  const [edited, setEdited] = useState<Record<Lang, boolean>>({ sv: false, en: false, ar: false });
  const [tab, setTab] = useState<Lang>('sv');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/privacy', { cache: 'no-store' }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d.stored as PrivacyStored; })
      .then(stored => {
        setController({ ...EMPTY_CONTROLLER, ...(stored.controller ?? {}) });
        const next = {} as Record<Lang, PolicyLang>; const flags = {} as Record<Lang, boolean>;
        for (const l of LANGS) { const s = stored.langs?.[l.code]; flags[l.code] = !!s?.sections?.length; next[l.code] = s?.sections?.length ? s : structuredClone(POLICY_DEFAULTS[l.code]); }
        setLangs(next); setEdited(flags);
      }).catch(e => setError(e.message || 'Kunde inte läsa.'));
  }, []);

  const patch = (lang: Lang, fn: (p: PolicyLang) => PolicyLang) => { setLangs(c => c && ({ ...c, [lang]: fn(c[lang]) })); setEdited(e => ({ ...e, [lang]: true })); setNotice(''); };
  const move = (lang: Lang, i: number, d: -1 | 1) => patch(lang, p => { const s = [...p.sections]; const j = i + d; if (j < 0 || j >= s.length) return p; [s[i], s[j]] = [s[j], s[i]]; return { ...p, sections: s }; });

  async function save() {
    if (!langs) return;
    setBusy(true); setError(''); setNotice('');
    try {
      // Only languages that were edited are stored; the rest keep following the built-in default.
      const out: Partial<Record<Lang, PolicyLang>> = {};
      for (const l of LANGS) if (edited[l.code]) out[l.code] = langs[l.code];
      const r = await fetch('/api/admin/privacy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ controller, langs: out }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Kunde inte spara.');
      setNotice('Sparat. Integritetspolicyn är uppdaterad på hemsidan.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Kunde inte spara.'); }
    finally { setBusy(false); }
  }

  const cur = langs?.[tab];
  return <section className={adminPanelLayout}>
    <PanelHeader category="Inställningar" title="Integritetspolicy" description="Fyll i vem som är personuppgiftsansvarig och redigera policytexten på svenska, engelska och arabiska. Visas på /privacy och föreningens uppgifter visas även på startsidan." />
    {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p>}

    <Card>
      <h2 className="text-lg font-extrabold">Personuppgiftsansvarig</h2>
      <p className="mt-1 text-sm text-mosque-ink/75">GDPR kräver att föreningen namnges med kontaktuppgifter. Tomma fält visas inte.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {CONTROLLER_FIELDS.map(f => <label key={f.key} className="block text-sm font-semibold">{f.label}
          <input type={f.type ?? 'text'} maxLength={200} value={controller[f.key]} onChange={e => { setController(c => ({ ...c, [f.key]: e.target.value })); setNotice(''); }} className={adminPanelInput} />
        </label>)}
      </div>
    </Card>

    <Card>
      <div role="tablist" aria-label="Språk" className="flex flex-wrap gap-2">
        {LANGS.map(l => <button key={l.code} type="button" role="tab" aria-selected={tab === l.code} onClick={() => setTab(l.code)}
          className={tab === l.code ? adminPanelPrimaryButton : adminPanelSecondaryButton}>{l.label}{edited[l.code] ? ' ●' : ''}</button>)}
      </div>
      <p className="mt-2 text-xs text-mosque-ink/75">● = egen text sparas för språket. Utan ● används standardtexten, som kan uppdateras av oss vid kodändringar.</p>
      {!cur && !error && <p className="mt-4 text-sm">Laddar…</p>}
      {cur && <div lang={tab} dir={tab === 'ar' ? 'rtl' : 'ltr'} className="mt-4">
        <label className="block text-sm font-semibold">Rad om senaste uppdatering
          <input maxLength={100} value={cur.updated} onChange={e => patch(tab, p => ({ ...p, updated: e.target.value }))} className={adminPanelInput} />
        </label>
        <ol className="mt-5 space-y-4">
          {cur.sections.map((s, i) => <li key={i} className="rounded-xl border border-mosque-ink/10 p-4">
            <label className="block text-sm font-semibold">Rubrik {i + 1}
              <input maxLength={150} value={s.h} onChange={e => patch(tab, p => ({ ...p, sections: p.sections.map((x, k) => k === i ? { ...x, h: e.target.value } : x) }))} className={adminPanelInput} />
            </label>
            <label className="mt-3 block text-sm font-semibold">Text <span className="font-normal text-mosque-ink/75">(tom rad mellan stycken)</span>
              <textarea rows={6} maxLength={4000} value={s.p} onChange={e => patch(tab, p => ({ ...p, sections: p.sections.map((x, k) => k === i ? { ...x, p: e.target.value } : x) }))} className={adminPanelInput} />
            </label>
            <div className="mt-3 flex flex-wrap gap-2" dir="ltr">
              <button type="button" disabled={i === 0} onClick={() => move(tab, i, -1)} className={adminPanelSecondaryButton}>Flytta upp</button>
              <button type="button" disabled={i === cur.sections.length - 1} onClick={() => move(tab, i, 1)} className={adminPanelSecondaryButton}>Flytta ner</button>
              <button type="button" onClick={() => patch(tab, p => ({ ...p, sections: p.sections.filter((_, k) => k !== i) }))} className={adminPanelSecondaryButton}>Ta bort avsnitt</button>
            </div>
          </li>)}
        </ol>
        <div className="mt-4 flex flex-wrap gap-2" dir="ltr">
          <button type="button" disabled={cur.sections.length >= 25} onClick={() => patch(tab, p => ({ ...p, sections: [...p.sections, { h: '', p: '' }] }))} className={adminPanelSecondaryButton}>Lägg till avsnitt</button>
          <button type="button" onClick={() => { if (confirm('Återställa standardtexten för det här språket? Dina ändringar går förlorade när du sparar.')) { setLangs(c => c && ({ ...c, [tab]: structuredClone(POLICY_DEFAULTS[tab]) })); setEdited(e => ({ ...e, [tab]: false })); } }} className={adminPanelSecondaryButton}>Återställ standardtext</button>
        </div>
      </div>}
    </Card>
    <button type="button" disabled={busy || !langs} onClick={save} className={adminPanelPrimaryButton}>{busy ? 'Sparar…' : 'Spara'}</button>
  </section>;
}
