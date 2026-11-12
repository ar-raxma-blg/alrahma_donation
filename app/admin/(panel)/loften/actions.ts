'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { writeAudit } from '@/lib/admin/audit';
import { getAdminUser } from '@/lib/auth';
import { mainCollectionId } from '@/lib/admin/main-collection';
import { supabaseAdmin } from '@/lib/supabase/server';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const payloadSchema = z.object({
  donor_id: z.string().uuid().optional(),
  new_donor: z
    .object({
      full_name: z.string().trim().min(1, 'Skriv givarens namn.').max(100),
      phone: z.string().trim().max(30).optional(),
      email: z.string().trim().email('E-postadressen ser inte rätt ut.').max(120).optional().or(z.literal('')),
      consent_storage: z.boolean(),
      consent_contact: z.boolean()
    })
    .optional(),
  total_sek: z.coerce.number({ error: 'Ange totalbeloppet i hela kronor.' }).int().positive('Totalbeloppet måste vara större än 0 kr.').max(100_000_000),
  reminders: z.boolean(),
  installments: z
    .array(
      z.object({
        due_on: z.iso.date('Varje delbetalning behöver ett giltigt datum.'),
        amount_sek: z.coerce.number().int('Delbetalningar ska vara i hela kronor.').positive('Varje delbetalning måste vara större än 0 kr.')
      })
    )
    .min(1, 'Minst en delbetalning krävs.')
    .max(60)
});

export type PledgePayload = z.input<typeof payloadSchema>;

export async function createPledge(input: PledgePayload): Promise<Result<{ id: string }>> {
  const user = await getAdminUser();
  if (!user) return { ok: false, error: 'Du är inte inloggad som admin.' };

  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;

  const sum = v.installments.reduce((s, i) => s + i.amount_sek, 0);
  if (sum !== v.total_sek) return { ok: false, error: `Delbetalningarna summerar till ${sum} kr men totalen är ${v.total_sek} kr.` };
  if (!v.donor_id && !v.new_donor) return { ok: false, error: 'Välj en givare eller skapa en ny.' };

  let campaignId: string;
  try { campaignId = await mainCollectionId(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Kunde inte förbereda insamlingen.' }; }
  const db = supabaseAdmin();
  let donorId = v.donor_id;
  let createdDonor = false;

  if (!donorId) {
    const d = v.new_donor!;
    if (!d.phone && !d.email) return { ok: false, error: 'Ange telefon eller e-post så att vi kan nå givaren.' };
    if (!d.consent_storage) return { ok: false, error: 'Givaren måste ha godkänt att vi sparar uppgifterna.' };
    const { data, error } = await db.from('donor_profiles').insert({ full_name: d.full_name, phone: d.phone || null, email: d.email || null }).select('id').single();
    if (error) return { ok: false, error: error.message };
    donorId = data.id;
    createdDonor = true;
    const consents = [{ donor_id: donorId, purpose: 'storage', granted: true, source: 'manual' }];
    if (d.consent_contact) {
      if (d.phone) consents.push({ donor_id: donorId, purpose: 'contact_sms', granted: true, source: 'manual' });
      if (d.email) consents.push({ donor_id: donorId, purpose: 'contact_email', granted: true, source: 'manual' });
    }
    const { error: cErr } = await db.from('donor_consents').insert(consents);
    if (cErr) {
      await db.from('donor_profiles').delete().eq('id', donorId);
      return { ok: false, error: cErr.message };
    }
  }

  const { data: pledge, error } = await db
    .from('pledges')
    .insert({ campaign_id: campaignId, donor_id: donorId, total_sek: v.total_sek, reminders: false })
    .select('id')
    .single();
  if (error) {
    if (createdDonor) await db.from('donor_profiles').delete().eq('id', donorId);
    return { ok: false, error: error.message };
  }

  const { error: iErr } = await db
    .from('pledge_installments')
    .insert(v.installments.map((i, n) => ({ pledge_id: pledge.id, seq: n + 1, due_on: i.due_on, amount_sek: i.amount_sek })));
  if (iErr) {
    await db.from('pledges').delete().eq('id', pledge.id);
    if (createdDonor) await db.from('donor_profiles').delete().eq('id', donorId);
    return { ok: false, error: iErr.message };
  }

  await writeAudit({
    user,
    action: 'pledge.create',
    objectType: 'pledge',
    objectId: pledge.id,
    objectLabel: `${v.total_sek} kr i ${v.installments.length} delbetalningar`,
    changes: { total_sek: { from: null, to: v.total_sek }, installments: { from: null, to: v.installments.length }, ...(createdDonor ? { donor: { from: null, to: 'ny givare' } } : {}) }
  });
  revalidatePath('/admin', 'layout');
  return { ok: true, id: pledge.id };
}

export async function cancelPledge(id: string, reason: string): Promise<Result> {
  const user = await getAdminUser();
  if (!user) return { ok: false, error: 'Du är inte inloggad som admin.' };
  const why = reason.trim();
  if (why.length < 3) return { ok: false, error: 'Ange en anledning.' };

  const { data, error } = await supabaseAdmin()
    .from('pledges')
    .update({ status: 'cancelled', cancel_reason: why })
    .eq('id', id)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Löftet är redan avbrutet.' };

  await writeAudit({ user, action: 'pledge.cancel', objectType: 'pledge', objectId: id, changes: { status: { from: 'active', to: 'cancelled' }, cancel_reason: { from: null, to: why } } });
  revalidatePath('/admin', 'layout');
  return { ok: true };
}

export async function setReminders(id: string, on: boolean): Promise<Result> {
  const user = await getAdminUser();
  if (!user) return { ok: false, error: 'Du är inte inloggad som admin.' };
  const { error } = await supabaseAdmin().from('pledges').update({ reminders: on }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  await writeAudit({ user, action: 'pledge.update', objectType: 'pledge', objectId: id, changes: { reminders: { from: !on, to: on } } });
  revalidatePath(`/admin/loften/${id}`);
  return { ok: true };
}
