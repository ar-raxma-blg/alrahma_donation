import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { elksBalance } from '@/lib/broadcast';

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  try { return NextResponse.json(await elksBalance()); }
  catch { return NextResponse.json({ error: 'Kunde inte läsa saldot hos 46elks.' }, { status: 503 }); }
}
