-- Broadcast access only. Assign Owners explicitly after the board names them.
alter table public.admins add column if not exists role text not null default 'admin';
alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add constraint admins_role_check check (role in ('admin', 'owner'));
