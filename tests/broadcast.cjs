const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(name) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  new Function('require','exports','module',code)(id => id.startsWith('./') ? load(id.slice(2)) : require(id),mod.exports,mod);
  return mod.exports;
}
const { recipientAddress, isSwedishSmsAddress } = load('communication');
const { broadcastAddresses } = load('broadcast-targets');
const { providerStatus, sendSms, estimateSms, estimateSmsBatch, elksCurrency, sendEmail, sendWhatsApp } = load('broadcast');
const { profileRecipients, suppressOptedOutPhones } = load('broadcast-recipients');
const donor = { email:' USER@EXAMPLE.COM ',phone:'0046 70 000 00 00',comm_email:true,comm_sms:true,comm_whatsapp:true,comm_opt_out:false };
assert.equal(recipientAddress(donor,'sms'),'+46700000000');
assert.equal(recipientAddress(donor,'email'),'user@example.com');
assert.equal(recipientAddress({...donor,comm_opt_out:true},'whatsapp'),null);
assert.equal(recipientAddress({...donor,comm_sms:false},'sms'),null);
assert.equal(recipientAddress({...donor,phone:'0700000000'},'sms'),null);
assert.equal(isSwedishSmsAddress(recipientAddress(donor,'sms')),true);
assert.equal(isSwedishSmsAddress(recipientAddress({...donor,phone:'+4741234567'},'sms')),false);
assert.equal(isSwedishSmsAddress(recipientAddress({...donor,phone:'+12025550123'},'sms')),false);
assert.equal(isSwedishSmsAddress(recipientAddress({...donor,phone:'0700000000'},'sms')),false);
assert.equal(isSwedishSmsAddress('+460700000000'),false);
assert.deepEqual(broadcastAddresses([donor, {...donor}, {...donor,phone:'+4741234567'}], 'sms'), { addresses:['+46700000000'], excludedNonSwedish:1 });
const profile = {id:'profile-1',full_name:'Test Donor',phone:'+46700000000',email:null};
const consent = (id,purpose,granted,created_at) => ({id,donor_id:'profile-1',purpose,granted,created_at});
const profileRows = profileRecipients([profile],[
  consent('a','storage',true,'2026-01-01'), consent('b','contact_sms',true,'2026-01-01'),
  consent('c','contact_sms',false,'2026-02-01')
]);
assert.equal(profileRows[0].comm_sms,false);
assert.equal(profileRecipients([profile],[consent('a','contact_sms',true,'2026-01-01')]).length,0);
assert.equal(suppressOptedOutPhones([{...profileRows[0],comm_sms:true}, {...profileRows[0],id:'legacy:other',comm_opt_out:true}])[0].comm_sms,false);
assert.equal(suppressOptedOutPhones([{...donor,id:'legacy:other',full_name:'Old donor',preferred_language:'sv'}, profileRows[0]])[0].comm_sms,false);
let calls=[];
global.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,status:202,json:async()=>url.endsWith('/me') ? {currency:'SEK'} : options?.body?.toString().includes('dryrun=yes') ? {estimated_cost:5200,parts:1} : {id:'sms-test-id',messages:[{id:'wa-test-id'}]}};};
(async()=>{
  for(const key of ['ELKS_API_USERNAME','ELKS_API_PASSWORD','ELKS_FROM','RESEND_API_KEY','BROADCAST_FROM_EMAIL','WHATSAPP_ENABLED']) delete process.env[key];
  assert.equal((await sendSms('+46700000000','test')).ok,false);
  assert.equal((await sendEmail('a@example.invalid','test','test')).ok,false);
  assert.equal((await sendWhatsApp('+46700000000','test','sv')).ok,false);
  assert.equal(calls.length,0);
  Object.assign(process.env,{ELKS_API_USERNAME:'test-user',ELKS_API_PASSWORD:'test-password',ELKS_FROM:'AlRahma',RESEND_API_KEY:'test',BROADCAST_FROM_EMAIL:'test@example.invalid',WHATSAPP_ENABLED:'true',WHATSAPP_ACCESS_TOKEN:'test',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_API_VERSION:'vTest'});
  assert.deepEqual(await sendSms('+46700000000','test'),{ok:true,simulated:false,messageId:'sms-test-id'});
  assert.equal(calls[0].url,'https://api.46elks.com/a1/sms');
  assert.equal(calls[0].options.headers.Authorization,`Basic ${Buffer.from('test-user:test-password').toString('base64')}`);
  assert.equal(calls[0].options.body.toString(),'to=%2B46700000000&from=AlRahma&message=test');
  assert.deepEqual(await estimateSms('+46700000000','test'),{estimatedCost:5200,parts:1});
  assert.equal(calls[1].options.body.toString(),'to=%2B46700000000&from=AlRahma&message=test&dryrun=yes');
  assert.equal(await elksCurrency(),'SEK');
  assert.deepEqual(await estimateSmsBatch(['+46700000000','+46711111111'],'test'),{currency:'SEK',estimatedCost:10400,parts:2,recipients:2});
  assert.equal(calls.filter(c=>c.options?.body?.toString().includes('dryrun=yes')).length,3);
  assert.equal((await sendEmail('a@example.invalid','test','test')).ok,true);
  assert.equal((await sendWhatsApp('+46700000000','approved_template','sv')).ok,true);
  assert.equal(JSON.parse(calls.find(c=>c.url.includes('graph.facebook.com')).options.body).template.name,'approved_template');
  global.fetch=async()=>({ok:false,status:429});
  assert.equal((await sendSms('+46700000000','test')).ok,false);
  await assert.rejects(()=>estimateSms('+46700000000','test'),/kunde inte uppskatta/i);
  global.fetch=async()=>{throw new Error('offline')};
  assert.equal((await sendEmail('a@example.invalid','test','test')).ok,false);
  assert.equal(providerStatus().whatsapp,true);
  console.log('Broadcast checks passed: opt-out, preferences, normalization, provider setup, requests and failures. No real messages sent.');
})();
