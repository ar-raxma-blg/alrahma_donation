const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');const {fixtureClient}=require('../scripts/fixture-client.cjs');
function load(file,mocks){const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports','module',code)(id=>{if(id in mocks)return mocks[id];if(id.startsWith('@/')||id.startsWith('.')){const target=id.startsWith('@/')?id.slice(2):path.resolve(path.dirname(file),id);return load(target+(fs.existsSync(target+'.ts')?'.ts':'.tsx'),mocks);}return require(id);},mod.exports,mod);return mod.exports;}
(async()=>{const db=new PGlite();try{
 await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as 'select null::uuid'; create schema storage; create table storage.buckets(id text primary key, name text, public boolean); create publication supabase_realtime;");
 await db.exec(fs.readFileSync('supabase/setup.sql','utf8').replace(/create extension if not exists "pgcrypto";/i,''));
 await db.exec("update campaign_totals set opening_raised_sek=25000, goal_sek=100000 where id='main'; insert into campaigns(id,title,slug,goal_sek) values ('aaaaaaaa-1111-4111-8111-111111111111','Fixture','fixture',1);");
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm'}).format(new Date());
 await db.query("insert into transactions(campaign_id,amount_sek,received_on,method,status) values ('aaaaaaaa-1111-4111-8111-111111111111',200,$1,'swish','confirmed'),('aaaaaaaa-1111-4111-8111-111111111111',300,$1,'cash','awaiting_approval')",[today]);
 await db.query("insert into broadcast_log(channel,message,recipient_count,status,failed_count) values ('sms','PRIVATE BODY',1,'failed',1)");
 await db.exec("insert into donor_profiles(id,full_name,phone) values ('bbbbbbbb-2222-4222-8222-222222222222','Fixture donor','0700000000'); insert into pledges(id,campaign_id,donor_id,total_sek,status,cancel_reason) values ('cccccccc-3333-4333-8333-333333333333','aaaaaaaa-1111-4111-8111-111111111111','bbbbbbbb-2222-4222-8222-222222222222',1000,'active',null),('dddddddd-4444-4444-8444-444444444444','aaaaaaaa-1111-4111-8111-111111111111','bbbbbbbb-2222-4222-8222-222222222222',500,'cancelled','Fixture cancellation');");
 await db.query("insert into pledge_installments(id,pledge_id,seq,due_on,amount_sek) values ('eeeeeeee-5555-4555-8555-555555555555','cccccccc-3333-4333-8333-333333333333',1,$1::date-1,500),(gen_random_uuid(),'cccccccc-3333-4333-8333-333333333333',2,$1::date+30,500),(gen_random_uuid(),'dddddddd-4444-4444-8444-444444444444',1,$1::date-1,500)",[today]);
 await db.exec("update transactions set installment_id='eeeeeeee-5555-4555-8555-555555555555' where status='confirmed';");
 const client=fixtureClient(db);let historyReads=0;
 const wrapped={from(table){if(table==='broadcast_log')historyReads++;return client.from(table);}};
 const mocks={'@/lib/supabase/server':{supabaseAdmin:()=>wrapped}};
 const {loadOverviewDashboard}=load('lib/admin/overview.ts',mocks);
 const summary=await loadOverviewDashboard(true);assert.deepEqual(summary.homepage,{raised:25000,goal:100000});assert.equal(summary.operations.monthlyPaid,200);assert.equal(summary.operations.awaiting,1);assert.equal(summary.operations.outstanding,800);assert.equal(summary.operations.overdue,1);assert.equal(summary.broadcasts.length,1);
 const publicRoute=load('app/api/public/progress/route.ts',mocks);assert.deepEqual(await (await publicRoute.GET()).json(),summary.homepage);
 historyReads=0;const limited=await loadOverviewDashboard(false);assert.equal(historyReads,0);assert.equal(limited.broadcasts,null);
 const failure=load('lib/admin/overview.ts',{'@/lib/supabase/server':{supabaseAdmin:()=>({from(table){if(table==='campaign_totals')return {select(){return this;},eq(){return this;},single:async()=>({data:null,error:{message:'offline'}})};return client.from(table);}})}});
 assert.equal((await failure.loadOverviewDashboard(true)).homepage,null);
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const render=async owner=>renderToStaticMarkup(await load('app/admin/(panel)/page.tsx',{'@/lib/auth':{getAdminUser:async()=>owner?{id:'owner'}:null},'@/lib/admin/overview':{loadOverviewDashboard:async()=>summary}}).default());
 const html=await render(true);assert.ok(html.includes('25%'));assert.ok(html.includes('width:25%'));assert.ok(html.includes('/admin/betalsatt#insamling'));assert.ok(html.includes('/admin/betalsatt#betaluppgifter'));assert.ok(html.includes('/admin/utskick'));assert.ok(!html.includes('PRIVATE BODY'));
 const restricted=await render(false);assert.ok(!restricted.includes('/admin/betalsatt'));assert.ok(!restricted.includes('/admin/utskick'));
 console.log('Overview: homepage total/goal/percentage parity, separate payment totals, attention counts, Owner-only history/edit shortcuts and unavailable data passed.');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
