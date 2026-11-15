import { z } from 'zod';
import { translations, TranslationOverrides } from './i18n';
import { Lang } from './types';

export const LANGS: Lang[] = ['en', 'sv', 'ar'];
// The consent sentence is stored as evidence when someone registers (see
// lib/registration.ts), so it must stay exactly what the donor agreed to.
export const LOCKED_KEYS = ['gdprText'];
export const translationKeys = Object.keys(translations.en);

export const translationUpdateSchema = z.object({
  lang: z.enum(['en', 'sv', 'ar']),
  key: z.string().refine(k => translationKeys.includes(k) && !LOCKED_KEYS.includes(k), 'Den här texten kan inte ändras.'),
  // Empty means "restore the default".
  value: z.string().trim().max(600, 'Max 600 tecken.')
}).strict();

export function rowsToOverrides(rows: { lang: string; key: string; value: string }[] | null | undefined): TranslationOverrides {
  const out: TranslationOverrides = {};
  for (const r of rows ?? []) {
    if (!LANGS.includes(r.lang as Lang) || !translationKeys.includes(r.key) || LOCKED_KEYS.includes(r.key) || !r.value) continue;
    (out[r.lang as Lang] ??= {})[r.key] = r.value;
  }
  return out;
}
