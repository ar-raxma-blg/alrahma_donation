import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getAdminUser, requireAdmin } from '@/lib/auth';
import { elksBalance, providerStatus, sendSms, sendEmail, sendWhatsApp } from '@/lib/broadcast';
import { BroadcastDiagnostics, BroadcastFailure, readBroadcastDiagnostics } from '@/lib/broadcast-diagnostics';
import { writeAudit } from '@/lib/admin/audit';
import { Channel } from '@/lib/communication';
import { loadBroadcastRecipients } from '@/lib/broadcast-server';
import { broadcastAddresses, recipientId } from '@/lib/broadcast-targets';

export const maxDuration = 60;
const batchIdFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  const db = supabaseAdmin();
  const [history, templates, recipients] = await Promise.all([
    db.from('broadcast_log').select('*').order('created_at', { ascending: false }).limit(50),
    db.from('notification_templates').select('id, language, body, provider_name, provider_language').eq('approval_status', 'approved').not('provider_name', 'is', null).not('provider_language', 'is', null),
    loadBroadcastRecipients()
  ]);
  if (history.error || templates.error) return NextResponse.json({ error: 'Utskick är inte redo. Kontrollera databasen.' }, { status: 503 });
  const ids = history.data.map(entry => entry.id);
  const details = ids.length ? await db.from('audit_log').select('object_id, changes').eq('action', 'broadcast.result').eq('object_type', 'broadcast').in('object_id', ids) : { data: [], error: null };
  const diagnostics = new Map((details.data ?? []).map(entry => [entry.object_id, readBroadcastDiagnostics(entry.changes?.diagnostics?.to)]));
  // Templates needing pledge variables belong to the donation notification queue.
  return NextResponse.json({ log: history.data.map(entry => ({ ...entry, diagnostics: diagnostics.get(entry.id) ?? null })), diagnosticHistoryWarning: !!details.error, providers: providerStatus(), recipients, templates: templates.data.filter(t => !t.body.includes('{{')) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req, 'owner');
  if (guard) return guard;
  let input;
  try { input = await req.json(); } catch { return NextResponse.json({ error: 'Ogiltigt meddelande.' }, { status: 400 }); }
  const { channel, message, donorIds, templateId, language, batchId } = input || {};
  if (!['sms','email','whatsapp'].includes(channel) || !Array.isArray(donorIds) || !donorIds.length || donorIds.length > 50 || donorIds.some(id => typeof id !== 'string' || !recipientId.test(id)) ||
    typeof batchId !== 'string' || !batchIdFormat.test(batchId) ||
    (channel !== 'whatsapp' && (typeof message !== 'string' || !message.trim() || message.length > (channel === 'sms' ? 480 : 4000)))) {
    return NextResponse.json({ error: 'Välj upp till 50 givare och ange ett giltigt meddelande.' }, { status: 400 });
  }
  const kind = channel as Channel;
  const user = await getAdminUser('owner');
  if (!user) return NextResponse.json({ error: 'Du är inte inloggad som Owner.' }, { status: 403 });
  if (!providerStatus()[kind]) return NextResponse.json({ error: `${channel === 'whatsapp' ? 'WhatsApp väntar på Meta och API-inställningar' : 'Leverantören är inte konfigurerad'}. Inget skickades.` }, { status: 503 });
  const db = supabaseAdmin();
  let template = null;
  if (kind === 'whatsapp') {
    const { data, error } = await db.from('notification_templates').select('*').eq('id', templateId || '').eq('language', language || '').eq('approval_status', 'approved').single();
    if (error || !data?.provider_name || !data.provider_language || data.body.includes('{{')) return NextResponse.json({ error: 'Välj en godkänd WhatsApp-mall utan variabler.' }, { status: 400 });
    template = data;
  }
  let donors;
  try { donors = await loadBroadcastRecipients(donorIds); }
  catch { return NextResponse.json({ error: 'Kunde inte läsa givarnas val.' }, { status: 500 }); }
  const { addresses, excludedNonSwedish } = broadcastAddresses(donors, kind, language);
  if (!addresses.length) return NextResponse.json({ error: kind === 'sms' ? 'Inga valda givare har ett giltigt svenskt nummer (+46). Inget SMS skickades.' : 'Inga mottagare har valt denna kanal med giltiga kontaktuppgifter.' }, { status: 400 });
  const { data: log, error: logError } = await db.from('broadcast_log').insert({ id: batchId, channel, message: template?.body || message.trim(), recipient_count: addresses.length, simulated: false, status: 'sending' }).select().single();
  if (logError?.code === '23505') return NextResponse.json({ error: 'Utskicket har redan startats. Kontrollera historiken och 46elks innan du försöker igen.' }, { status: 409 });
  if (logError) return NextResponse.json({ error: 'Kunde inte skapa utskicksloggen. Inget skickades.' }, { status: 500 });
  let accepted = 0;
  const failures: BroadcastFailure[] = [];
  for (let i = 0; i < addresses.length; i += 10) {
    const results = await Promise.all(addresses.slice(i, i + 10).map(address =>
      kind === 'sms' ? sendSms(address, message.trim()) : kind === 'email' ? sendEmail(address, 'Al-Rahma — donationsuppdatering', message.trim()) : sendWhatsApp(address, template.provider_name, template.provider_language)
    ));
    accepted += results.filter(result => result.ok).length;
    for (const result of results.filter(result => !result.ok)) {
      const code = result.failureCode ?? 'unknown';
      const existing = failures.find(f => f.code === code && f.httpStatus === result.httpStatus);
      if (existing) existing.count++;
      else failures.push({ code, count: 1, ...(result.httpStatus === undefined ? {} : { httpStatus: result.httpStatus }) });
    }
  }
  const failed = addresses.length - accepted;
  const { error: auditError } = await db.from('broadcast_log').update({ accepted_count: accepted, failed_count: failed, status: accepted === 0 ? 'failed' : failed ? 'partial' : 'accepted' }).eq('id', log.id);
  const diagnostics: BroadcastDiagnostics = { failures, balanceAfter: null };
  if (kind === 'sms' && failed) {
    try { diagnostics.balanceAfter = { ...await elksBalance(), checkedAt: new Date().toISOString() }; } catch {}
  }
  let diagnosticWarning = false;
  try { await writeAudit({ user, action: 'broadcast.result', objectType: 'broadcast', objectId: log.id, changes: { diagnostics: { from: null, to: diagnostics } } }); }
  catch { diagnosticWarning = true; }
  return NextResponse.json({ accepted, failed, excludedNonSwedish, diagnostics, auditWarning: !!auditError || diagnosticWarning });
}
