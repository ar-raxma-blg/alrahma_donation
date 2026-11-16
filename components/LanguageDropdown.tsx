'use client';

import { useEffect, useRef, useState } from 'react';
import { Lang } from '@/lib/types';
import { useT } from '@/components/TranslationProvider';

const LABELS: Record<Lang, string> = { en: 'English', sv: 'Svenska', ar: 'العربية' };

export default function LanguageDropdown({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Close on Escape (return focus to the button) and on outside click.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    const onClick = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);

  return (
    <div className="relative" ref={wrap}>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${t(lang, 'changeLanguage')}: ${LABELS[lang]}`}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg border border-mosque-muted bg-mosque-deep px-4 py-2 text-base font-bold text-mosque-cream"
      >
        <span aria-hidden="true">🌐</span>
        <span aria-hidden="true">{lang.toUpperCase()}</span>
        <span aria-hidden="true" className="text-sm">▾</span>
      </button>
      {open && (
        <ul className="absolute end-0 top-[calc(100%+6px)] z-20 m-0 min-w-[180px] list-none overflow-hidden rounded-lg border border-mosque-muted bg-mosque-deep p-0 shadow-xl">
          {(Object.keys(LABELS) as Lang[]).map((code) => (
            <li key={code}>
              <button
                type="button"
                lang={code}
                dir={code === 'ar' ? 'rtl' : 'ltr'}
                aria-current={code === lang ? 'true' : undefined}
                onClick={() => { onChange(code); setOpen(false); button.current?.focus(); }}
                className={`flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-base font-semibold ${
                  code === lang ? 'bg-mosque-goldLight text-mosque-deep' : 'text-mosque-cream'
                }`}
              >
                {LABELS[code]}
                {code === lang && <span aria-hidden="true">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
