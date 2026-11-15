-- Edit an active pledge's payment schedule atomically.
-- p_installments: [{ "id": uuid|null, "due_on": "YYYY-MM-DD", "amount_sek": int }]
-- Installments that already have any payment registered keep their amount and
-- cannot be removed (dates may move). The pledge total is the sum of the rows.
create or replace function public.edit_pledge(p_pledge uuid, p_installments jsonb, actor uuid, actor_name text)
returns void language plpgsql set search_path = public as $$
declare
  pl pledges%rowtype; item jsonb; old_total integer; old_count integer; new_total integer := 0; new_count integer;
  existing pledge_installments%rowtype; used boolean; kept uuid[] := '{}'; n integer := 0;
begin
  if not exists (select 1 from public.admins where user_id = actor) then raise exception 'Admin required' using errcode = '42501'; end if;
  select * into pl from public.pledges where id = p_pledge for update;
  if not found then raise exception 'Pledge not found' using errcode = 'P0002'; end if;
  if pl.status <> 'active' then raise exception 'Pledge not active' using errcode = '02000'; end if;
  if jsonb_typeof(p_installments) <> 'array' or jsonb_array_length(p_installments) not between 1 and 60 then raise exception 'Invalid installments' using errcode = '22023'; end if;
  old_total := pl.total_sek;
  select count(*) into old_count from public.pledge_installments where pledge_id = p_pledge;
  -- Park existing sequence numbers so renumbering cannot collide.
  update public.pledge_installments set seq = seq + 1000 where pledge_id = p_pledge;

  for item in select * from jsonb_array_elements(p_installments) loop
    if (item->>'amount_sek')::integer < 1 then raise exception 'Invalid amount' using errcode = '22023'; end if;
    new_total := new_total + (item->>'amount_sek')::integer;
    if nullif(item->>'id','') is not null then
      select * into existing from public.pledge_installments where id = (item->>'id')::uuid and pledge_id = p_pledge;
      if not found then raise exception 'Unknown installment' using errcode = '22023'; end if;
      select exists(select 1 from public.transactions where installment_id = existing.id) into used;
      if used and existing.amount_sek <> (item->>'amount_sek')::integer then raise exception 'Paid installment locked' using errcode = '22023'; end if;
      update public.pledge_installments set due_on = (item->>'due_on')::date, amount_sek = (item->>'amount_sek')::integer where id = existing.id;
      kept := kept || existing.id;
    else
      n := n + 1;
      insert into public.pledge_installments(pledge_id, seq, due_on, amount_sek)
      values (p_pledge, 3000 + n, (item->>'due_on')::date, (item->>'amount_sek')::integer)
      returning id into existing.id;
      kept := kept || existing.id;
    end if;
  end loop;

  if exists (select 1 from public.pledge_installments i where i.pledge_id = p_pledge and not (i.id = any(kept)) and exists (select 1 from public.transactions t where t.installment_id = i.id)) then
    raise exception 'Paid installment cannot be removed' using errcode = '22023';
  end if;
  delete from public.pledge_installments where pledge_id = p_pledge and not (id = any(kept));

  update public.pledge_installments i set seq = r.n from (
    select id, row_number() over (order by due_on, seq, id) as n from public.pledge_installments where pledge_id = p_pledge
  ) r where i.id = r.id;
  select count(*) into new_count from public.pledge_installments where pledge_id = p_pledge;
  update public.pledges set total_sek = new_total where id = p_pledge;
  insert into public.audit_log(user_id, user_name, action, object_type, object_id, object_label, changes)
  values (actor, actor_name, 'pledge.update', 'pledge', p_pledge::text, new_total || ' kr i ' || new_count || ' delbetalningar', jsonb_build_object(
    'total_sek', jsonb_build_object('from', old_total, 'to', new_total),
    'installments', jsonb_build_object('from', old_count, 'to', new_count)));
end;
$$;
revoke all on function public.edit_pledge(uuid, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.edit_pledge(uuid, jsonb, uuid, text) to service_role;
