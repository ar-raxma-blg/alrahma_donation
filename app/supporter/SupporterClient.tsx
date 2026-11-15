'use client';

import { useLang } from '@/lib/use-lang';
import { Lang, TransparencyFile } from '@/lib/types';
import { useT } from '@/components/TranslationProvider';
import PublicHeader from '@/components/PublicHeader';
import RegisterForm from '@/components/RegisterForm';

export default function SupporterClient({
  initialLang,
  transparencyFiles
}: {
  initialLang: Lang;
  transparencyFiles: TransparencyFile[];
}) {
  const t = useT();
  const [lang, setLang] = useLang(initialLang);

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="min-h-screen w-full bg-[radial-gradient(circle_at_50%_-10%,#1a3c21_0%,#0e2a14_55%,#081a0c_100%)] px-4 pb-12 pt-5 text-mosque-cream sm:px-8 sm:pt-8"
    >
      <div className="mx-auto max-w-2xl">
        <PublicHeader lang={lang} onLanguageChange={setLang} />

        <main id="main" tabIndex={-1} className="outline-none">
        <a href={`/?lang=${lang}`} className="inline-flex min-h-[44px] items-center text-base font-semibold text-mosque-mint underline underline-offset-4">
          {t(lang, 'backHome')}
        </a>

        <RegisterForm lang={lang} transparencyFiles={transparencyFiles} />
        </main>
      </div>
    </div>
  );
}
