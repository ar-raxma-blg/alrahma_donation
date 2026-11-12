import BroadcastPanel from '@/components/BroadcastPanel';
import { Card } from '@/components/admin/ui';
import PanelHeader, { adminPanelLayout } from '@/components/admin/PanelHeader';
import { getAdminUser } from '@/lib/auth';

export default async function Page() {
  if (!await getAdminUser('owner')) return <section className={adminPanelLayout}>
    <PanelHeader category="Kommunikation" title="Utskick" description="Endast Owner får se mottagare och skicka meddelanden." />
    <Card className="text-sm">Be en Owner att kontakta dig om ett utskick behöver göras.</Card>
  </section>;
  return <BroadcastPanel />;
}
