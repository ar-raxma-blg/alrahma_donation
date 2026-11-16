import { Card, PageHead } from '@/components/admin/ui';
import { supabaseAdmin } from '@/lib/supabase/server';

const ACTION_SV: Record<string, string> = {
  'campaign.create': 'Skapade kampanj',
  'campaign.update': 'Ändrade kampanj',
  'campaign.delete': 'Tog bort kampanj',
  'transaction.register': 'Registrerade gåva',
  'transaction.approve': 'Godkände transaktion',
  'transaction.reject': 'Avvisade transaktion',
  'transaction.refund': 'Återbetalade transaktion',
  'transaction.import': 'Importerade transaktioner',
  'pledge.create': 'Skapade löfte',
  'pledge.update': 'Ändrade löfte',
  'pledge.cancel': 'Avbröt löfte',
  'homepage.update': 'Ändrade hemsidans inställningar',
  'homepage.live_feed': 'Ändrade live-donationer',
  'translation.update': 'Ändrade text'
};

type Change = { from: unknown; to: unknown };
const show = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '–';
  return (typeof v === 'object' ? JSON.stringify(v) : String(v)).slice(0, 60);
};
// Nested changes (e.g. payment details) are flattened to one line per field,
// and fields that did not change are left out.
function flatten(changes: Record<string, Change>): [string, Change][] {
  const out: [string, Change][] = [];
  for (const [key, c] of Object.entries(changes)) {
    const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
    if (isObj(c.to)) {
      const from = isObj(c.from) ? c.from : {};
      for (const [k, v] of Object.entries(c.to)) {
        if (JSON.stringify(from[k] ?? null) !== JSON.stringify(v ?? null)) out.push([`${key}.${k}`, { from: from[k], to: v }]);
      }
    } else if (JSON.stringify(c.from ?? null) !== JSON.stringify(c.to ?? null)) out.push([key, c]);
  }
  return out;
}

export default async function Log() {
  const { data } = await supabaseAdmin().from('audit_log').select('*').order('at', { ascending: false }).limit(200);
  const rows = data ?? [];

  return (
    <div>
      <PageHead title="Logg" sub="Vem gjorde vad och när. Loggen kan inte ändras eller raderas." />
      {rows.length === 0 ? (
        <Card className="text-sm text-mosque-ink/60">Inget har loggats än. Ändringar i kampanjer dyker upp här.</Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-mosque-cream text-left text-xs text-mosque-ink/60">
              <tr><th className="p-3">Tid</th><th className="p-3">Användare</th><th className="p-3">Händelse</th><th className="p-3">Ändringar</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-mosque-ink/10 align-top">
                  <td className="whitespace-nowrap p-3 text-mosque-ink/60">{new Date(r.at).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="p-3">{r.user_name}</td>
                  <td className="p-3"><b>{ACTION_SV[r.action] ?? r.action}</b><div className="text-xs text-mosque-ink/50">{r.object_label}</div></td>
                  <td className="p-3">
                    {r.changes && Object.keys(r.changes).length ? (() => {
                      const items = flatten(r.changes as Record<string, Change>);
                      return items.length ? (
                        <ul className="space-y-0.5 text-xs">
                          {items.map(([k, c]) => (
                            <li key={k}><span className="font-mono text-mosque-ink/60">{k}</span>: <span className="text-red-700 line-through">{show(c.from)}</span> → <span className="text-emerald-800">{show(c.to)}</span></li>
                          ))}
                        </ul>
                      ) : <span className="text-xs text-mosque-ink/50">Inga värden ändrades</span>;
                    })() : <span className="text-mosque-ink/40">–</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
