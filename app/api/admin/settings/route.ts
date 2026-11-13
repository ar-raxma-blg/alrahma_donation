import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';

// Admin-only: read or update the payment accounts shown to donors
// (Swish number, Bankgiro, IBAN). Single row, id='main'.
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard) return guard;

  const supabase = supabaseAdmin();
  const [{ data, error }, { data: totals }] = await Promise.all([
    supabase.from('campaign_settings').select('*').eq('id', 'main').single(),
    supabase.from('campaign_totals').select('goal_sek').eq('id', 'main').single()
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: { ...data, goal_sek: totals?.goal_sek } });
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;

  const { swishNumber, bankgiro, iban, paypalLink, paypalPlaceholder, goalSek, plusgiro, bankName, accountHolder, accountNumber, bic, cardLink, isLive, pausedMessage, transparencyFiles } = await req.json();
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('campaign_settings')
    .update({
      swish_number: swishNumber,
      bankgiro,
      iban,
      paypal_link: paypalLink ?? '',
      paypal_placeholder: paypalPlaceholder ?? true,
      plusgiro: plusgiro ?? '',
      bank_name: bankName ?? '',
      account_holder: accountHolder ?? '',
      account_number: accountNumber ?? '',
      bic: bic ?? '',
      card_link: cardLink ?? '',
      is_live: isLive,
      paused_message: pausedMessage,
      transparency_files: Array.isArray(transparencyFiles) ? transparencyFiles : [],
      updated_at: new Date().toISOString()
    })
    .eq('id', 'main')
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const goal = Math.round(Number(goalSek));
  if (Number.isFinite(goal) && goal > 0) {
    const { error: goalError } = await supabase
      .from('campaign_totals')
      .update({ goal_sek: goal, updated_at: new Date().toISOString() })
      .eq('id', 'main');
    if (goalError) return NextResponse.json({ error: goalError.message }, { status: 500 });
  }
  return NextResponse.json({ settings: { ...data, goal_sek: goal > 0 ? goal : undefined } });
}
