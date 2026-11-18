import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { cleanInviteName, makeInviteCode } from '@/lib/invites';

// A visitor taps "Dela" on the public page and (optionally) types their name to
// get their own invitation link. Best-effort per-IP limit, same idea as /api/register.
const hits = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t > 10 * 60_000)) hits.delete(k);
  return recent.length > 6;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (tooMany(ip)) return NextResponse.json({ error: 'unavailable' }, { status: 429 });
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid' }, { status: 400 }); }
  const name = cleanInviteName((body as { name?: unknown } | null)?.name);
  if (!process.env.SUPABASE_SECRET_KEY) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = makeInviteCode(name);
      const { error } = await supabaseAdmin().from('invite_channels').insert({ code, name, source: 'public' });
      if (!error) return NextResponse.json({ ok: true, code }, { status: 201 });
      if (error.code !== '23505') break; // only a code collision is worth retrying
    }
  } catch { /* fall through */ }
  return NextResponse.json({ error: 'unavailable' }, { status: 503 });
}
