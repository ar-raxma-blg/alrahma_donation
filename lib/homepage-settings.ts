import { z } from 'zod';

function validIban(value: string) {
  if (!value) return true;
  const iban = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
const text = z.string().trim().max(150, 'Max 150 tecken.');
const httpsLink = z.string().trim().max(500).refine(v => {
  if (!v) return true;
  try { const url = new URL(v); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}, 'Ange en fullständig https-länk.');
const qrImage = z.string().trim().max(1000).refine(v => {
  if (!v) return true;
  try {
    const url = new URL(v);
    const configured = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    return url.origin === configured.origin && url.pathname.startsWith('/storage/v1/object/public/qr-codes/') && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}, 'Välj en bild som laddats upp här.').optional();
export const homepageSchema = z.object({
  swish_number: text.refine(v => !v || /^123\d{7}$/.test(v.replace(/[\s-]/g, '')), 'Ange ett Swish-nummer med 10 siffror som börjar med 123.'),
  paypal_link: httpsLink.refine(v => {
    if (!v) return true;
    try { return ['paypal.me', 'www.paypal.me', 'paypal.com', 'www.paypal.com'].includes(new URL(v).hostname); } catch { return false; }
  }, 'Använd en länk till paypal.me eller paypal.com.'),
  card_link: httpsLink,
  bankgiro: text.refine(v => !v || /^\d{3,4}-?\d{4}$/.test(v.replace(/\s/g, '')), 'Ange ett giltigt Bankgiro.'),
  plusgiro: text.refine(v => !v || /^\d{1,8}-?\d$/.test(v.replace(/\s/g, '')), 'Ange ett giltigt Plusgiro.'),
  iban: text.refine(validIban, 'IBAN-numrets kontrollsiffror stämmer inte.'),
  bic: text.refine(v => !v || /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v.toUpperCase()), 'Ange en giltig BIC/SWIFT-kod.'),
  account_holder: text, bank_name: text, account_number: text,
  swish_qr_url: qrImage, paypal_qr_url: qrImage,
  goal_sek: z.number().int().min(1, 'Målet måste vara större än noll.').max(1_000_000_000),
  raised_sek: z.number().int().min(0, 'Insamlat får inte vara negativt.').max(1_000_000_000),
  expected_settings_at: z.string().datetime({ offset: true }),
  expected_totals_at: z.string().datetime({ offset: true })
}).strict();
