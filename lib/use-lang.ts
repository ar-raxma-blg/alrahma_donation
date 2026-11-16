'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lang } from '@/lib/types';

const KEY = 'alrahma-lang';
const isLang = (v: unknown): v is Lang => v === 'en' || v === 'sv' || v === 'ar';

// Language state that is remembered between visits (localStorage — a purely
// functional preference, so no cookie notice is needed) and mirrored onto
// <html lang dir> so screen readers, browsers and translation tools see it.
// Priority: ?lang= in the URL → remembered choice → browser language → initial.
export function useLang(initial: Lang = 'en'): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>(initial);

  useEffect(() => {
    let next: Lang | null = null;
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('lang');
      if (isLang(fromUrl)) next = fromUrl;
      else {
        const stored = window.localStorage.getItem(KEY);
        if (isLang(stored)) next = stored;
      }
    } catch { /* storage blocked — fall through */ }
    if (!next) {
      const nav = (navigator.language || '').slice(0, 2).toLowerCase();
      if (isLang(nav)) next = nav;
    }
    if (next) setLangState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { window.localStorage.setItem(KEY, l); } catch { /* ignore */ }
  }, []);

  return [lang, setLang];
}
