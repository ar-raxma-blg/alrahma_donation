-- Admin-editable public texts. Defaults stay in lib/i18n.ts; a row here
-- replaces one phrase in one language. Deleting the row restores the default.
create table if not exists public.translation_overrides (
  lang text not null check (lang in ('en','sv','ar')),
  key text not null check (char_length(key) between 1 and 80),
  value text not null check (char_length(value) between 1 and 600),
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (lang, key)
);
alter table public.translation_overrides enable row level security;
drop policy if exists "public can read translation overrides" on public.translation_overrides;
create policy "public can read translation overrides" on public.translation_overrides for select using (true);
-- No insert/update/delete policy: only the server (service role) writes.
