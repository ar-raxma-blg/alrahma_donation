-- Owner can hide the public "Live donations" list. Shown by default.
alter table public.campaign_settings add column if not exists show_live_feed boolean not null default true;
