-- Editing and unsending your own messages.
--
-- 0002 made message text permanently immutable. That is now reversed by
-- request: the sender can edit or unsend, and the change applies for both
-- people rather than just hiding it locally.
--
-- Grants are role-wide, so opening up `body` would also let each person rewrite
-- the other's messages. A trigger draws the line that grants cannot: only the
-- original sender may change the text.

alter table messages add column if not exists edited_at timestamptz;

grant update (body, edited_at, delivered_at, seen_at, pinned) on messages to authenticated;

create or replace function guard_message_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Who sent it and when are never rewritable, by anyone.
  if new.sender_id is distinct from old.sender_id
     or new.created_at is distinct from old.created_at then
    raise exception 'sender and timestamp are immutable';
  end if;

  if new.body is distinct from old.body then
    if old.sender_id is distinct from current_app_user() then
      raise exception 'only the sender can edit this message';
    end if;
    -- Stamped server-side so the "edited" marker cannot be faked or skipped.
    new.edited_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists messages_guard_update on messages;
create trigger messages_guard_update
  before update on messages
  for each row execute function guard_message_update();

-- Unsend is a real delete, so it disappears for both people. The existing
-- delete_own policy already restricts this to the sender.

-- DELETE events over realtime only carry the primary key by default, which is
-- all the client needs to remove the row.
