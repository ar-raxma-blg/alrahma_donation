'use client';

import { PublicDonation, Lang } from '@/lib/types';
import PaymentQR, { QrCode } from '@/components/PaymentQR';

import BankTransfer from '@/components/BankTransfer';
import PublicHeader from '@/components/PublicHeader';
import LiveFeed from '@/components/LiveFeed';
import ProgressCard from '@/components/ProgressCard';
import { useT } from '@/components/TranslationProvider';
import { useEffect } from 'react';
import { useLang } from '@/lib/use-lang';
import type { Controller } from '@/lib/privacy-policy';
import TrustInfo from '@/components/TrustInfo';
import StickyDonate from '@/components/StickyDonate';

// Client shell: owns the language toggle and composes the server-fetched
// totals/donations into the tracker layout.
export default function TrackerClient({
  goal,
  raised,
  initialDonations,
  subtitle,
  isLive,
  pausedMessage,
  qrCodes,
  refreshProgress = true,
  showLiveFeed = true,
  projectImageUrl = null,
  org
}: {
  goal: number;
  raised: number;
  initialDonations: PublicDonation[];
  subtitle?: string | null;
  isLive: boolean;
  pausedMessage?: string | null;
  qrCodes: { swish?: QrCode; paypal?: QrCode; card?: QrCode; bank?: QrCode };
  refreshProgress?: boolean;
  showLiveFeed?: boolean;
  projectImageUrl?: string | null;
  org: Controller;
}) {
  const t = useT();
  const [lang, setLang] = useLang('en');
  // Per-language tab title + description (crawlers get the English defaults from layout.tsx).
  useEffect(() => {
    document.title = t(lang, 'metaTitle');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t(lang, 'metaDescription'));
  }, [lang, t]);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  return (
    <div
      dir={dir}
      className="min-h-screen w-full bg-[radial-gradient(circle_at_50%_-10%,#1a3c21_0%,#0e2a14_55%,#081a0c_100%)] px-4 pb-28 pt-5 sm:px-8 sm:pb-12 sm:pt-8 lg:pb-12 text-mosque-cream"
    >
      <div className="mx-auto max-w-[1120px]">
        <PublicHeader lang={lang} onLanguageChange={setLang} subtitle={subtitle} />

        <main id="main" tabIndex={-1} className="outline-none">
        <h1 className="sr-only">{t(lang, 'heroTitle')}</h1>
        <div className="mb-5 sm:mb-6">
          <ProgressCard lang={lang} raised={raised} goal={goal} refresh={refreshProgress} />
        </div>

        {isLive ? (
          <>
            <div id="donate" className="grid items-start gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <PaymentQR lang={lang} codes={qrCodes} />

              <div className="flex flex-col gap-5 sm:gap-6">
                <BankTransfer lang={lang} bank={qrCodes.bank} />
              </div>
            </div>

            {showLiveFeed && (
              <div className="mt-5 sm:mt-6">
                <LiveFeed lang={lang} initial={initialDonations} />
              </div>
            )}

            <div className="mt-5 flex flex-col items-center gap-4 rounded-3xl border border-mosque-gold/25 bg-gradient-to-b from-mosque-gold/[0.10] to-mosque-gold/[0.03] p-6 text-center shadow-xl shadow-black/20 sm:mt-6 sm:p-8">
              <span className="rounded-full border border-mosque-gold/30 bg-mosque-gold/10 px-3 py-0.5 text-sm font-semibold text-mosque-goldLight">
                {t(lang, 'sustained')}
              </span>
              <h2 className="text-2xl font-extrabold sm:text-3xl">{t(lang, 'monthlyTitle')}</h2>
              <a
                href={`/supporter?lang=${lang}`}
                className="w-full max-w-md rounded-xl bg-gradient-to-r from-[#e0c068] to-[#f2c230] px-6 py-3.5 text-center text-base font-extrabold text-mosque-deep shadow-lg transition hover:brightness-110"
              >
                {t(lang, 'monthlyCta')}
              </a>
              <div className="text-sm text-mosque-muted">{t(lang, 'monthlyHint')}</div>
            </div>

            <div className="mt-5 flex flex-col gap-5 sm:mt-6 sm:gap-6">
              <TrustInfo lang={lang} imageUrl={projectImageUrl} org={org} />
            </div>

            <figure className="mt-5 rounded-3xl border border-white/10 bg-black/25 px-6 py-10 text-center sm:mt-6 sm:px-10 sm:py-12">
              <blockquote className="mx-auto max-w-2xl text-2xl italic leading-snug sm:text-3xl">{t(lang, 'quote')}</blockquote>
              <figcaption className="mt-5 text-sm font-semibold uppercase tracking-widest text-mosque-goldLight">— {t(lang, 'quoteSource')}</figcaption>
            </figure>
          </>
        ) : (
          <div className="mt-6 rounded-[20px] border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
            <div className="mb-3 text-3xl">⏸️</div>
            <div className="mb-1.5 text-lg font-extrabold">Kampanjen är pausad</div>
            <div className="mx-auto max-w-md text-sm leading-relaxed text-mosque-mint">
              {pausedMessage || 'Kampanjen är pausad för tillfället. Tack för ert tålamod — vi är snart tillbaka.'}
            </div>
          </div>
        )}
        </main>

        <footer className="mt-10 border-t border-white/10 pt-8 text-center">
          <div className="text-2xl text-mosque-muted">{t(lang, 'jazak')}</div>
          <div className="mt-3 text-base text-mosque-muted">© {new Date().getFullYear()} {t(lang, 'mosqueName')}</div>
          <a href={`/privacy?lang=${lang}`} className="mt-1 inline-flex min-h-[44px] items-center text-base font-semibold underline underline-offset-4">{t(lang, 'footerPrivacy')}</a>
          <div className="mt-2 text-base text-mosque-muted">
            {{ en: 'Gift from', sv: 'Gåva från', ar: 'هدية من' }[lang]}{' '}
            <a href="https://smidify.com" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">Smidify Solutions</a>
            {' '}(smidify.com)
          </div>
        </footer>
      </div>
      {isLive && <StickyDonate lang={lang} />}
    </div>
  );
}
