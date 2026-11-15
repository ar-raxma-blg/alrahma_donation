-- Public registrations also appear in the rebuilt admin (Löften / Transaktioner).
--
-- Until now the public form wrote only to the legacy tables (donors, donations,
-- payment_plans), which no admin page reads. Legacy tables stay the source for
-- the public feed, WhatsApp notifications and the homepage total, so they keep
-- being written. This migration:
--   1. links the new tables to the legacy rows they mirror,
--   2. mirrors every new registration into the new tables (same transaction),
--   3. syncs a payment confirmed/rejected/refunded in the dashboard back to the
--      legacy row, so the homepage total, public feed and thank-you messages
--      follow. Only mirrored public registrations are synced: manual cash/bank
--      entries and the manual opening balance are untouched (no double count),
--   4. copies existing pending registrations once (idempotent; safe to re-run).
-- Safe to re-run.

-- ------------------------------------------------------------------ links
alter table public.donor_profiles add column if not exists legacy_donor_id uuid unique references public.donors(id) on delete set null;
alter table public.pledges add column if not exists legacy_plan_id uuid unique references public.payment_plans(id) on delete set null;
alter table public.pledges add column if not exists reference text unique;
-- transactions.provider_ref holds the AR-… reference of a mirrored one-time gift.
create unique index if not exists transactions_provider_ref_unique on public.transactions (provider_ref) where provider_ref is not null;

-- ------------------------------------------------------------------ mirror
-- Copies one legacy registration (identified by its legacy donor id) into the
-- rebuilt tables. Does nothing if it was already mirrored.
create or replace function public.mirror_registration(p_donor uuid) returns void
language plpgsql set search_path = public as $$
declare
  d donors; plan payment_plans; gift donations;
  camp uuid; prof uuid; anon boolean; shown text; n integer;
begin
  select * into d from donors where id = p_donor and deleted_at is null;
  if not found then return; end if;
  select * into plan from payment_plans where donor_id = p_donor order by created_at limit 1;
  select * into gift from donations where donor_id = p_donor and payment_plan_id is null and status = 'pending' order by created_at limit 1;
  if plan.id is null and gift.id is null then return; end if;
  if nullif(trim(d.email), '') is null and nullif(trim(d.phone), '') is null then return; end if;

  -- Same private bookkeeping collection the admin creates for manual entries.
  insert into campaigns (slug, title, goal_sek, fund_type, status, pledges_count_public)
  values ('al-rahma-main', 'Al-Rahmas huvudinsamling', 1, 'building', 'draft', false)
  on conflict (slug) do nothing;
  select id into camp from campaigns where slug = 'al-rahma-main';

  anon := coalesce(case when plan.id is not null then plan.is_anonymous else gift.is_anonymous end, true);
  -- The new tables only ever hold a first name publicly.
  shown := case when anon then null else nullif(split_part(trim(case when plan.id is not null then plan.display_name else gift.display_name end), ' ', 1), '') end;

  select id into prof from donor_profiles where legacy_donor_id = p_donor;
  if prof is null then
    insert into donor_profiles (full_name, phone, email, created_at, legacy_donor_id)
    values (d.full_name, nullif(trim(d.phone), ''), nullif(trim(d.email), ''), d.created_at, d.id)
    returning id into prof;
    insert into donor_consents (donor_id, purpose, granted, source, created_at) values
      (prof, 'storage', coalesce(d.gdpr_consent, true), 'form', d.created_at),
      (prof, 'contact_sms', coalesce(d.comm_sms, false), 'form', d.created_at),
      (prof, 'contact_email', coalesce(d.comm_email, false), 'form', d.created_at),
      (prof, 'show_first_name', not anon, 'form', d.created_at);
  end if;

  if plan.id is not null then
    -- Plans that already have confirmed legacy payments are left to the legacy data.
    if not exists (select 1 from pledges where legacy_plan_id = plan.id)
       and not exists (select 1 from donations where payment_plan_id = plan.id and status = 'confirmed') then
      declare pledge_id uuid;
      begin
        insert into pledges (campaign_id, donor_id, total_sek, status, reminders, created_at, legacy_plan_id, reference)
        values (camp, prof, plan.total_amount_sek, case when plan.status = 'cancelled' then 'cancelled' else 'active' end::pledge_status,
                false, plan.created_at, plan.id, plan.reference)
        returning id into pledge_id;
        if plan.status = 'cancelled' then update pledges set cancel_reason = 'Avbruten före kopiering' where id = pledge_id; end if;
        -- First instalment is due on the plan's first due date (if staff set one) or the
        -- registration day, then monthly. Staff can see
        -- and chase it in Löften; the donor never agreed a date in the public form.
        for n in 1..plan.months loop
          insert into pledge_installments (pledge_id, seq, due_on, amount_sek)
          values (pledge_id, n, (coalesce(plan.first_due_on, (plan.created_at at time zone 'Europe/Stockholm')::date) + ((n - 1) * interval '1 month'))::date, plan.total_amount_sek / plan.months);
        end loop;
      end;
    end if;
  elsif not exists (select 1 from transactions where provider_ref = gift.reference) then
    insert into transactions (campaign_id, amount_sek, received_on, method, status, donor_id, display_name, provider_ref, created_at)
    values (camp, gift.amount_sek, (gift.created_at at time zone 'Europe/Stockholm')::date,
            case when gift.method in ('swish', 'bank_transfer', 'cash', 'card') then gift.method else 'bank_transfer' end::tx_method,
            'awaiting_approval', prof, shown, gift.reference, gift.created_at);
  end if;
end;
$$;
revoke all on function public.mirror_registration(uuid) from public, anon, authenticated;
grant execute on function public.mirror_registration(uuid) to service_role;

-- --------------------------------------------------------- registration
-- Same rules as 202610100003_display_name.sql; the only change is the final mirror call.
create or replace function public.register_donation(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_donor uuid;
  registration_ref text;
  anonymous_display boolean := not (payload->>'publicDisplayConsent')::boolean;
  public_name text;
begin
  if not coalesce((payload->>'gdprConsent')::boolean, false)
     or (payload->>'amountSek')::integer not between 1 and 10000000
     or payload->>'paymentMethod' not in ('swish', 'bank_transfer')
     or payload->>'frequency' not in ('onetime', 'monthly') then
    raise exception 'Invalid registration';
  end if;
  if payload->>'frequency' = 'monthly' and (
     (payload->>'months')::integer not in (2,6,12)
     or (payload->>'amountSek')::integer % (payload->>'months')::integer <> 0) then
    raise exception 'Plan total must divide evenly by its number of months';
  end if;
  if not exists (select 1 from campaign_settings where id = 'main' and is_live) then
    raise exception 'Campaign is paused' using errcode = 'P0002';
  end if;
  insert into donors (full_name, email, phone, preferred_language, comm_email, comm_sms,
    comm_whatsapp, comm_opt_out, gdpr_consent, gdpr_consent_at)
  values (payload->>'fullName', payload->>'email', nullif(payload->>'phone', ''),
    payload->>'preferredLanguage', (payload->'comms'->>'email')::boolean,
    (payload->'comms'->>'sms')::boolean, (payload->'comms'->>'whatsapp')::boolean,
    (payload->'comms'->>'none')::boolean, true, now()) returning id into new_donor;
  if not anonymous_display and (nullif(trim(payload->>'displayName'), '') is null or length(payload->>'displayName') > 120) then
    raise exception 'Invalid display name';
  end if;
  public_name := case when anonymous_display then 'Anonymous' else payload->>'displayName' end;
  if payload->>'frequency' = 'monthly' then
    insert into payment_plans (donor_id, display_name, total_amount_sek, months, method, is_anonymous)
    values (new_donor, public_name, (payload->>'amountSek')::integer, (payload->>'months')::integer,
      payload->>'paymentMethod', anonymous_display) returning reference into registration_ref;
  else
    insert into donations (donor_id, display_name, amount_sek, method, status, is_anonymous)
    values (new_donor, public_name, (payload->>'amountSek')::integer,
      payload->>'paymentMethod', 'pending', anonymous_display) returning reference into registration_ref;
  end if;
  insert into consent_log (donor_id, donor_email, consent_text_shown, consent_given, purpose, registration_reference)
  values
    (new_donor, payload->>'email', payload->>'processingConsentText', true, 'donation_processing', registration_ref),
    (new_donor, payload->>'email', payload->>'displayConsentText', not anonymous_display, 'public_display', registration_ref),
    (new_donor, payload->>'email', payload->>'notificationConsentText',
      (payload->'comms'->>'email')::boolean or (payload->'comms'->>'sms')::boolean or (payload->'comms'->>'whatsapp')::boolean,
      'donation_notifications', registration_ref);
  perform public.mirror_registration(new_donor);
  return jsonb_build_object('reference', registration_ref, 'status', 'pending');
end;
$$;
revoke all on function public.register_donation(jsonb) from public, anon, authenticated;
grant execute on function public.register_donation(jsonb) to service_role;

-- --------------------------------------------------- dashboard -> legacy sync
-- When staff confirm, reject or refund a mirrored public payment in Transaktioner,
-- the legacy row follows. That is what moves the homepage total (bump_campaign_total),
-- the public feed, plan progress and the thank-you message queue.
create or replace function public.sync_registration_payment() returns trigger
language plpgsql set search_path = public as $$
declare legacy_plan uuid; legacy_method text;
begin
  if NEW.status = OLD.status then return NEW; end if;
  if NEW.installment_id is null then
    -- One-time gift, matched by its AR-… reference. Manual entries have no provider_ref.
    if NEW.provider_ref is null or NEW.provider_ref not like 'AR-%' then return NEW; end if;
    if NEW.status = 'confirmed' then
      update donations set status = 'confirmed', confirmed_at = now(), paid_on = NEW.received_on
      where reference = NEW.provider_ref and payment_plan_id is null and status <> 'confirmed';
    elsif OLD.status = 'confirmed' or NEW.status = 'rejected' then
      update donations set status = 'rejected', confirmed_at = null
      where reference = NEW.provider_ref and payment_plan_id is null and status <> 'rejected';
    end if;
  else
    -- Instalment of a mirrored plan. Pledges entered manually have no legacy plan.
    select pl.legacy_plan_id into legacy_plan
    from pledge_installments i join pledges pl on pl.id = i.pledge_id where i.id = NEW.installment_id;
    if legacy_plan is null then return NEW; end if;
    legacy_method := case when NEW.method::text in ('swish', 'bank_transfer', 'cash', 'card') then NEW.method::text else 'bank_transfer' end;
    if NEW.status = 'confirmed' then
      insert into donations (donor_id, payment_plan_id, display_name, is_anonymous, amount_sek, method, status, confirmed_at, paid_on, recording_key, reference)
      select p.donor_id, p.id, p.display_name, coalesce(p.is_anonymous, true), NEW.amount_sek, legacy_method, 'confirmed', now(), NEW.received_on, NEW.id,
             'AR-' || upper(replace(gen_random_uuid()::text, '-', ''))
      from payment_plans p where p.id = legacy_plan
      on conflict (recording_key) do update set status = 'confirmed', confirmed_at = now(), paid_on = NEW.received_on, amount_sek = NEW.amount_sek;
    elsif OLD.status = 'confirmed' then
      update donations set status = 'rejected', confirmed_at = null where recording_key = NEW.id and status <> 'rejected';
    end if;
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_sync_registration_payment on public.transactions;
create trigger trg_sync_registration_payment after update of status on public.transactions
for each row execute function public.sync_registration_payment();

-- ------------------------------------------------------------- backfill
-- Existing pending one-time gifts and payment plans. Rows that are already
-- mirrored or have confirmed legacy payments are skipped; re-running adds nothing.
do $$
declare r record;
begin
  for r in
    select distinct x.donor_id from (
      select donor_id from donations where payment_plan_id is null and status = 'pending' and donor_id is not null
      union
      select donor_id from payment_plans where donor_id is not null
    ) x order by 1
  loop
    perform public.mirror_registration(r.donor_id);
  end loop;
end $$;
