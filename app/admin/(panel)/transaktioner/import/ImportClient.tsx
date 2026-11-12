'use client';

import { adminPanelInput, adminPanelPrimaryButton, adminPanelSecondaryButton } from '@/components/admin/PanelHeader';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { checkImport, commitImport, ImportRow, RowCheck } from '../actions';

const input = adminPanelInput;
const label = 'mb-1.5 block text-xs font-bold text-mosque-ink/60';
const FIELDS = [
  { key: 'received_on', label: 'Datum (ÅÅÅÅ-MM-DD)', required: true },
  { key: 'amount_sek', label: 'Belopp', required: true },
  { key: 'display_name', label: 'Förnamn' },
  { key: 'receipt_no', label: 'Kvittonummer' },
  { key: 'method', label: 'Betalsätt (Kontant/Bank)' }
] as const;
type FieldKey = (typeof FIELDS)[number]['key'];

// Minimal CSV reader: handles quotes, ; or , separators, BOM.
function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const sep = (t.split('\n')[0].match(/;/g) ?? []).length >= (t.split('\n')[0].match(/,/g) ?? []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const guess = (headers: string[], words: string[]) => {
  const i = headers.findIndex((h) => words.some((w) => h.toLowerCase().includes(w)));
  return i >= 0 ? String(i) : '';
};

export default function ImportClient({ campaigns }: { campaigns: { id: string; title: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState(campaigns[0]?.id ?? '');
  const [grid, setGrid] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<FieldKey, string>>({ received_on: '', amount_sek: '', display_name: '', receipt_no: '', method: '' });
  const [checks, setChecks] = useState<RowCheck[] | null>(null);
  const [done, setDone] = useState<{ imported: number; skipped: number } | null>(null);

  const headers = grid[0] ?? [];
  const body = grid.slice(1);

  const toRows = (): ImportRow[] =>
    body.map((r) => {
      const get = (k: FieldKey) => (map[k] === '' ? '' : (r[Number(map[k])] ?? '').trim());
      return { received_on: get('received_on'), amount_sek: get('amount_sek'), display_name: get('display_name'), receipt_no: get('receipt_no'), method: get('method') };
    });

  const onFile = async (f: File | undefined) => {
    setError(null); setChecks(null); setDone(null);
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return setError('Filen är för stor (max 2 MB).');
    const g = parseCsv(await f.text());
    if (g.length < 2) return setError('Filen har ingen datarad. Första raden ska vara kolumnrubriker.');
    setGrid(g);
    const h = g[0];
    setMap({ received_on: guess(h, ['datum', 'date']), amount_sek: guess(h, ['belopp', 'amount', 'summa']), display_name: guess(h, ['namn', 'name']), receipt_no: guess(h, ['kvitto', 'receipt', 'ref']), method: guess(h, ['betalsätt', 'method', 'typ']) });
  };

  const preview = () => {
    setError(null);
    if (map.received_on === '' || map.amount_sek === '') return setError('Koppla minst kolumnerna Datum och Belopp.');
    start(async () => {
      const res = await checkImport(campaign, toRows());
      if (!res.ok) return setError(res.error);
      setChecks(res.checks);
    });
  };

  const submit = () =>
    start(async () => {
      const res = await commitImport(campaign, toRows());
      if (!res.ok) return setError(res.error);
      setDone({ imported: res.imported, skipped: res.skipped });
      router.refresh();
    });

  if (done) {
    return (
      <div className="max-w-xl rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm">
        <b>{done.imported} rader importerade.</b> {done.skipped > 0 && `${done.skipped} rader hoppades över (fel eller dubbletter). `}
        De väntar nu på godkännande av en annan admin.
        <div className="mt-3"><button onClick={() => router.push('/admin/transaktioner?status=awaiting_approval')} className={adminPanelPrimaryButton}>Visa väntande</button></div>
      </div>
    );
  }

  const rows = toRows();
  const bad = checks?.filter((c) => c.error).length ?? 0;
  const dup = checks?.filter((c) => c.duplicate).length ?? 0;
  const ok = checks ? checks.length - bad - dup : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid max-w-2xl gap-4 rounded-2xl border border-mosque-ink/10 bg-white p-5 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="imp-campaign">Kampanj</label>
          <select id="imp-campaign" className={input} value={campaign} onChange={(e) => { setCampaign(e.target.value); setChecks(null); }}>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="imp-file">CSV-fil (komma eller semikolon)</label>
          <input id="imp-file" type="file" accept=".csv,text/csv" className="text-sm" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
      </div>

      {grid.length > 0 && (
        <div className="rounded-2xl border border-mosque-ink/10 bg-white p-5">
          <h2 className="mb-3 text-base font-extrabold">Koppla kolumner</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className={label} htmlFor={`m-${f.key}`}>{f.label}{'required' in f && f.required ? ' *' : ''}</label>
                <select id={`m-${f.key}`} className={input} value={map[f.key]} onChange={(e) => { setMap({ ...map, [f.key]: e.target.value }); setChecks(null); }}>
                  <option value="">Hoppa över</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Kolumn ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-mosque-ink/50">Namn: bara förnamn sparas. Utan kolumn för betalsätt markeras raderna som Import. {body.length} rader hittades.</p>
          <button onClick={preview} disabled={pending} className={`mt-4 ${adminPanelPrimaryButton}`}>{pending && !checks ? 'Kontrollerar…' : 'Förhandsgranska'}</button>
        </div>
      )}

      {error && <div role="alert" className="max-w-2xl rounded-lg bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{error}</div>}

      {checks && (
        <div className="rounded-2xl border border-mosque-ink/10 bg-white p-5">
          <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
            <span className="text-emerald-800">{ok} redo att importera</span>
            {dup > 0 && <span className="text-amber-800">{dup} dubbletter hoppas över</span>}
            {bad > 0 && <span className="text-red-700">{bad} med fel hoppas över</span>}
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 bg-mosque-cream text-left text-xs text-mosque-ink/60"><tr><th className="p-2">Rad</th><th className="p-2">Datum</th><th className="p-2">Belopp</th><th className="p-2">Namn</th><th className="p-2">Kvitto</th><th className="p-2">Kontroll</th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const c = checks[i];
                  return (
                    <tr key={i} className={`border-t border-mosque-ink/10 ${c.error ? 'bg-red-50' : c.duplicate ? 'bg-amber-50' : ''}`}>
                      <td className="p-2 text-mosque-ink/50">{i + 2}</td><td className="p-2">{r.received_on}</td><td className="p-2 tabular-nums">{String(r.amount_sek)}</td><td className="p-2">{r.display_name}</td><td className="p-2">{r.receipt_no}</td>
                      <td className="p-2 text-xs font-semibold">{c.error ? <span className="text-red-700">{c.error}</span> : c.duplicate ? <span className="text-amber-800">{c.duplicate}</span> : <span className="text-emerald-800">OK</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button onClick={submit} disabled={pending || ok === 0} className={`mt-4 ${adminPanelPrimaryButton}`}>
            {pending ? 'Importerar…' : `Skicka ${ok} rader för godkännande`}
          </button>
        </div>
      )}
    </div>
  );
}
