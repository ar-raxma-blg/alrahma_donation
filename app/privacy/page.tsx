import PrivacyClient from './PrivacyClient';
import TranslationProvider from '@/components/TranslationProvider';
import { getTranslationOverrides } from '@/lib/translations-server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { PrivacyStored, resolveController } from '@/lib/privacy-policy';

export const revalidate = 0;
export const metadata = { title: 'Privacy policy', description: 'How Al-Rahma Mosque handles donor personal data (GDPR).' };

export default async function PrivacyPage() {
  const overrides = await getTranslationOverrides();
  let stored: PrivacyStored = {};
  try {
    const { data } = await supabaseAdmin().from('campaign_settings').select('privacy_policy').eq('id', 'main').single();
    stored = (data?.privacy_policy as PrivacyStored) ?? {};
  } catch { /* migration not applied yet: built-in defaults are used */ }
  return <TranslationProvider overrides={overrides}><PrivacyClient stored={stored} controller={resolveController(stored)} /></TranslationProvider>;
}
