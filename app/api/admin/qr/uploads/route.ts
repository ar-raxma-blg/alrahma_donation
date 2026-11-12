import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/server';

// Stage an image only. Activating it is part of the atomic homepage save.
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  let form;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'Ogiltig uppladdning.' }, { status: 400 }); }
  const kind = form.get('kind');
  const file = form.get('file');
  if (!['swish', 'paypal'].includes(String(kind)) || !(file instanceof File)) return NextResponse.json({ error: 'Välj Swish eller PayPal och en bild.' }, { status: 400 });
  if (!file.size || file.size > 2 * 1024 * 1024) return NextResponse.json({ error: 'Bilden måste vara mellan 1 byte och 2 MB.' }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((b, i) => bytes[i] === b);
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 12 && Buffer.from(bytes.slice(0,4)).toString() === 'RIFF' && Buffer.from(bytes.slice(8,12)).toString() === 'WEBP';
  const ext = file.type === 'image/png' && png ? 'png' : file.type === 'image/jpeg' && jpeg ? 'jpg' : file.type === 'image/webp' && webp ? 'webp' : null;
  if (!ext) return NextResponse.json({ error: 'Använd en riktig PNG-, JPG- eller WebP-bild.' }, { status: 400 });
  const storage = supabaseAdmin().storage.from('qr-codes');
  const path = `${kind}-${randomUUID()}.${ext}`;
  const { error } = await storage.upload(path, bytes, { contentType: file.type });
  if (error) return NextResponse.json({ error: 'Kunde inte ladda upp bilden. Försök igen.' }, { status: 503 });
  return NextResponse.json({ url: storage.getPublicUrl(path).data.publicUrl });
}
