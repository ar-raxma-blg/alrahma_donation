'use client';

import { useEffect, useRef, useState } from 'react';
import { BroadcastLogEntry } from '@/lib/types';
import type { BroadcastRecipient } from '@/lib/broadcast-recipients';
import { Channel, isSwedishSmsAddress, recipientAddress } from '@/lib/communication';
import PanelHeader, { adminPanelLayout } from '@/components/admin/PanelHeader';
import BroadcastFailureDetails from '@/components/admin/BroadcastFailureDetails';
import { BroadcastDiagnostics, readBroadcastDiagnostics } from '@/lib/broadcast-diagnostics';

type Template = { id: string; language: string; body: string };
type SmsEstimate = { currency: string; estimatedCost: number; parts: number; recipients: number };
type SmsBalance = { currency: string; balance: number };
const labels: Record<Channel, string> = { sms: 'SMS', email: 'E-post', whatsapp: 'WhatsApp' };
const statuses: Record<string, string> = { sending: 'Pågår – kontrollera leverantören före nytt försök', accepted: 'Accepterat', partial: 'Delvis accepterat', failed: 'Misslyckat' };

export default function BroadcastPanel() {
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [channel, setChannel] = useState<Channel>('sms');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [smsRegion, setSmsRegion] = useState<'all' | 'sweden' | 'outside'>('all');
  const [balance, setBalance] = useState<SmsBalance | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [providers, setProviders] = useState<Record<Channel, boolean>>({ sms: false, email: false, whatsapp: false });
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateKey, setTemplateKey] = useState('');
  const [log, setLog] = useState<BroadcastLogEntry[]>([]);
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<SmsEstimate | null>(null);
  const [estimateError, setEstimateError] = useState('');
  const [balanceError, setBalanceError] = useState('');
  const [lastDiagnostics, setLastDiagnostics] = useState<BroadcastDiagnostics | null>(null);
  const [diagnosticHistoryWarning, setDiagnosticHistoryWarning] = useState(false);
  const reviewId = useRef<string | null>(null);

  const template = templates.find(t => `${t.id}:${t.language}` === templateKey);
  const group = recipients.filter(r => !r.comm_opt_out && r[`comm_${channel}`]);
  const eligible = group.filter(r => {
    const address = recipientAddress(r, channel);
    return address && (channel !== 'sms' || isSwedishSmsAddress(address)) && (channel !== 'whatsapp' || !template || r.preferred_language === template.language);
  });
  const excludedNonSwedish = channel === 'sms' ? group.filter(r => {
    const address = recipientAddress(r, 'sms');
    return address && !isSwedishSmsAddress(address);
  }).length : 0;
  const visible = group.filter(r => `${r.full_name} ${r.phone || ''} ${r.email}`.toLowerCase().includes(search.toLowerCase()) && (channel !== 'sms' || smsRegion === 'all' || (smsRegion === 'sweden' ? isSwedishSmsAddress(recipientAddress(r, 'sms')) : !!recipientAddress(r, 'sms') && !isSwedishSmsAddress(recipientAddress(r, 'sms')))));
  const chosen = eligible.filter(r => selected.includes(r.id));
  const reach = new Set(chosen.map(r => recipientAddress(r, channel))).size;
  const text = channel === 'whatsapp' ? template?.body || '' : message.trim();
  const availableChannels = (Object.keys(labels) as Channel[]).filter(key => providers[key]);
  const canReview = providers[channel] && reach > 0 && !!text && !busy;

  async function load() {
    const response = await fetch('/api/admin/broadcast');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Kunde inte läsa utskick.');
    setRecipients(data.recipients || []);
    setLog(data.log || []);
    setDiagnosticHistoryWarning(!!data.diagnosticHistoryWarning);
    setProviders(data.providers);
    setChannel(current => data.providers[current] ? current : (Object.keys(labels) as Channel[]).find(key => data.providers[key]) ?? 'sms');
    setTemplates(data.templates || []);
    setLoaded(true);
  }

  useEffect(() => { load().catch(() => setNotice('Kunde inte läsa utskick. Ladda om sidan.')); }, []);

  async function loadBalance() {
    setBalanceError('');
    try {
      const response = await fetch('/api/admin/broadcast/balance', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      setBalance(await response.json());
    } catch { setBalance(null); setBalanceError('Kunde inte läsa 46elks-saldot.'); }
  }

  useEffect(() => { if (providers.sms) void loadBalance(); }, [providers.sms]);

  async function fetchEstimate(id: string) {
    setEstimate(null); setEstimateError('');
    try {
      const response = await fetch('/api/admin/broadcast/estimate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, donorIds: chosen.map(r => r.id) })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Kunde inte beräkna kostnaden.');
      if (result.recipients !== reach) throw new Error('Mottagarna har ändrats. Gå tillbaka och granska igen.');
      if (reviewId.current === id) setEstimate(result);
    } catch (error) {
      if (reviewId.current === id) setEstimateError(error instanceof Error ? error.message : 'Kunde inte beräkna kostnaden.');
    }
  }

  function beginReview() {
    const id = crypto.randomUUID();
    reviewId.current = id; setBatchId(id); setEstimate(null); setEstimateError('');
    if (channel === 'sms') void fetchEstimate(id);
  }

  async function send() {
    if (!batchId || busy || (channel === 'sms' && !estimate)) return;
    setBusy(true); setNotice(''); setLastDiagnostics(null);
    try {
      const response = await fetch('/api/admin/broadcast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, channel, message: text, donorIds: chosen.map(r => r.id), templateId: template?.id, language: template?.language })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Utskicket misslyckades.');
      setNotice(`${result.accepted} accepterade, ${result.failed} misslyckade eller okända.${result.excludedNonSwedish ? ` ${result.excludedNonSwedish} utländska nummer uteslöts.` : ''} Leverans är ännu inte bekräftad.${result.auditWarning ? ' Loggen kunde inte uppdateras; kontrollera 46elks.' : ''}`);
      setLastDiagnostics(readBroadcastDiagnostics(result.diagnostics));
      if (channel === 'sms') void loadBalance();
      reviewId.current = null; setBatchId(null); setSelected([]); setMessage(''); setEstimate(null);
      try { await load(); } catch { setNotice('Utskicket behandlades. Historiken kunde inte uppdateras här; kontrollera 46elks.'); }
    } catch (error) {
      setNotice(`${error instanceof Error ? error.message : 'Anslutningen avbröts.'} Kontrollera historiken och 46elks innan du startar ett nytt utskick.`);
    } finally { setBusy(false); }
  }

  if (!loaded && !notice) return <p>Läser utskick…</p>;

  return <section className={adminPanelLayout}>
    <PanelHeader category="Kommunikation" title="Utskick" description="Donationuppdateringar och påminnelser till givare som valt kanalen. Inga nya insamlingsmeddelanden. Högst 50 givare per utskick." />

    {availableChannels.length > 0 ? <>
    <div className="grid gap-3 sm:grid-cols-3">{availableChannels.map(key =>
      <button key={key} type="button" disabled={busy || !!batchId} aria-pressed={key === channel} onClick={() => { setChannel(key); setSelected([]); setNotice(''); }} className={`rounded-2xl border px-5 py-4 text-left transition-colors disabled:opacity-60 ${key === channel ? 'border-mosque-emerald bg-mosque-emerald text-white shadow-sm' : 'border-mosque-ink/10 bg-white text-mosque-ink hover:border-mosque-emerald/40 hover:bg-mosque-cream'}`}>
        <span className="block text-sm font-bold">{labels[key]}</span><span className={`mt-1 block text-2xl font-extrabold tabular-nums ${key === channel ? 'text-white' : 'text-mosque-deep'}`}>{recipients.filter(r => !r.comm_opt_out && r[`comm_${key}`] && (key !== 'sms' || isSwedishSmsAddress(recipientAddress(r, 'sms')))).length}</span><span className={`text-xs ${key === channel ? 'text-white/75' : 'text-mosque-ink/55'}`}>mottagare</span>
      </button>)}</div>

    <p className={`rounded-xl border px-4 py-3 text-sm ${providers[channel] ? 'border-mosque-emerald/20 bg-mosque-emerald/5 text-mosque-deep' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{providers[channel] ? channel === 'sms' ? '46elks är anslutet. Kontrollera saldo hos 46elks före större utskick.' : 'Leverantören är konfigurerad.' : channel === 'whatsapp' ? 'WhatsApp väntar på Meta-godkännande och API-inställningar.' : `${labels[channel]} behöver en konfigurerad leverantör.`}</p>
    {channel === 'sms' && <div className="grid gap-4 rounded-2xl border border-mosque-ink/10 bg-white p-5 text-sm sm:grid-cols-2">
      <p><strong>Endast Sverige (+46).</strong> Nummer utanför Sverige kan visas men inte väljas eller skickas till. {excludedNonSwedish} givare med utländska nummer är uteslutna.</p>
      <div className="sm:text-right"><span className="block text-xs font-bold uppercase tracking-wide text-mosque-ink/55">46elks-saldo · aktuellt</span><strong className="mt-1 block text-xl tabular-nums text-mosque-deep">{balance ? new Intl.NumberFormat('sv-SE', { style: 'currency', currency: balance.currency }).format(balance.balance / 10000) : balanceError || 'Läser…'}</strong>{balance && <p className={`mt-1 text-xs ${balance.balance <= 0 ? 'font-bold text-amber-800' : 'text-mosque-ink/60'}`}>{balance.balance <= 0 ? 'Inget positivt saldo. Kontrollera betalning eller fyll på hos 46elks.' : 'Saldo finns. Jämför med kostnaden före utskick.'}</p>}<button type="button" onClick={() => void loadBalance()} className="mt-1 text-xs font-bold text-mosque-emerald underline underline-offset-2">Uppdatera saldo</button></div>
      <label className="sm:col-span-2"><span className="mr-2 font-semibold">Visa nummer</span><select value={smsRegion} disabled={busy || !!batchId} onChange={e => { setSmsRegion(e.target.value as typeof smsRegion); setSelected([]); }} className="rounded-lg border border-mosque-ink/15 bg-white px-3 py-2 focus:border-mosque-emerald focus:outline-none"><option value="all">Alla</option><option value="sweden">Sverige (+46)</option><option value="outside">Utanför Sverige</option></select></label>
    </div>}

    {channel === 'whatsapp' ? <div className="space-y-3 rounded-2xl border border-mosque-ink/10 bg-white p-5">
      <label className="block text-sm font-bold">Godkänd WhatsApp-mall
        <select value={templateKey} disabled={busy || !!batchId} onChange={e => { setTemplateKey(e.target.value); setSelected([]); }} className="ml-3 rounded-lg border p-2"><option value="">Välj mall</option>{templates.map(t => <option key={`${t.id}:${t.language}`} value={`${t.id}:${t.language}`}>{t.id} · {t.language}</option>)}</select>
      </label>
      <p className="rounded-xl bg-mosque-cream p-4 text-sm leading-6">{template?.body || 'Inga meddelanden skickas utan en godkänd mall.'}</p>
    </div> : <label className="block rounded-2xl border border-mosque-ink/10 bg-white p-5 text-sm font-bold">Meddelande
      <textarea maxLength={channel === 'sms' ? 480 : 4000} disabled={busy || !!batchId} value={message} onChange={e => setMessage(e.target.value)} className="mt-3 block min-h-36 w-full resize-y rounded-xl border border-mosque-ink/15 bg-mosque-cream/40 p-4 font-normal leading-6 outline-none focus:border-mosque-emerald focus:bg-white" />
      <span className="mt-1 block text-xs font-normal text-mosque-ink/60">{message.length}/{channel === 'sms' ? 480 : 4000} tecken{channel === 'sms' ? ' · Långa SMS kan delas upp och kosta mer.' : ''}</span>
    </label>}

    <div className="rounded-2xl border border-mosque-ink/10 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold">{labels[channel]}-gruppen</h2><p className="mt-1 text-xs text-mosque-ink/60">{eligible.length} tillgängliga · {reach} valda {channel === 'email' ? 'adresser' : 'nummer'}</p></div>
        <div className="flex gap-3 text-sm"><button type="button" disabled={busy || !!batchId} onClick={() => setSelected(eligible.filter(r => visible.includes(r)).slice(0, 50).map(r => r.id))} className="text-mosque-emerald underline">Markera upp till 50</button><button type="button" disabled={busy || !!batchId} onClick={() => setSelected([])} className="underline">Rensa</button></div>
      </div>
      <input type="search" value={search} disabled={busy || !!batchId} onChange={e => setSearch(e.target.value)} placeholder="Sök namn eller kontakt" aria-label="Sök givare" className="my-4 w-full rounded-xl border border-mosque-ink/15 bg-mosque-cream/40 px-4 py-3 text-sm outline-none focus:border-mosque-emerald focus:bg-white" />
      {!group.length && <p className="text-sm">Inga givare har valt denna kanal.</p>}
      <div className="max-h-80 overflow-auto rounded-xl border border-mosque-ink/10">{visible.map(r => <label key={r.id} className="flex min-h-12 items-center gap-3 border-b border-mosque-ink/10 px-3 py-2 text-sm last:border-b-0 hover:bg-mosque-cream/60">
        <input type="checkbox" disabled={busy || !!batchId || !eligible.includes(r) || (!selected.includes(r.id) && selected.length >= 50)} checked={selected.includes(r.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, r.id] : ids.filter(id => id !== r.id))} />
        <span className="min-w-0"><span className="block font-semibold">{r.full_name}</span><span className="block text-xs text-mosque-ink/60">{channel === 'email' ? r.email : r.phone || 'Inget nummer'}</span></span><span className="ml-auto text-xs text-mosque-ink/60">{!recipientAddress(r, channel) ? 'Kontaktuppgifter behöver rättas' : channel === 'sms' && !isSwedishSmsAddress(recipientAddress(r, 'sms')) ? 'Utanför Sverige – utesluten' : channel === 'whatsapp' && template && r.preferred_language !== template.language ? 'Annat språk än mallen' : r.id.startsWith('profile:') ? 'Ny givarprofil' : ''}</span>
      </label>)}</div>
    </div>

    {!batchId ? <button type="button" disabled={!canReview} onClick={beginReview} className="rounded-xl bg-mosque-emerald px-6 py-3 font-bold text-white shadow-sm transition-colors hover:bg-mosque-forest disabled:cursor-not-allowed disabled:opacity-40">Granska {labels[channel]} ({reach})</button> : <div className="space-y-4 rounded-2xl border border-mosque-emerald/40 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-extrabold">Granska före utskick</h2>
      <p className="text-sm">{reach} unika {channel === 'email' ? 'e-postadresser' : 'nummer'} får meddelandet. Dubbletter skickas en gång.</p>
      <p className="text-sm text-mosque-ink/65">{chosen.map(r => `${r.full_name} (${(recipientAddress(r, channel) || '').slice(-4)})`).join(', ')}</p>
      <p className="whitespace-pre-wrap rounded-xl bg-mosque-cream p-4 text-sm leading-6">{text}</p>
      {channel === 'sms' && <div className="rounded-xl border border-mosque-ink/10 bg-mosque-cream p-4 text-sm" role="status">
        {estimate ? <><strong>Uppskattad kostnad: {new Intl.NumberFormat('sv-SE', { style: 'currency', currency: estimate.currency, maximumFractionDigits: 4 }).format(estimate.estimatedCost / 10000)}</strong><p>{estimate.parts} SMS-delar till {estimate.recipients} nummer. 46elks slutliga kostnad kan skilja sig.</p></> : estimateError ? <><p>{estimateError} Inget SMS skickades.</p><button type="button" onClick={() => fetchEstimate(batchId)} className="mt-2 underline">Försök beräkna igen</button></> : <p>Beräknar kostnaden hos 46elks… Inget SMS skickas.</p>}
      </div>}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || (channel === 'sms' && !estimate)} onClick={send} className="rounded-xl bg-mosque-emerald px-5 py-3 font-bold text-white hover:bg-mosque-forest disabled:cursor-not-allowed disabled:opacity-40">{busy ? 'Skickar…' : `Bekräfta och skicka ${labels[channel]} (${reach})`}</button><button type="button" disabled={busy} onClick={() => { reviewId.current = null; setBatchId(null); setEstimate(null); }} className="rounded-xl border border-mosque-ink/15 px-5 py-3 font-semibold hover:bg-mosque-cream">Ändra</button></div>
    </div>}

    </> : loaded && <p className="rounded-2xl border border-mosque-ink/10 bg-white p-5 text-sm">Inga utskickskanaler är anslutna ännu. Historiken visas nedan.</p>}

    {notice && <div role="status" className="rounded-xl border border-mosque-ink/10 bg-white p-4 text-sm"><p>{notice}</p>{!!lastDiagnostics?.failures.length && <BroadcastFailureDetails diagnostics={lastDiagnostics} showBalance={channel === 'sms'} />}</div>}
    <h2 className="pt-2 text-lg font-extrabold">Utskickshistorik</h2>
    {diagnosticHistoryWarning && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">Felorsakerna kunde inte läsas från loggen. Ladda om sidan eller kontrollera leverantörens historik.</p>}
    {log.map(entry => <article key={entry.id} className="rounded-xl border border-mosque-ink/10 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><p><strong className="text-mosque-deep">{entry.channel.toUpperCase()}</strong> · {statuses[entry.status || ''] || (entry.simulated ? 'Tidigare simulering' : 'Äldre utskick')} · {entry.accepted_count || 0} accepterade · {entry.failed_count || 0} misslyckade eller okända</p><time dateTime={entry.created_at} className="text-xs text-mosque-ink/55">{new Date(entry.created_at).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}</time></div>
      <p className="mt-2 whitespace-pre-wrap break-words text-mosque-ink/65">{entry.message}</p>
      {entry.diagnostics?.failures.length ? <BroadcastFailureDetails diagnostics={entry.diagnostics} showBalance={entry.channel === 'sms'} /> : (entry.failed_count || entry.status === 'failed' || entry.status === 'partial') ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-950">{diagnosticHistoryWarning ? 'Felorsaken är inte tillgänglig just nu.' : 'Felorsaken sparades inte för detta utskick.'} Kontrollera historiken hos {entry.channel === 'sms' ? '46elks' : 'leverantören'}.{entry.channel === 'sms' ? ' Dagens saldo kan inte visa varför ett äldre utskick misslyckades.' : ''}</p> : null}
      {entry.status === 'accepted' && <p className="mt-2 text-xs text-mosque-ink/55">Accepterat av leverantören. Leverans till mottagaren är inte bekräftad här.</p>}
      <details className="mt-3 text-xs text-mosque-ink/55"><summary className="cursor-pointer font-semibold">Felsökningsuppgifter</summary><p className="mt-2 break-all">Utskicks-ID: {entry.id}</p><p className="mt-1">Kontrollera leverantörens historik vid tiden ovan innan ett nytt försök.</p>{entry.channel === 'sms' && <a href="https://46elks.com/" target="_blank" rel="noreferrer" className="mt-2 inline-block font-bold text-mosque-emerald underline">Öppna 46elks</a>}</details>
    </article>)}
  </section>;
}
