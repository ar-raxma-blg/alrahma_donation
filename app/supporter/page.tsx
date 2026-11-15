import { supabaseAdmin } from '@/lib/supabase/server';
import { Lang } from '@/lib/types';
import SupporterClient from './SupporterClient';
import TranslationProvider from '@/components/TranslationProvider';
import { getTranslationOverrides } from '@/lib/translations-server';

export const revalidate = 0;

export const metadata = { title: 'Become a supporter — Al-Rahma Mosque' };

export default async function SupporterPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ lang?: string }> }) {
  const searchParams = await searchParamsPromise;
  const [{ data: settings }, overrides] = await Promise.all([
    supabaseAdmin().from('campaign_settings').select('transparency_files').eq('id', 'main').single(),
    getTranslationOverrides()
  ]);

  const initialLang: Lang = searchParams.lang === 'sv' || searchParams.lang === 'ar' ? searchParams.lang : 'en';

  return <TranslationProvider overrides={overrides}><SupporterClient initialLang={initialLang} transparencyFiles={settings?.transparency_files ?? []} /></TranslationProvider>;
}
