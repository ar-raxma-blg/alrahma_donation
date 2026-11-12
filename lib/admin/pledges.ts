export type PledgeState = 'on_plan' | 'overdue' | 'fulfilled' | 'cancelled';

export const PLEDGE_STATE_SV: Record<PledgeState, string> = {
  on_plan: 'Enligt plan',
  overdue: 'Försenad',
  fulfilled: 'Uppfyllt',
  cancelled: 'Avbruten'
};

export interface InstallmentBalance {
  installment_id: string;
  pledge_id: string;
  seq: number;
  due_on: string;
  amount_sek: number;
  paid_sek: number;
  outstanding_sek: number;
}

export function pledgeState(status: string, installments: InstallmentBalance[], today: string): PledgeState {
  if (status === 'cancelled') return 'cancelled';
  if (installments.length > 0 && installments.every((i) => i.outstanding_sek === 0)) return 'fulfilled';
  if (installments.some((i) => i.outstanding_sek > 0 && i.due_on < today)) return 'overdue';
  return 'on_plan';
}
