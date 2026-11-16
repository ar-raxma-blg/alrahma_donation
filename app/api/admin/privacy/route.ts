import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminUser, requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { writeAudit } from '@/lib/admin/audit';
import { privacySchema } from '@/lib/privacy-policy';

const notReady = 'Kunde inte läsa integritetspolicyn. Kontrollera att databasuppdateringen för integritetspolicy är installerad.';

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  const { data, error } = await supabaseAdmin().from('campaign_settings').select('privacy_policy').eq('id', 'main').single();
  if (error) return NextResponse.json({ error: notReady }, { status: 503 });
  return NextResponse.json({ stored: data.privacy_policy ?? {} }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  const user = await getAdminUser('owner');
  if (!user) return NextResponse.json({ error: 'Owner-behörighet krävs.' }, { status: 403 });
  let input;
  try { input = await req.json(); } catch { return NextResponse.json({ error: 'Ogiltiga uppgifter.' }, { status: 400 }); }
  const parsed = privacySchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  // updated_at is left alone so an open homepage-settings form is not invalidated.
  const { error } = await supabaseAdmin().from('campaign_settings').update({ privacy_policy: parsed.data }).eq('id', 'main');
  if (error) return NextResponse.json({ error: notReady }, { status: 503 });
  await writeAudit({ user, action: 'homepage.privacy_policy', objectType: 'homepage', objectId: 'main', objectLabel: 'Integritetspolicy', changes: { languages: { from: null, to: Object.keys(parsed.data.langs) } } });
  revalidatePath('/privacy'); revalidatePath('/');
  return NextResponse.json({ ok: true });
}
