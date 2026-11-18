BEGIN;
do $$
declare
  base jsonb := jsonb_build_object('fullName','Invited Donor','email','invited@example.invalid','phone','','preferredLanguage','en',
    'gdprConsent',true,'publicDisplayConsent',false,'displayName','x','paymentMethod','swish','frequency','onetime','amountSek',500,
    'comms',jsonb_build_object('email',false,'sms',false,'whatsapp',false,'none',true),
    'processingConsentText','p','displayConsentText','d','notificationConsentText','n');
  reg jsonb; ali uuid;
begin
  insert into invite_channels (code, name, source) values ('ali-test', 'Ali', 'admin') returning id into ali;
  reg := register_donation(base);
  if not attach_invite(reg->>'reference', 'ALI-test') then raise exception 'Invite not attached'; end if;
  if (select invite_channel_id from donors where email = 'invited@example.invalid') is distinct from ali then raise exception 'Donor not tied to channel'; end if;
  if attach_invite(reg->>'reference', 'nope-code') then raise exception 'Unknown code accepted'; end if;
  if attach_invite('AR-DOESNOTEXIST', 'ali-test') then raise exception 'Unknown reference accepted'; end if;
  if has_function_privilege('anon', 'attach_invite(text,text)', 'execute') or has_table_privilege('anon', 'invite_channels', 'select') then raise exception 'Invite data exposed to anon'; end if;
end $$;
ROLLBACK;
