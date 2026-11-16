import { createClient } from '@supabase/supabase-js';
import { TranslationOverrides } from './i18n';
import { rowsToOverrides } from './translations';

// Public read (RLS allows select). Never blocks the page: any failure, such as
// the migration not being applied yet, falls back to the built-in texts.
export async function getTranslationOverrides(): Promise<TranslationOverrides> {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const { data, error } = await supabase.from('translation_overrides').select('lang, key, value');
    return error ? {} : rowsToOverrides(data);
  } catch { return {}; }
}
