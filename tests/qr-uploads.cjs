const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {NextRequest,NextResponse}=require('next/server');
let allowed=true;let uploads=0;
const mockDb={storage:{from:()=>({upload:async()=>{uploads++;return{error:null};},getPublicUrl:path=>({data:{publicUrl:`https://fixture.supabase.co/storage/v1/object/public/qr-codes/${path}`}})})}};
const mod={exports:{}};
const code=ts.transpileModule(fs.readFileSync('app/api/admin/qr/uploads/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','exports','module',code)(id=>id==='@/lib/auth'?{requireAdmin:async()=>allowed?null:NextResponse.json({error:'Forbidden'},{status:403})}:id==='@/lib/supabase/server'?{supabaseAdmin:()=>mockDb}:require(id),mod.exports,mod);
async function post(kind,bytes,type='image/png'){
  const form=new FormData();form.append('kind',kind);form.append('file',new File([bytes],'fixture.png',{type}));
  return mod.exports.POST(new NextRequest('http://localhost/api/admin/qr/uploads',{method:'POST',body:form}));
}
(async()=>{
  assert.equal((await post('swish','not a PNG')).status,400);
  assert.equal((await post('__proto__','not a PNG')).status,400);
  assert.equal((await post('paypal',new Uint8Array(2097153))).status,400);
  assert.equal(uploads,0);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/tZcAAAAASUVORK5CYII=','base64');
  for(const kind of ['swish','paypal']){
    const res=await post(kind,png);assert.equal(res.status,200);
    assert.match((await res.json()).url,new RegExp(`/qr-codes/${kind}-[0-9a-f-]+.png$`));
  }
  allowed=false;
  assert.equal((await post('swish',png)).status,403);
  assert.equal(uploads,2);
  // No from('campaign_settings') method exists in this mock: staging cannot publish.
  console.log('QR uploads: Owner access, image type/size validation and unpublished staging passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
