import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { processNotifications } from '@/lib/notifications';

export const maxDuration = 60;
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  try { return NextResponse.json(await processNotifications()); }
  catch { return NextResponse.json({ error: 'Kunde inte slutföra utskicket. Kontrollera status innan du försöker igen.' }, { status: 503 }); }
}
