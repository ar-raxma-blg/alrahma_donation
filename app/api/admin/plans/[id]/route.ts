import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const guard = await requireAdmin(req);
  if (guard) return guard;
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Kontrollera datumet.' }, { status: 400 }); }
  const value = body?.firstDueOn;
  if (value !== null && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) return NextResponse.json({ error: 'Ange ett giltigt förfallodatum eller lämna datumet tomt.' }, { status: 400 });
  const { data, error } = await supabaseAdmin().from('payment_plans').update({ first_due_on: value }).eq('id', params.id).eq('status', 'active').select().maybeSingle();
  if (error) return NextResponse.json({ error: 'Kunde inte spara. Kontrollera att databasuppdateringen är installerad.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Planen hittades inte eller är avslutad.' }, { status: 409 });
  return NextResponse.json({ plan: data });
}

// Edit or cancel a payment plan.
export async function PUT(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const guard = await requireAdmin(req);
  if (guard) return guard;

  const { displayName, totalAmountSek, months } = await req.json();
  if (typeof displayName !== 'string' || !displayName.trim() || !Number.isInteger(totalAmountSek) || totalAmountSek < 1 || totalAmountSek > 10000000 || ![2,6,12].includes(months) || totalAmountSek % months !== 0) return NextResponse.json({ error: 'Ange ett namn och ett helt belopp som delas jämnt över valda månader.' }, { status: 400 });
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('payment_plans')
    .update({ display_name: displayName, total_amount_sek: totalAmountSek, months })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.code === 'P0001' ? error.message : 'Planen kunde inte uppdateras.' }, { status: error.code === 'P0001' ? 409 : 500 });
  return NextResponse.json({ plan: data });
}

export async function DELETE(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const guard = await requireAdmin(req);
  if (guard) return guard;

  const supabase = supabaseAdmin();
  const { error } = await supabase.from('payment_plans').update({ status: 'cancelled' }).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
