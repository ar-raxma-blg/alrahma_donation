const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');

let role = 'admin';
let signedIn = true;
let missingRole = false;
const client = {
  auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'staff-1', email: 'staff@example.test' } : null } }) },
  from: () => ({ select: columns => ({ eq: () => ({ maybeSingle: async () =>
    missingRole && columns.includes('role') ? { data: null, error: { message: 'column does not exist' } } :
    { data: { user_id: 'staff-1', full_name: 'Staff', role }, error: null }
  }) }) })
};
const mod = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('lib/auth.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
new Function('require', 'exports', 'module', code)(id => {
  if (id === '@supabase/ssr') return { createServerClient: () => client };
  if (id === 'next/headers') return { cookies: async () => ({ getAll: () => [] }) };
  if (id === 'next/server') return { NextResponse: { json: (body, init) => ({ body, status: init.status }) } };
  return require(id);
}, mod.exports, mod);

(async () => {
  const { requireAdmin, getAdminUser } = mod.exports;
  assert.equal(await requireAdmin({}), null);
  assert.equal((await requireAdmin({}, 'owner')).status, 403);
  assert.equal(await getAdminUser('owner'), null);
  role = 'owner';
  assert.equal(await requireAdmin({}, 'owner'), null);
  assert.equal((await getAdminUser('owner')).id, 'staff-1');
  missingRole = true;
  assert.equal((await requireAdmin({}, 'owner')).status, 503);
  assert.equal(await requireAdmin({}), null);
  signedIn = false;
  assert.equal((await requireAdmin({}, 'owner')).status, 401);
  console.log('Owner broadcast authorization passed. No messages sent.');
})().catch(error => { console.error(error); process.exitCode = 1; });
