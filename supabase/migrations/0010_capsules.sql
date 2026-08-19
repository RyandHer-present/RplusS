-- Time capsules.
--
-- 0001 hid the whole row until unlock time, which meant the recipient could not
-- even tell one existed — no countdown, no anticipation. But simply letting
-- them read the row would hand over the text too, since row policies cannot
-- restrict columns.
--
-- So: the row is readable, `body` is not granted at all, and the text comes
-- back only through a function that checks the clock. Reading it early is not
-- prevented by the UI; there is no path to it.

drop policy if exists read_unlocked on capsules;
drop policy if exists open_unlocked on capsules;

create policy read_all on capsules for select using (is_member());

revoke select on capsules from authenticated;
grant select (id, author_id, media_id, unlock_at, opened_at, created_at) on capsules to authenticated;
grant insert (author_id, body, media_id, unlock_at) on capsules to authenticated;

create policy mark_opened on capsules for update using (is_member());
revoke update on capsules from authenticated;
grant update (opened_at) on capsules to authenticated;

create policy delete_own on capsules for delete
  using (author_id = current_app_user() or is_admin());
grant delete on capsules to authenticated;

/*
 * Returns a capsule's text, but only once its time has passed. Admin is not
 * exempt: the point of a capsule is that nobody reads it early.
 */
create or replace function open_capsule(capsule_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  row_data capsules%rowtype;
begin
  if not is_member() then
    raise exception 'not signed in';
  end if;

  select * into row_data from capsules where id = capsule_id;
  if not found then
    raise exception 'no such capsule';
  end if;

  if row_data.unlock_at > now() then
    raise exception 'not yet';
  end if;

  return row_data.body;
end;
$$;

grant execute on function open_capsule(uuid) to authenticated;

alter publication supabase_realtime add table capsules;
