import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { validateRegistration } from '@/lib/registration';
import { registrationIssues } from '@/lib/registration-errors';

// Best-effort per-IP limit (in-memory: per server instance). Enough to stop
// casual form spam; use a shared store or a CAPTCHA if abuse gets serious.
const hits = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t > 10 * 60_000)) hits.delete(k);
  return recent.length > 8;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (tooMany(ip)) return NextResponse.json({ error: 'unavailable' }, { status: 429 });
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid' }, { status: 400 }); }
  // Honeypot: real visitors never see this field. Pretend success so bots don't adapt.
  if (body && typeof body === 'object' && typeof (body as { website?: unknown }).website === 'string' && (body as { website: string }).website.trim()) {
    return NextResponse.json({ ok: true, reference: 'AR-0000', status: 'pending' }, { status: 201 });
  }
  const payload = validateRegistration(body);
  if (!payload) return NextResponse.json({ error: 'invalid', issues: registrationIssues(body) }, { status: 400 });
  if (!process.env.SUPABASE_SECRET_KEY) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
  try {
    const { data, error } = await supabaseAdmin().rpc('register_donation', { payload });
    if (error) {
      console.error('Registration failed:', error.code);
      return NextResponse.json({ error: 'unavailable' }, { status: error.code === 'P0002' ? 409 : 503 });
    }
    return NextResponse.json({ ok: true, reference: data.reference, status: data.status }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
