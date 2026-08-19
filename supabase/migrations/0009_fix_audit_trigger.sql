-- Fixes the audit trigger.
--
-- 0008 used `(case ... end)::jsonb` to read the row's id. A row type cannot be
-- cast to jsonb directly, so every insert, update and delete on the audited
-- tables failed outright. Resolving the row into a jsonb variable first fixes
-- it and makes the function easier to follow.

create or replace function record_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target  jsonb;
  payload jsonb;
begin
  if tg_op = 'DELETE' then
    target := to_jsonb(old);
    -- Keep the whole row, so an unsent message stays readable afterwards.
    payload := target;
  elsif tg_op = 'UPDATE' then
    target := to_jsonb(new);
    -- Only what actually changed, with the previous value alongside the new
    -- one. This is what makes "what did it say before the edit" answerable.
    select jsonb_object_agg(key, jsonb_build_object('from', o.value, 'to', n.value))
      into payload
      from jsonb_each(to_jsonb(old)) as o
      join jsonb_each(to_jsonb(new)) as n using (key)
     where o.value is distinct from n.value;

    if payload is null then return new; end if;
  else
    target := to_jsonb(new);
    payload := target;
  end if;

  insert into audit_log (actor, action, entity, entity_id, detail)
  values (who(), lower(tg_op), tg_table_name, (target ->> 'id')::uuid, payload);

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
