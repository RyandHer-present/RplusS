-- Admin mode and the audit trail.
--
-- Admin is a third sign-in that belongs to neither person. It can read, edit
-- and delete anything, but it deliberately cannot *create* anything: every
-- insert policy requires author = current_app_user(), and for admin that is
-- null, so posting as Ry or Sarah fails on its own without a special rule.

create table admin_account (
  auth_uid uuid primary key references auth.users(id) on delete cascade
);

alter table admin_account enable row level security;
-- No policies: unreachable from any client. Only is_admin() reads it, and that
-- runs as definer.

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_account where auth_uid = auth.uid())
$$;

-- Read access now covers admin as well as the two people.
create or replace function is_member() returns boolean
language sql stable as $$
  select current_app_user() is not null or is_admin()
$$;

grant execute on function is_admin() to authenticated;

-- ------------------------------------------------------------- audit log --

create table audit_log (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  -- 'ry', 'sarah' or 'admin'. Null only if something ran without a session.
  actor     text,
  action    text not null,
  entity    text not null,
  entity_id uuid,
  detail    jsonb
);

create index audit_at_idx     on audit_log (at desc);
create index audit_entity_idx on audit_log (entity, at desc);

alter table audit_log enable row level security;

-- Only admin reads the log, and nobody edits it. Without an update or delete
-- policy the history cannot be rewritten, including by admin.
create policy admin_reads on audit_log for select using (is_admin());

grant select on audit_log to authenticated;
grant all privileges on audit_log to service_role;
grant usage, select on sequence audit_log_id_seq to authenticated, service_role;

create or replace function who() returns text
language sql stable as $$
  select coalesce(current_app_user()::text, case when is_admin() then 'admin' end)
$$;

/*
 * Generic change recorder.
 *
 * Deletes keep the whole row so an unsent message is still readable afterwards,
 * and updates keep the previous values of whatever actually changed — which is
 * what makes "what did it say before the edit" answerable.
 */
create or replace function record_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  payload jsonb;
begin
  if tg_op = 'DELETE' then
    payload := to_jsonb(old);
  elsif tg_op = 'UPDATE' then
    -- Only the fields that differ, old value alongside new.
    select jsonb_object_agg(key, jsonb_build_object('from', old_row.value, 'to', new_row.value))
      into payload
      from jsonb_each(to_jsonb(old)) as old_row
      join jsonb_each(to_jsonb(new)) as new_row using (key)
     where old_row.value is distinct from new_row.value;

    if payload is null then return new; end if;
  else
    payload := to_jsonb(new);
  end if;

  insert into audit_log (actor, action, entity, entity_id, detail)
  values (
    who(),
    lower(tg_op),
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then old else new end)::jsonb ->> 'id', null)::uuid,
    payload
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger audit_messages    after insert or update or delete on messages    for each row execute function record_change();
create trigger audit_notes       after insert or update or delete on notes       for each row execute function record_change();
create trigger audit_fits        after insert or update or delete on fits        for each row execute function record_change();
create trigger audit_gallery     after insert or update or delete on gallery     for each row execute function record_change();
create trigger audit_voice_notes after insert or update or delete on voice_notes for each row execute function record_change();
create trigger audit_media       after insert or delete on media                 for each row execute function record_change();

-- --------------------------------------------------------- presence log --

create table presence_log (
  id      bigserial primary key,
  user_id user_id not null references users(id),
  event   text    not null check (event in ('online', 'offline')),
  at      timestamptz not null default now()
);

create index presence_at_idx on presence_log (at desc);

alter table presence_log enable row level security;

create policy write_own  on presence_log for insert with check (user_id = current_app_user());
create policy admin_reads on presence_log for select using (is_admin());

grant select, insert on presence_log to authenticated;
grant all privileges on presence_log to service_role;
grant usage, select on sequence presence_log_id_seq to authenticated, service_role;

-- ------------------------------------------------- admin edit and delete --

-- Admin may change message text, which the sender-only guard would otherwise
-- refuse. Who sent it and when stay immutable for everyone.
create or replace function guard_message_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sender_id is distinct from old.sender_id
     or new.created_at is distinct from old.created_at then
    raise exception 'sender and timestamp are immutable';
  end if;

  if new.body is distinct from old.body then
    if old.sender_id is distinct from current_app_user() and not is_admin() then
      raise exception 'only the sender can edit this message';
    end if;
    new.edited_at := now();
  end if;

  return new;
end;
$$;

drop policy if exists delete_own on messages;
create policy delete_own on messages for delete
  using (sender_id = current_app_user() or is_admin());

drop policy if exists edit_own on notes;
create policy edit_own on notes for update
  using (author_id = current_app_user() or is_admin());
drop policy if exists delete_own on notes;
create policy delete_own on notes for delete
  using (author_id = current_app_user() or is_admin());

drop policy if exists edit_own on fits;
create policy edit_own on fits for update
  using (author_id = current_app_user() or is_admin());
drop policy if exists delete_own on fits;
create policy delete_own on fits for delete
  using (author_id = current_app_user() or is_admin());

drop policy if exists edit_own on gallery;
create policy edit_own on gallery for update
  using (author_id = current_app_user() or is_admin());
drop policy if exists delete_own on gallery;
create policy delete_own on gallery for delete
  using (author_id = current_app_user() or is_admin());

drop policy if exists delete_own on voice_notes;
create policy delete_own on voice_notes for delete
  using (author_id = current_app_user() or is_admin());

drop policy if exists edit_own on media;
create policy edit_own on media for update
  using (owner_id = current_app_user() or is_admin());
create policy delete_any on media for delete using (is_admin());

drop policy if exists delete_own on reactions;
create policy delete_own on reactions for delete
  using (user_id = current_app_user() or is_admin());
