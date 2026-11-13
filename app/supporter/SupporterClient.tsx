'use client';

import { useState } from 'react';
import { Lang, TransparencyFile } from '@/lib/types';
import { t } from '@/lib/i18n';
import PublicHeader from '@/components/PublicHeader';
import RegisterForm from '@/components/RegisterForm';

export default function SupporterClient({
  initialLang,
  transparencyFiles
}: {
  initialLang: Lang;
  transparencyFiles: TransparencyFile[];
}) {
  const [lang, setLang] = useState<Lang>(initialLang);

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="min-h-screen w-full bg-[radial-gradient(circle_at_50%_-10%,#1a3c21_0%,#0e2a14_55%,#081a0c_100%)] px-4 pb-12 pt-5 text-mosque-cream sm:px-8 sm:pt-8"
    >
      <div className="mx-auto max-w-2xl">
        <PublicHeader lang={lang} onLanguageChange={setLang} />

        <a href="/" className="text-sm font-semibold text-mosque-mint/80 hover:text-mosque-mint">
          {t(lang, 'backHome')}
        </a>

        <RegisterForm lang={lang} transparencyFiles={transparencyFiles} />
      </div>
    </div>
  );
}
