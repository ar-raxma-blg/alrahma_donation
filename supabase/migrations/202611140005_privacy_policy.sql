-- Owner-editable privacy policy (controller details + text per language).
-- Empty {} means "use the built-in default text".
alter table public.campaign_settings add column if not exists privacy_policy jsonb not null default '{}'::jsonb;
