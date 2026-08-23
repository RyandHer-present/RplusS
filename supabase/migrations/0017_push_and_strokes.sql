-- Push notifications, and the stroke data that makes a doodle replayable.
--
-- Push is per *device*, not per person: the same person on a phone and a laptop
-- is two subscriptions, and either can be revoked by the browser at any time
-- without telling us. The endpoint is therefore the identity of a row, and a
-- dead one is deleted rather than kept — a subscription the push service has
-- rejected will never work again.
--
-- Strokes live on `media` rather than in their own table because a doodle is
-- already a media row; the PNG stays the thing that gets displayed, and the
-- strokes are an optional extra that lets it be drawn again. Anything sent
-- before this shipped simply has null here and plays back as a still image.

create table push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      user_id not null references users(id),
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  -- Only so a stale row can be recognised in the list; never shown.
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz
);

create index push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- You may only ever see and manage your own devices. Admin is deliberately
-- excluded from reading these: they are device fingerprints, and admin has no
-- reason to hold them.
create policy read_own on push_subscriptions for select using (user_id = current_app_user());

create policy write_own on push_subscriptions for insert with check (user_id = current_app_user());

create policy update_own on push_subscriptions for update using (user_id = current_app_user());

create policy delete_own on push_subscriptions for delete using (user_id = current_app_user());

grant select, insert, update, delete on push_subscriptions to authenticated;

grant all privileges on push_subscriptions to service_role;

-- Recorded points for a doodle, as [{c,w,p:[[x,y],...]}] in a 0..1 coordinate
-- space so it replays at any size.
alter table media add column strokes jsonb;
