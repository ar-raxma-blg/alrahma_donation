import QRCode from 'qrcode';

// Swish deep link — scanning it in the Swish app opens a payment to this
// number with the amount left editable.
export function swishUrl(number: string): string | null {
  const digits = number.replace(/\D/g, '');
  if (!digits) return null;
  return `https://app.swish.nu/1/p/sw/?sw=${digits}&cur=SEK&edit=amt,msg`;
}

// Accepts "https://paypal.me/name", "paypal.me/name" or just "name".
export function paypalUrl(link: string): string | null {
  const v = link.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^(www\.)?paypal\.me\//i.test(v)) return `https://${v}`;
  return `https://www.paypal.com/paypalme/${encodeURIComponent(v)}`;
}

export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
}
