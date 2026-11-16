'use client';

import { useLang } from '@/lib/use-lang';
import { Lang } from '@/lib/types';
import PublicHeader from '@/components/PublicHeader';
import { CONTROLLER_LABELS, Controller, PrivacyStored, resolvePolicy } from '@/lib/privacy-policy';

const BACK: Record<Lang, string> = { en: '← Back to the donation page', sv: '← Tillbaka till donationssidan', ar: '← العودة إلى صفحة التبرع' };
const TITLE: Record<Lang, string> = { en: 'Privacy policy', sv: 'Integritetspolicy', ar: 'سياسة الخصوصية' };

export default function PrivacyClient({ stored, controller }: { stored: PrivacyStored; controller: Controller }) {
  const [lang, setLang] = useLang('en');
  const c = resolvePolicy(stored, lang);
  const L = CONTROLLER_LABELS[lang];
  const rows = ([['name', L.name], ['orgNumber', L.orgNumber], ['address', L.address], ['email', L.email], ['phone', L.phone]] as const).filter(([k]) => controller[k]);
  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-[radial-gradient(circle_at_50%_-10%,#1a3c21_0%,#0e2a14_55%,#081a0c_100%)] px-4 pb-12 pt-5 text-mosque-cream sm:px-8 sm:pt-8">
      <div className="mx-auto max-w-3xl">
        <PublicHeader lang={lang} onLanguageChange={setLang} />
        <main id="main" tabIndex={-1} className="outline-none">
          <article className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 sm:p-8">
            <h1 className="text-3xl font-extrabold">{TITLE[lang]}</h1>
            {c.updated && <p className="mt-1 text-base text-mosque-muted">{c.updated}</p>}
            {rows.length > 0 && (
              <section aria-labelledby="controller-title" className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
                <h2 id="controller-title" className="text-xl font-bold text-mosque-goldLight">{L.title}</h2>
                <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
                  {rows.map(([k, label]) => (
                    <div key={k} className="contents">
                      <dt className="text-base text-mosque-muted">{label}</dt>
                      <dd className="text-base font-semibold" dir={k === 'email' || k === 'phone' || k === 'orgNumber' ? 'ltr' : undefined}>
                        {k === 'email' ? <a className="underline underline-offset-4" href={`mailto:${controller.email}`}>{controller.email}</a> : controller[k]}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            <div className="prose-copy">
              {c.sections.map((s, i) => (
                <section key={i} className="mt-8">
                  <h2 className="text-xl font-bold text-mosque-goldLight">{s.h}</h2>
                  {s.p.split(/\n\s*\n/).filter(Boolean).map((x, j) => <p key={j} className="mt-3 whitespace-pre-line text-base">{x}</p>)}
                </section>
              ))}
            </div>
          </article>
          <a href={`/?lang=${lang}`} className="mt-6 inline-flex min-h-[44px] items-center text-base font-semibold text-mosque-mint underline underline-offset-4">{BACK[lang]}</a>
        </main>
      </div>
    </div>
  );
}
