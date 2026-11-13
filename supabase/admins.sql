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
