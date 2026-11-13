import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead } from '@/components/admin/ui';
import { Campaign } from '@/lib/admin/types';
import { supabaseAdmin } from '@/lib/supabase/server';
import CampaignForm from '../CampaignForm';

export default async function EditCampaign({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  if (params.id === 'ny') {
    return (
      <div>
        <PageHead title="Ny kampanj" action={<Link href="/admin/kampanjer" className="text-sm font-bold underline">Tillbaka</Link>} />
        <CampaignForm campaign={null} confirmedSek={0} canDelete={false} />
      </div>
    );
  }

  if (!/^[0-9a-f-]{36}$/.test(params.id)) notFound();
  const db = supabaseAdmin();
  const { data } = await db.from('campaigns').select('*').eq('id', params.id).maybeSingle();
  if (!data) notFound();

  const [{ data: stats }, { count: tx }, { count: pl }] = await Promise.all([
    db.from('campaign_stats').select('confirmed_sek').eq('campaign_id', params.id).maybeSingle(),
    db.from('transactions').select('id', { count: 'exact', head: true }).eq('campaign_id', params.id),
    db.from('pledges').select('id', { count: 'exact', head: true }).eq('campaign_id', params.id)
  ]);

  return (
    <div>
      <PageHead title="Redigera kampanj" action={<Link href="/admin/kampanjer" className="text-sm font-bold underline">Tillbaka</Link>} />
      <CampaignForm campaign={data as Campaign} confirmedSek={stats?.confirmed_sek ?? 0} canDelete={(tx ?? 0) + (pl ?? 0) === 0} />
    </div>
  );
}
