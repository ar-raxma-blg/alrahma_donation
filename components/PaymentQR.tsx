import { Lang } from '@/lib/types';
import { t } from '@/lib/i18n';
import CopyButton from './CopyButton';

export interface QrCode {
  kind: 'swish' | 'paypal' | 'card' | 'bank';
  svg?: string;
  // uploaded QR image; takes precedence over svg
  imageUrl?: string;
  detail?: string;
  // bank only: [i18n label key, value] pairs, already filtered for non-empty
  rows?: [string, string][];
}

export const CARD = 'min-w-0 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] shadow-xl shadow-black/20';

// "Instant Direct Giving": one QR card per configured method (Swish, PayPal,
// card). SVGs are generated server-side (lib/qr.ts) so they are
// trusted. Everything shown is configured in /admin → Hemsida & betalsätt.
export default function PaymentQR({
  lang,
  codes
}: {
  lang: Lang;
  codes: { swish?: QrCode; paypal?: QrCode; card?: QrCode; bank?: QrCode };
}) {
  const cards = [codes.swish, codes.paypal, codes.card].filter(Boolean) as QrCode[];
  if (cards.length === 0) return null;
  const hintKey = { swish: 'scanSwish', paypal: 'scanPaypal', card: 'scanCard', bank: 'scanBank' } as const;
  const cols =
    cards.length >= 2
        ? 'min-[480px]:grid-cols-2'
        : 'mx-auto w-full max-w-xs';

  return (
    <div className={`${CARD} p-5 sm:p-8`}>
      <h2 className="text-3xl font-extrabold leading-tight">{t(lang, 'instantTitle')}</h2>
      <p className="mt-1 text-sm text-mosque-cream/70">{t(lang, 'instantSubtitle')}</p>

      <div className={`mt-6 grid grid-cols-1 gap-4 ${cols}`}>
        {cards.map((c) => {
          const title = t(lang, c.kind);
          return (
            <div key={c.kind} className="flex min-w-0 flex-col items-center rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
              <div className="mb-3 text-sm font-bold uppercase tracking-widest text-mosque-gold">{title}</div>
              {c.imageUrl ? (
                <div className="aspect-square w-full max-w-[10.5rem] rounded-xl bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.imageUrl} alt={`${title} QR`} className="h-full w-full object-contain" />
                </div>
              ) : (
                <div
                  className="aspect-square w-full max-w-[10.5rem] rounded-xl bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: c.svg! }}
                  role="img"
                  aria-label={`${title} QR`}
                />
              )}
              <div className="mt-3 text-sm text-mosque-mint/80">{t(lang, hintKey[c.kind])}</div>
              {c.detail && (
                <div className="mt-3 flex w-full max-w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5">
                  <span className={`min-w-0 flex-1 font-mono font-extrabold text-white ${c.kind === 'swish' ? 'whitespace-nowrap text-base tracking-normal' : 'break-all text-sm leading-6'}`} dir="ltr">{c.detail}</span>
                  <CopyButton value={c.detail} label={t(lang, 'copy')} doneLabel={t(lang, 'copied')} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
