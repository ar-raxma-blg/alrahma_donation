const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
// In-memory PostgreSQL; no Supabase connection or real donor data.
(async () => {
  for (const mode of ['migrations', 'setup']) {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as 'select null::uuid'; create schema storage; create table storage.buckets(id text primary key, name text, public boolean); create publication supabase_realtime;");
    const files = mode === 'setup' ? ['../setup.sql'] : fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = fs.readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/create extension if not exists "pgcrypto";/i, '');
      try { await db.exec(sql); } catch (error) { throw new Error(`${file}: ${error.message}`); }
    }
    await db.exec(fs.readFileSync('supabase/tests/notifications.sql', 'utf8'));
    await db.exec(fs.readFileSync('supabase/tests/installments.sql', 'utf8'));
    await db.exec(fs.readFileSync('supabase/tests/homepage.sql', 'utf8'));
    const privileges = (await db.query("select has_function_privilege('anon','record_installment(uuid,integer,text,date,uuid)','execute') as record, has_function_privilege('authenticated','queue_monthly_reminders()','execute') as queue, has_table_privilege('anon','notification_controls_log','select') as audit")).rows[0];
    assert.deepEqual(privileges, { record: false, queue: false, audit: false });
    await db.exec("insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'); insert into admins(user_id) values ('11111111-1111-4111-8111-111111111111');");
    assert.equal((await db.query("select role from admins where user_id = '11111111-1111-4111-8111-111111111111'")).rows[0].role, 'admin');
    await db.exec("update admins set role = 'owner' where user_id = '11111111-1111-4111-8111-111111111111'");
    assert.equal((await db.query("select role from admins where user_id = '11111111-1111-4111-8111-111111111111'")).rows[0].role, 'owner');
    await assert.rejects(db.exec("update admins set role = 'invalid' where user_id = '11111111-1111-4111-8111-111111111111'"));
    assert.equal((await db.query('select count(*)::int count from donors')).rows[0].count, 0);
    console.log(`${mode}: database assertions passed in isolated PostgreSQL.`);
  } finally { await db.close(); }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
