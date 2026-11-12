import { headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/server';

export interface AuditEntry {
  user: { id: string; name: string };
  action: string;
  objectType: string;
  objectId?: string;
  objectLabel?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

// Every server action that changes data calls this. The table is append-only
// (see supabase/phase1.sql), so entries can never be edited or removed.
export async function writeAudit(e: AuditEntry) {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const { error } = await supabaseAdmin().from('audit_log').insert({
    user_id: e.user.id,
    user_name: e.user.name,
    action: e.action,
    object_type: e.objectType,
    object_id: e.objectId ?? null,
    object_label: e.objectLabel ?? null,
    changes: e.changes ?? null,
    ip
  });
  if (error) throw new Error(`Audit log write failed: ${error.message}`);
}

export function diff<T extends Record<string, unknown>>(before: T | null, after: T, fields: (keyof T)[]) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of fields) {
    const a = before ? before[f] : null;
    if (JSON.stringify(a) !== JSON.stringify(after[f])) out[f as string] = { from: a, to: after[f] };
  }
  return out;
}
