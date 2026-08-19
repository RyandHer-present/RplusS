-- RplusS initial schema
--
-- Two fixed users, Ry and Sarah. There is no signup flow and never will be, so
-- identity is a small enum rather than free-form accounts.
--
-- The PIN is not the credential. The pin-login Edge Function checks the PIN,
-- then signs in as a real Supabase Auth user whose password lives only in
-- server-side secrets, and hands back a genuine session. That means normal
-- refresh tokens, normal auth.uid(), and no hand-rolled token signing.

create type user_id as enum ('ry', 'sarah');

-- ---------------------------------------------------------------- helpers --

-- Maps the Supabase Auth session to which of the two people is signed in.
create or replace function current_app_user() returns user_id
language sql stable security definer set search_path = public as $$
  select id from users where auth_uid = auth.uid()
$$;

-- True for either of the two real people; false for an anonymous caller.
create or replace function is_member() returns boolean
language sql stable as $$
  select current_app_user() is not null
$$;

-- ------------------------------------------------------------------ users --

create table users (
  id          user_id primary key,
  -- Linked to the Supabase Auth user after the accounts are created; see the
  -- setup notes in supabase/README.md.
  auth_uid    uuid unique references auth.users(id) on delete set null,
  name        text    not null,
  avatar_url  text,
  theme       text    not null default 'aurora',
  mood        text,
  mood_color  text,
  last_seen   timestamptz,
  created_at  timestamptz not null default now()
);

insert into users (id, name) values ('ry', 'Ry'), ('sarah', 'Sarah');

-- ------------------------------------------------------------------ media --
-- Rows describe files living in Backblaze B2; the bytes are never in Postgres.

create type media_kind as enum ('image', 'video', 'audio', 'doodle');

create table media (
  id          uuid primary key default gen_random_uuid(),
  owner_id    user_id    not null references users(id),
  kind        media_kind not null,
  b2_key      text       not null,
  thumb_key   text,
  -- Tiny inline base64 blur shown while the real image loads.
  blur        text,
  width       int,
  height      int,
  duration_ms int,
  bytes       bigint,
  created_at  timestamptz not null default now()
);

create index media_created_idx on media (created_at desc);
create index media_kind_idx    on media (kind, created_at desc);

-- --------------------------------------------------------------- messages --

create table messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    user_id not null references users(id),
  body         text,
  media_id     uuid references media(id) on delete set null,
  reply_to_id  uuid references messages(id) on delete set null,
  pinned       boolean not null default false,
  created_at   timestamptz not null default now(),
  delivered_at timestamptz,
  seen_at      timestamptz,
  -- A message must carry something.
  constraint messages_not_empty check (body is not null or media_id is not null)
);

create index messages_created_idx on messages (created_at desc);
create index messages_pinned_idx  on messages (pinned) where pinned;

create table reactions (
  message_id uuid    not null references messages(id) on delete cascade,
  user_id    user_id not null references users(id),
  emoji      text    not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- ------------------------------------------------------------------ notes --

create table notes (
  id         uuid primary key default gen_random_uuid(),
  author_id  user_id not null references users(id),
  title      text,
  body       text not null,
  color      text,
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_created_idx on notes (created_at desc);

-- ----------------------------------------------------------- voice notes --
-- Separate from messages: these are meant to be kept and revisited, not to
-- scroll away in a chat log.

create table voice_notes (
  id          uuid primary key default gen_random_uuid(),
  author_id   user_id not null references users(id),
  media_id    uuid    not null references media(id) on delete cascade,
  title       text,
  listened_at timestamptz,
  created_at  timestamptz not null default now()
);

create index voice_notes_created_idx on voice_notes (created_at desc);

-- --------------------------------------------------------------- capsules --

create table capsules (
  id         uuid primary key default gen_random_uuid(),
  author_id  user_id not null references users(id),
  body       text,
  media_id   uuid references media(id) on delete set null,
  unlock_at  timestamptz not null,
  opened_at  timestamptz,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------- activity ---
-- One row per person per day. Powers the streak counter.

create table daily_activity (
  user_id user_id not null references users(id),
  day     date    not null,
  primary key (user_id, day)
);

-- ----------------------------------------------------- private / no RLS ---
-- Neither table is ever readable by the client. Only the Edge Function, which
-- uses the service role, touches them.

create table pins (
  user_id  user_id primary key references users(id),
  pin_hash text not null
);

create table login_attempts (
  ip           text primary key,
  attempts     int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

-- --------------------------------------------------------------- policies --

alter table users          enable row level security;
alter table media          enable row level security;
alter table messages       enable row level security;
alter table reactions      enable row level security;
alter table notes          enable row level security;
alter table voice_notes    enable row level security;
alter table capsules       enable row level security;
alter table daily_activity enable row level security;
alter table pins           enable row level security;
alter table login_attempts enable row level security;

-- Both people can read everything; that is the whole point of the app.
create policy read_all on users          for select using (is_member());
create policy read_all on media          for select using (is_member());
create policy read_all on messages       for select using (is_member());
create policy read_all on reactions      for select using (is_member());
create policy read_all on notes          for select using (is_member());
create policy read_all on voice_notes    for select using (is_member());
create policy read_all on daily_activity for select using (is_member());

-- Writes are restricted to your own rows.
create policy write_own on media       for insert with check (owner_id  = current_app_user());
create policy write_own on messages    for insert with check (sender_id = current_app_user());
create policy write_own on notes       for insert with check (author_id = current_app_user());
create policy write_own on voice_notes for insert with check (author_id = current_app_user());
create policy write_own on capsules    for insert with check (author_id = current_app_user());
create policy write_own on reactions   for insert with check (user_id   = current_app_user());

create policy edit_own on notes    for update using (author_id = current_app_user());
create policy edit_own on media    for update using (owner_id  = current_app_user());
create policy edit_own on users    for update using (id        = current_app_user());

create policy delete_own on notes     for delete using (author_id = current_app_user());
create policy delete_own on reactions for delete using (user_id   = current_app_user());
create policy delete_own on messages  for delete using (sender_id = current_app_user());

-- The recipient — not the sender — is the one who marks a message delivered or
-- seen, so this update is scoped to messages you did not send.
create policy mark_received on messages for update
  using (is_member() and sender_id <> current_app_user());

create policy track_own on daily_activity for insert with check (user_id = current_app_user());

-- Capsules stay unreadable until their unlock time, enforced in the database
-- rather than the UI so it cannot be bypassed by poking at the API.
create policy read_unlocked on capsules for select
  using (is_member() and (unlock_at <= now() or author_id = current_app_user()));

create policy open_unlocked on capsules for update
  using (is_member() and unlock_at <= now());

-- `pins` and `login_attempts` get RLS enabled with no policies at all, which
-- denies every client request. Only the service role bypasses this.

-- -------------------------------------------------------------- realtime --

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table reactions;
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table media;
alter publication supabase_realtime add table voice_notes;
alter publication supabase_realtime add table users;
