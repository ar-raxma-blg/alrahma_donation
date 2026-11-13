import { Channel } from './communication';
import { BroadcastFailureCode, classifyProviderFailure, FAILURE_INFO } from './broadcast-diagnostics';

type Result = { ok: boolean; simulated: false; error?: string; messageId?: string; failureCode?: BroadcastFailureCode; httpStatus?: number };
export function providerStatus(): Record<Channel, boolean> {
  const e = process.env;
  return {
    sms: !!(e.ELKS_API_USERNAME && e.ELKS_API_PASSWORD && e.ELKS_FROM),
    email: !!(e.RESEND_API_KEY && e.BROADCAST_FROM_EMAIL),
    whatsapp: e.WHATSAPP_ENABLED === 'true' && !!(e.WHATSAPP_ACCESS_TOKEN && e.WHATSAPP_PHONE_NUMBER_ID && e.WHATSAPP_API_VERSION)
  };
}
function elksAuth() {
  return `Basic ${Buffer.from(`${process.env.ELKS_API_USERNAME}:${process.env.ELKS_API_PASSWORD}`).toString('base64')}`;
}
function smsRequest(to: string, body: string, dryrun = false): RequestInit {
  return {
    method: 'POST', headers: { Authorization: elksAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ to, from: process.env.ELKS_FROM!, message: body, ...(dryrun ? { dryrun: 'yes' } : {}) })
  };
}
async function deliver(url: string, init: RequestInit): Promise<Result> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      let body = '';
      if (url.includes('api.46elks.com')) { try { body = await response.text(); } catch {} }
      const failureCode = classifyProviderFailure(response.status, body);
      return { ok: false, simulated: false, error: `Provider HTTP ${response.status}`, failureCode, httpStatus: response.status };
    }
    let messageId: string | undefined;
    if (response.ok && (url.includes('graph.facebook.com') || url.includes('api.46elks.com'))) {
      try { const data = await response.json(); messageId = url.includes('graph.facebook.com') ? data.messages?.[0]?.id : data.id; } catch {}
    }
    return { ok: response.ok, simulated: false, ...(messageId ? { messageId } : {}), ...(response.ok ? {} : { error: `Provider HTTP ${response.status}` }) };
  } catch { return { ok: false, simulated: false, error: 'Provider connection failed', failureCode: 'connection_unknown' }; }
}
export async function sendSms(to: string, body: string): Promise<Result> {
  if (!providerStatus().sms) return { ok: false, simulated: false, error: 'SMS provider is not configured', failureCode: 'not_configured' };
  return deliver('https://api.46elks.com/a1/sms', smsRequest(to, body));
}
export async function estimateSms(to: string, body: string): Promise<{ estimatedCost: number; parts: number }> {
  if (!providerStatus().sms) throw new Error('SMS-leverantören är inte konfigurerad.');
  const response = await fetch('https://api.46elks.com/a1/sms', { ...smsRequest(to, body, true), signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    let body = ''; try { body = await response.text(); } catch {}
    const info = FAILURE_INFO[classifyProviderFailure(response.status, body)];
    throw new Error(`46elks kunde inte uppskatta SMS-kostnaden. ${info.title}. ${info.action} (HTTP ${response.status})`);
  }
  const data = await response.json();
  if (!Number.isSafeInteger(data.estimated_cost) || data.estimated_cost < 0 || !Number.isSafeInteger(data.parts) || data.parts < 1) throw new Error('46elks gav ett ogiltigt kostnadsbesked.');
  return { estimatedCost: data.estimated_cost, parts: data.parts };
}
export async function elksCurrency(): Promise<string> {
  if (!providerStatus().sms) throw new Error('SMS-leverantören är inte konfigurerad.');
  const response = await fetch('https://api.46elks.com/a1/me', { headers: { Authorization: elksAuth() }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Kunde inte läsa kontots valuta hos 46elks.');
  const data = await response.json();
  if (typeof data.currency !== 'string' || !/^[A-Z]{3}$/.test(data.currency)) throw new Error('46elks gav en ogiltig kontovaluta.');
  return data.currency;
}
export async function elksBalance(): Promise<{ currency: string; balance: number }> {
  if (!providerStatus().sms) throw new Error('SMS-leverantören är inte konfigurerad.');
  const response = await fetch('https://api.46elks.com/a1/me', { headers: { Authorization: elksAuth() }, signal: AbortSignal.timeout(10000), cache: 'no-store' });
  if (!response.ok) throw new Error('Kunde inte läsa saldot hos 46elks.');
  const data = await response.json();
  if (typeof data.currency !== 'string' || !/^[A-Z]{3}$/.test(data.currency) || !Number.isSafeInteger(data.balance)) throw new Error('46elks gav ett ogiltigt saldo.');
  return { currency: data.currency, balance: data.balance };
}
export async function estimateSmsBatch(addresses: string[], body: string) {
  const [currency, estimates] = await Promise.all([
    elksCurrency(),
    (async () => {
      const results: Awaited<ReturnType<typeof estimateSms>>[] = [];
      for (let i = 0; i < addresses.length; i += 10) results.push(...await Promise.all(addresses.slice(i, i + 10).map(to => estimateSms(to, body))));
      return results;
    })()
  ]);
  return { currency, estimatedCost: estimates.reduce((sum, item) => sum + item.estimatedCost, 0), parts: estimates.reduce((sum, item) => sum + item.parts, 0), recipients: addresses.length };
}
export async function sendEmail(to: string, subject: string, body: string): Promise<Result> {
  if (!providerStatus().email) return { ok: false, simulated: false, error: 'Email provider is not configured' };
  return deliver('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.BROADCAST_FROM_EMAIL, to, subject, text: body })
  });
}
export async function sendWhatsApp(to: string, template: string, language: string, parameters: string[] = []): Promise<Result> {
  if (!providerStatus().whatsapp) return { ok: false, simulated: false, error: 'WhatsApp is not enabled' };
  const e = process.env;
  return deliver(`https://graph.facebook.com/${e.WHATSAPP_API_VERSION}/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/^\+/, ''), type: 'template', template: { name: template, language: { code: language }, ...(parameters.length ? { components: [{ type: 'body', parameters: parameters.map(text => ({ type: 'text', text })) }] } : {}) } })
  });
}
