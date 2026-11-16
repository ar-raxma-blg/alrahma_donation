'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { writeAudit } from '@/lib/admin/audit';
import { getAdminUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/server';

// Hide (or show again) one person's name in the public "Live donations" list.
// The admin always keeps seeing the real name; only the public view changes.
export async function setPublicAnonymity(formData: FormData): Promise<void> {
  const user = await getAdminUser();
  if (!user) throw new Error('Du är inte inloggad som admin.');
  const donorId = z.string().uuid().parse(formData.get('donor_id'));
  const hide = formData.get('hide') === '1';
  const db = supabaseAdmin();

  const { data: donor } = await db.from('donors').select('id, full_name').eq('id', donorId).maybeSingle();
  if (!donor) throw new Error('Givaren hittades inte.');

  // A name is only shown again if the donor agreed to public display when registering.
  if (!hide) {
    const { data: consent } = await db.from('consent_log').select('id').eq('donor_id', donorId).eq('purpose', 'public_display').eq('consent_given', true).limit(1);
    if (!consent?.length) throw new Error('Givaren har inte samtyckt till att namnet visas publikt.');
  }

  const [gifts, plans] = await Promise.all([
    db.from('donations').update({ is_anonymous: hide }).eq('donor_id', donorId),
    db.from('payment_plans').update({ is_anonymous: hide }).eq('donor_id', donorId)
  ]);
  if (gifts.error || plans.error) throw new Error('Kunde inte spara. Försök igen.');

  // Keep the rebuilt admin tables consistent: no public name, and the consent decision recorded.
  const { data: profile } = await db.from('donor_profiles').select('id').eq('legacy_donor_id', donorId).maybeSingle();
  if (profile) {
    if (hide) await db.from('transactions').update({ display_name: null }).eq('donor_id', profile.id);
    await db.from('donor_consents').insert({ donor_id: profile.id, purpose: 'show_first_name', granted: !hide, source: 'manual' });
  }

  await writeAudit({
    user, action: hide ? 'live_feed.hide_name' : 'live_feed.show_name', objectType: 'donor', objectId: donorId,
    objectLabel: donor.full_name, changes: { public_name: { from: hide ? 'visible' : 'hidden', to: hide ? 'hidden' : 'visible' } }
  });
  revalidatePath('/');
  revalidatePath('/admin/live-lista');
}
