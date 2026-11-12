const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', 'module', code)(id => {
    if (id in mocks) return mocks[id];
    if (id.startsWith('./')) return load(path.join(path.dirname(file), `${id}.ts`), mocks);
    if (id.startsWith('@/')) { const p = id.slice(2); return load(`${p}.${fs.existsSync(`${p}.ts`) ? 'ts' : 'tsx'}`, mocks); }
    return require(id);
  }, mod.exports, mod);
  return mod.exports;
}
const { classifyProviderFailure, readBroadcastDiagnostics } = load('lib/broadcast-diagnostics.ts');
for (const [status, body, expected] of [
  [403, 'Insufficient credit for this request', 'insufficient_credit'],
  [403, 'Account restricted', 'restricted'], [403, '', 'restricted'],
  [401, '', 'authentication'], [402, '', 'billing'], [429, '', 'rate_limit'],
  [503, '', 'provider_unavailable'], [400, 'Invalid recipient number +46700000000', 'invalid_number'],
  [400, 'Invalid sender', 'invalid_sender'], [422, '', 'invalid_request'], [418, '', 'unknown']
]) assert.equal(classifyProviderFailure(status, body), expected);
assert.equal(readBroadcastDiagnostics({ failures: [{ code: 'made-up', count: 1 }] }), null);
assert.equal(readBroadcastDiagnostics({ failures: [{ code: 'restricted', count: -1 }] }), null);
const privateDiagnostic = { failures: [{ code: 'restricted', count: 1, httpStatus: 403, phone: 'PRIVATE-PHONE' }], balanceAfter: null, rawBody: 'PRIVATE-TEXT' };
assert.ok(!JSON.stringify(readBroadcastDiagnostics(privateDiagnostic)).includes('PRIVATE'));

(async () => {
  Object.assign(process.env, { ELKS_API_USERNAME: 'test', ELKS_API_PASSWORD: 'test', ELKS_FROM: 'AlRahma' });
  const { sendSms, estimateSms } = load('lib/broadcast.ts');
  global.fetch = async () => ({ ok: false, status: 403, text: async () => 'Insufficient credit PRIVATE-PHONE PRIVATE-TEXT' });
  const rejection = await sendSms('+46700000000', 'test');
  assert.equal(rejection.failureCode, 'insufficient_credit');
  assert.ok(!JSON.stringify(rejection).includes('PRIVATE'));
  await assert.rejects(estimateSms('+46700000000', 'test'), /Otillräckligt saldo/);
  global.fetch = async () => { throw new Error('network SECRET'); };
  const uncertain = await sendSms('+46700000000', 'test');
  assert.equal(uncertain.failureCode, 'connection_unknown');
  assert.ok(!JSON.stringify(uncertain).includes('SECRET'));

  const id = '11111111-1111-4111-8111-111111111111';
  let outcome = rejection;
  let auditFails = false;
  let duplicate = false;
  let sends = 0;
  let audits = [];
  let savedLog;
  const db = { from: table => {
    if (table === 'broadcast_log') return {
      insert: value => { savedLog = value; return { select: () => ({ single: async () => duplicate ? { error: { code: '23505' } } : { data: { id }, error: null } }) }; },
      update: value => ({ eq: async () => { savedLog = { ...savedLog, ...value }; return { error: null }; } }),
      select: () => ({ order: () => ({ limit: async () => ({ data: [{ ...savedLog, id }], error: null }) }) })
    };
    if (table === 'notification_templates') return { select: () => ({ eq: () => ({ not: () => ({ not: async () => ({ data: [], error: null }) }) }) }) };
    if (table === 'audit_log') return { select: () => ({ eq: () => ({ eq: () => ({ in: async () => ({ data: audits.map(a => ({ object_id: a.objectId, changes: a.changes })), error: null }) }) }) }) };
    throw new Error(`Unexpected table ${table}`);
  } };
  const { NextRequest } = require('next/server');
  const route = load('app/api/admin/broadcast/route.ts', {
    '@/lib/auth': { requireAdmin: async () => null, getAdminUser: async () => ({ id, name: 'Test Owner' }) },
    '@/lib/supabase/server': { supabaseAdmin: () => db },
    '@/lib/admin/audit': { writeAudit: async entry => { if (auditFails) throw new Error('audit offline'); audits.push(entry); } },
    '@/lib/broadcast-server': { loadBroadcastRecipients: async () => [{ id: `legacy:${id}`, phone: '+46700000000', email: '', comm_sms: true, comm_opt_out: false }] },
    '@/lib/broadcast': { providerStatus: () => ({ sms: true }), sendSms: async () => { sends++; return outcome; }, elksBalance: async () => ({ balance: 0, currency: 'SEK' }) }
  });
  const request = () => new NextRequest('http://localhost/api/admin/broadcast', { method: 'POST', body: JSON.stringify({ channel: 'sms', donorIds: [`legacy:${id}`], message: 'test', batchId: id }) });
  let result = await (await route.POST(request())).json();
  assert.equal(result.failed, 1);
  assert.equal(result.diagnostics.failures[0].code, 'insufficient_credit');
  assert.equal(result.diagnostics.balanceAfter.balance, 0);
  assert.equal(audits[0].action, 'broadcast.result');
  assert.ok(!JSON.stringify(audits).includes('+467'));
  const history = await (await route.GET(new NextRequest('http://localhost/api/admin/broadcast'))).json();
  assert.deepEqual(history.log[0].diagnostics, result.diagnostics);
  duplicate = true;
  assert.equal((await route.POST(request())).status, 409);
  assert.equal(sends, 1, 'duplicate batch must not resend');
  duplicate = false; auditFails = true; outcome = uncertain;
  result = await (await route.POST(request())).json();
  assert.equal(result.auditWarning, true);
  assert.equal(result.diagnostics.failures[0].code, 'connection_unknown');

  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const Details = load('components/admin/BroadcastFailureDetails.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Details, { diagnostics: result.diagnostics }));
  assert.ok(html.includes('Meddelandet kan ha skickats'));
  assert.ok(html.includes('46elks-saldo efter försöket'));
  assert.ok(!html.includes('+467'));
  console.log('Broadcast diagnostics: safe provider categories, unknown outcomes, persisted failure/balance details, duplicate protection and UI passed. No real messages sent.');
})().catch(error => { console.error(error); process.exitCode = 1; });
