-- Discord ping for everything that happens.
--
-- The audit log already records every insert, update and delete on the tables
-- that matter, so this hangs a single trigger on `audit_log` rather than one
-- per table. Anything audited later is picked up with no further work.
--
-- The request is sent with pg_net, which queues it and returns immediately, so
-- posting a message never waits on Discord. The whole thing is wrapped so that
-- a failure here can never roll back the row that caused it: a broken webhook
-- must not stop the two of you using the site.

create extension if not exists pg_net;

-- ------------------------------------------------------------- settings --

/*
 * One row per event, named `<entity>.<action>` — 'messages.insert',
 * 'fits.insert', 'session.login'. The '*' row is the fallback for anything
 * with no row of its own, so a new audited table starts pinging without
 * needing to be added here first.
 *
 * Change these with plain SQL; nothing needs redeploying:
 *
 *   update notify_settings set enabled = false where event = 'messages.insert';
 *   update notify_settings set cooldown_seconds = 900 where event = 'messages.insert';
 */
create table notify_settings (
  event            text primary key,
  enabled          boolean not null default true,
  -- Seconds of quiet per actor after a ping of this kind. 0 means every one.
  cooldown_seconds int not null default 0,
  -- Whether the ping may quote what was actually written.
  include_detail   boolean not null default false
);

insert into notify_settings (event, enabled, cooldown_seconds, include_detail) values
  ('*',                 true,  0,   false),
  ('session.login',     true,  0,   false),
  -- Wrong PIN. Worth hearing about, but rate limited so a brute force cannot
  -- bury the rest of the channel.
  ('session.login_failed', true, 60, false),
  -- Conversation, so one ping then quiet; the next says how many were held.
  ('messages.insert',   true,  300, true),
  ('messages.update',   true,  0,   true),
  ('messages.delete',   true,  0,   true),
  ('fits.insert',       true,  0,   false),
  ('gallery.insert',    true,  0,   false),
  ('voice_notes.insert',true,  0,   false),
  ('notes.insert',      true,  0,   false),
  -- The file row behind a fit or gallery post; the post itself already pinged.
  ('media.insert',      false, 0,   false),
  ('media.delete',      false, 0,   false);

-- Cooldown bookkeeping, one row per event and actor.
create table notify_state (
  key          text primary key,
  last_sent_at timestamptz not null default now(),
  suppressed   int not null default 0
);

alter table notify_settings enable row level security;
alter table notify_state    enable row level security;
-- No policies on either: the trigger runs as definer, and nothing else has any
-- business reading or writing them.

-- ---------------------------------------------------------------- ping --

create or replace function notify_discord() returns trigger
language plpgsql security definer set search_path = public, net, vault as $$
declare
  webhook   text;
  setting   notify_settings%rowtype;
  event_key text;
  state_key text;
  state     notify_state%rowtype;
  held      int := 0;
  actor     text;
  subject   text;
  preview   text;
  lines     text;
  colour    int;
begin
  event_key := tg_argv[0];
  if event_key is null then
    event_key := new.entity || '.' || new.action;
  end if;

  select * into setting from notify_settings where event = event_key;
  if not found then
    select * into setting from notify_settings where event = '*';
  end if;
  if not found or not setting.enabled then
    return new;
  end if;

  select decrypted_secret into webhook
    from vault.decrypted_secrets
   where name = 'discord_webhook_url';

  -- No secret is a valid state: it is how these get switched off wholesale.
  if webhook is null or webhook = '' then
    return new;
  end if;

  -- --- cooldown ----------------------------------------------------------
  state_key := event_key || ':' || coalesce(new.actor, 'unknown');

  if setting.cooldown_seconds > 0 then
    select * into state from notify_state where key = state_key;

    if found and state.last_sent_at > now() - make_interval(secs => setting.cooldown_seconds) then
      update notify_state set suppressed = suppressed + 1 where key = state_key;
      return new;
    end if;

    held := coalesce(state.suppressed, 0);
  end if;

  insert into notify_state (key, last_sent_at, suppressed) values (state_key, now(), 0)
    on conflict (key) do update set last_sent_at = now(), suppressed = 0;

  -- --- wording -----------------------------------------------------------
  actor := case new.actor
             when 'ry'    then 'Ry'
             when 'sarah' then 'Sarah'
             when 'admin' then 'Admin'
             else 'Someone'
           end;

  subject := case new.entity
               when 'messages'    then 'a message'
               when 'notes'       then 'a note'
               when 'fits'        then 'a fit'
               when 'gallery'     then 'a gallery post'
               when 'voice_notes' then 'a voice note'
               when 'media'       then 'a file'
               when 'session'     then 'in'
               else new.entity
             end;

  lines := actor || ' ' ||
    case new.action
      when 'insert'       then case when new.entity = 'fits' then 'posted ' else 'added ' end
      when 'update'       then 'edited '
      when 'delete'       then 'removed '
      when 'login'        then 'signed '
      when 'login_failed' then 'got the PIN wrong signing '
      else new.action || ' '
    end || subject;

  -- --- what was written --------------------------------------------------
  if setting.include_detail and new.detail is not null then
    if new.action = 'update' then
      preview := new.detail #>> '{body,to}';
    else
      preview := new.detail ->> 'body';
    end if;

    if preview is not null and preview <> '' then
      -- Trimmed, and backticks dropped so the quote cannot break its own span.
      preview := replace(left(preview, 140), '`', '''');
      lines := lines || E'\n> `' || preview || '`';
    end if;
  end if;

  -- `->> is not null` rather than the `?` operator: a bare question mark is
  -- read as a bind placeholder by some drivers, and this has to survive being
  -- run from anywhere.
  if new.action in ('login', 'login_failed') and (new.detail ->> 'ip') is not null then
    lines := lines || E'\nfrom `' || (new.detail ->> 'ip') || '`';
  end if;

  if held > 0 then
    lines := lines || E'\n_' || held || ' more held back._';
  end if;

  colour := case
              when new.action in ('delete', 'login_failed') then 16729156  -- red
              when new.action = 'login'                     then 16755200  -- amber
              else 16735728                                               -- pink
            end;

  -- --- send it -----------------------------------------------------------
  -- pg_net queues and returns; nothing here waits on Discord. The exception
  -- block is the point: an insert must succeed even when the ping cannot.
  begin
    perform net.http_post(
      url     := webhook,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'username', 'R+S watch',
        'embeds', jsonb_build_array(
          jsonb_build_object(
            'description', lines,
            'color', colour,
            'timestamp', to_char(new.at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          )
        )
      )
    );
  exception when others then
    raise warning 'discord ping failed: %', sqlerrm;
  end;

  return new;
end;
$$;

create trigger notify_on_audit
  after insert on audit_log
  for each row execute function notify_discord();

-- --------------------------------------------------------------- logins --

-- Sign-ins do not touch an audited table, so the login function records them
-- here directly. Doing it through audit_log rather than pinging Discord itself
-- means they also show up in the admin log alongside everything else.
grant insert on audit_log to service_role;
