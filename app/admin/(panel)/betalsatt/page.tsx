import HomepageSettings from '@/components/admin/HomepageSettings';
import { getAdminUser } from '@/lib/auth';
import { Card } from '@/components/admin/ui';
import PanelHeader, { adminPanelLayout } from '@/components/admin/PanelHeader';

export default async function Page() {
  if (!await getAdminUser('owner')) return <section className={adminPanelLayout}><PanelHeader category="Inställningar" title="Hemsida & betalsätt" description="Endast Owner får ändra hemsidans betaluppgifter och total." /><Card>Kontakta en Owner om uppgifterna behöver ändras.</Card></section>;
  return <HomepageSettings />;
}
