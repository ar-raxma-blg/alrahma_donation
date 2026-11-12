import { Lang } from '@/lib/types';
import { t } from '@/lib/i18n';
import { CARD } from './PaymentQR';
import { useEffect, useState } from 'react';
import { campaignProgress } from '@/lib/homepage';

const num = (n: number) => n.toLocaleString('sv-SE');

export default function ProgressCard({ lang, raised: initialRaised, goal: initialGoal, refresh = false }: { lang: Lang; raised: number; goal: number; refresh?: boolean }) {
  const [values, setValues] = useState({ raised: initialRaised, goal: initialGoal });
  useEffect(() => { setValues({ raised: initialRaised, goal: initialGoal }); }, [initialRaised, initialGoal]);
  useEffect(() => {
    if (!refresh) return;
    let active = true;
    const controller = new AbortController();
    const update = async () => {
      try {
        const response = await fetch('/api/public/progress', { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (active && response.ok && Number.isFinite(data.raised) && data.raised >= 0 && Number.isFinite(data.goal) && data.goal > 0) setValues(data);
      } catch { /* Keep the last successful totals when offline. */ }
    };
    void update();
    const onVisible = () => { if (document.visibilityState === 'visible') void update(); };
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(update, 15000);
    return () => { active = false; controller.abort(); clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);
  const { raised, goal, barPercent, displayed } = campaignProgress(values.raised, values.goal);
  const percentage = displayed === null ? '<0.1' : new Intl.NumberFormat(lang === 'ar' ? 'ar' : lang === 'sv' ? 'sv-SE' : 'en-GB', { maximumFractionDigits: 1 }).format(displayed);

  return (
    <div className={`${CARD} p-5 sm:p-8`}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-full">
          <div className="text-sm font-semibold uppercase tracking-widest text-mosque-cream/60">{t(lang, 'totalRaised')}</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="text-[clamp(1.75rem,7vw,3.75rem)] font-bold leading-tight" dir="ltr">
              {num(raised)} <span className="text-[0.6em] font-semibold text-mosque-cream/70">kr</span>
            </div>
            {raised === 0 && (
              <span className="rounded-md border border-mosque-mint/30 bg-mosque-emerald/20 px-2 py-0.5 text-xs font-semibold text-mosque-mint">
                {t(lang, 'justLaunched')}
              </span>
            )}
          </div>
        </div>
        <div className="min-w-0 max-w-full text-start sm:text-end">
          <div className="text-sm font-semibold uppercase tracking-widest text-mosque-gold/80">{t(lang, 'targetGoal')}</div>
          <div className="mt-2 text-[clamp(1.5rem,5.5vw,2.25rem)] font-bold text-mosque-gold" dir="ltr">
            {goal > 0 ? num(goal) : '—'} <span className="text-xl font-semibold">kr</span>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="mb-2.5 flex items-center gap-2 font-mono text-base font-bold">
          <span className="h-2 w-2 rounded-full bg-mosque-gold" />
          <span dir="ltr">{percentage}%</span> {t(lang, 'funded')}
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-black/40" role="progressbar" aria-label={t(lang, 'funded')} aria-valuenow={barPercent} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="h-full rounded-full bg-gradient-to-r from-mosque-gold to-[#f2c230] transition-all duration-1000"
            style={{ width: `${barPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
