import { Lang } from '@/lib/types';
import { useT } from '@/components/TranslationProvider';
import { CARD } from './PaymentQR';
import { useEffect, useRef, useState } from 'react';
import { campaignProgress } from '@/lib/homepage';

const parse = (v: string | null | undefined) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
const num = (n: number) => n.toLocaleString('sv-SE');

export default function ProgressCard({ lang, raised: initialRaised, goal: initialGoal, updatedAt: initialUpdatedAt = null, refresh = false }: { lang: Lang; raised: number; goal: number; updatedAt?: string | null; refresh?: boolean }) {
  const t = useT();
  const [values, setValues] = useState({ raised: initialRaised, goal: initialGoal });
  // When the total last changed, as recorded by the server (same for every visitor).
  const [updated, setUpdated] = useState<Date | null>(() => parse(initialUpdatedAt));
  useEffect(() => { setUpdated(parse(initialUpdatedAt)); }, [initialUpdatedAt]);
  // Ticks so "15 minutes ago" keeps moving without a refetch.
  // Starts null so server and client render the same markup; set after mount.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  const latest = useRef({ raised: initialRaised, goal: initialGoal });
  useEffect(() => { latest.current = { raised: initialRaised, goal: initialGoal }; setValues(latest.current); }, [initialRaised, initialGoal]);
  useEffect(() => {
    if (!refresh) return;
    let active = true;
    const controller = new AbortController();
    const update = async () => {
      try {
        const response = await fetch('/api/public/progress', { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (active && response.ok && Number.isFinite(data.raised) && data.raised >= 0 && Number.isFinite(data.goal) && data.goal > 0) {
          if (data.raised !== latest.current.raised || data.goal !== latest.current.goal) { latest.current = { raised: data.raised, goal: data.goal }; setValues({ raised: data.raised, goal: data.goal }); }
          setUpdated(parse(data.updatedAt));
        }
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

  const locale = lang === 'ar' ? 'ar' : lang === 'sv' ? 'sv-SE' : 'en-GB';
  const ago = (from: Date) => {
    const minutes = Math.max(0, Math.floor(((now ?? 0) - from.getTime()) / 60000));
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (minutes < 1) return ({ sv: 'nyss', ar: 'الآن', en: 'just now' } as Record<string, string>)[lang] ?? 'just now';
    if (minutes < 60) return rtf.format(-minutes, 'minute');
    if (minutes < 1440) return rtf.format(-Math.floor(minutes / 60), 'hour');
    return rtf.format(-Math.floor(minutes / 1440), 'day');
  };

  return (
    <section aria-labelledby="progress-title" className={`${CARD} p-5 sm:p-8`}>
      <h2 id="progress-title" className="sr-only">{t(lang, 'progressLabel')}</h2>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-full">
          <div className="text-base font-semibold uppercase tracking-wide text-mosque-muted">{t(lang, 'totalRaised')}</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="text-[clamp(1.75rem,7vw,3.75rem)] font-bold leading-tight" dir="ltr">
              {num(raised)} <span className="text-[0.6em] font-semibold text-mosque-muted">kr</span>
            </div>
            {raised === 0 && (
              <span className="rounded-md border border-mosque-mint/30 bg-mosque-emerald/20 px-2 py-0.5 text-sm font-semibold text-mosque-mint">
                {t(lang, 'justLaunched')}
              </span>
            )}
          </div>
        </div>
        <div className="min-w-0 max-w-full text-start sm:text-end">
          <div className="text-base font-semibold uppercase tracking-wide text-mosque-goldLight">{t(lang, 'targetGoal')}</div>
          <div className="mt-2 text-[clamp(1.5rem,5.5vw,2.25rem)] font-bold text-mosque-goldLight" dir="ltr">
            {goal > 0 ? num(goal) : '—'} <span className="text-xl font-semibold">kr</span>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="mb-2.5 flex items-center gap-2 font-mono text-base font-bold">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-mosque-goldLight" />
          <span dir="ltr">{percentage}%</span> {t(lang, 'funded')}
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-black/40" role="progressbar" aria-label={t(lang, 'funded')} aria-valuenow={Math.round(barPercent * 10) / 10} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${percentage}% — ${num(raised)} ${t(lang, 'raisedOfGoal')} ${goal > 0 ? num(goal) : '—'} kr`}>
          <div
            className="h-full rounded-full bg-gradient-to-r from-mosque-goldLight to-[#f2c230] transition-all duration-1000"
            style={{ width: `${barPercent}%` }}
          />
        </div>
        {/* The numbers are repeated as text so the bar is never the only signal. */}
        <p className="mt-3 text-base text-mosque-cream" dir="ltr">
          <strong>{num(raised)} kr</strong> {t(lang, 'raisedOfGoal')} <strong>{goal > 0 ? `${num(goal)} kr` : '—'}</strong>
        </p>
        {updated && now !== null && (
          <p className="mt-1 text-sm text-mosque-muted">
            {t(lang, 'updatedAt')} <time dateTime={updated.toISOString()} title={updated.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}>{ago(updated)}</time>
          </p>
        )}
      </div>
    </section>
  );
}
