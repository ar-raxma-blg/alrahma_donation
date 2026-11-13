import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { publicRaised } from '@/lib/homepage';

export const dynamic = 'force-dynamic';
export async function GET() {
  const { data, error } = await supabaseAdmin().from('campaign_totals').select('*').eq('id', 'main').single();
  if (error || !data) return NextResponse.json({ error: 'Kunde inte läsa insamlingen.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ raised: publicRaised(data), goal: Number(data.goal_sek) }, { headers: { 'Cache-Control': 'no-store' } });
}
