import { Lang } from '@/lib/types';
import { t } from '@/lib/i18n';
import CopyButton from './CopyButton';
import { CARD, QrCode } from './PaymentQR';

// "Direct Bank Transfer": text details with copy buttons. Rows come from
// /admin → Hemsida & betalsätt; empty fields are filtered out server-side.
export default function BankTransfer({ lang, bank }: { lang: Lang; bank?: QrCode }) {
  if (!bank?.rows?.length) return null;

  return (
    <div className={`${CARD} p-5 sm:p-6`}>
      <h2 className="text-2xl font-semibold">{t(lang, 'bankTitle')}</h2>
      <dl className="mt-4 flex flex-col gap-2.5">
        {bank.rows.map(([key, value]) => (
          <div key={key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-white/10 bg-black/25 px-4 py-3.5">
            <dt className="text-base font-medium text-mosque-cream/80">{t(lang, key)}</dt>
            <dd className="flex min-w-0 max-w-full items-center gap-1.5">
              <span className="min-w-0 break-words [overflow-wrap:anywhere] font-mono text-base font-extrabold text-white sm:text-lg" dir="ltr">{value}</span>
              <CopyButton value={value} label={t(lang, 'copy')} doneLabel={t(lang, 'copied')} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-mosque-cream/75">{t(lang, 'bankNote')}</p>
    </div>
  );
}
