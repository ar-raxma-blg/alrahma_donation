-- Editable public total: manual opening balance + confirmed public donations.
-- Existing money and payment details remain unchanged by this migration.
alter table public.campaign_totals add column if not exists opening_raised_sek bigint not null default 0;

create or replace function public.bump_campaign_total() returns trigger as $$
declare previous_amount bigint := 0; next_amount bigint := 0;
begin
  if TG_OP <> 'INSERT' and OLD.status = 'confirmed' then previous_amount := OLD.amount_sek; end if;
  if TG_OP <> 'DELETE' and NEW.status = 'confirmed' then next_amount := NEW.amount_sek; end if;
  if previous_amount <> next_amount then
    update public.campaign_totals set raised_sek = raised_sek + next_amount - previous_amount, updated_at = clock_timestamp() where id = 'main';
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$ language plpgsql set search_path = public;
drop trigger if exists trg_bump_campaign_total on public.donations;
create trigger trg_bump_campaign_total after insert or update or delete on public.donations
for each row execute function public.bump_campaign_total();

create or replace function public.save_homepage_settings(
  payment jsonb, target_goal integer, target_raised bigint,
  expected_settings_at timestamptz, expected_totals_at timestamptz,
  actor uuid, actor_name text
) returns void language plpgsql set search_path = public as $$
declare old_settings campaign_settings%rowtype; old_totals campaign_totals%rowtype; changed_at timestamptz := clock_timestamp();
begin
  if not exists (select 1 from public.admins where user_id = actor and role = 'owner') then
    raise exception 'Owner required' using errcode = '42501';
  end if;
  select * into strict old_settings from public.campaign_settings where id = 'main' for update;
  select * into strict old_totals from public.campaign_totals where id = 'main' for update;
  if old_settings.updated_at is distinct from expected_settings_at or old_totals.updated_at is distinct from expected_totals_at then
    raise exception 'Settings changed' using errcode = '40001';
  end if;
  if target_goal < 1 or target_goal > 1000000000 or target_raised < old_totals.raised_sek or target_raised > 1000000000 then
    raise exception 'Invalid amount' using errcode = '22023';
  end if;
  update public.campaign_settings set
    swish_number = payment->>'swish_number', paypal_link = payment->>'paypal_link', card_link = payment->>'card_link',
    bankgiro = payment->>'bankgiro', plusgiro = payment->>'plusgiro', iban = payment->>'iban', bic = payment->>'bic',
    account_holder = payment->>'account_holder', bank_name = payment->>'bank_name', account_number = payment->>'account_number',
    paypal_placeholder = false,
    -- A QR uploaded for an old recipient must never override a new recipient.
    swish_qr_url = case when regexp_replace(swish_number, '\D', '', 'g') is distinct from regexp_replace(payment->>'swish_number', '\D', '', 'g') then '' else swish_qr_url end,
    paypal_qr_url = case when paypal_link is distinct from payment->>'paypal_link' then '' else paypal_qr_url end,
    updated_at = changed_at where id = 'main';
  update public.campaign_totals set goal_sek = target_goal, opening_raised_sek = target_raised - raised_sek, updated_at = changed_at where id = 'main';
  insert into public.audit_log(user_id, user_name, action, object_type, object_id, object_label, changes)
  values (actor, actor_name, 'homepage.update', 'homepage', 'main', 'Hemsidans inställningar', jsonb_build_object(
    'payment', jsonb_build_object('from', to_jsonb(old_settings) - array['transparency_files','paused_message'], 'to', payment),
    'goal_sek', jsonb_build_object('from', old_totals.goal_sek, 'to', target_goal),
    'displayed_raised_sek', jsonb_build_object('from', old_totals.raised_sek + old_totals.opening_raised_sek, 'to', target_raised)
  ));
end;
$$;
revoke all on function public.save_homepage_settings(jsonb, integer, bigint, timestamptz, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.save_homepage_settings(jsonb, integer, bigint, timestamptz, timestamptz, uuid, text) to service_role;
