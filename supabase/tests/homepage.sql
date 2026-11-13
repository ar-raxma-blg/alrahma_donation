BEGIN;
do $$
declare owner_id uuid := 'aaaaaaaa-1111-4111-8111-111111111111';
  non_owner uuid := 'aaaaaaaa-2222-4222-8222-222222222222';
  s campaign_settings%rowtype; t campaign_totals%rowtype; donation_id uuid;
  payment jsonb := '{"swish_number":"1234567890","paypal_link":"","card_link":"","bankgiro":"","plusgiro":"","iban":"","bic":"","account_holder":"","bank_name":"","account_number":""}';
begin
  insert into auth.users(id) values(owner_id), (non_owner);
  insert into admins(user_id, full_name, role) values(owner_id, 'Fixture Owner', 'owner'), (non_owner, 'Fixture Admin', 'admin');
  select * into s from campaign_settings where id='main';
  select * into t from campaign_totals where id='main';
  begin
    perform save_homepage_settings(payment, 100000, 25000, s.updated_at, t.updated_at, non_owner, 'Fixture Admin');
    raise exception 'Non-owner saved homepage';
  exception when insufficient_privilege then null; end;
  perform save_homepage_settings(payment, 100000, 25000, s.updated_at, t.updated_at, owner_id, 'Fixture Owner');
  if (select raised_sek + opening_raised_sek from campaign_totals where id='main') <> 25000 then raise exception 'Manual total not saved'; end if;
  if (select goal_sek from campaign_totals where id='main') <> 100000 then raise exception 'Goal not saved'; end if;
  if not exists(select 1 from audit_log where action='homepage.update' and user_id=owner_id) then raise exception 'Audit missing'; end if;
  if (select paypal_placeholder from campaign_settings where id='main') then raise exception 'Placeholder enabled'; end if;
  begin
    perform save_homepage_settings(payment, 200000, 30000, s.updated_at, t.updated_at, owner_id, 'Fixture Owner');
    raise exception 'Stale edit overwritten newer settings';
  exception when serialization_failure then null; end;
  if (select goal_sek from campaign_totals where id='main') <> 100000 then raise exception 'Stale edit was partially applied'; end if;
  insert into donations(display_name,amount_sek,method,status) values('Fixture',100,'bank_transfer','confirmed') returning id into donation_id;
  if (select raised_sek + opening_raised_sek from campaign_totals where id='main') <> 25100 then raise exception 'New payment not added'; end if;
  update donations set amount_sek=120 where id=donation_id;
  if (select raised_sek + opening_raised_sek from campaign_totals where id='main') <> 25120 then raise exception 'Payment correction counted incorrectly'; end if;
  update donations set status='rejected' where id=donation_id;
  if (select raised_sek + opening_raised_sek from campaign_totals where id='main') <> 25000 then raise exception 'Rejected payment still counted'; end if;
  update donations set status='confirmed' where id=donation_id;
  delete from donations where id=donation_id;
  if (select raised_sek + opening_raised_sek from campaign_totals where id='main') <> 25000 then raise exception 'Deleted payment still counted'; end if;
  select * into s from campaign_settings where id='main';
  select * into t from campaign_totals where id='main';
  begin
    perform save_homepage_settings(payment, 999, -1, s.updated_at, t.updated_at, owner_id, 'Fixture Owner');
    raise exception 'Negative total allowed';
  exception when invalid_parameter_value then null; end;
  if (select goal_sek from campaign_totals where id='main') <> 100000 then raise exception 'Bad save partially applied'; end if;
  update campaign_settings set swish_qr_url='https://example.invalid/old.png' where id='main';
  select * into s from campaign_settings where id='main';
  perform save_homepage_settings(jsonb_set(payment,'{swish_number}','"1230000000"'), 100000, 25000, s.updated_at, t.updated_at, owner_id, 'Fixture Owner');
  if (select swish_qr_url from campaign_settings where id='main') <> '' then raise exception 'Stale QR image retained'; end if;
  select * into s from campaign_settings where id='main';
  select * into t from campaign_totals where id='main';
  perform save_homepage_settings(payment || '{"swish_qr_url":"https://example.invalid/swish.png","paypal_qr_url":"https://example.invalid/paypal.png"}'::jsonb,100000,25000,s.updated_at,t.updated_at,owner_id,'Fixture Owner');
  if (select paypal_qr_url from campaign_settings where id='main') <> 'https://example.invalid/paypal.png' then raise exception 'PayPal image not published'; end if;
  if (select swish_qr_url from campaign_settings where id='main') <> 'https://example.invalid/swish.png' then raise exception 'Swish image not published'; end if;
  select * into s from campaign_settings where id='main';
  select * into t from campaign_totals where id='main';
  perform save_homepage_settings(payment || '{"swish_qr_url":"","paypal_qr_url":""}'::jsonb,100000,25000,s.updated_at,t.updated_at,owner_id,'Fixture Owner');
  if (select swish_qr_url || paypal_qr_url from campaign_settings where id='main') <> '' then raise exception 'QR removal not published'; end if;
  if has_function_privilege('anon','save_homepage_settings(jsonb,integer,bigint,timestamptz,timestamptz,uuid,text)','execute') or has_function_privilege('authenticated','save_homepage_settings(jsonb,integer,bigint,timestamptz,timestamptz,uuid,text)','execute') then raise exception 'Public may edit homepage'; end if;
end; $$;
ROLLBACK;
