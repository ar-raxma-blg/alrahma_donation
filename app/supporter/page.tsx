import { supabaseAdmin } from '@/lib/supabase/server';
import { Lang } from '@/lib/types';
import SupporterClient from './SupporterClient';

export const revalidate = 0;

export const metadata = { title: 'Become a supporter — Al-Rahma Mosque' };

export default async function SupporterPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ lang?: string }> }) {
  const searchParams = await searchParamsPromise;
  const { data: settings } = await supabaseAdmin()
    .from('campaign_settings')
    .select('transparency_files')
    .eq('id', 'main')
    .single();

  const initialLang: Lang = searchParams.lang === 'sv' || searchParams.lang === 'ar' ? searchParams.lang : 'en';

  return <SupporterClient initialLang={initialLang} transparencyFiles={settings?.transparency_files ?? []} />;
}
