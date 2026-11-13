export type BroadcastFailureCode = 'insufficient_credit' | 'billing' | 'authentication' | 'restricted' | 'invalid_number' | 'invalid_sender' | 'invalid_request' | 'rate_limit' | 'provider_unavailable' | 'connection_unknown' | 'not_configured' | 'unknown';
export type BroadcastFailure = { code: BroadcastFailureCode; count: number; httpStatus?: number };
export type BroadcastDiagnostics = {
  failures: BroadcastFailure[];
  balanceAfter: { currency: string; balance: number; checkedAt: string } | null;
};

export const FAILURE_INFO: Record<BroadcastFailureCode, { title: string; action: string }> = {
  insufficient_credit: { title: 'Otillräckligt saldo enligt leverantören', action: 'Fyll på 46elks-kontot och kontrollera saldot innan ett nytt utskick.' },
  billing: { title: 'Betalning krävs av leverantören', action: 'Kontrollera saldo, fakturor och betalningsmetod hos leverantören.' },
  authentication: { title: 'Leverantören nekade inloggningen', action: 'Be ansvarig utvecklare kontrollera API-uppgifterna.' },
  restricted: { title: 'Kontot får inte skicka detta meddelande', action: 'Kontrollera kontots aktivering, mottagarbegränsningar och avsändare hos leverantören. Detta bekräftar inte saldobrist.' },
  invalid_number: { title: 'Leverantören avvisade mottagarnumret', action: 'Kontrollera att mottagaren har ett giltigt mobilnummer med landskod.' },
  invalid_sender: { title: 'Leverantören avvisade avsändaren', action: 'Be ansvarig utvecklare kontrollera det registrerade avsändarnamnet.' },
  invalid_request: { title: 'Leverantören avvisade meddelandets uppgifter', action: 'Kontrollera nummer, avsändare och meddelande med ansvarig utvecklare.' },
  rate_limit: { title: 'För många förfrågningar till leverantören', action: 'Kontrollera leverantörens historik och begränsningar innan ett nytt försök.' },
  provider_unavailable: { title: 'Leverantören svarade med ett serverfel', action: 'Utfallet kan vara osäkert. Kontrollera leverantörens historik innan ett nytt försök.' },
  connection_unknown: { title: 'Ingen säker bekräftelse från leverantören', action: 'Anslutningen bröts eller tog för lång tid. Meddelandet kan ha skickats. Kontrollera historiken hos leverantören innan du försöker igen.' },
  not_configured: { title: 'Leverantören är inte konfigurerad', action: 'Be ansvarig utvecklare kontrollera anslutningen.' },
  unknown: { title: 'Leverantören avvisade begäran utan en identifierad orsak', action: 'Kontrollera leverantörens historik eller kontakta support. Saldo är inte en bekräftad orsak.' }
};

// Inspect provider text only for known categories; never return/store raw text,
// which can contain phone numbers, credentials or the outgoing message.
export function classifyProviderFailure(status: number, smsBody = ''): BroadcastFailureCode {
  const body = smsBody.slice(0, 2000).toLowerCase();
  if (status === 401) return 'authentication';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'provider_unavailable';
  if (/(insufficient|not enough|too low|out of|no remaining)[\s\S]{0,50}(credit|balance|funds)|(credit|balance|funds)[\s\S]{0,50}(insufficient|too low|exhausted)/.test(body)) return 'insufficient_credit';
  if (/invalid[\s\S]{0,20}(recipient|phone|mobile|number)|(recipient|phone|mobile|number)[\s\S]{0,20}invalid/.test(body)) return 'invalid_number';
  if (/invalid[\s\S]{0,20}(sender|from)|(sender|from)[\s\S]{0,20}(invalid|not allowed)/.test(body)) return 'invalid_sender';
  if (status === 402) return 'billing';
  if (status === 403) return 'restricted';
  if (status === 400 || status === 422) return 'invalid_request';
  return 'unknown';
}

export function readBroadcastDiagnostics(value: unknown): BroadcastDiagnostics | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as BroadcastDiagnostics;
  if (!Array.isArray(raw.failures) || raw.failures.length > 50) return null;
  const failures: BroadcastFailure[] = [];
  for (const f of raw.failures) {
    if (!f || !Object.hasOwn(FAILURE_INFO, f.code) || !Number.isInteger(f.count) || f.count < 1 || f.count > 50 || (f.httpStatus !== undefined && (!Number.isInteger(f.httpStatus) || f.httpStatus < 100 || f.httpStatus > 599))) return null;
    failures.push({ code: f.code, count: f.count, ...(f.httpStatus === undefined ? {} : { httpStatus: f.httpStatus }) });
  }
  const b = raw.balanceAfter;
  return { failures, balanceAfter: b && /^[A-Z]{3}$/.test(b.currency) && Number.isSafeInteger(b.balance) && typeof b.checkedAt === 'string' && !Number.isNaN(Date.parse(b.checkedAt)) ? { currency: b.currency, balance: b.balance, checkedAt: b.checkedAt } : null };
}
