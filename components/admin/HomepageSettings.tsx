'use client';

import { useEffect, useState } from 'react';
import PanelHeader, { adminPanelInput, adminPanelLayout, adminPanelPrimaryButton, adminPanelSecondaryButton } from './PanelHeader';
import { Card } from './ui';
import { campaignProgress } from '@/lib/homepage';
import QrImageUpload from './QrImageUpload';

type Fields = { swish_number: string; paypal_link: string; card_link: string; bankgiro: string; plusgiro: string; iban: string; bic: string; account_holder: string; bank_name: string; account_number: string; swish_qr_url: string; paypal_qr_url: string };
type Snapshot = { settings: Fields & { updated_at: string }; totals: { goal_sek: number; raised_sek: number; opening_raised_sek: number; displayed_raised_sek: number; updated_at: string }; ready: boolean; qrReady: boolean };
const money = (value: number) => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(value);

export default function HomepageSettings() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [fields, setFields] = useState<Fields | null>(null);
  const [raised, setRaised] = useState('');
  const [goal, setGoal] = useState('');
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const load = async () => {
    const res = await fetch('/api/admin/homepage', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Kunde inte läsa inställningarna.');
    setSnapshot(data);
    const { updated_at, ...editable } = data.settings;
    setFields(editable); setRaised(String(data.totals.displayed_raised_sek)); setGoal(String(data.totals.goal_sek)); setReview(false);
  };
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  const fieldsLoaded = fields !== null;
  useEffect(() => {
    if (!fieldsLoaded) return;
    const id = window.location.hash.slice(1);
    if (id === 'insamling' || id === 'betaluppgifter') document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, [fieldsLoaded]);
  const progress = campaignProgress(Number(raised), Number(goal));
  const inputField = (key: keyof Fields, label: string, hint?: string) => <label key={key} className="block text-sm font-semibold">{label}<input value={fields?.[key] ?? ''} maxLength={key.endsWith('_link') ? 500 : 150} onChange={e => { setFields(f => f && ({ ...f, [key]: e.target.value, ...(key === 'swish_number' ? {swish_qr_url:''} : key === 'paypal_link' ? {paypal_qr_url:''} : {}) })); setReview(false); }} className={adminPanelInput} />{hint && <span className="mt-1 block text-xs font-normal leading-5 text-mosque-ink/60">{hint}</span>}</label>;
  async function save() {
    if (!snapshot || !fields || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch('/api/admin/homepage', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, goal_sek: Number(goal), raised_sek: Number(raised), expected_settings_at: snapshot.settings.updated_at, expected_totals_at: snapshot.totals.updated_at }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kunde inte spara.');
      setNotice('Hemsidan är uppdaterad.'); setReview(false);
      try { await load(); } catch { setError('Ändringen sparades, men uppgifterna kunde inte läsas igen. Ladda om sidan innan nästa ändring.'); setSnapshot(null); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Kunde inte spara.'); }
    finally { setBusy(false); }
  }
  return <section className={adminPanelLayout}>
    <PanelHeader category="Inställningar" title="Hemsida & betalsätt" description="Styr insamlingens mål, total och betaluppgifter på den publika hemsidan. Endast Owner kan spara ändringar." />
    {notice && <p role="status" className="rounded-xl border border-mosque-emerald/20 bg-mosque-emerald/5 p-4 text-sm text-mosque-deep">{notice}</p>}
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button type="button" disabled={busy} onClick={() => { setError(''); load().catch(e => setError(e.message)); }} className="mt-2 font-bold underline">Läs in uppgifterna igen</button></div>}
    {!fields || !snapshot ? <Card><p>Läser hemsidans inställningar…</p></Card> : <>
      {!snapshot.ready && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">Hemsidans databasuppdatering behöver installeras innan du kan spara.</p>}
      <form onSubmit={e => { e.preventDefault(); setError(''); setNotice(''); setReview(true); }}>
        <fieldset disabled={busy || review || uploading} className="space-y-6 disabled:opacity-75">
          <Card><h2 id="insamling" className="scroll-mt-24 text-lg font-extrabold">Insamling och mål</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Total raised so far / Insamlat totalt (kr)<input type="number" min={Math.max(0, snapshot.totals.raised_sek)} max={1000000000} step="1" required value={raised} onChange={e => setRaised(e.target.value)} className={adminPanelInput} /></label>
            <label className="text-sm font-semibold">Target campaign goal / Insamlingsmål (kr)<input type="number" min="1" max={1000000000} step="1" required value={goal} onChange={e => setGoal(e.target.value)} className={adminPanelInput} /></label>
          </div><div className="mt-4 rounded-xl bg-mosque-cream p-4 text-sm leading-6"><p>Registrerade bekräftade gåvor: <strong>{money(snapshot.totals.raised_sek)}</strong>. Manuell del av totalen: <strong>{money(Number(raised) - snapshot.totals.raised_sek)}</strong>.</p><p className="mt-2">Ange det sammanlagda belopp som ska visas på hemsidan efter bankavstämning. Nya bekräftade gåvor läggs till automatiskt. Räkna inte in en betalning manuellt om du också kommer att registrera den som en gåva.</p><p className="mt-2">Detta ändrar hemsidans total; det skapar inga transaktioner i Rapporter och ansluter inte någon bank-API.</p></div>
          <div className="mt-4"><p className="text-sm font-bold">Förhandsvisning: {money(progress.raised)} av {money(progress.goal)} · {progress.displayed === null ? '<0,1' : progress.displayed.toLocaleString('sv-SE')} %</p><div className="mt-2 h-3 overflow-hidden rounded-full bg-mosque-ink/10"><div className="h-full bg-mosque-emerald" style={{ width: `${progress.barPercent}%` }} /></div></div></Card>
          <Card><h2 id="betaluppgifter" className="scroll-mt-24 text-lg font-extrabold">Instant Direct Giving</h2><p className="mt-1 text-sm text-mosque-ink/60">Tomma betalsätt döljs. QR-koder genereras från uppgifterna. Ingen Swish-kod visas som PayPal.</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{inputField('swish_number', 'Swish-nummer', '10 siffror, börjar med 123. Lämna tomt om Swish inte är redo.')}{inputField('paypal_link', 'PayPal-länk', 'Fullständig https-länk till PayPal eller PayPal.Me.')}{inputField('card_link', 'Länk för kortbetalning', 'Fullständig https-länk till er betalningssida.')}</div><p className="mt-3 text-xs text-mosque-ink/60">En tidigare uppladdad QR-bild tas bort från hemsidan om mottagaren ändras, så att den inte pekar på gamla uppgifter.</p></Card>
          <Card><h2 className="text-lg font-extrabold">Egna QR-bilder</h2>{!snapshot.qrReady && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Uppladdning av egna QR-bilder är inte tillgänglig ännu. Övriga inställningar kan sparas.</p>}<p className="mt-1 text-sm text-mosque-ink/60">Ladda upp era officiella Swish- och PayPal-koder. Granska och spara för att visa dem på hemsidan.</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{(['swish','paypal'] as const).map(kind => <QrImageUpload key={kind} kind={kind} url={fields[`${kind}_qr_url`]} disabled={busy || review || uploading || !snapshot.qrReady} onBusy={setUploading} onChange={url => { setFields(f => f && ({...f, [`${kind}_qr_url`]: url})); setReview(false); }} />)}</div></Card>
          <Card><h2 className="text-lg font-extrabold">Direct Bank Transfer</h2><p className="mt-1 text-sm text-mosque-ink/60">Lämna uppgifter tomma tills bankkontot är klart. Bara ifyllda rader visas för givare.</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{inputField('account_holder', 'Kontoinnehavare')}{inputField('bank_name', 'Banknamn')}{inputField('account_number', 'Kontonummer / clearingnummer')}{inputField('bankgiro', 'Bankgiro')}{inputField('plusgiro', 'Plusgiro')}{inputField('iban', 'IBAN')}{inputField('bic', 'BIC / SWIFT')}</div></Card>
          <button disabled={!snapshot.ready} className={adminPanelPrimaryButton}>Granska ändringar</button>
        </fieldset>
      </form>
      {review && <Card><h2 className="text-lg font-extrabold">Granska innan du publicerar</h2><p className="mt-2 text-sm">Kontrollera särskilt vart pengarna skickas. Ändringarna blir synliga på hemsidan när du sparar.</p><dl className="mt-4 grid gap-2 text-sm"><div><dt className="font-bold">Total och mål</dt><dd>{money(Number(raised))} / {money(Number(goal))}</dd></div>{Object.entries(fields).map(([k, v]) => <div key={k} className="grid gap-1 rounded-lg bg-mosque-cream p-3 sm:grid-cols-2"><dt className="font-semibold">{({ swish_number: 'Swish', paypal_link: 'PayPal', card_link: 'Kortbetalning', bankgiro: 'Bankgiro', plusgiro: 'Plusgiro', iban: 'IBAN', bic: 'BIC / SWIFT', account_holder: 'Kontoinnehavare', bank_name: 'Bank', account_number: 'Kontonummer', swish_qr_url: 'Swish QR-bild', paypal_qr_url: 'PayPal QR-bild' } as Record<string, string>)[k]}</dt><dd className="break-all">{k.endsWith('_qr_url') ? v ? <img src={v} alt={`${k.startsWith('swish') ? 'Swish' : 'PayPal'} QR att publicera`} className="h-24 w-24 bg-white object-contain" /> : 'Ingen egen bild' : v || 'Dold på hemsidan'}</dd></div>)}</dl><div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={save} className={adminPanelPrimaryButton}>{busy ? 'Sparar…' : 'Spara och uppdatera hemsidan'}</button><button type="button" disabled={busy} onClick={() => setReview(false)} className={adminPanelSecondaryButton}>Ändra</button></div></Card>}
      <a href="/" target="_blank" rel="noreferrer" className="inline-block text-sm font-bold text-mosque-emerald underline">Öppna publika hemsidan</a>
    </>}
  </section>;
}
