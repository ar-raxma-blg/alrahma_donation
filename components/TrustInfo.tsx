'use client';

import { Lang } from '@/lib/types';
import { useT } from '@/components/TranslationProvider';
import { CARD } from './PaymentQR';

import { Controller } from '@/lib/privacy-policy';

// Organisation details are entered in /admin → Integritetspolicy (env vars are the fallback).

export default function TrustInfo({ lang, imageUrl, org }: { lang: Lang; imageUrl?: string | null; org: Controller }) {
  const ORG = org.orgNumber, ADDRESS = org.address, EMAIL = org.email, PHONE = org.phone;
  const t = useT();
  const details: [string, React.ReactNode][] = [];
  if (ORG) details.push([t(lang, 'orgNumber'), <span key="o" dir="ltr">{ORG}</span>]);
  if (ADDRESS) details.push([t(lang, 'address'), ADDRESS]);
  if (EMAIL) details.push([t(lang, 'contact'), <a key="e" href={`mailto:${EMAIL}`} className="inline-flex min-h-[44px] items-center underline underline-offset-4" dir="ltr">{EMAIL}</a>]);
  if (PHONE) details.push([t(lang, 'contact'), <a key="p" href={`tel:${PHONE.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-[44px] items-center underline underline-offset-4" dir="ltr">{PHONE}</a>]);

  return (
    <section aria-labelledby="trust-title" className={`${CARD} p-5 sm:p-8`}>
      <div className={imageUrl ? 'grid items-start gap-8 md:grid-cols-2' : ''}>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={t(lang, 'projectImageAlt')} width={1200} height={800} loading="lazy" decoding="async" className="aspect-[3/2] w-full rounded-2xl border border-white/10 object-cover" />
        )}
        <div className="prose-copy">
          <h2 id="trust-title" className="text-2xl font-extrabold">{t(lang, 'projectTitle')}</h2>
          <p className="mt-3 whitespace-pre-line text-base text-mosque-cream">{t(lang, 'projectText')}</p>
          <h3 className="mt-6 text-xl font-bold">{t(lang, 'moneyTitle')}</h3>
          <p className="mt-3 whitespace-pre-line text-base text-mosque-cream">{t(lang, 'moneyText')}</p>
        </div>
      </div>
      {details.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xl font-bold">{t(lang, 'aboutTitle')}</h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {details.map(([k, v], i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <dt className="text-base text-mosque-muted">{k}</dt>
                <dd className="text-base font-semibold text-mosque-cream">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
