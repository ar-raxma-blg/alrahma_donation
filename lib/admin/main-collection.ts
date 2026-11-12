import { supabaseAdmin } from '@/lib/supabase/server';

// A private bookkeeping collection, created only when a new record needs it.
// Existing campaigns and the public homepage settings are left intact.
export async function mainCollectionId(): Promise<string> {
  const db = supabaseAdmin();
  const slug = 'al-rahma-main';
  const { error } = await db.from('campaigns').upsert({
    slug, title: 'Al-Rahmas huvudinsamling', goal_sek: 1,
    fund_type: 'building', status: 'draft', pledges_count_public: false
  }, { onConflict: 'slug', ignoreDuplicates: true });
  if (error) throw new Error('Kunde inte förbereda huvudinsamlingen. Försök igen.');
  const { data, error: readError } = await db.from('campaigns').select('id').eq('slug', slug).single();
  if (readError || !data) throw new Error('Kunde inte läsa huvudinsamlingen. Försök igen.');
  return data.id;
}
