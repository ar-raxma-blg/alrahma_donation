'use server';

import { revalidatePath } from 'next/cache';
import { writeAudit } from '@/lib/admin/audit';
import { getAdminUser } from '@/lib/auth';
import { cleanInviteName, makeInviteCode } from '@/lib/invites';
import { supabaseAdmin } from '@/lib/supabase/server';

// An admin creates a channel for a person ("Ali") who will share the link.
// Registrations made through it are then listed under that name.
export async function createInviteChannel(formData: FormData): Promise<void> {
  const user = await getAdminUser();
  if (!user) throw new Error('Du är inte inloggad som admin.');
  const name = cleanInviteName(formData.get('name'));
  if (!name) throw new Error('Skriv ett namn för personen som ska dela länken.');
  const db = supabaseAdmin();
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = makeInviteCode(name);
    const { data, error } = await db.from('invite_channels').insert({ code, name, source: 'admin', created_by: user.name }).select('id').single();
    if (!error && data) {
      await writeAudit({ user, action: 'invite.create', objectType: 'invite_channel', objectId: data.id, objectLabel: name });
      revalidatePath('/admin/inbjudningar');
      return;
    }
    if (error?.code !== '23505') break;
  }
  throw new Error('Kunde inte skapa kanalen. Försök igen.');
}
