'use client';
import { useRef, useState } from 'react';

export default function QrImageUpload({ kind, url, disabled, onChange, onBusy }: { kind: 'swish' | 'paypal'; url: string; disabled: boolean; onChange: (value: string) => void; onBusy: (value: boolean) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const label = kind === 'swish' ? 'Swish' : 'PayPal';
  async function upload(file: File) {
    setError('');
    if (file.size > 2 * 1024 * 1024 || !['image/png','image/jpeg','image/webp'].includes(file.type)) { setError('Välj PNG, JPG eller WebP, max 2 MB.'); return; }
    setUploading(true); onBusy(true);
    try {
      const form = new FormData(); form.append('kind',kind); form.append('file',file);
      const response = await fetch('/api/admin/qr/uploads', { method:'POST', body:form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Kunde inte ladda upp bilden.');
      onChange(data.url);
    } catch(e) { setError(e instanceof Error ? e.message : 'Kunde inte ladda upp bilden.'); }
    finally { setUploading(false); onBusy(false); if(input.current) input.current.value=''; }
  }
  return <div className="rounded-xl border border-mosque-ink/10 p-4">
    <h3 className="font-bold">{label} QR-kod</h3>
    {url ? <img src={url} alt={`${label} QR-förhandsvisning`} className="mx-auto mt-3 h-44 w-44 rounded-lg border bg-white object-contain p-2" /> : <p className="mt-3 rounded-lg bg-mosque-cream p-4 text-sm text-mosque-ink/60">Ingen egen bild vald. En kod genereras från betaluppgifterna om de är ifyllda.</p>}
    <label className="mt-3 block text-sm font-semibold">{uploading ? 'Laddar upp…' : `Ladda upp ${label} QR-bild`}<input ref={input} type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || uploading} onChange={e=>{ const file=e.target.files?.[0]; if(file) void upload(file); }} className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-mosque-emerald file:px-3 file:py-2 file:font-bold file:text-white disabled:opacity-50" /></label>
    {url && <button type="button" disabled={disabled || uploading} onClick={()=>onChange('')} className="mt-3 text-sm font-bold text-mosque-emerald underline">Ta bort {label} QR-bild</button>}
    <p className="mt-2 text-xs leading-5 text-mosque-ink/60">PNG, JPG eller WebP, max 2 MB. Kontrollera mottagaren genom att skanna bilden. Bildvalet gäller först när du granskat och sparat hemsidan.</p>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </div>;
}
