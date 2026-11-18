'use client';

import LanguageDropdown from './LanguageDropdown';
import { Lang } from '@/lib/types';
import { t } from '@/lib/i18n';

export default function PublicHeader({ lang, onLanguageChange, subtitle }: { lang: Lang; onLanguageChange: (lang: Lang) => void; subtitle?: string | null }) {
  return <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
    <a href="/" className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mosque-gold">
      <img src="/logo.png" alt="Masjid Al-Rahma" className="h-11 w-11 flex-shrink-0 sm:h-12 sm:w-12" />
      <div><div className="text-base font-extrabold sm:text-lg">{t(lang, 'mosqueName')}</div>{subtitle && <div className="mt-1 text-xs font-medium text-mosque-mint/70">{subtitle}</div>}</div>
    </a>
    <LanguageDropdown lang={lang} onChange={onLanguageChange} />
  </header>;
}
