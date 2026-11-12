import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';

// Admin-only: approve or reject a pending donation.
export async function PATCH(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const guard = await requireAdmin(req);
  if (guard) return guard;

  const { status } = await req.json(); // 'confirmed' | 'rejected'
  if (!['confirmed', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('donations')
    .update({ status, confirmed_at: status === 'confirmed' ? new Date().toISOString() : null })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ donation: data });
}

// Edit a donation record (name/amount/method) — e.g. fixing a typo'd cash entry.
export async function PUT(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const guard = await requireAdmin(req);
  if (guard) return guard;

  const { displayName, amountSek, method } = await req.json();
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('donations')
    .update({ display_name: displayName, amount_sek: amountSek, method })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ donation: data });
}

export async function DELETE(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const guard = await requireAdmin(req);
  if (guard) return guard;

  const supabase = supabaseAdmin();
  const { error } = await supabase.from('donations').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
