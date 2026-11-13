'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { PublicDonation, Lang } from '@/lib/types';
import { fmtSEK, timeAgo } from '@/lib/format';
import { t } from '@/lib/i18n';
import { CARD } from './PaymentQR';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

// Refresh only safe display fields; private donation rows are never broadcast.
export default function LiveFeed({ lang, initial }: { lang: Lang; initial: PublicDonation[] }) {
  const [donations, setDonations] = useState<PublicDonation[]>(initial);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const { data, error } = await supabaseBrowser.from('public_donations')
        .select('*').order('created_at', { ascending: false }).limit(30);
      if (active && !error && data) setDonations(data);
    };
    const timer = setInterval(refresh, 15000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className={`${CARD} p-5 sm:p-8`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <span className="h-5 w-5 animate-pulseGlow rounded-full bg-mosque-mint" />
          <h2 className="text-2xl font-semibold">{t(lang, 'liveTitle')}</h2>
        </div>
        <div className="text-xs text-mosque-cream/55">{t(lang, 'liveSync')}</div>
      </div>

      <div className="mt-5 flex max-h-[460px] flex-col gap-3 overflow-y-auto">
        {donations.length === 0 && (
          <div className="py-6 text-center text-sm text-mosque-cream/60">{t(lang, 'liveEmpty')}</div>
        )}
        {donations.map((d) => (
          <div
            key={d.id}
            className="flex flex-wrap animate-slideIn items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-black/20 p-3.5"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-mosque-gold/30 bg-mosque-gold/10 text-xs font-bold text-mosque-gold">
              {d.is_anonymous ? '★' : initials(d.display_name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{d.is_anonymous ? t(lang, 'anonymousSupporter') : d.display_name}</div>
              {d.message && <div className="truncate text-[13px] italic text-mosque-cream/55">“{d.message}”</div>}
            </div>
            <div className="ml-auto max-w-full text-end">
              <div className="break-words text-lg font-bold text-mosque-gold sm:text-xl" dir="ltr">{fmtSEK(d.amount_sek)}</div>
              <div className="mt-0.5 text-[11px] text-mosque-cream/50">
                {timeAgo(d.created_at)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 text-center text-xs text-mosque-cream/55">{t(lang, 'liveFooter')}</div>
    </div>
  );
}
