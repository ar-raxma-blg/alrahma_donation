import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { publicRaised } from '@/lib/homepage';
import { homepageSchema } from '@/lib/homepage-settings';
import { revalidatePath } from 'next/cache';

const fields = 'swish_number, paypal_link, card_link, bankgiro, plusgiro, iban, bic, account_holder, bank_name, account_number, swish_qr_url, paypal_qr_url, updated_at';
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  const db = supabaseAdmin();
  const [settings, totals, capabilities] = await Promise.all([
    db.from('campaign_settings').select(fields).eq('id', 'main').single(),
    db.from('campaign_totals').select('*').eq('id', 'main').single(),
    db.rpc('homepage_qr_uploads_ready')
  ]);
  if (settings.error || totals.error) return NextResponse.json({ error: 'Kunde inte läsa hemsidans inställningar.' }, { status: 503 });
  return NextResponse.json({ settings: settings.data, totals: { ...totals.data, displayed_raised_sek: publicRaised(totals.data) }, ready: 'opening_raised_sek' in totals.data, qrReady: !capabilities.error && capabilities.data === true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  const user = await getAdminUser('owner');
  if (!user) return NextResponse.json({ error: 'Owner-behörighet krävs.' }, { status: 403 });
  let input;
  try { input = await req.json(); } catch { return NextResponse.json({ error: 'Ogiltiga uppgifter.' }, { status: 400 }); }
  const parsed = homepageSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { goal_sek, raised_sek, expected_settings_at, expected_totals_at, ...payment } = parsed.data;
  const { error } = await supabaseAdmin().rpc('save_homepage_settings', {
    payment, target_goal: goal_sek, target_raised: raised_sek,
    expected_settings_at, expected_totals_at, actor: user.id, actor_name: user.name
  });
  if (error) {
    const status = error.code === '40001' ? 409 : error.code === '22023' ? 400 : 503;
    const message = status === 409 ? 'Uppgifterna har ändrats. Ladda om inställningarna innan du sparar.' : status === 400 ? 'Insamlat får inte vara lägre än de bekräftade gåvor som redan registrerats.' : 'Kunde inte spara inställningarna. Kontrollera att hemsidans databasuppdatering är installerad.';
    return NextResponse.json({ error: message }, { status });
  }
  revalidatePath('/'); revalidatePath('/admin/betalsatt');
  return NextResponse.json({ ok: true });
}
