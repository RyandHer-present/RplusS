-- A shared vibe, and a game to play against each other.

-- ----------------------------------------------------------------- vibe --

-- Exactly one row, ever. The vibe is a property of the pair rather than of a
-- person, which is the entire point of it: setting one recolours the app for
-- both of you at once, and the other person sees it change under them.
--
-- A personal theme still exists and still works. The vibe simply wins while it
-- is set, and clearing it hands control back.
create table vibe (
  id     int primary key default 1 check (id = 1),
  name   text,
  set_by user_id references users(id),
  set_at timestamptz not null default now()
);

insert into vibe (id, name) values (1, null);

alter table vibe enable row level security;

create policy read_all on vibe for select using (is_member());
create policy set_any  on vibe for update using (is_member());

grant select, update on vibe to authenticated;
grant all privileges on vibe to service_role;

alter publication supabase_realtime add table vibe;

-- ---------------------------------------------------------------- games --

-- The board is a 42 character string, row-major, 7 wide and 6 tall, using a
-- dot for empty and r or s for a disc. Kept as one value rather than a row per
-- move so a move is a single atomic update and realtime carries the whole
-- state, which removes any question of two clients disagreeing about the
-- board.
create table games (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'connect4',
  board      text not null default repeat('.', 42),
  turn       user_id not null,
  winner     text,
  moves      int not null default 0,
  started_by user_id not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index games_created_idx on games (created_at desc);

alter table games enable row level security;

create policy read_all  on games for select using (is_member());
create policy start_any on games for insert with check (is_member());
-- Either player updates the same row, since taking a turn is a write to the
-- opponent-owned game as often as to your own.
create policy play_any  on games for update using (is_member());
create policy clear_own on games for delete using (started_by = current_app_user() or is_admin());

grant select, insert, update, delete on games to authenticated;
grant all privileges on games to service_role;

alter publication supabase_realtime add table games;

create trigger audit_games after insert or update or delete on games
  for each row execute function record_change();

-- A move fires many updates in a row while you play, so it stays quiet.
insert into notify_settings (event, enabled, cooldown_seconds, include_detail) values
  ('games.insert', true,  0, false),
  ('games.update', false, 0, false),
  ('games.delete', false, 0, false),
  ('vibe.update',  false, 0, false)
on conflict (event) do nothing;
