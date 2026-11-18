// Invitation-link codes: lowercase letters, digits and dashes, 3-40 characters.
const CODE = /^[a-z0-9-]{3,40}$/;

export function cleanInviteCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toLowerCase();
  return CODE.test(code) ? code : null;
}

export function cleanInviteName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim().slice(0, 80);
  return name || null;
}

// "Ali Hassan" -> "ali-hassan-k3x9". The random tail keeps links unguessable and
// lets two people called Ali have separate channels.
export function makeInviteCode(name: string | null): string {
  const slug = (name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/g, '');
  const tail = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  return `${slug || 'inbjudan'}-${tail}`;
}

export function inviteUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/?ref=${code}`;
}
