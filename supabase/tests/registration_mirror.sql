BEGIN;
do $$
declare
  base jsonb := jsonb_build_object('fullName','Mirror Donor','email','mirror@example.invalid','phone','+46700000001','preferredLanguage','en',
    'gdprConsent',true,'publicDisplayConsent',true,'displayName','Mirror Visible','paymentMethod','swish',
    'comms',jsonb_build_object('email',true,'sms',false,'whatsapp',false,'none',false),
    'processingConsentText','p','displayConsentText','d','notificationConsentText','n');
  one jsonb; plan jsonb; one_ref text; plan_ref text; tx transactions; pl pledges; inst uuid;
  raised0 bigint; legacy_donor uuid; manual uuid; camp uuid;
begin
  select raised_sek into raised0 from campaign_totals where id='main';
  one := register_donation(base || '{"frequency":"onetime","amountSek":1200}');
  plan := register_donation(base || '{"frequency":"monthly","amountSek":6000,"months":6,"paymentMethod":"bank_transfer","publicDisplayConsent":false}');
  one_ref := one->>'reference'; plan_ref := plan->>'reference';

  -- One-time gift: awaiting approval, first name only, tied to its AR reference.
  select * into tx from transactions where provider_ref = one_ref;
  if tx.id is null or tx.status <> 'awaiting_approval' or tx.amount_sek <> 1200 or tx.display_name <> 'Mirror' or tx.method <> 'swish' then raise exception 'One-time gift not mirrored correctly'; end if;
  if (select full_name from donor_profiles where id = tx.donor_id) <> 'Mirror Donor' then raise exception 'Donor profile missing'; end if;
  if (select count(*) from donor_consents where donor_id = tx.donor_id) <> 4 then raise exception 'Consents missing'; end if;
  if not (select granted from donor_consents where donor_id = tx.donor_id and purpose = 'show_first_name') then raise exception 'Display consent wrong'; end if;
  if (select slug from campaigns where id = tx.campaign_id) <> 'al-rahma-main' then raise exception 'Wrong collection'; end if;

  -- Monthly plan: pledge with six monthly instalments, anonymous.
  select * into pl from pledges where reference = plan_ref;
  if pl.id is null or pl.total_sek <> 6000 or pl.status <> 'active' then raise exception 'Plan not mirrored'; end if;
  if (select count(*) from pledge_installments where pledge_id = pl.id) <> 6 or (select sum(amount_sek) from pledge_installments where pledge_id = pl.id) <> 6000 then raise exception 'Instalments wrong'; end if;
  if (select due_on from pledge_installments where pledge_id = pl.id and seq = 2) <> ((select due_on from pledge_installments where pledge_id = pl.id and seq = 1) + interval '1 month')::date then raise exception 'Instalment dates wrong'; end if;
  if (select granted from donor_consents where donor_id = pl.donor_id and purpose = 'show_first_name') then raise exception 'Anonymous plan shows name'; end if;

  -- Re-mirroring (the backfill) adds nothing.
  select id into legacy_donor from donors where email = 'mirror@example.invalid' order by created_at limit 1;
  perform mirror_registration(legacy_donor);
  perform mirror_registration((select donor_id from payment_plans where reference = plan_ref));
  if (select count(*) from transactions where provider_ref = one_ref) <> 1 or (select count(*) from pledges where reference = plan_ref) <> 1
     or (select count(*) from pledge_installments where pledge_id = pl.id) <> 6 then raise exception 'Mirror not idempotent'; end if;

  -- Confirming in the dashboard confirms the legacy gift and moves the homepage total once.
  update transactions set status = 'confirmed', approved_by = null where id = tx.id;
  if (select status from donations where reference = one_ref) <> 'confirmed' then raise exception 'Legacy gift not confirmed'; end if;
  if (select raised_sek from campaign_totals where id='main') <> raised0 + 1200 then raise exception 'Homepage total not raised'; end if;
  -- A refund takes it back out.
  update transactions set status = 'refunded', refund_reason = 'test' where id = tx.id;
  if (select status from donations where reference = one_ref) <> 'rejected' or (select raised_sek from campaign_totals where id='main') <> raised0 then raise exception 'Refund not reflected'; end if;

  -- Paying an instalment of the mirrored plan records a legacy payment and plan progress.
  select id into inst from pledge_installments where pledge_id = pl.id and seq = 1;
  insert into transactions (campaign_id, amount_sek, method, status, donor_id, installment_id, registered_by)
  values (pl.campaign_id, 1000, 'bank_transfer', 'awaiting_approval', pl.donor_id, inst, null) returning * into tx;
  update transactions set status = 'confirmed', approved_by = gen_random_uuid() where id = tx.id;
  if (select count(*) from donations where recording_key = tx.id and status = 'confirmed') <> 1 then raise exception 'Instalment not synced'; end if;
  if (select raised_sek from campaign_totals where id='main') <> raised0 + 1000 then raise exception 'Instalment not in total'; end if;
  if (select installments_paid from payment_plans where reference = plan_ref) <> 1 then raise exception 'Plan progress not updated'; end if;
  update transactions set status = 'refunded', refund_reason = 'test' where id = tx.id;
  if (select raised_sek from campaign_totals where id='main') <> raised0 then raise exception 'Instalment refund not reflected'; end if;

  -- Manual entries and manual pledges never touch the legacy tables or the homepage total.
  select id into camp from campaigns where slug = 'al-rahma-main';
  insert into transactions (campaign_id, amount_sek, method, status, registered_by)
  values (camp, 500, 'cash', 'awaiting_approval', gen_random_uuid()) returning id into manual;
  update transactions set status = 'rejected' where id = manual;
  if (select raised_sek from campaign_totals where id='main') <> raised0 or (select count(*) from donations where amount_sek = 500) <> 0 then raise exception 'Manual entry leaked into legacy'; end if;

  -- Rejecting a mirrored pending gift rejects the legacy gift too.
  one := register_donation(base || '{"frequency":"onetime","amountSek":300}');
  update transactions set status = 'rejected' where provider_ref = one->>'reference';
  if (select status from donations where reference = one->>'reference') <> 'rejected' then raise exception 'Reject not mirrored'; end if;

  -- Paused campaign still blocks registration, and a failure writes nothing.
  update campaign_settings set is_live = false where id = 'main';
  begin
    perform register_donation(base || '{"frequency":"onetime","amountSek":100}');
    raise exception 'Paused campaign accepted registration';
  exception when sqlstate 'P0002' then null;
  end;
  update campaign_settings set is_live = true where id = 'main';
end; $$;
ROLLBACK;
