'use client';

import { adminPanelInput, adminPanelPrimaryButton, adminPanelSecondaryButton } from '@/components/admin/PanelHeader';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { fmtSEK } from '@/lib/format';
import { Campaign } from '@/lib/admin/types';
import { deleteCampaign, saveCampaign } from './actions';

const input = adminPanelInput;
const label = 'mb-1.5 block text-xs font-bold text-mosque-ink/60';

export default function CampaignForm({
  campaign,
  confirmedSek,
  canDelete
}: {
  campaign: Campaign | null;
  confirmedSek: number;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [title, setTitle] = useState(campaign?.title ?? '');
  const [shortText, setShortText] = useState(campaign?.short_text ?? '');
  const [goal, setGoal] = useState(String(campaign?.goal_sek ?? ''));
  const [imageUrl, setImageUrl] = useState(campaign?.image_url ?? '');
  const [removeImage, setRemoveImage] = useState(false);

  // Revoke object URLs we created for the preview.
  useEffect(() => () => { if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (removeImage) fd.set('remove_image', '1');
    start(async () => {
      const res = await saveCampaign(fd);
      if (!res.ok) return setError(res.error);
      router.push('/admin/kampanjer');
      router.refresh();
    });
  };

  const remove = () =>
    start(async () => {
      const res = await deleteCampaign(campaign!.id);
      if (!res.ok) return setError(res.error);
      router.push('/admin/kampanjer');
      router.refresh();
    });

  const goalN = Number(goal) || 0;
  const pct = goalN ? Math.min(100, Math.round((confirmedSek / goalN) * 100)) : 0;

  return (
    <form onSubmit={submit} className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <input type="hidden" name="id" value={campaign?.id ?? ''} />
      <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-mosque-ink/10 bg-white p-5 sm:p-6">
        <div>
          <label className={label} htmlFor="title">Titel</label>
          <input id="title" name="title" required maxLength={120} className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="slug">Webbadress (lämna tomt för automatisk)</label>
          <div className="flex items-center gap-2 text-sm text-mosque-ink/50">
            <span>/</span>
            <input id="slug" name="slug" className={input} defaultValue={campaign?.slug ?? ''} placeholder="ramadan-2027" />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="short_text">Kort text (visas på kortet, max 240 tecken)</label>
          <textarea id="short_text" name="short_text" rows={2} maxLength={240} className={input} value={shortText} onChange={(e) => setShortText(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="long_text">Lång text</label>
          <textarea id="long_text" name="long_text" rows={6} className={input} defaultValue={campaign?.long_text ?? ''} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="goal_sek">Mål (kr)</label>
            <input id="goal_sek" name="goal_sek" type="number" min={1} step={1} inputMode="numeric" required className={input} value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="starts_on">Startdatum</label>
            <input id="starts_on" name="starts_on" type="date" className={input} defaultValue={campaign?.starts_on ?? ''} />
          </div>
          <div>
            <label className={label} htmlFor="ends_on">Slutdatum</label>
            <input id="ends_on" name="ends_on" type="date" className={input} defaultValue={campaign?.ends_on ?? ''} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="fund_type">Typ av fond</label>
            <select id="fund_type" name="fund_type" className={input} defaultValue={campaign?.fund_type ?? 'sadaqah'}>
              <option value="sadaqah">Sadaqah</option>
              <option value="zakat">Zakat (hålls separat i rapporter)</option>
              <option value="building">Byggfond</option>
              <option value="other">Övrigt</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="status">Status</label>
            <select id="status" name="status" className={input} defaultValue={campaign?.status ?? 'draft'}>
              <option value="draft">Utkast</option>
              <option value="published">Publicerad</option>
              <option value="paused">Pausad</option>
              <option value="ended">Avslutad</option>
            </select>
          </div>
        </div>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="pledges_count_public" defaultChecked={campaign?.pledges_count_public ?? false} className="mt-1" />
          <span>
            <b>Räkna utlovade belopp i den publika summan</b>
            <span className="block text-xs text-mosque-ink/50">Av som standard. Löften är inte pengar förrän de är betalda.</span>
          </span>
        </label>
        <div>
          <label className={label} htmlFor="image">Bild (JPG, PNG eller WebP, max 3 MB)</label>
          <input
            id="image"
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setImageUrl(URL.createObjectURL(f)); setRemoveImage(false); }
            }}
          />
          {imageUrl && (
            <button type="button" onClick={() => { setImageUrl(''); setRemoveImage(true); }} className="mt-2 block text-xs font-semibold text-red-600 underline">
              Ta bort bilden
            </button>
          )}
        </div>

        {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{error}</div>}

        <div className="flex flex-wrap items-center gap-3">
          <button disabled={pending} className={adminPanelPrimaryButton}>
            {pending ? 'Sparar…' : 'Spara'}
          </button>
          <button type="button" onClick={() => router.push('/admin/kampanjer')} className={adminPanelSecondaryButton}>Avbryt</button>
          {campaign && canDelete && !confirmDelete && (
            <button type="button" onClick={() => setConfirmDelete(true)} className="ml-auto text-sm font-semibold text-red-600 underline">Ta bort kampanjen</button>
          )}
        </div>
        {confirmDelete && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
            Ta bort “{campaign?.title}” för alltid?
            <button type="button" disabled={pending} onClick={remove} className="rounded-lg bg-red-600 px-3 py-1.5 text-white">Ja, ta bort</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg bg-white px-3 py-1.5">Avbryt</button>
          </div>
        )}
        {campaign && !canDelete && (
          <p className="text-xs text-mosque-ink/50">Kampanjen har transaktioner eller löften och kan därför inte tas bort. Sätt status till Avslutad eller Pausad.</p>
        )}
      </div>

      <div className="min-w-0 xl:sticky xl:top-6">
        <h2 className="mb-2 text-sm font-extrabold">Så ser kortet ut för givarna</h2>
        <div className="overflow-hidden rounded-2xl border border-mosque-ink/10 bg-white">
          <div className="aspect-video bg-gradient-to-br from-mosque-emerald to-mosque-deep bg-cover bg-center" style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined} />
          <div className="p-4">
            <div className="text-lg font-extrabold">{title || 'Titel på kampanjen'}</div>
            <p className="mt-1 text-sm text-mosque-ink/60">{shortText || 'Den korta texten visas här.'}</p>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-mosque-ink/10"><div className="h-full rounded-full bg-mosque-emerald" style={{ width: `${pct}%` }} /></div>
            <div className="mt-2 text-xs tabular-nums text-mosque-ink/60">{fmtSEK(confirmedSek)} av {fmtSEK(goalN)}</div>
          </div>
        </div>
        <p className="mt-2 text-xs text-mosque-ink/50">Insamlat beräknas av databasen från bekräftade transaktioner. Det går inte att skriva in för hand.</p>
      </div>
    </form>
  );
}
