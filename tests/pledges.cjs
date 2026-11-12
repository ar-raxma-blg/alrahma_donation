const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');const {fixtureClient}=require('../scripts/fixture-client.cjs');
function load(file,mocks){const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','exports','module',code)(id=>{if(id in mocks)return mocks[id];if(id.startsWith('@/')||id.startsWith('.'))return load((id.startsWith('@/')?id.slice(2):path.resolve(path.dirname(file),id))+'.ts',mocks);return require(id);},mod.exports,mod);return mod.exports;}
(async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as 'select null::uuid'; create schema storage; create table storage.buckets(id text primary key, name text, public boolean); create publication supabase_realtime;");
 await db.exec(fs.readFileSync('supabase/setup.sql','utf8').replace(/create extension if not exists "pgcrypto";/i,''));
 const A='aaaaaaaa-1111-4111-8111-111111111111',B='bbbbbbbb-2222-4222-8222-222222222222';
 await db.query("insert into auth.users values ($1),($2)",[A,B]);await db.query("insert into admins(user_id,role) values ($1,'owner'),($2,'owner')",[A,B]);
 let actor={id:A,name:'Fixture Admin'};const client=fixtureClient(db);
 const mocks={'@/lib/supabase/server':{supabaseAdmin:()=>client},'@/lib/auth':{getAdminUser:async()=>actor},'next/cache':{revalidatePath:()=>{}},'next/headers':{headers:async()=>new Headers()}};
 const pledges=load('app/admin/(panel)/loften/actions.ts',mocks),txs=load('app/admin/(panel)/transaktioner/actions.ts',mocks),{pledgeState}=load('lib/admin/pledges.ts',mocks);
 const payload={new_donor:{full_name:'Fixture Pledge',phone:'0700000000',email:'',consent_storage:true,consent_contact:false},total_sek:1000,reminders:false,installments:[{due_on:'2026-11-01',amount_sek:500},{due_on:'2026-12-01',amount_sek:500}]};
 assert.equal((await db.query('select count(*) n from campaigns')).rows[0].n,0);
 assert.equal((await pledges.createPledge({...payload,installments:[{due_on:'2026-02-30',amount_sek:1000}]})).ok,false);
 actor=null;assert.equal((await pledges.createPledge(payload)).ok,false);actor={id:A,name:'Fixture Admin'};
 const created=await pledges.createPledge(payload);assert.equal(created.ok,true,created.error);const id=created.id;
 let rows=(await client.from('installment_balances').select('*').eq('pledge_id',id).order('seq')).data;
 const campaign=(await db.query('select * from campaigns')).rows[0];assert.equal(campaign.status,'draft');assert.equal(campaign.slug,'al-rahma-main');
 assert.equal((await pledges.createPledge(payload)).ok,true);assert.equal((await db.query('select count(*) n from campaigns')).rows[0].n,1);
 const payment=async(amount,inst,patch={})=>{const fd=new FormData();Object.entries({amount_sek:String(amount),received_on:'2026-11-01',method:'bank_transfer',installment_id:inst,...patch}).forEach(([k,v])=>fd.set(k,v));return txs.createManualTransaction(fd);};
 assert.equal((await payment(501,rows[0].installment_id)).ok,false);
 assert.equal((await payment(100,rows[0].installment_id,{received_on:'2026-02-30'})).ok,false);
 const partial=await payment(200,rows[0].installment_id);assert.equal(partial.ok,true,partial.error);
 assert.equal((await db.query('select paid_sek from installment_balances where installment_id=$1',[rows[0].installment_id])).rows[0].paid_sek,0);
 assert.equal((await txs.decideTransaction(partial.id,'approve')).ok,false);
 actor={id:B,name:'Second Admin'};assert.equal((await txs.decideTransaction(partial.id,'approve')).ok,true);
 rows=(await client.from('installment_balances').select('*').eq('pledge_id',id).order('seq')).data;assert.equal(rows[0].paid_sek,200);assert.equal(rows[0].outstanding_sek,300);assert.equal(pledgeState('active',rows,'2026-11-12'),'overdue');
 for(const row of rows){actor={id:A,name:'Fixture Admin'};const r=await payment(row.outstanding_sek,row.installment_id);assert.equal(r.ok,true,r.error);actor={id:B,name:'Second Admin'};assert.equal((await txs.decideTransaction(r.id,'approve')).ok,true);}
 rows=(await client.from('installment_balances').select('*').eq('pledge_id',id).order('seq')).data;assert.equal(pledgeState('active',rows,'2026-11-12'),'fulfilled');assert.equal(rows.reduce((n,r)=>n+r.paid_sek,0),1000);
 assert.equal((await txs.refundTransaction(partial.id,'Fixture refund')).ok,true);rows=(await client.from('installment_balances').select('*').eq('pledge_id',id).order('seq')).data;assert.equal(rows[0].outstanding_sek,200);
 assert.equal((await pledges.cancelPledge(id,'Fixture cancellation')).ok,true);assert.equal((await payment(100,rows[0].installment_id)).ok,false);
 assert.equal(pledgeState('active',[],'2026-11-12'),'on_plan');
 assert.ok((await db.query('select count(*) n from audit_log')).rows[0].n>0);
 console.log('Pledges: no campaign setup, validation/auth, manual partial payments, independent approval, completion, refund and cancellation passed in isolated PostgreSQL.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
