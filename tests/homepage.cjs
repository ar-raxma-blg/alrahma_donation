const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require','exports','module',code)(id => {
    if (id in mocks) return mocks[id];
    if (id.startsWith('@/') || id.startsWith('.')) {
      const p = id.startsWith('@/') ? id.slice(2) : path.resolve(path.dirname(file), id);
      return load(`${p}.${fs.existsSync(`${p}.ts`) ? 'ts' : 'tsx'}`, mocks);
    }
    return require(id);
  },mod.exports,mod);
  return mod.exports;
}
const { campaignProgress, publicRaised } = load('lib/homepage.ts');
assert.equal(campaignProgress(25000,100000).percent,25);
assert.equal(campaignProgress(0,100000).barPercent,0);
assert.equal(campaignProgress(150000,100000).barPercent,100);
assert.equal(campaignProgress(150000,100000).displayed,150);
assert.equal(campaignProgress(1,100000).displayed,null);
assert.equal(campaignProgress(99999,100000).displayed,99.9);
assert.equal(campaignProgress(NaN,0).barPercent,0);
assert.equal(publicRaised({raised_sek:1000,opening_raised_sek:24000}),25000);
const { homepageSchema } = load('lib/homepage-settings.ts');
const valid = { swish_number:'1234567890', paypal_link:'https://paypal.me/fixture', card_link:'', bankgiro:'', plusgiro:'', iban:'', bic:'', bank_name:'', account_number:'', account_holder:'', goal_sek:100000, raised_sek:25000, expected_settings_at:'2026-11-12T12:00:00.123456+00:00', expected_totals_at:'2026-11-12T12:00:00Z' };
assert.equal(homepageSchema.safeParse(valid).success,true);
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';
assert.equal(homepageSchema.safeParse({...valid,swish_qr_url:'https://fixture.supabase.co/storage/v1/object/public/qr-codes/swish.png',paypal_qr_url:''}).success,true);
assert.equal(homepageSchema.safeParse({...valid,paypal_qr_url:'https://untrusted.example/qr.png'}).success,false);
for(const patch of [{paypal_link:'invalid'}, {paypal_link:'javascript:alert(1)'}, {paypal_link:'https://evil.test'}, {card_link:'http://example.test'}, {swish_number:'abc'}, {goal_sek:0}, {raised_sek:-1}, {raised_sek:0.5}, {iban:'SE1234567890123456789012'}, {bic:'bad'}, {bankgiro:'123'}, {unexpected:true}]) assert.equal(homepageSchema.safeParse({...valid,...patch}).success,false,JSON.stringify(patch));
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const Progress=load('components/ProgressCard.tsx').default;
const html=renderToStaticMarkup(React.createElement(Progress,{lang:'en',raised:25000,goal:100000}));
assert.ok(html.includes('25%'));
assert.ok(html.includes('width:25%'));
const zero=renderToStaticMarkup(React.createElement(Progress,{lang:'en',raised:0,goal:100000}));
assert.ok(zero.includes('width:0%'));
assert.ok(!zero.includes('min-w-[10px]'));

(async()=>{
  const {NextRequest,NextResponse}=require('next/server');
  let writes=0; let error=null;
  const mocks={
    '@/lib/auth':{requireAdmin:async()=>null,getAdminUser:async()=>({id:'owner',name:'Owner'})},
    '@/lib/supabase/server':{supabaseAdmin:()=>({rpc:async(name,args)=>{writes++;assert.equal(name,'save_homepage_settings');assert.equal(args.target_raised,25000);return{error};}})},
    'next/cache':{revalidatePath:()=>{}}
  };
  const route=load('app/api/admin/homepage/route.ts',mocks);
  const request=body=>new NextRequest('http://localhost/api/admin/homepage',{method:'PUT',body:JSON.stringify(body)});
  assert.equal((await route.PUT(request({...valid,paypal_link:'broken'}))).status,400);
  assert.equal(writes,0);
  assert.equal((await route.PUT(request(valid))).status,200);
  error={code:'40001'};
  assert.equal((await route.PUT(request(valid))).status,409);
  const forbidden=load('app/api/admin/homepage/route.ts',{...mocks,'@/lib/auth':{requireAdmin:async()=>NextResponse.json({error:'Owner required'},{status:403})}});
  assert.equal((await forbidden.PUT(request(valid))).status,403);
  assert.equal(writes,2);
  const publicRoute=load('app/api/public/progress/route.ts',{
    '@/lib/supabase/server':{supabaseAdmin:()=>({from:()=>({select:()=>({eq:()=>({single:async()=>({data:{raised_sek:1000,opening_raised_sek:24000,goal_sek:100000,secret:'PRIVATE'}})})})})})}
  });
  const response=await publicRoute.GET();
  assert.deepEqual(await response.json(),{raised:25000,goal:100000});
  console.log('Homepage: editable total, percentage edge cases, validation, Owner authorization, stale edits and public response passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
