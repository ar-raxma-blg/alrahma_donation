import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { estimateSmsBatch, providerStatus } from '@/lib/broadcast';
import { loadBroadcastRecipients } from '@/lib/broadcast-server';
import { broadcastAddresses, recipientId } from '@/lib/broadcast-targets';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  let input;
  try { input = await req.json(); } catch { return NextResponse.json({ error: 'Ogiltig förfrågan.' }, { status: 400 }); }
  const { message, donorIds } = input || {};
  if (typeof message !== 'string' || !message.trim() || message.length > 480 || !Array.isArray(donorIds) || !donorIds.length || donorIds.length > 50 || donorIds.some(id => typeof id !== 'string' || !recipientId.test(id))) {
    return NextResponse.json({ error: 'Välj upp till 50 givare och ange ett giltigt SMS.' }, { status: 400 });
  }
  if (!providerStatus().sms) return NextResponse.json({ error: '46elks är inte konfigurerat.' }, { status: 503 });
  try {
    const recipients = await loadBroadcastRecipients(donorIds);
    const { addresses, excludedNonSwedish } = broadcastAddresses(recipients, 'sms');
    if (!addresses.length) return NextResponse.json({ error: 'Inga valda givare har ett giltigt svenskt nummer (+46).' }, { status: 400 });
    const estimate = await estimateSmsBatch(addresses, message.trim());
    return NextResponse.json({ ...estimate, excludedNonSwedish });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message.startsWith('46elks-kontot får inte') ? error.message : 'Kunde inte hämta en säker kostnadsuppskattning från 46elks.' }, { status: 503 });
  }
}
