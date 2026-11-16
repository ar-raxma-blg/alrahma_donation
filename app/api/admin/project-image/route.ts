import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminUser, requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { writeAudit } from '@/lib/admin/audit';

// Owner-only: the photo/plan shown in "The project" on the homepage.
// Stored in the public "qr-codes" Storage bucket under a project- prefix.
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_BYTES = 4 * 1024 * 1024;
const notReady = 'Kunde inte spara bilden. Kontrollera att databasuppdateringen för projektbild är installerad.';

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  const { data, error } = await supabaseAdmin().from('campaign_settings').select('project_image_url').eq('id', 'main').single();
  if (error) return NextResponse.json({ error: notReady }, { status: 503 });
  return NextResponse.json({ url: data.project_image_url || '' }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  const user = await getAdminUser('owner');
  if (!user) return NextResponse.json({ error: 'Owner-behörighet krävs.' }, { status: 403 });
  const file = (await req.formData()).get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Välj en bild.' }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Använd PNG, JPG eller WebP.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Bilden är för stor (max 4 MB).' }, { status: 400 });
  const db = supabaseAdmin();
  // New name each time so browsers/CDN never serve a stale picture.
  const path = `project-${Date.now()}.${ext}`;
  const up = await db.storage.from('qr-codes').upload(path, file, { contentType: file.type });
  if (up.error) return NextResponse.json({ error: 'Kunde inte ladda upp bilden.' }, { status: 500 });
  const url = db.storage.from('qr-codes').getPublicUrl(path).data.publicUrl;
  // updated_at is left alone so an open homepage-settings form is not invalidated.
  const { error } = await db.from('campaign_settings').update({ project_image_url: url }).eq('id', 'main');
  if (error) return NextResponse.json({ error: notReady }, { status: 503 });
  await writeAudit({ user, action: 'homepage.project_image', objectType: 'homepage', objectId: 'main', objectLabel: 'Projektbild', changes: { project_image: { from: null, to: path } } });
  revalidatePath('/');
  return NextResponse.json({ url });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  const user = await getAdminUser('owner');
  if (!user) return NextResponse.json({ error: 'Owner-behörighet krävs.' }, { status: 403 });
  const { error } = await supabaseAdmin().from('campaign_settings').update({ project_image_url: '' }).eq('id', 'main');
  if (error) return NextResponse.json({ error: notReady }, { status: 503 });
  await writeAudit({ user, action: 'homepage.project_image', objectType: 'homepage', objectId: 'main', objectLabel: 'Projektbild', changes: { project_image: { from: 'bild', to: null } } });
  revalidatePath('/');
  return NextResponse.json({ ok: true });
}
