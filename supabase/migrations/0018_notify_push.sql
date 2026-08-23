-- Fire a push for anything worth interrupting someone about.
--
-- Hung off audit_log for the same reason the Discord ping is: one trigger
-- covers every table that is already audited, and anything audited later is
-- picked up without touching this.
--
-- Deliberately narrower than the Discord ping, which tells Ry about
-- everything including logins and failed PINs. This one goes to the *other
-- person's phone*, so it only fires for things a person actually sent, and
-- never for edits, deletes or sessions.

create table if not exists push_settings (
  entity  text primary key,
  enabled boolean not null default true
);

insert into push_settings (entity, enabled) values
  ('messages',    true),
  ('fits',        true),
  ('gallery',     true),
  ('notes',       true),
  ('voice_notes', true),
  ('jams',        true)
on conflict (entity) do nothing;

alter table push_settings enable row level security;

grant all privileges on push_settings to service_role;

create or replace function notify_push() returns trigger
language plpgsql security definer set search_path = public, net, vault as $$
declare
  setting push_settings%rowtype;
  fn_url  text;
begin
  -- Only ever inserts: an edit does not deserve a phone buzzing.
  if new.action <> 'insert' then
    return new;
  end if;

  select * into setting from push_settings where entity = new.entity;
  if not found or not setting.enabled then
    return new;
  end if;

  -- Admin acts on behalf of nobody, so there is no "other person" to tell.
  if new.actor is null or new.actor not in ('ry', 'sarah') then
    return new;
  end if;

  select decrypted_secret into fn_url
    from vault.decrypted_secrets
   where name = 'push_function_url';

  if fn_url is null or fn_url = '' then
    return new;
  end if;

  -- pg_net queues and returns immediately, so sending a message never waits on
  -- Apple. Wrapped so a push failure can never roll back the row that caused
  -- it — a broken notification must not stop the two of them using the site.
  begin
    perform net.http_post(
      url     := fn_url,
      body    := jsonb_build_object('actor', new.actor, 'entity', new.entity, 'action', new.action),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists push_on_audit on audit_log;

create trigger push_on_audit after insert on audit_log
  for each row execute function notify_push();
