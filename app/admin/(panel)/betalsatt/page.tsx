import HomepageSettings from '@/components/admin/HomepageSettings';
import ProjectEditor from '@/components/admin/ProjectEditor';
import LiveFeedToggle from '@/components/admin/LiveFeedToggle';
import { getAdminUser } from '@/lib/auth';
import { Card } from '@/components/admin/ui';
import PanelHeader, { adminPanelLayout } from '@/components/admin/PanelHeader';

export default async function Page() {
  if (!await getAdminUser('owner')) return <section className={adminPanelLayout}><PanelHeader category="Inställningar" title="Hemsida & betalsätt" description="Endast Owner får ändra hemsidans betaluppgifter och total." /><Card>Kontakta en Owner om uppgifterna behöver ändras.</Card></section>;
  return <><div className="mx-auto mb-6 max-w-5xl"><LiveFeedToggle /></div><div className="mx-auto mb-6 max-w-5xl"><ProjectEditor /></div><HomepageSettings /></>;
}
