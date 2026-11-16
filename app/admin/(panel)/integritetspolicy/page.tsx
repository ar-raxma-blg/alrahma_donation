import PrivacyEditor from '@/components/admin/PrivacyEditor';
import { getAdminUser } from '@/lib/auth';
import { Card } from '@/components/admin/ui';
import PanelHeader, { adminPanelLayout } from '@/components/admin/PanelHeader';

export default async function Page() {
  if (!await getAdminUser('owner')) return <section className={adminPanelLayout}><PanelHeader category="Inställningar" title="Integritetspolicy" description="Endast Owner får ändra integritetspolicyn." /><Card>Kontakta en Owner om policyn behöver ändras.</Card></section>;
  return <PrivacyEditor />;
}
