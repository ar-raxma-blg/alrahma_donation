import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAdminUser, requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { writeAudit } from '@/lib/admin/audit';

const notReady = 'Kunde inte läsa inställningen. Kontrollera att databasuppdateringen för live-donationer är installerad.';
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  const { data, error } = await supabaseAdmin().from('campaign_settings').select('show_live_feed').eq('id', 'main').single();
  if (error) return NextResponse.json({ error: notReady }, { status: 503 });
  return NextResponse.json({ show: data.show_live_feed !== false }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  const user = await getAdminUser('owner');
  if (!user) return NextResponse.json({ error: 'Owner-behörighet krävs.' }, { status: 403 });
  let input;
  try { input = await req.json(); } catch { return NextResponse.json({ error: 'Ogiltiga uppgifter.' }, { status: 400 }); }
  const parsed = z.object({ show: z.boolean() }).strict().safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: 'Ogiltiga uppgifter.' }, { status: 400 });
  const db = supabaseAdmin();
  const before = await db.from('campaign_settings').select('show_live_feed').eq('id', 'main').single();
  if (before.error) return NextResponse.json({ error: notReady }, { status: 503 });
  // updated_at is left alone so an open homepage-settings form is not invalidated.
  const { error } = await db.from('campaign_settings').update({ show_live_feed: parsed.data.show }).eq('id', 'main');
  if (error) return NextResponse.json({ error: 'Kunde inte spara.' }, { status: 503 });
  await writeAudit({ user, action: 'homepage.live_feed', objectType: 'homepage', objectId: 'main', objectLabel: 'Live-donationer på hemsidan', changes: { show_live_feed: { from: before.data.show_live_feed !== false, to: parsed.data.show } } });
  revalidatePath('/');
  return NextResponse.json({ ok: true });
}
