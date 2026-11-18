-- Invitation links: each channel is a person (or group) who shares the donation
-- page. A registration made through /?ref=<code> or /supporter?ref=<code> is
-- tied to that channel, so staff can see who registered via whose link.
--
-- Channels are created by an admin (source 'admin') or by a visitor who taps
-- "Dela" on the public page and optionally types their name (source 'public').
-- The name is only ever read by the server for the admin panel.
create table if not exists public.invite_channels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9-]{3,40}$'),
  name text check (name is null or length(name) <= 80),
  source text not null default 'admin' check (source in ('admin', 'public')),
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.invite_channels enable row level security;
revoke all on public.invite_channels from anon, authenticated;

alter table public.donors add column if not exists invite_channel_id uuid references public.invite_channels(id) on delete set null;
create index if not exists donors_invite_channel_idx on public.donors(invite_channel_id) where invite_channel_id is not null;

-- Called by the server right after register_donation succeeds. Unknown codes and
-- unknown references are ignored: a bad link must never block a registration.
create or replace function public.attach_invite(registration_ref text, invite_code text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare channel uuid; owner_donor uuid;
begin
  select id into channel from invite_channels where code = lower(invite_code);
  if channel is null then return false; end if;
  select donor_id into owner_donor from donations where reference = registration_ref;
  if owner_donor is null then select donor_id into owner_donor from payment_plans where reference = registration_ref; end if;
  if owner_donor is null then return false; end if;
  update donors set invite_channel_id = channel where id = owner_donor and invite_channel_id is null;
  return found;
end;
$$;
revoke all on function public.attach_invite(text, text) from public, anon, authenticated;
grant execute on function public.attach_invite(text, text) to service_role;
