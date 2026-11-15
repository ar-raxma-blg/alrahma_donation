import TranslationEditor from '@/components/admin/TranslationEditor';
import { getAdminUser } from '@/lib/auth';
import { Card } from '@/components/admin/ui';
import PanelHeader, { adminPanelLayout } from '@/components/admin/PanelHeader';
import { translations } from '@/lib/i18n';
import { LOCKED_KEYS } from '@/lib/translations';

export default async function Page() {
  if (!await getAdminUser('owner')) return <section className={adminPanelLayout}><PanelHeader category="Inställningar" title="Texter & språk" description="Endast Owner får ändra hemsidans texter." /><Card>Kontakta en Owner om en text behöver ändras.</Card></section>;
  return <TranslationEditor defaults={translations} locked={LOCKED_KEYS} />;
}
