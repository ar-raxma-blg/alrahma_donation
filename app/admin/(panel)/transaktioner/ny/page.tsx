import Link from 'next/link';
import { PageHead } from '@/components/admin/ui';
import { stockholmToday } from '@/lib/admin/dates';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/auth';
import NewTransactionForm from './NewTransactionForm';

export default async function NewTransaction({ searchParams }: { searchParams: Promise<{ installment?: string }> }) {
  const { installment } = await searchParams;
  const db = supabaseAdmin();
  const user = await getAdminUser();
  const [{ data: donors, error: donorError }, { data: inst, error: installmentError }] = await Promise.all([
    db.from('donor_profiles').select('id, full_name').is('anonymized_at', null).order('full_name'),
    db
      .from('installment_balances')
      .select('installment_id, pledge_id, campaign_id, seq, due_on, outstanding_sek, pledge:pledges(donor_id, donor:donor_profiles(full_name))')
      .eq('pledge_status', 'active')
      .gt('outstanding_sek', 0)
      .order('due_on')
  ]);

  const installments = (inst ?? []).map((i) => {
    const donor = (i.pledge as unknown as { donor_id: string; donor: { full_name: string } } | null)?.donor?.full_name ?? '';
    return { id: i.installment_id as string, pledge_id: i.pledge_id as string, outstanding_sek: i.outstanding_sek as number, donor_id: (i.pledge as unknown as { donor_id: string } | null)?.donor_id ?? '', campaign_id: i.campaign_id as string, label: `${donor}, delbetalning ${i.seq}, förfaller ${i.due_on}, ${i.outstanding_sek} kr kvar` };
  });

  const unavailable = !!installment && !installments.some(i => i.id === installment);
  return (
    <div>
      <PageHead title="Registrera gåva" sub="För kontanter och banköverföringar. Gåvan räknas inte med förrän en annan admin har godkänt den." action={<Link href="/admin/transaktioner" className="text-sm font-bold underline">Tillbaka</Link>} />
      {donorError || installmentError ? <p role="alert">Kunde inte läsa betalningsuppgifterna. Ladda om sidan och försök igen.</p> : unavailable ? <p role="alert">Delbetalningen är redan betald, avbruten eller finns inte. Öppna löftet igen för aktuellt saldo.</p> : <NewTransactionForm donors={donors ?? []} installments={installments} initialInstallment={installment ?? ''} today={stockholmToday()} me={user?.name ?? ''} />}
    </div>
  );
}
