import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { installmentError } from '@/lib/installments';

export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const guard = await requireAdmin(req);
  if (guard) return guard;
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Kontrollera betalningsuppgifterna.' }, { status: 400 }); }
  const invalid = installmentError(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const { data, error } = await supabaseAdmin().rpc('record_installment', { plan_id: params.id, amount: body.amountSek, payment_method: body.method, payment_date: body.paidOn, request_key: body.requestId });
  if (error) return NextResponse.json({ error: error.code === 'P0001' ? error.message : 'Betalningen kunde inte registreras. Kontrollera att databasuppdateringen är installerad.' }, { status: error.code === 'P0001' ? 409 : 503 });
  return NextResponse.json({ payment: data }, { status: 201 });
}
