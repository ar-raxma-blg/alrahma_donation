import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function PATCH(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const guard = await requireAdmin(req);
  if (guard) return guard;
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Kontrollera ditt val.' }, { status: 400 }); }
  if (!['pause_reminders','resume_reminders','stop_all'].includes(body?.action) || (body.action === 'stop_all' && body.donorRequested !== true)) return NextResponse.json({ error: 'Bekräfta givarens begäran innan aviseringarna stängs av.' }, { status: 400 });
  const { error } = await supabaseAdmin().rpc('set_donor_notification_controls', { target_donor: params.id, requested_action: body.action });
  if (error) return NextResponse.json({ error: 'Kunde inte spara. Kontrollera att databasuppdateringen är installerad.' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
