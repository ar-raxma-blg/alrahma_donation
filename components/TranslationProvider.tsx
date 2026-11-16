'use client';

import { createContext, useCallback, useContext } from 'react';
import { t as translate, TranslationOverrides } from '@/lib/i18n';
import { Lang } from '@/lib/types';

const Ctx = createContext<TranslationOverrides>({});

export default function TranslationProvider({ overrides, children }: { overrides: TranslationOverrides; children: React.ReactNode }) {
  return <Ctx.Provider value={overrides}>{children}</Ctx.Provider>;
}

// Same signature as t(lang, key), but includes the admin's edits.
export function useT() {
  const overrides = useContext(Ctx);
  return useCallback((lang: Lang, key: string) => translate(lang, key, overrides), [overrides]);
}
