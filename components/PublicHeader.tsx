'use client';

import LanguageDropdown from './LanguageDropdown';
import { Lang } from '@/lib/types';
import { useT } from '@/components/TranslationProvider';

export default function PublicHeader({ lang, onLanguageChange, subtitle }: { lang: Lang; onLanguageChange: (lang: Lang) => void; subtitle?: string | null }) {
  const t = useT();
  return <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
    <a href={`/?lang=${lang}`} className="flex min-h-[44px] min-w-0 items-center gap-3 rounded-xl">
      {/* Decorative: the mosque name right next to it is the link's accessible name. */}
      <img src="/logo.png" alt="" width={48} height={48} className="h-11 w-11 flex-shrink-0 sm:h-12 sm:w-12" />
      <div><div className="text-lg font-extrabold">{t(lang, 'mosqueName')}</div>{subtitle && <div className="mt-1 text-sm font-medium text-mosque-mint">{subtitle}</div>}</div>
    </a>
    <LanguageDropdown lang={lang} onChange={onLanguageChange} />
  </header>;
}
