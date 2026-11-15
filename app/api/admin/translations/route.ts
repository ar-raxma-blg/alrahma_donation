import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminUser, requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { translations } from '@/lib/i18n';
import { translationUpdateSchema, rowsToOverrides } from '@/lib/translations';
import { writeAudit } from '@/lib/admin/audit';

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  const { data, error } = await supabaseAdmin().from('translation_overrides').select('lang, key, value');
  if (error) return NextResponse.json({ error: 'Kunde inte läsa texterna. Kontrollera att databasuppdateringen för texter är installerad.' }, { status: 503 });
  return NextResponse.json({ overrides: rowsToOverrides(data) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  const user = await getAdminUser('owner');
  if (!user) return NextResponse.json({ error: 'Owner-behörighet krävs.' }, { status: 403 });
  let input;
  try { input = await req.json(); } catch { return NextResponse.json({ error: 'Ogiltiga uppgifter.' }, { status: 400 }); }
  const parsed = translationUpdateSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { lang, key, value } = parsed.data;
  const db = supabaseAdmin();
  const previous = await db.from('translation_overrides').select('value').eq('lang', lang).eq('key', key).maybeSingle();
  if (previous.error) return NextResponse.json({ error: 'Kunde inte spara texten.' }, { status: 503 });
  const fallback = translations[lang][key];
  // Saving the default text, or nothing, removes the override.
  const reset = value === '' || value === fallback;
  const { error } = reset
    ? await db.from('translation_overrides').delete().eq('lang', lang).eq('key', key)
    : await db.from('translation_overrides').upsert({ lang, key, value, updated_at: new Date().toISOString(), updated_by: user.name });
  if (error) return NextResponse.json({ error: 'Kunde inte spara texten.' }, { status: 503 });
  await writeAudit({ user, action: 'translation.update', objectType: 'translation', objectId: `${lang}.${key}`, objectLabel: `Text ${key} (${lang})`, changes: { value: { from: previous.data?.value ?? fallback, to: reset ? fallback : value } } });
  revalidatePath('/'); revalidatePath('/supporter');
  return NextResponse.json({ ok: true, reset });
}
