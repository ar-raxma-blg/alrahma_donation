'use server';

import { mainCollectionId } from '@/lib/admin/main-collection';
import { stockholmToday } from '@/lib/admin/dates';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { writeAudit } from '@/lib/admin/audit';
import { getAdminUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/server';

type Fail = { ok: false; error: string };
export type Result<T = object> = ({ ok: true } & T) | Fail;

const date = z.iso.date('Ange ett giltigt datum.');
const firstName = z
  .string()
  .trim()
  .max(40)
  .transform((s) => s.split(/\s+/)[0] ?? '') // never store a surname in the public name
  .optional();

const manualSchema = z.object({
  campaign_id: z.string().uuid().optional(),
  amount_sek: z.coerce.number({ error: 'Ange beloppet i hela kronor.' }).int('Ange beloppet i hela kronor.').positive('Beloppet måste vara större än 0 kr.').max(100_000_000),
  received_on: date,
  method: z.enum(['cash', 'bank_transfer'], { error: 'Välj kontant eller banköverföring.' }),
  receipt_no: z.string().trim().max(40).optional(),
  received_by_name: z.string().trim().max(60).optional(),
  display_name: firstName,
  donor_id: z.string().uuid().optional(),
  installment_id: z.string().uuid().optional()
});

const blank = (v: FormDataEntryValue | null) => (typeof v === 'string' && v.trim() ? v : undefined);

function receiptDupMessage(code?: string) {
  return code === '23505' ? 'Kvittonumret är redan bokfört i den här kampanjen.' : null;
}

export async function createManualTransaction(fd: FormData): Promise<Result<{ id: string }>> {
  const user = await getAdminUser();
  if (!user) return { ok: false, error: 'Du är inte inloggad som admin.' };

  const parsed = manualSchema.safeParse({
    campaign_id: blank(fd.get('campaign_id')),
    amount_sek: fd.get('amount_sek'),
    received_on: fd.get('received_on'),
    method: fd.get('method'),
    receipt_no: blank(fd.get('receipt_no')),
    received_by_name: blank(fd.get('received_by_name')),
    display_name: blank(fd.get('display_name')),
    donor_id: blank(fd.get('donor_id')),
    installment_id: blank(fd.get('installment_id'))
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const db = supabaseAdmin();

  if (v.received_on > stockholmToday()) return { ok: false, error: 'Betalningsdatum får inte ligga i framtiden.' };
  let campaign_id = v.campaign_id;
  let donor_id = v.donor_id ?? null;
  if (v.installment_id) {
    const { data: inst } = await db
      .from('pledge_installments')
      .select('id, pledge:pledges(campaign_id, donor_id, status)')
      .eq('id', v.installment_id)
      .single();
    const pledge = inst?.pledge as unknown as { campaign_id: string; donor_id: string; status: string } | null;
    if (!pledge) return { ok: false, error: 'Delbetalningen finns inte.' };
    if (pledge.status !== 'active') return { ok: false, error: 'Löftet är avbrutet.' };
    if (campaign_id && pledge.campaign_id !== campaign_id) return { ok: false, error: 'Löftet tillhör en annan kampanj än gåvan.' };
    donor_id = pledge.donor_id;
    campaign_id = pledge.campaign_id;
    const { data: balance, error: balanceError } = await db.from('installment_balances').select('outstanding_sek').eq('installment_id', v.installment_id).single();
    if (balanceError || !balance) return { ok: false, error: 'Kunde inte läsa delbetalningens saldo.' };
    if (v.amount_sek > balance.outstanding_sek) return { ok: false, error: 'Beloppet överstiger vad som återstår på delbetalningen.' };
  }

  if (!campaign_id) {
    try { campaign_id = await mainCollectionId(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Kunde inte förbereda insamlingen.' }; }
  }

  const { data, error } = await db
    .from('transactions')
    .insert({
      campaign_id,
      amount_sek: v.amount_sek,
      received_on: v.received_on,
      method: v.method,
      status: 'awaiting_approval',
      donor_id,
      display_name: v.display_name || null,
      installment_id: v.installment_id ?? null,
      receipt_no: v.receipt_no ?? null,
      received_by_name: v.received_by_name ?? null,
      registered_by: user.id
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: receiptDupMessage(error.code) ?? error.message };

  await writeAudit({
    user,
    action: 'transaction.register',
    objectType: 'transaction',
    objectId: data.id,
    objectLabel: `${v.amount_sek} kr, ${v.method}`,
    changes: { status: { from: null, to: 'awaiting_approval' }, amount_sek: { from: null, to: v.amount_sek } }
  });
  revalidatePath('/admin', 'layout');
  return { ok: true, id: data.id };
}

// ---------------------------------------------------------------- approval
export async function decideTransaction(id: string, decision: 'approve' | 'reject', note?: string): Promise<Result> {
  const user = await getAdminUser();
  if (!user) return { ok: false, error: 'Du är inte inloggad som admin.' };

  const db = supabaseAdmin();
  const { data: tx } = await db.from('transactions').select('id, status, registered_by, amount_sek, installment_id').eq('id', id).single();
  if (!tx) return { ok: false, error: 'Transaktionen finns inte.' };
  if (tx.status !== 'awaiting_approval') return { ok: false, error: 'Transaktionen väntar inte längre på godkännande.' };

  if (decision === 'approve') {
    if (tx.registered_by === user.id) return { ok: false, error: 'Du registrerade den här transaktionen. En annan admin måste godkänna den.' };
    if (tx.installment_id) {
      const { data: balance, error: balanceError } = await db.from('installment_balances').select('outstanding_sek, pledge_status').eq('installment_id', tx.installment_id).single();
      if (balanceError || !balance) return { ok: false, error: 'Kunde inte läsa delbetalningens saldo.' };
      if (balance.pledge_status !== 'active' || tx.amount_sek > balance.outstanding_sek) return { ok: false, error: 'Löftet är avbrutet eller betalningen överstiger aktuellt återstående belopp.' };
    }
    const { error } = await db
      .from('transactions')
      .update({ status: 'confirmed', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'awaiting_approval');
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await db.from('transactions').update({ status: 'rejected' }).eq('id', id).eq('status', 'awaiting_approval');
    if (error) return { ok: false, error: error.message };
  }

  await writeAudit({
    user,
    action: decision === 'approve' ? 'transaction.approve' : 'transaction.reject',
    objectType: 'transaction',
    objectId: id,
    objectLabel: `${tx.amount_sek} kr`,
    changes: { status: { from: 'awaiting_approval', to: decision === 'approve' ? 'confirmed' : 'rejected' }, ...(note ? { note: { from: null, to: note } } : {}) }
  });
  revalidatePath('/admin', 'layout');
  return { ok: true };
}

export async function refundTransaction(id: string, reason: string): Promise<Result> {
  const user = await getAdminUser();
  if (!user) return { ok: false, error: 'Du är inte inloggad som admin.' };
  const why = reason.trim();
  if (why.length < 3) return { ok: false, error: 'Ange en anledning till återbetalningen.' };

  const db = supabaseAdmin();
  const { data: tx } = await db.from('transactions').select('id, status, amount_sek').eq('id', id).single();
  if (!tx) return { ok: false, error: 'Transaktionen finns inte.' };
  if (tx.status !== 'confirmed') return { ok: false, error: 'Bara bekräftade transaktioner kan återbetalas.' };

  const { error } = await db.from('transactions').update({ status: 'refunded', refund_reason: why }).eq('id', id).eq('status', 'confirmed');
  if (error) return { ok: false, error: error.message };

  await writeAudit({
    user,
    action: 'transaction.refund',
    objectType: 'transaction',
    objectId: id,
    objectLabel: `${tx.amount_sek} kr`,
    changes: { status: { from: 'confirmed', to: 'refunded' }, refund_reason: { from: null, to: why } }
  });
  revalidatePath('/admin', 'layout');
  return { ok: true };
}

// ------------------------------------------------------------- CSV import
export interface ImportRow {
  received_on: string;
  amount_sek: number | string;
  display_name?: string;
  receipt_no?: string;
  method?: string;
}
export interface RowCheck {
  error?: string;
  duplicate?: string;
}

const METHOD_ALIASES: Record<string, 'cash' | 'bank_transfer' | 'import'> = {
  kontant: 'cash',
  cash: 'cash',
  bank: 'bank_transfer',
  'banköverföring': 'bank_transfer',
  bank_transfer: 'bank_transfer',
  bankgiro: 'bank_transfer',
  '': 'import'
};

const importRowSchema = z.object({
  received_on: date,
  amount_sek: z.coerce.number().int('Beloppet måste vara i hela kronor.').positive('Beloppet måste vara större än 0.').max(100_000_000),
  display_name: firstName,
  receipt_no: z.string().trim().max(40).optional()
});

async function checkRows(campaignId: string, rows: ImportRow[]) {
  const db = supabaseAdmin();
  const parsed = rows.map((r) => {
    const base = importRowSchema.safeParse({
      received_on: r.received_on,
      amount_sek: typeof r.amount_sek === 'string' ? r.amount_sek.replace(/[\s ]|kr/gi, '').replace(',', '.') : r.amount_sek,
      display_name: r.display_name || undefined,
      receipt_no: r.receipt_no || undefined
    });
    const method = METHOD_ALIASES[(r.method ?? '').trim().toLowerCase()];
    if (!base.success) return { check: { error: base.error.issues[0].message } as RowCheck, value: null };
    if (!method) return { check: { error: `Okänt betalsätt “${r.method}”. Använd Kontant eller Bank.` } as RowCheck, value: null };
    return { check: {} as RowCheck, value: { ...base.data, method } };
  });

  const dates = Array.from(new Set(parsed.flatMap((p) => (p.value ? [p.value.received_on] : []))));
  const { data: existing } = dates.length
    ? await db.from('transactions').select('received_on, amount_sek, receipt_no').eq('campaign_id', campaignId).neq('status', 'rejected').in('received_on', dates)
    : { data: [] as { received_on: string; amount_sek: number; receipt_no: string | null }[] };
  const key = (d: string, a: number, r?: string | null) => (r ? `r|${r}` : `${d}|${a}`);
  const seen = new Set((existing ?? []).map((e) => key(e.received_on, e.amount_sek, e.receipt_no)));
  const seenReceipts = new Set((existing ?? []).filter((e) => e.receipt_no).map((e) => `r|${e.receipt_no}`));

  for (const p of parsed) {
    if (!p.value) continue;
    const k = key(p.value.received_on, p.value.amount_sek, p.value.receipt_no);
    if (seen.has(k) || (p.value.receipt_no && seenReceipts.has(`r|${p.value.receipt_no}`))) {
      p.check.duplicate = p.value.receipt_no ? 'Kvittonumret finns redan.' : 'Samma datum och belopp finns redan.';
    } else {
      seen.add(k);
    }
  }
  return parsed;
}

export async function checkImport(campaignId: string, rows: ImportRow[]): Promise<Result<{ checks: RowCheck[] }>> {
  const user = await getAdminUser();
  if (!user) return { ok: false, error: 'Du är inte inloggad som admin.' };
  if (!z.string().uuid().safeParse(campaignId).success) return { ok: false, error: 'Välj en kampanj.' };
  if (rows.length === 0) return { ok: false, error: 'Filen innehåller inga rader.' };
  if (rows.length > 1000) return { ok: false, error: 'Max 1000 rader per import.' };
  const parsed = await checkRows(campaignId, rows);
  return { ok: true, checks: parsed.map((p) => p.check) };
}

export async function commitImport(campaignId: string, rows: ImportRow[]): Promise<Result<{ imported: number; skipped: number }>> {
  const user = await getAdminUser();
  if (!user) return { ok: false, error: 'Du är inte inloggad som admin.' };
  if (!z.string().uuid().safeParse(campaignId).success) return { ok: false, error: 'Välj en kampanj.' };
  if (rows.length === 0 || rows.length > 1000) return { ok: false, error: 'Antal rader måste vara mellan 1 och 1000.' };

  const parsed = await checkRows(campaignId, rows);
  const batch = randomUUID();
  const good = parsed.flatMap((p) => (p.value && !p.check.error && !p.check.duplicate ? [p.value] : []));
  if (good.length === 0) return { ok: false, error: 'Inga rader kunde importeras. Rätta felen och försök igen.' };

  const { error } = await supabaseAdmin()
    .from('transactions')
    .insert(
      good.map((g) => ({
        campaign_id: campaignId,
        amount_sek: g.amount_sek,
        received_on: g.received_on,
        method: g.method,
        status: 'awaiting_approval',
        display_name: g.display_name || null,
        receipt_no: g.receipt_no || null,
        registered_by: user.id,
        import_batch: batch
      }))
    );
  if (error) return { ok: false, error: receiptDupMessage(error.code) ?? error.message };

  await writeAudit({
    user,
    action: 'transaction.import',
    objectType: 'import_batch',
    objectId: batch,
    objectLabel: `${good.length} rader`,
    changes: { rows: { from: rows.length, to: good.length } }
  });
  revalidatePath('/admin', 'layout');
  return { ok: true, imported: good.length, skipped: rows.length - good.length };
}
