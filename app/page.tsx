import { createClient } from '@supabase/supabase-js';
import { paypalUrl, qrSvg, swishUrl } from '@/lib/qr';

import { PublicDonation } from '@/lib/types';
import TrackerClient from './TrackerClient';
import { supabaseAdmin } from '@/lib/supabase/server';
import { publicRaised } from '@/lib/homepage';

export const revalidate = 0; 

// Dev-only preview data so the layout can be reviewed with realistic content.
// Open /?demo=1 locally; ignored in production builds.
function demoDonations(): PublicDonation[] {
  const rows: [string, number, string | null, boolean, number][] = [
    ['Ahmed Hassan', 5000, 'May Allah accept it from us all', false, 2],
    ['Anonymous', 1000, null, true, 11],
    ['Fatima Ali', 250, 'For my parents', false, 34],
    ['Omar Yusuf', 10000, 'Sadaqah jariyah', false, 95],
    ['Aisha Mohamed', 500, null, false, 180],
    ['Anonymous', 2000, 'Barakallahu feekum', true, 360],
    ['Ibrahim Nur', 100, null, false, 720],
    ['Maryam Abdi', 7500, 'In memory of my grandfather', false, 1440]
  ];
  return rows.map(([display_name, amount_sek, message, is_anonymous, minsAgo], i) => ({
    id: `demo-${i}`,
    display_name,
    amount_sek,
    message,
    is_anonymous,
    created_at: new Date(Date.now() - minsAgo * 60_000).toISOString()
  }));
}

export default async function TrackerPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ demo?: string }> }) {
  const searchParams = await searchParamsPromise;
  const demo = process.env.NODE_ENV !== 'production' && searchParams.demo === '1';
  // Public reads use the publishable key and the public_donations view; only
  // payment settings need the server key.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } }
  );

  const [{ data: totals }, { data: donations }, { data: settings }] = await Promise.all([
    supabase.from('campaign_totals').select('*').eq('id', 'main').single(),
    supabase
      .from('public_donations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20),
    supabaseAdmin().from('campaign_settings').select('*').eq('id', 'main').single()
  ]);

  const swish = settings?.swish_number ? swishUrl(settings.swish_number) : null;
  const paypal = settings?.paypal_link ? paypalUrl(settings.paypal_link) : null;
  const cardLink = settings?.card_link?.trim();
  const card = cardLink ? (/^https?:\/\//i.test(cardLink) ? cardLink : `https://${cardLink}`) : null;
  const bankRows = (
    [
      ['bankgiro', settings?.bankgiro],
      ['plusgiro', settings?.plusgiro],
      ['iban', settings?.iban],
      ['bic', settings?.bic],
      ['accountHolder', settings?.account_holder],
      ['bankName', settings?.bank_name],
      ['accountNumber', settings?.account_number]
    ] as [string, string | undefined][]
  ).filter(([, v]) => v && v.trim()) as [string, string][];
  const qrCodes = {
    swish: swish || settings?.swish_qr_url ? { kind: 'swish' as const, svg: swish ? await qrSvg(swish) : undefined, imageUrl: settings?.swish_qr_url || undefined, detail: settings?.swish_number || undefined } : undefined,
    // PayPal only uses its own configured link/image; never reuse Swish here.
    paypal: settings?.paypal_qr_url
      ? { kind: 'paypal' as const, imageUrl: settings.paypal_qr_url, detail: settings.paypal_link?.replace(/^https?:\/\//i, '') || undefined }
      : paypal
      ? { kind: 'paypal' as const, svg: await qrSvg(paypal), detail: settings!.paypal_link.replace(/^https?:\/\//i, '') }
      : undefined,
    card: card ? { kind: 'card' as const, svg: await qrSvg(card), detail: settings!.card_link.replace(/^https?:\/\//i, '') } : undefined,
    bank: bankRows.length
      ? { kind: 'bank' as const, rows: bankRows }
      : undefined
  };

  return (
    <TrackerClient
      qrCodes={qrCodes}
      goal={Number(totals?.goal_sek ?? 0)}
      raised={demo ? 3250000 : publicRaised(totals)}
      refreshProgress={!demo}
      initialDonations={demo ? demoDonations() : donations ?? []}
      subtitle={null}
      isLive={settings?.is_live ?? true}
      pausedMessage={settings?.paused_message ?? null}
    />
  );
}
