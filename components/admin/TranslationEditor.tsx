'use client';

import { useEffect, useMemo, useState } from 'react';
import PanelHeader, { adminPanelInput, adminPanelLayout, adminPanelPrimaryButton, adminPanelSecondaryButton } from './PanelHeader';
import { Card, Pill } from './ui';
import { Lang } from '@/lib/types';

const LANGS: { code: Lang; label: string }[] = [{ code: 'en', label: 'English' }, { code: 'sv', label: 'Svenska' }, { code: 'ar', label: 'العربية' }];
type Overrides = Partial<Record<Lang, Record<string, string>>>;

export default function TranslationEditor({ defaults, locked }: { defaults: Record<Lang, Record<string, string>>; locked: string[] }) {
  const [overrides, setOverrides] = useState<Overrides | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [onlyEdited, setOnlyEdited] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/admin/translations', { cache: 'no-store' }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Kunde inte läsa texterna.'); setOverrides(d.overrides); }).catch(e => setError(e.message));
  }, []);
  const keys = useMemo(() => Object.keys(defaults.en), [defaults]);
  const current = (lang: Lang, key: string) => overrides?.[lang]?.[key] ?? defaults[lang][key] ?? '';
  const id = (lang: Lang, key: string) => `${lang}.${key}`;
  const edited = (key: string) => LANGS.some(l => overrides?.[l.code]?.[key]);
  const needle = query.trim().toLowerCase();
  const visible = keys.filter(key => (!onlyEdited || edited(key)) && (!needle || key.toLowerCase().includes(needle) || LANGS.some(l => current(l.code, key).toLowerCase().includes(needle) || defaults[l.code][key]?.toLowerCase().includes(needle))));

  async function save(lang: Lang, key: string, value: string) {
    setBusy(id(lang, key)); setError(''); setNotice('');
    try {
      const res = await fetch('/api/admin/translations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang, key, value }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kunde inte spara.');
      setOverrides(o => {
        const next = { ...(o ?? {}), [lang]: { ...(o?.[lang] ?? {}) } };
        if (data.reset) delete next[lang]![key]; else next[lang]![key] = value;
        return next;
      });
      setDrafts(d => { const { [id(lang, key)]: _, ...rest } = d; return rest; });
      setNotice(data.reset ? 'Standardtexten är återställd.' : 'Texten är sparad och syns direkt på hemsidan.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Kunde inte spara.'); }
    finally { setBusy(''); }
  }

  return <section className={adminPanelLayout}>
    <PanelHeader category="Inställningar" title="Texter & språk" description="Sök en text och ändra den på engelska, svenska eller arabiska. Ändringen visas direkt på hemsidan och kan återställas." />
    <Card>
      <div className="flex flex-wrap items-end gap-4">
        <label className="block min-w-0 flex-1 basis-64 text-sm font-semibold">Sök text
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Sök på ord eller nyckel, t.ex. Swish" className={adminPanelInput} />
        </label>
        <label className="flex items-center gap-2 pb-3 text-sm font-semibold"><input type="checkbox" checked={onlyEdited} onChange={e => setOnlyEdited(e.target.checked)} />Bara ändrade</label>
      </div>
      <p className="mt-3 text-xs text-mosque-ink/75" aria-live="polite">{visible.length} av {keys.length} texter</p>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p>}
    </Card>
    {!overrides && !error && <Card>Laddar…</Card>}
    {overrides && visible.map(key => <Card key={key}>
      <div className="mb-3 flex flex-wrap items-center gap-2"><code className="rounded bg-mosque-ink/5 px-2 py-0.5 text-xs font-bold">{key}</code>{edited(key) && <Pill tone="amber">Ändrad</Pill>}{locked.includes(key) && <Pill tone="grey">Låst – samtyckestext</Pill>}</div>
      <div className="grid gap-4 lg:grid-cols-3">
        {LANGS.map(({ code, label }) => {
          const k = id(code, key), value = drafts[k] ?? current(code, key), dirty = drafts[k] !== undefined && drafts[k] !== current(code, key), isOverride = !!overrides[code]?.[key];
          return <div key={code} className="min-w-0">
            <label className="block text-xs font-bold uppercase tracking-wider text-mosque-ink/80">{label}
              <textarea dir={code === 'ar' ? 'rtl' : 'ltr'} rows={3} maxLength={600} disabled={locked.includes(key)} value={value} onChange={e => setDrafts(d => ({ ...d, [k]: e.target.value }))} className={`${adminPanelInput} !text-mosque-ink text-sm normal-case leading-6 tracking-normal disabled:cursor-not-allowed disabled:!text-mosque-ink/70`} />
            </label>
            {!locked.includes(key) && <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={!dirty || busy === k} onClick={() => save(code, key, value)} className={`${adminPanelPrimaryButton} !px-4 !py-2`}>{busy === k ? 'Sparar…' : 'Spara'}</button>
              {isOverride && <button type="button" disabled={busy === k} onClick={() => save(code, key, '')} className={`${adminPanelSecondaryButton} !px-4 !py-2`}>Återställ</button>}
            </div>}
            {isOverride && <p className="mt-1 text-xs text-mosque-ink/75" dir="ltr">Standard: {defaults[code][key]}</p>}
          </div>;
        })}
      </div>
    </Card>)}
    {overrides && visible.length === 0 && <Card>Inga texter matchar sökningen.</Card>}
  </section>;
}
