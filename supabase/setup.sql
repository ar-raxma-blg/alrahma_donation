BEGIN;
-- Run this complete file in the Supabase SQL Editor for the initial setup.

-- Al-Rahma Mosque donation platform schema
-- Run in the Supabase SQL editor, or via supabase db push

create extension if not exists "pgcrypto";

-- Donors: registered supporters (GDPR data subject)
create table if not exists donors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  phone text,
  preferred_language text default 'en' check (preferred_language in ('en','sv','ar')),
  comm_email boolean default true,
  comm_sms boolean default false,
  comm_whatsapp boolean default false,
  comm_opt_out boolean default false,
  gdpr_consent boolean not null default false,
  gdpr_consent_at timestamptz,
  marketing_consent boolean default false,
  created_at timestamptz not null default now(),
  -- GDPR: right-to-erasure support. Soft-delete keeps donation totals intact
  -- while scrubbing personal fields; a scheduled job can hard-delete after
  -- the retention window (see README "GDPR" section).
  deleted_at timestamptz
);

-- Recurring pledges (2/6/12 month plans)
create table if not exists payment_plans (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid references donors(id) on delete set null,
  display_name text not null,
  total_amount_sek integer not null check (total_amount_sek > 0),
  months integer not null check (months in (2,6,12)),
  amount_per_month_sek integer generated always as (total_amount_sek / months) stored,
  installments_paid integer not null default 0,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  created_at timestamptz not null default now()
);

-- One-off donations, or a single installment against a payment plan
create table if not exists donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid references donors(id) on delete set null,
  display_name text not null,           -- snapshot at time of gift (survives donor deletion)
  amount_sek integer not null check (amount_sek > 0),
  method text not null check (method in ('cash','swish','card','bank_transfer')),
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  message text,
  is_anonymous boolean default false,
  payment_plan_id uuid references payment_plans(id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

-- Immutable log of consent capture, kept even if the donor record is scrubbed
-- (Article 7(1) GDPR: controller must be able to demonstrate consent was given)
create table if not exists consent_log (
  id uuid primary key default gen_random_uuid(),
  donor_email text not null,
  consent_text_shown text not null,
  consent_given boolean not null,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Campaign-level running total, updated by trigger below for fast reads
create table if not exists campaign_totals (
  id text primary key default 'main',
  goal_sek integer not null default 15000000,
  raised_sek integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into campaign_totals (id) values ('main') on conflict do nothing;

create or replace function bump_campaign_total() returns trigger as $$
begin
  if (TG_OP = 'UPDATE' and NEW.status = 'confirmed' and OLD.status <> 'confirmed') then
    update campaign_totals set raised_sek = raised_sek + NEW.amount_sek, updated_at = now() where id = 'main';
  elsif (TG_OP = 'INSERT' and NEW.status = 'confirmed') then
    update campaign_totals set raised_sek = raised_sek + NEW.amount_sek, updated_at = now() where id = 'main';
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_bump_campaign_total on donations;
create trigger trg_bump_campaign_total
  after insert or update on donations
  for each row execute function bump_campaign_total();

-- Realtime: enable so the public tracker can subscribe to new confirmed donations
alter publication supabase_realtime add table donations;

-- Payment accounts shown to donors at checkout (Swish/Bankgiro/IBAN), editable in
-- the admin "Payment accounts" tab. Single row, same pattern as campaign_totals.
create table if not exists campaign_settings (
  id text primary key default 'main',
  swish_number text not null default '123 456 78 90',
  bankgiro text not null default '5678-1234',
  iban text not null default 'SE45 5000 0000 0583 9825 7466',
  -- Live/paused toggle for the public tracker (admin "Betalkonton" tab).
  -- When false, the tracker shows paused_message instead of the live feed
  -- and registration form.
  is_live boolean not null default true,
  paused_message text not null default 'Kampanjen är pausad för tillfället. Tack för ert tålamod — vi är snart tillbaka.',
  -- Transparency attachments (receipts, progress photos, contractor
  -- invoices) donors see on the post-donation thank-you screen, as
  -- {label, url} pairs. Admin pastes links to files hosted in Supabase
  -- Storage or elsewhere; no upload pipeline is implied here.
  transparency_files jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
insert into campaign_settings (id) values ('main') on conflict do nothing;

-- Migration for existing deployments created before this column set:
alter table campaign_settings add column if not exists is_live boolean not null default true;
alter table campaign_settings add column if not exists paused_message text not null default 'Kampanjen är pausad för tillfället. Tack för ert tålamod — vi är snart tillbaka.';
alter table campaign_settings add column if not exists transparency_files jsonb not null default '[]'::jsonb;

-- Audit trail of every SMS/email broadcast sent from the admin Broadcast tab.
-- Does not store per-recipient rows (only a count) to avoid duplicating PII;
-- the actual send goes through the provider configured in lib/broadcast.ts.
create table if not exists broadcast_log (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('sms','email')),
  recipient_count integer not null,
  message text not null,
  simulated boolean not null default true,
  created_at timestamptz not null default now()
);

-- Row Level Security. Enable on every table that holds personal data.
alter table donors enable row level security;
alter table donations enable row level security;
alter table payment_plans enable row level security;
alter table consent_log enable row level security;
alter table campaign_totals enable row level security;

-- Public (anon key): can read confirmed donations only, for the live tracker.
-- No personal columns (email/phone) are exposed by the API views used client-side.
create policy "public can read confirmed donations"
  on donations for select
  using (status = 'confirmed');

create policy "public can read campaign totals"
  on campaign_totals for select
  using (true);

-- Public can INSERT a donor registration and a pending donation/plan themselves
-- (the register form), but cannot read other donors' rows.
create policy "anyone can register as a donor"
  on donors for insert
  with check (true);

create policy "anyone can submit a pending donation"
  on donations for insert
  with check (status = 'pending');

create policy "anyone can submit a pending payment plan"
  on payment_plans for insert
  with check (status = 'active');

create policy "anyone can write their own consent log entry"
  on consent_log for insert
  with check (true);

-- Everything else (reading donor PII, updating status, approving payments,
-- exporting reports) is done from the server using the service-role key in
-- app/api/**, which bypasses RLS deliberately and must stay behind admin auth.
-- Never expose SUPABASE_SERVICE_ROLE_KEY to the client.

-- Payment account settings and broadcast history are admin-only: RLS is on
-- with no policies, so only the service-role key (used in app/api/admin/**,
-- gated by requireAdmin) can read or write them.
alter table campaign_settings enable row level security;
alter table broadcast_log enable row level security;

-- Staff allow-list. Add a row per admin after they sign up via Supabase Auth.
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'admin' check (role in ('admin', 'owner')),
  created_at timestamptz not null default now()
);

alter table admins enable row level security;

-- Admins can see the allow-list (used by requireAdmin); no public access.
create policy "admins can read admin list"
  on admins for select
  using (auth.uid() = user_id);


-- Registration is executed only by the server, in one transaction.
alter table public.donations add column if not exists reference text unique default ('AR-' || upper(replace(gen_random_uuid()::text, '-', '')));
alter table public.payment_plans add column if not exists reference text unique default ('AR-' || upper(replace(gen_random_uuid()::text, '-', '')));
alter table public.payment_plans add column if not exists method text not null default 'swish' check (method in ('swish', 'bank_transfer'));
alter table public.payment_plans add column if not exists is_anonymous boolean not null default true;
alter table public.consent_log add column if not exists purpose text not null default 'donation_processing';
alter table public.consent_log add column if not exists donor_id uuid references public.donors(id) on delete set null;
alter table public.consent_log add column if not exists registration_reference text;

-- The public endpoint must never allow callers to overwrite another donor by email.
-- Email is a contact address, not proof of identity; each submission has its own donor.
alter table public.donors drop constraint if exists donors_email_key;
create index if not exists donors_email_idx on public.donors(email);

drop policy if exists "anyone can register as a donor" on public.donors;
drop policy if exists "anyone can submit a pending donation" on public.donations;
drop policy if exists "anyone can submit a pending payment plan" on public.payment_plans;
drop policy if exists "anyone can write their own consent log entry" on public.consent_log;

-- Never expose donor IDs, references or other private columns on the live feed.
revoke select on public.donations from anon, authenticated;
grant select (id, display_name, amount_sek, status, message, is_anonymous, created_at) on public.donations to anon, authenticated;

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
  public_name := case when anonymous_display then 'Anonymous' else payload->>'fullName' end;
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
  return jsonb_build_object('reference', registration_ref, 'status', 'pending');
end;
$$;
revoke all on function public.register_donation(jsonb) from public, anon, authenticated;
grant execute on function public.register_donation(jsonb) to service_role;

-- Keep totals correct when staff amend, reject or delete a confirmed donation.
create or replace function public.bump_campaign_total() returns trigger as $$
declare delta integer := 0;
begin
  if TG_OP <> 'INSERT' and OLD.status = 'confirmed' then delta := delta - OLD.amount_sek; end if;
  if TG_OP <> 'DELETE' and NEW.status = 'confirmed' then delta := delta + NEW.amount_sek; end if;
  update public.campaign_totals set raised_sek = raised_sek + delta, updated_at = now() where id = 'main';
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$ language plpgsql set search_path = public;
drop trigger if exists trg_bump_campaign_total on public.donations;
create trigger trg_bump_campaign_total after insert or update or delete on public.donations
for each row execute function public.bump_campaign_total();
update public.campaign_totals set raised_sek = (select coalesce(sum(amount_sek), 0) from public.donations where status = 'confirmed') where id = 'main';

-- Public feed contains only display fields; no donor IDs or payment references.
create or replace view public.public_donations with (security_invoker = true) as
select id, case when is_anonymous then 'Anonymous' else display_name end as display_name,
  amount_sek, case when is_anonymous then null else message end as message, is_anonymous, created_at
from public.donations where status = 'confirmed';
grant select on public.public_donations to anon, authenticated, service_role;
-- Postgres Changes sends whole records; the public feed polls the safe view instead.
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'donations') then
    alter publication supabase_realtime drop table public.donations;
  end if;
end;
$$;

-- The public page does not need a privileged key to render the form.
drop policy if exists "public can read campaign display settings" on public.campaign_settings;
create policy "public can read campaign display settings" on public.campaign_settings for select to anon, authenticated using (id = 'main');
revoke select on public.campaign_settings from anon, authenticated;
grant select (id, is_live, paused_message, transparency_files) on public.campaign_settings to anon, authenticated;


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
  return jsonb_build_object('reference', registration_ref, 'status', 'pending');
end;
$$;
revoke all on function public.register_donation(jsonb) from public, anon, authenticated;
grant execute on function public.register_donation(jsonb) to service_role;


COMMIT;

BEGIN;
create table public.notification_templates (
  id text not null,
  language text not null check (language in ('en','sv','ar')),
  body text not null,
  approval_status text not null default 'draft' check (approval_status in ('draft','approved','rejected')),
  primary key (id, language)
);
create table public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid references public.donors(id) on delete cascade,
  donation_id uuid references public.donations(id) on delete cascade,
  plan_id uuid references public.payment_plans(id) on delete cascade,
  template_id text not null,
  language text not null,
  status text not null default 'queued' check (status in ('queued','cancelled','sent','failed')),
  created_at timestamptz not null default now(),
  foreign key (template_id, language) references public.notification_templates(id, language),
  check (num_nonnulls(donation_id, plan_id) = 1)
);
create unique index notification_donation_once on public.notification_queue(donation_id, template_id) where donation_id is not null;
create unique index notification_plan_once on public.notification_queue(plan_id, template_id) where plan_id is not null;
create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.notification_queue(id) on delete cascade,
  event text not null check (event in ('queued','cancelled','sent','delivered','read','failed')),
  provider_message_id text,
  created_at timestamptz not null default now()
);
alter table public.notification_templates enable row level security;
alter table public.notification_queue enable row level security;
alter table public.notification_logs enable row level security;
revoke all on public.notification_templates, public.notification_queue, public.notification_logs from anon, authenticated;
grant all on public.notification_templates, public.notification_queue, public.notification_logs to service_role;

insert into public.notification_templates(id, language, body) values
 ('pledge_received','en','Thank you for your pledge of {{amount}} SEK to Al-Rahma. Reference: {{reference}}. Payment is awaiting verification.'),
 ('payment_confirmed','en','Thank you! Your payment of {{amount}} SEK to Al-Rahma is confirmed. Reference: {{reference}}.'),
 ('pledge_reminder','en','A reminder about your pledge of {{amount}} SEK to Al-Rahma. Reference: {{reference}}. If you have already paid, please contact us.'),
 ('pledge_received','sv','Tack för ditt löfte om {{amount}} kr till Al-Rahma. Referens: {{reference}}. Betalningen väntar på verifiering.'),
 ('payment_confirmed','sv','Tack! Din betalning på {{amount}} kr till Al-Rahma är bekräftad. Referens: {{reference}}.'),
 ('pledge_reminder','sv','En påminnelse om ditt löfte på {{amount}} kr till Al-Rahma. Referens: {{reference}}. Kontakta oss om du redan har betalat.'),
 ('pledge_received','ar','شكرًا لتعهدك بمبلغ {{amount}} كرونة لمسجد الرحمة. المرجع: {{reference}}. الدفع بانتظار التحقق.'),
 ('payment_confirmed','ar','شكرًا! تم تأكيد دفعتك بقيمة {{amount}} كرونة لمسجد الرحمة. المرجع: {{reference}}.'),
 ('pledge_reminder','ar','تذكير بتعهدك بمبلغ {{amount}} كرونة لمسجد الرحمة. المرجع: {{reference}}. تواصل معنا إذا كنت قد دفعت بالفعل.');

create function public.queue_pledge_notification() returns trigger
language plpgsql set search_path = public as $$
declare kind text;
begin
  if TG_TABLE_NAME = 'payment_plans' then
    if TG_OP <> 'INSERT' then return NEW; end if;
    kind := 'pledge_received';
  elsif NEW.status = 'confirmed' then
    if TG_OP = 'UPDATE' and OLD.status = 'confirmed' then return NEW; end if;
    kind := 'payment_confirmed';
  elsif TG_OP = 'INSERT' and NEW.status = 'pending' then
    kind := 'pledge_received';
  else
    return NEW;
  end if;
  insert into notification_queue(donor_id, donation_id, plan_id, template_id, language)
  select d.id,
    case when TG_TABLE_NAME = 'donations' then NEW.id end,
    case when TG_TABLE_NAME = 'payment_plans' then NEW.id end,
    kind, coalesce(d.preferred_language, 'en')
  from donors d where d.id = NEW.donor_id and d.comm_whatsapp and not d.comm_opt_out
    and d.deleted_at is null and nullif(trim(d.phone), '') is not null
  on conflict do nothing;
  return NEW;
end; $$;
create trigger queue_donation_notification after insert or update on public.donations for each row execute function public.queue_pledge_notification();
create trigger queue_plan_notification after insert on public.payment_plans for each row execute function public.queue_pledge_notification();

create function public.log_notification_event() returns trigger
language plpgsql set search_path = public as $$
begin
  if TG_OP = 'INSERT' or NEW.status is distinct from OLD.status then
    insert into notification_logs(queue_id, event) values (NEW.id, NEW.status);
  end if;
  return NEW;
end; $$;
create trigger log_notification_event after insert or update on public.notification_queue for each row execute function public.log_notification_event();

create function public.cancel_donor_notifications() returns trigger
language plpgsql set search_path = public as $$
begin
  if NEW.deleted_at is not null or NEW.comm_opt_out or not NEW.comm_whatsapp or nullif(trim(NEW.phone),'') is null then
    update notification_queue set status='cancelled' where donor_id=NEW.id and status='queued';
  end if;
  return NEW;
end; $$;
create trigger cancel_donor_notifications after update on public.donors for each row execute function public.cancel_donor_notifications();

create function public.cancel_stale_notifications() returns trigger
language plpgsql set search_path = public as $$
begin
  if NEW.status <> 'pending' then
    update notification_queue set status='cancelled' where donation_id=NEW.id and status='queued' and template_id in ('pledge_received','pledge_reminder');
  end if;
  if NEW.status <> 'confirmed' then
    update notification_queue set status='cancelled' where donation_id=NEW.id and status='queued' and template_id='payment_confirmed';
  end if;
  return NEW;
end; $$;
create trigger cancel_stale_notifications after update on public.donations for each row execute function public.cancel_stale_notifications();

create function public.queue_pledge_reminders() returns integer
language plpgsql security invoker set search_path = public as $$
declare queued integer;
begin
  insert into notification_queue(donor_id, donation_id, template_id, language)
  select d.id, n.id, 'pledge_reminder', coalesce(d.preferred_language,'en')
  from donations n join donors d on d.id=n.donor_id
  where n.status='pending' and n.created_at < now() - interval '7 days'
    and d.comm_whatsapp and not d.comm_opt_out and d.deleted_at is null
    and nullif(trim(d.phone),'') is not null
    and exists (select 1 from campaign_settings where id='main' and is_live)
  on conflict do nothing;
  get diagnostics queued = row_count;
  return queued;
end; $$;
revoke all on function public.queue_pledge_reminders() from public, anon, authenticated;
grant execute on function public.queue_pledge_reminders() to service_role;
COMMIT;

BEGIN;
alter table public.broadcast_log drop constraint if exists broadcast_log_channel_check;
alter table public.broadcast_log add constraint broadcast_log_channel_check check (channel in ('sms','email','whatsapp'));
alter table public.broadcast_log add column accepted_count integer not null default 0;
alter table public.broadcast_log add column failed_count integer not null default 0;
alter table public.broadcast_log add column status text not null default 'legacy' check (status in ('legacy','sending','accepted','partial','failed'));
alter table public.notification_templates add column provider_name text;
alter table public.notification_templates add column provider_language text;
COMMIT;


alter table public.campaign_settings add column if not exists paypal_link text not null default '';

-- Only delivery status is retained: no incoming messages or phone numbers.
create table if not exists public.whatsapp_delivery_events (
  provider_message_id text not null,
  status text not null check (status in ('sent','delivered','read','failed')),
  occurred_at timestamptz not null,
  error_code integer,
  primary key (provider_message_id, status, occurred_at)
);
alter table public.whatsapp_delivery_events enable row level security;
revoke all on public.whatsapp_delivery_events from anon, authenticated;
grant all on public.whatsapp_delivery_events to service_role;


BEGIN;
alter table public.notification_queue drop constraint notification_queue_status_check;
alter table public.notification_queue add constraint notification_queue_status_check check (status in ('queued','sending','cancelled','sent','failed'));
alter table public.notification_queue add column provider_message_id text unique;

create or replace function public.log_notification_event() returns trigger
language plpgsql set search_path = public as $$
begin
  if NEW.status in ('queued','cancelled','sent','failed') and (TG_OP='INSERT' or NEW.status is distinct from OLD.status) then
    insert into notification_logs(queue_id,event,provider_message_id) values (NEW.id,NEW.status,NEW.provider_message_id);
  end if;
  return NEW;
end; $$;

-- Only confirmed-payment thank-you messages; no registration acknowledgements.
create or replace function public.queue_pledge_notification() returns trigger
language plpgsql set search_path = public as $$
begin
  if TG_TABLE_NAME <> 'donations' then return NEW; end if;
  if NEW.status <> 'confirmed' then return NEW; end if;
  if TG_OP='UPDATE' and OLD.status='confirmed' then return NEW; end if;
  insert into notification_queue(donor_id,donation_id,template_id,language)
  select d.id,NEW.id,'payment_confirmed',coalesce(d.preferred_language,'en')
  from donors d where d.id=NEW.donor_id and d.comm_whatsapp and not d.comm_opt_out
    and d.deleted_at is null and nullif(trim(d.phone),'') is not null
  on conflict do nothing;
  return NEW;
end; $$;
update notification_queue set status='cancelled' where template_id='pledge_received' and status='queued';

create or replace function public.queue_pledge_reminders() returns integer
language plpgsql security invoker set search_path = public as $$
declare queued integer;
begin
  insert into notification_queue(donor_id,donation_id,template_id,language)
  select d.id,n.id,'pledge_reminder',coalesce(d.preferred_language,'en')
  from donations n join donors d on d.id=n.donor_id
  where n.status='pending' and n.payment_plan_id is null and n.created_at < now()-interval '7 days'
    and d.comm_whatsapp and not d.comm_opt_out and d.deleted_at is null
    and nullif(trim(d.phone),'') is not null
    and exists(select 1 from campaign_settings where id='main' and is_live)
  on conflict do nothing;
  get diagnostics queued = row_count;
  return queued;
end; $$;

update notification_templates set body=case language
  when 'sv' then 'Salam! En vänlig påminnelse om ditt registrerade donationslöfte till Masjid Al Rahma på {{amount}} kr. Betalningsreferens: {{reference}}. Om du redan har betalat, kontakta moskén så att vi kan kontrollera betalningen. Behöver du ändra ditt löfte eller sluta få påminnelser? Kontakta oss via https://alrahmaborlange.se/. Tack för ditt stöd.'
  when 'en' then 'Salam! A friendly reminder about your registered donation pledge of {{amount}} SEK to Masjid Al Rahma. Payment reference: {{reference}}. If you have already paid, please contact the mosque so we can check your payment. To change your pledge or stop reminders, contact us through https://alrahmaborlange.se/. Thank you for your support.'
  when 'ar' then 'السلام عليكم! تذكير لطيف بتعهدك المسجل بالتبرع بمبلغ {{amount}} كرونة لمسجد الرحمة. مرجع الدفع: {{reference}}. إذا كنت قد دفعت بالفعل، يرجى التواصل مع المسجد للتحقق من الدفع. لتعديل تعهدك أو إيقاف التذكيرات، تواصل معنا عبر https://alrahmaborlange.se/. شكرًا لدعمك.'
end, approval_status='draft',provider_name=null,provider_language=null where id='pledge_reminder';
update notification_templates set body=case language
  when 'sv' then 'Tack för ditt stöd till Masjid Al Rahma! Vi har bekräftat din betalning på {{amount}} kr. Betalningsreferens: {{reference}}. Må Allah belöna dig för din generositet. Vid frågor, kontakta moskén via https://alrahmaborlange.se/.'
  when 'en' then 'Thank you for supporting Masjid Al Rahma! We have confirmed your payment of {{amount}} SEK. Payment reference: {{reference}}. May Allah reward your generosity. For questions, contact the mosque through https://alrahmaborlange.se/.'
  when 'ar' then 'شكرًا لدعمك مسجد الرحمة! تم تأكيد دفعتك بمبلغ {{amount}} كرونة. مرجع الدفع: {{reference}}. جزاك الله خيرًا على كرمك. للاستفسارات، تواصل مع المسجد عبر https://alrahmaborlange.se/.'
end, approval_status='draft',provider_name=null,provider_language=null where id='payment_confirmed';
COMMIT;


BEGIN;
alter table public.donations add column paid_on date;
alter table public.donations add column recording_key uuid unique;

create function public.protect_paid_plan_terms() returns trigger
language plpgsql set search_path=public as $$
begin
  if (NEW.total_amount_sek<>OLD.total_amount_sek or NEW.months<>OLD.months) and exists(select 1 from donations where payment_plan_id=OLD.id and status='confirmed') then
    raise exception 'Planens belopp och antal månader kan inte ändras efter registrerad betalning.';
  end if;
  return NEW;
end; $$;
create trigger protect_paid_plan_terms before update on public.payment_plans for each row execute function public.protect_paid_plan_terms();

create function public.sync_plan_payments() returns trigger
language plpgsql set search_path=public as $$
declare target uuid; total_paid bigint;
begin
  for target in select distinct id from unnest(array[case when TG_OP<>'DELETE' then NEW.payment_plan_id end,case when TG_OP<>'INSERT' then OLD.payment_plan_id end]) id where id is not null loop
    perform 1 from payment_plans where id=target for update;
    select coalesce(sum(amount_sek),0) into total_paid from donations where payment_plan_id=target and status='confirmed';
    update payment_plans set installments_paid=least(months,total_paid/greatest(amount_per_month_sek,1)),
      status=case when status='cancelled' then status when total_paid>=total_amount_sek then 'completed' else 'active' end where id=target;
  end loop;
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end; $$;
create trigger sync_plan_payments after insert or update or delete on public.donations for each row execute function public.sync_plan_payments();

create function public.record_installment(plan_id uuid,amount integer,payment_method text,payment_date date,request_key uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare p payment_plans; existing donations; paid bigint; payment donations;
begin
  if amount is null or amount<1 or amount>10000000 or payment_method is null or payment_method not in ('swish','bank_transfer','cash','card') or payment_date is null or payment_date>(now() at time zone 'Europe/Stockholm')::date or request_key is null then raise exception 'Kontrollera betalningsuppgifterna.'; end if;
  select * into p from payment_plans where id=plan_id for update;
  if not found then raise exception 'Betalningsplanen hittades inte.'; end if;
  select * into existing from donations where recording_key=request_key;
  if found then
    if existing.payment_plan_id<>plan_id or existing.amount_sek<>amount or existing.method<>payment_method or existing.paid_on<>payment_date then raise exception 'Uppgifterna har ändrats. Kontrollera den tidigare betalningen.'; end if;
    return to_jsonb(existing);
  end if;
  if p.status<>'active' or p.donor_id is null or not exists(select 1 from donors where id=p.donor_id and deleted_at is null) then raise exception 'Planen är avslutad, avbruten eller saknar givare.'; end if;
  select coalesce(sum(amount_sek),0) into paid from donations where payment_plan_id=plan_id and status='confirmed';
  if paid+amount>p.total_amount_sek then raise exception 'Beloppet överstiger det som återstår att betala.'; end if;
  insert into donations(donor_id,payment_plan_id,display_name,is_anonymous,amount_sek,method,status,confirmed_at,paid_on,recording_key,reference)
  values(p.donor_id,p.id,p.display_name,coalesce(p.is_anonymous,true),amount,payment_method,'confirmed',now(),payment_date,request_key,'AR-'||upper(replace(gen_random_uuid()::text,'-','')))
  returning * into payment;
  return to_jsonb(payment);
end; $$;
revoke all on function public.record_installment(uuid,integer,text,date,uuid) from public,anon,authenticated;
grant execute on function public.record_installment(uuid,integer,text,date,uuid) to service_role;
COMMIT;


BEGIN;
alter table public.payment_plans add column first_due_on date;
alter table public.donors add column reminders_paused boolean not null default false;
alter table public.campaign_settings add column notifications_paused boolean not null default false;
alter table public.notification_queue add column installment_number integer check (installment_number between 1 and 12);
alter table public.notification_queue add column amount_due integer;
alter table public.notification_queue add column due_on date;
drop index public.notification_plan_once;
create unique index notification_plan_once on public.notification_queue(plan_id,template_id) where plan_id is not null and installment_number is null;
create unique index notification_installment_once on public.notification_queue(plan_id,template_id,installment_number) where plan_id is not null and installment_number is not null;

insert into public.notification_templates(id,language,body) values
 ('plan_reminder','sv','Salam! En vänlig påminnelse om en obetald delbetalning i din donationsplan till Masjid Al Rahma. Kvar på delbetalningen: {{amount}} kr. Planens betalningsreferens: {{reference}}. Om du redan har betalat, kontakta moskén så att vi kan kontrollera betalningen. För att ändra planen eller sluta få påminnelser, kontakta oss via https://alrahmaborlange.se/. Tack för ditt stöd.'),
 ('plan_reminder','en','Salam! A friendly reminder about an unpaid installment in your donation plan to Masjid Al Rahma. Remaining on this installment: {{amount}} SEK. Plan payment reference: {{reference}}. If you have already paid, please contact the mosque so we can check your payment. To change your plan or stop reminders, contact us through https://alrahmaborlange.se/. Thank you for your support.'),
 ('plan_reminder','ar','السلام عليكم! تذكير لطيف بقسط غير مدفوع ضمن خطة تبرعك لمسجد الرحمة. المتبقي من هذا القسط: {{amount}} كرونة. مرجع دفع الخطة: {{reference}}. إذا كنت قد دفعت بالفعل، تواصل مع المسجد للتحقق. لتعديل الخطة أو إيقاف التذكيرات، تواصل معنا عبر https://alrahmaborlange.se/. شكرًا لدعمك.');

-- Amounts are recomputed immediately before sending; old or paid installments return null.
create function public.plan_reminder_details(target_plan uuid,target_installment integer) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare p payment_plans; paid bigint; earliest integer; due date; remaining integer;
begin
  select * into p from payment_plans where id=target_plan;
  if not found or p.status<>'active' or p.amount_per_month_sek<1 then return null; end if;
  select coalesce(sum(amount_sek),0) into paid from donations where payment_plan_id=p.id and status='confirmed';
  earliest=least(p.months+1,floor(paid::numeric/p.amount_per_month_sek)+1)::integer;
  if earliest>p.months or target_installment is distinct from earliest then return null; end if;
  if p.first_due_on is null then return jsonb_build_object('waiting',true); end if;
  due=(p.first_due_on+make_interval(months=>earliest-1))::date;
  if due+7>(now() at time zone 'Europe/Stockholm')::date then return jsonb_build_object('waiting',true); end if;
  remaining=p.amount_per_month_sek-(paid%p.amount_per_month_sek)::integer;
  return jsonb_build_object('amount',remaining,'reference',p.reference,'dueOn',due);
end; $$;
revoke all on function public.plan_reminder_details(uuid,integer) from public,anon,authenticated;
grant execute on function public.plan_reminder_details(uuid,integer) to service_role;

create function public.queue_monthly_reminders() returns integer
language plpgsql security invoker set search_path=public as $$
declare queued integer;
begin
  insert into notification_queue(donor_id,plan_id,template_id,language,installment_number,amount_due,due_on)
  select d.id,p.id,'plan_reminder',coalesce(d.preferred_language,'en'),progress.installment,(details.value->>'amount')::integer,(details.value->>'dueOn')::date
  from payment_plans p join donors d on d.id=p.donor_id
  cross join lateral (select least(p.months+1,floor(coalesce(sum(n.amount_sek),0)::numeric/greatest(p.amount_per_month_sek,1))+1)::integer installment from donations n where n.payment_plan_id=p.id and n.status='confirmed') progress
  cross join lateral (select plan_reminder_details(p.id,progress.installment) value) details
  where details.value ? 'amount' and d.comm_whatsapp and not d.comm_opt_out and not d.reminders_paused and d.deleted_at is null
    and nullif(trim(d.phone),'') is not null and exists(select 1 from campaign_settings where id='main' and is_live and not notifications_paused)
  on conflict do nothing;
  get diagnostics queued=row_count;
  return queued;
end; $$;
revoke all on function public.queue_monthly_reminders() from public,anon,authenticated;
grant execute on function public.queue_monthly_reminders() to service_role;
COMMIT;


BEGIN;
create table public.notification_controls_log (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid references public.donors(id) on delete set null,
  action text not null check(action in ('pause_reminders','resume_reminders','stop_all','pause_automatic','resume_automatic')),
  created_at timestamptz not null default now()
);
alter table public.notification_controls_log enable row level security;
revoke all on public.notification_controls_log from anon,authenticated;
grant all on public.notification_controls_log to service_role;
create function public.set_donor_notification_controls(target_donor uuid,requested_action text) returns void
language plpgsql security invoker set search_path=public as $$
begin
  if requested_action not in ('pause_reminders','resume_reminders','stop_all') then raise exception 'Invalid action'; end if;
  perform 1 from donors where id=target_donor and deleted_at is null for update;
  if not found then raise exception 'Donor not found'; end if;
  if requested_action='stop_all' then
    update donors set comm_opt_out=true,comm_email=false,comm_sms=false,comm_whatsapp=false where id=target_donor;
  else
    update donors set reminders_paused=(requested_action='pause_reminders') where id=target_donor;
  end if;
  insert into notification_controls_log(donor_id,action) values(target_donor,requested_action);
end; $$;
revoke all on function public.set_donor_notification_controls(uuid,text) from public,anon,authenticated;
grant execute on function public.set_donor_notification_controls(uuid,text) to service_role;
create function public.set_notification_pause(paused boolean) returns void
language plpgsql security invoker set search_path=public as $$
begin
  if paused is null then raise exception 'Missing pause value'; end if;
  update campaign_settings set notifications_paused=paused,updated_at=now() where id='main';
  if not found then raise exception 'Campaign not found'; end if;
  insert into notification_controls_log(action) values(case when paused then 'pause_automatic' else 'resume_automatic' end);
end; $$;
revoke all on function public.set_notification_pause(boolean) from public,anon,authenticated;
grant execute on function public.set_notification_pause(boolean) to service_role;

create function public.pending_whatsapp_notifications() returns setof public.notification_queue
language sql security invoker set search_path=public as $$
  select q.* from notification_queue q
  join notification_templates t on t.id=q.template_id and t.language=q.language
  join donors d on d.id=q.donor_id
  where q.status='queued' and q.template_id in ('payment_confirmed','pledge_reminder','plan_reminder')
    and t.approval_status='approved' and t.provider_name is not null and t.provider_language is not null
    and d.comm_whatsapp and not d.comm_opt_out and d.deleted_at is null
    and d.preferred_language=q.language and nullif(trim(d.phone),'') is not null
    and (q.template_id='payment_confirmed' or not d.reminders_paused)
  order by case when q.template_id='payment_confirmed' then 1 else 0 end,q.created_at
  limit 3;
$$;
revoke all on function public.pending_whatsapp_notifications() from public,anon,authenticated;
grant execute on function public.pending_whatsapp_notifications() to service_role;

create or replace function public.queue_pledge_reminders() returns integer
language plpgsql security invoker set search_path=public as $$
declare queued integer;
begin
  insert into notification_queue(donor_id,donation_id,template_id,language)
  select d.id,n.id,'pledge_reminder',coalesce(d.preferred_language,'en')
  from donations n join donors d on d.id=n.donor_id
  where n.status='pending' and n.payment_plan_id is null and n.created_at < now()-interval '7 days'
    and d.comm_whatsapp and not d.comm_opt_out and not d.reminders_paused and d.deleted_at is null
    and nullif(trim(d.phone),'') is not null
    and exists(select 1 from campaign_settings where id='main' and is_live and not notifications_paused)
  on conflict do nothing;
  get diagnostics queued=row_count;
  return queued;
end; $$;
COMMIT;

-- ===== migrations/202610140001_payment_settings.sql =====
BEGIN;
-- Payment settings added after the QR/supporter update: bank rows, card link,
-- uploaded QR images and the PayPal placeholder toggle. Safe to re-run.
alter table public.campaign_settings add column if not exists plusgiro text not null default '';
alter table public.campaign_settings add column if not exists bank_name text not null default '';
alter table public.campaign_settings add column if not exists account_holder text not null default '';
alter table public.campaign_settings add column if not exists account_number text not null default '';
alter table public.campaign_settings add column if not exists bic text not null default '';
alter table public.campaign_settings add column if not exists card_link text not null default '';
-- While paypal_link is empty, show the Swish QR in the PayPal slot.
alter table public.campaign_settings add column if not exists paypal_placeholder boolean not null default true;
-- Own uploaded QR images (public URLs in the "qr-codes" Storage bucket).
alter table public.campaign_settings add column if not exists swish_qr_url text not null default '';
alter table public.campaign_settings add column if not exists paypal_qr_url text not null default '';
insert into storage.buckets (id, name, public) values ('qr-codes', 'qr-codes', true) on conflict do nothing;
COMMIT;

-- ===== migrations/202610140002_admin_phase1.sql =====
BEGIN;
-- Phase 1 of the admin rebuild: campaigns, transactions, pledges, donors,
-- audit log. These are NEW tables; the legacy tables (donations, donors,
-- payment_plans, campaign_settings ...) are untouched and still power the
-- public tracker until a later phase replaces it.
-- Run after schema.sql / admins.sql. Safe to re-run.
--
-- Access model: every table has RLS enabled and (except published campaigns)
-- NO policy, so only the server (service-role key, behind admin auth) can
-- read or write. There are no roles yet: any row in `admins` is a full admin.

-- ---------------------------------------------------------------- enums
do $$ begin
  create type campaign_status as enum ('draft', 'published', 'paused', 'ended');
exception when duplicate_object then null; end $$;
do $$ begin
  create type fund_type as enum ('sadaqah', 'zakat', 'building', 'other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type tx_method as enum ('swish', 'card', 'paypal', 'cash', 'bank_transfer', 'import');
exception when duplicate_object then null; end $$;
do $$ begin
  -- pending_provider = online payment started but not yet confirmed by the provider
  create type tx_status as enum ('pending_provider', 'awaiting_approval', 'confirmed', 'rejected', 'refunded');
exception when duplicate_object then null; end $$;
do $$ begin
  create type pledge_status as enum ('active', 'cancelled');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------- campaigns
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  short_text text not null default '',
  long_text text not null default '',
  image_url text not null default '',
  goal_sek integer not null check (goal_sek > 0),
  starts_on date,
  ends_on date,
  fund_type fund_type not null default 'sadaqah',
  -- Do outstanding pledges count toward the public total? Default no.
  pledges_count_public boolean not null default false,
  status campaign_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

-- --------------------------------------------------------------- donors
-- Only created when needed (pledge, contact consent, donor-provided email).
-- Anonymous online gifts never create a row here.
create table if not exists donor_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  anonymized_at timestamptz,
  check (phone is not null or email is not null or anonymized_at is not null)
);
create index if not exists donor_profiles_phone_idx on donor_profiles (phone);
create index if not exists donor_profiles_email_idx on donor_profiles (lower(email));

-- One row per consent decision, per purpose. Latest row per (donor, purpose) wins.
create table if not exists donor_consents (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donor_profiles(id) on delete cascade,
  purpose text not null check (purpose in ('storage', 'contact_sms', 'contact_email', 'show_first_name')),
  granted boolean not null,
  source text not null check (source in ('form', 'event', 'manual')),
  created_at timestamptz not null default now()
);
create index if not exists donor_consents_donor_idx on donor_consents (donor_id, purpose, created_at desc);

-- --------------------------------------------------------------- pledges
create table if not exists pledges (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete restrict,
  donor_id uuid not null references donor_profiles(id) on delete restrict,
  total_sek integer not null check (total_sek > 0),
  status pledge_status not null default 'active',
  cancel_reason text,
  reminders boolean not null default true,
  created_at timestamptz not null default now(),
  check (status <> 'cancelled' or cancel_reason is not null)
);

create table if not exists pledge_installments (
  id uuid primary key default gen_random_uuid(),
  pledge_id uuid not null references pledges(id) on delete cascade,
  seq integer not null check (seq > 0),
  due_on date not null,
  amount_sek integer not null check (amount_sek > 0),
  unique (pledge_id, seq)
);

-- ---------------------------------------------------------- transactions
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete restrict,
  amount_sek integer not null check (amount_sek > 0),
  received_on date not null default current_date,
  method tx_method not null,
  status tx_status not null,
  donor_id uuid references donor_profiles(id) on delete set null,
  -- First name shown publicly; null = "Anonym". Never a surname.
  display_name text,
  installment_id uuid references pledge_installments(id) on delete set null,
  receipt_no text,
  -- Manual / imported rows: who entered and who approved (admin user ids).
  registered_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  -- Online rows: provider reference, locked from edits in the app.
  provider_ref text,
  refund_reason text,
  created_at timestamptz not null default now(),
  -- Four eyes, enforced in the database as well as the UI.
  check (approved_by is null or approved_by <> registered_by),
  check (
    method in ('swish', 'card', 'paypal')
    or status in ('awaiting_approval', 'rejected')
    or approved_by is not null
  ),
  check (status <> 'refunded' or refund_reason is not null)
);
create index if not exists transactions_campaign_idx on transactions (campaign_id, status);
create index if not exists transactions_received_idx on transactions (received_on desc);
create index if not exists transactions_status_idx on transactions (status, created_at);

-- ------------------------------------------------------------ audit log
-- Append-only: UPDATE/DELETE are blocked for everyone, including the service role.
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  user_name text,
  action text not null,       -- e.g. campaign.create, campaign.update
  object_type text not null,
  object_id text,
  object_label text,
  changes jsonb,              -- {field: {from, to}}
  ip text
);
create index if not exists audit_log_at_idx on audit_log (at desc);

create or replace function audit_log_immutable() returns trigger as $$
begin
  raise exception 'audit_log is append-only';
end;
$$ language plpgsql;
drop trigger if exists trg_audit_log_immutable on audit_log;
create trigger trg_audit_log_immutable
  before update or delete on audit_log
  for each row execute function audit_log_immutable();
drop trigger if exists trg_audit_log_no_truncate on audit_log;
create trigger trg_audit_log_no_truncate
  before truncate on audit_log
  for each statement execute function audit_log_immutable();

-- --------------------------------------------------------------- totals
-- Totals are always computed here, never typed in.
create or replace view installment_balances with (security_invoker = true) as
select
  i.id as installment_id,
  i.pledge_id,
  p.campaign_id,
  i.seq,
  i.due_on,
  i.amount_sek,
  coalesce(sum(t.amount_sek) filter (where t.status = 'confirmed'), 0)::int as paid_sek,
  greatest(i.amount_sek - coalesce(sum(t.amount_sek) filter (where t.status = 'confirmed'), 0), 0)::int as outstanding_sek,
  p.status as pledge_status
from pledge_installments i
join pledges p on p.id = i.pledge_id
left join transactions t on t.installment_id = i.id
group by i.id, p.id;

create or replace view campaign_stats with (security_invoker = true) as
select
  c.id as campaign_id,
  coalesce(tx.confirmed_sek, 0)::int as confirmed_sek,
  coalesce(tx.gifts, 0)::int as gifts,
  coalesce(tx.donors, 0)::int as donors,
  coalesce(pl.outstanding_sek, 0)::int as pledged_outstanding_sek
from campaigns c
left join (
  select campaign_id,
         sum(amount_sek) as confirmed_sek,
         count(*) as gifts,
         -- each anonymous gift counts as one donor
         count(distinct coalesce(donor_id::text, id::text)) as donors
  from transactions where status = 'confirmed' group by campaign_id
) tx on tx.campaign_id = c.id
left join (
  select campaign_id, sum(outstanding_sek) as outstanding_sek
  from installment_balances where pledge_status = 'active' group by campaign_id
) pl on pl.campaign_id = c.id;

-- ------------------------------------------------------------------ RLS
alter table campaigns enable row level security;
alter table donor_profiles enable row level security;
alter table donor_consents enable row level security;
alter table pledges enable row level security;
alter table pledge_installments enable row level security;
alter table transactions enable row level security;
alter table audit_log enable row level security;

drop policy if exists "public can read published campaigns" on campaigns;
create policy "public can read published campaigns"
  on campaigns for select using (status = 'published');

-- ------------------------------------------------------------- storage
insert into storage.buckets (id, name, public) values ('campaign-images', 'campaign-images', true)
on conflict do nothing;
COMMIT;

-- ===== migrations/202610140003_admin_phase2.sql =====
BEGIN;
-- Phase 2: Transaktioner and Löften. Run after phase1.sql. Safe to re-run.

-- Who physically received a cash gift (free text, e.g. a volunteer's name).
-- registered_by (who entered it in the admin) stays the four-eyes anchor.
alter table transactions add column if not exists received_by_name text;
alter table transactions add column if not exists import_batch uuid;
create index if not exists transactions_import_batch_idx on transactions (import_batch) where import_batch is not null;

-- Duplicate guard for imports and manual entries: the same receipt number
-- cannot be booked twice in one campaign.
create unique index if not exists transactions_receipt_unique
  on transactions (campaign_id, receipt_no)
  where receipt_no is not null and status <> 'rejected';
COMMIT;

-- Homepage settings and manual opening total (202611120001)
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
    swish_qr_url = case when payment ? 'swish_qr_url' then payment->>'swish_qr_url' when regexp_replace(swish_number, '\D', '', 'g') is distinct from regexp_replace(payment->>'swish_number', '\D', '', 'g') then '' else swish_qr_url end,
    paypal_qr_url = case when payment ? 'paypal_qr_url' then payment->>'paypal_qr_url' when paypal_link is distinct from payment->>'paypal_link' then '' else paypal_qr_url end,
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

-- Capability check prevents the editor from publishing before this migration.
create or replace function public.homepage_qr_uploads_ready() returns boolean
language sql set search_path = public as 'select true';
revoke all on function public.homepage_qr_uploads_ready() from public, anon, authenticated;
grant execute on function public.homepage_qr_uploads_ready() to service_role;
