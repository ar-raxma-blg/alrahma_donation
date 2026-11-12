import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';

// GDPR right-to-erasure: soft-delete a donor. Their historical donation
// amounts stay in campaign totals (display_name is already snapshotted on
// each donation row), but personal fields are scrubbed here. A scheduled
// job can hard-delete rows past your retention window.
export async function DELETE(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const guard = await requireAdmin(req);
  if (guard) return guard;

  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from('donors')
    .update({
      full_name: 'Deleted donor',
      email: `deleted-${params.id}@erased.local`,
      phone: null,
      deleted_at: new Date().toISOString()
    })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
