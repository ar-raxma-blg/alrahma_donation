// Isolated browser-test backend. DB/auth/storage use loopback and in-memory data.
// Next reads .env.local, but DB keys and provider flags are explicitly overridden.
// Run npm run test:homepage-ui, then open http://127.0.0.1:3001/admin/login.
// Login: owner@example.invalid or second@example.invalid / fixture-password (fictitious).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { PGlite } = require('@electric-sql/pglite');
const QRCode = require('qrcode');
const { fixtureClient } = require('./fixture-client.cjs');

const owner = 'aaaaaaaa-1111-4111-8111-111111111111';
const user = { id:owner, aud:'authenticated', role:'authenticated', email:'owner@example.invalid', app_metadata:{provider:'email',providers:['email']}, user_metadata:{}, created_at:'2026-11-12T00:00:00Z' };
const secondOwner = 'bbbbbbbb-2222-4222-8222-222222222222';
const fixtureToken = id => Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+86400,iat:Math.floor(Date.now()/1000)})).toString('base64url')+'.local-fixture-signature';
const uploads = new Map();

let child;

function run(args, env) {
  return new Promise((resolve,reject)=>{
    const proc=spawn(process.execPath,args,{env,stdio:'inherit',windowsHide:true});
    proc.on('error',reject); proc.on('exit',code=>code===0?resolve():reject(new Error(`Next exited ${code}`)));
  });
}
(async()=>{
  const db=new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as 'select null::uuid'; create schema storage; create table storage.buckets(id text primary key, name text, public boolean); create publication supabase_realtime;");
  await db.exec(fs.readFileSync('supabase/setup.sql','utf8').replace(/create extension if not exists "pgcrypto";/i,''));
  await db.query('insert into auth.users(id) values($1)',[owner]);
  await db.query("insert into admins(user_id,full_name,role) values($1,'Fixture Owner','owner')",[owner]);
  await db.query('insert into auth.users(id) values($1)',[secondOwner]);
  await db.query("insert into admins(user_id,full_name,role) values($1,'Second Fixture Owner','owner')",[secondOwner]);
  const client=fixtureClient(db);
  const fixtureDir=fs.mkdtempSync(path.join(os.tmpdir(),'alrahma-homepage-ui-'));
  await QRCode.toFile(path.join(fixtureDir,'swish-test.png'),'https://example.invalid/test-only-swish',{width:240});
  await QRCode.toFile(path.join(fixtureDir,'paypal-test.png'),'https://example.invalid/test-only-paypal',{width:240});
  fs.writeFileSync(path.join(fixtureDir,'not-an-image.png'),'invalid fixture');
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1:54329');
    res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3001');
    res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info,prefer,accept,x-supabase-api-version,x-upsert');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS');
    res.setHeader('Access-Control-Expose-Headers','content-range');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
    try {
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
      if(url.pathname==='/auth/v1/token'){
        const credentials=JSON.parse(body.toString());const id=credentials.email==='second@example.invalid'?secondOwner:owner;
        return json(200,{access_token:fixtureToken(id),refresh_token:'local-fixture-refresh',expires_in:86400,token_type:'bearer',user:{...user,id,email:id===owner?user.email:'second@example.invalid'}});
      }
      if(url.pathname==='/auth/v1/user'){
        const id=JSON.parse(Buffer.from((req.headers.authorization||'').split('.')[1]||'', 'base64url').toString()).sub;
        return json(200,{...user,id,email:id===owner?user.email:'second@example.invalid'});
      }
      if(url.pathname==='/auth/v1/logout')return json(200,{});
      if(url.pathname.startsWith('/storage/v1/object/public/qr-codes/')){
        const image=uploads.get(decodeURIComponent(url.pathname.split('/qr-codes/')[1]));
        if(!image)return json(404,{error:'Not found'});
        res.writeHead(200,{'Content-Type':image.type});res.end(image.bytes);return;
      }
      if(url.pathname.startsWith('/storage/v1/object/qr-codes/') && req.method==='POST'){
        const filePath=decodeURIComponent(url.pathname.split('/qr-codes/')[1]);
        // supabase-js uses multipart/form-data for Uint8Array uploads on Node.
        let bytes=body;let type=req.headers['content-type']||'image/png';
        if(type.startsWith('multipart/form-data')){
          const boundary=type.split('boundary=')[1];
          const parts=body.toString('latin1').split('--'+boundary);
          const imagePart=parts.find(p=>p.includes('filename='));
          if(!imagePart)throw new Error('Missing multipart file');
          const headerEnd=imagePart.indexOf('\r\n\r\n');
          bytes=Buffer.from(imagePart.slice(headerEnd+4).replace(/\r\n$/,''),'latin1');
          type=/Content-Type: ([^\r]+)/i.exec(imagePart)?.[1]||'image/png';
        }
        uploads.set(filePath,{bytes,type});return json(200,{Key:'qr-codes/'+filePath,Id:filePath});
      }
      if(url.pathname==='/rest/v1/rpc/homepage_qr_uploads_ready')return json(200,true);
      if(url.pathname==='/rest/v1/rpc/save_homepage_settings'){
        const p=JSON.parse(body.toString());
        await db.query('select save_homepage_settings($1::jsonb,$2,$3,$4,$5,$6,$7)',[JSON.stringify(p.payment),p.target_goal,p.target_raised,p.expected_settings_at,p.expected_totals_at,p.actor,p.actor_name]);
        return json(200,null);
      }
      const table=url.pathname.replace('/rest/v1/','');
      let query=client.from(table);
      if(req.method==='POST')query=url.searchParams.has('on_conflict')?query.upsert(JSON.parse(body.toString()),{onConflict:url.searchParams.get('on_conflict'),ignoreDuplicates:true}):query.insert(JSON.parse(body.toString()));
      if(req.method==='PATCH')query=query.update(JSON.parse(body.toString()));
      if(req.method==='DELETE')query=query.delete();
      query=query.select(url.searchParams.get('select')||'*',{count:'exact',head:req.method==='HEAD'});
      for(const [key,value] of url.searchParams){
        const dot=value.indexOf('.'),op=value.slice(0,dot),arg=value.slice(dot+1);
        if(['eq','gt','gte','lt','lte'].includes(op))query=query[op](key,arg);
        if(op==='is')query=query.is(key,null);
        if(op==='not')query=query.not(key,'is',null);
        if(op==='in')query=query.in(key,arg.slice(1,-1).split(','));
      }
      for(const order of (url.searchParams.get('order')||'').split(',').filter(Boolean)){const [key,dir]=order.split('.');query=query.order(key,{ascending:dir!=='desc'});}
      if(url.searchParams.has('limit'))query=query.limit(Number(url.searchParams.get('limit')));
      const single=req.headers.accept?.includes('application/vnd.pgrst.object+json');
      if(single)query=query.maybeSingle();
      const result=await query;
      if(result.error)return json(400,result.error);
      res.setHeader('Content-Range',result.count?`0-${result.count-1}/${result.count}`:'*/0');
      if(req.method==='HEAD'){res.writeHead(200);res.end();return;}
      return json(200,result.data);
    }catch(error){return json(400,{code:error.code||'fixture_error',message:error.message});}
  });
  await new Promise(resolve=>server.listen(54329,'127.0.0.1',resolve));
  const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture-public-key',SUPABASE_SECRET_KEY:'fixture-server-key',NEXT_BUILD_DIR:'.next-smoke',ELKS_API_USERNAME:'',ELKS_API_PASSWORD:'',ELKS_FROM:'',RESEND_API_KEY:'',BROADCAST_FROM_EMAIL:'',WHATSAPP_ENABLED:'false',WHATSAPP_NOTIFICATIONS_ENABLED:'false',WHATSAPP_ACCESS_TOKEN:'',WHATSAPP_PHONE_NUMBER_ID:'',META_APP_SECRET:'',CRON_SECRET:''};
  // Explicit empty values prevent Next's .env.local loading from enabling providers.
  console.log(`Fixture images: ${fixtureDir}`);
  if(!process.argv.includes('--reuse-build')) await run(['node_modules/next/dist/bin/next','build'],env);
  child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3001'],{env,stdio:'inherit',windowsHide:true});
  console.log('ISOLATED HOMEPAGE TEST: http://127.0.0.1:3001/admin/login');
  console.log('Login: owner@example.invalid / fixture-password. No live data or messages are used.');
  const stop=()=>{child?.kill();server.close();db.close().finally(()=>process.exit());};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
})().catch(error=>{console.error(error);child?.kill();process.exit(1);});
