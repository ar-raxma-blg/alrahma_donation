import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';

// Admin-only: upload (POST, multipart: kind + file) or remove (DELETE ?kind=)
// your own Swish / PayPal QR image. Files live in the public "qr-codes"
// Storage bucket; the public URL is saved on campaign_settings.
const COLUMN = { swish: 'swish_qr_url', paypal: 'paypal_qr_url' } as const;
type Kind = keyof typeof COLUMN;
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;

  const form = await req.formData();
  const kind = form.get('kind') as Kind;
  const file = form.get('file');
  if (!(kind in COLUMN) || !(file instanceof File)) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Använd PNG, JPG, WebP eller SVG' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Bilden är för stor (max 2 MB)' }, { status: 400 });

  const supabase = supabaseAdmin();
  // New file name each time so browsers/CDN never serve a stale QR.
  const path = `${kind}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('qr-codes').upload(path, file, { contentType: file.type });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const url = supabase.storage.from('qr-codes').getPublicUrl(path).data.publicUrl;
  const { error } = await supabase.from('campaign_settings').update({ [COLUMN[kind]]: url, updated_at: new Date().toISOString() }).eq('id', 'main');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;

  const kind = req.nextUrl.searchParams.get('kind') as Kind;
  if (!(kind in COLUMN)) return NextResponse.json({ error: 'Missing kind' }, { status: 400 });

  const supabase = supabaseAdmin();
  const { error } = await supabase.from('campaign_settings').update({ [COLUMN[kind]]: '', updated_at: new Date().toISOString() }).eq('id', 'main');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
