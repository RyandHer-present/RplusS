-- Jam links.
--
-- A Spotify Jam is a live session: the link works while the host has it open
-- and is dead afterwards. That single fact shapes the table — `ended_at` marks
-- one as over, and the screen treats an old link as probably dead even when
-- nobody got round to marking it, because a link that silently stopped working
-- is worse than one clearly labelled stale.
--
-- `kind` is worked out from the URL when it is posted rather than on every
-- render, so a row carries what it is.

create table jams (
  id         uuid primary key default gen_random_uuid(),
  author_id  user_id not null references users(id),
  url        text not null,
  -- What the sender wants to say about it. Optional; most are self-evident.
  note       text,
  -- 'jam', 'playlist', 'album', 'track', 'artist', 'episode', 'show', 'link'.
  kind       text not null default 'link',
  ended_at   timestamptz,
  created_at timestamptz not null default now()
);

create index jams_created_idx on jams (created_at desc);

alter table jams enable row level security;

create policy read_all  on jams for select using (is_member());
create policy write_own on jams for insert with check (author_id = current_app_user());

-- Deliberately looser than the other tables: either of you can mark a jam
-- ended, not just whoever posted it. The person who notices a dead link is
-- usually the one who clicked it, and making them wait for the other to tidy
-- up would leave the screen lying about what still works.
create policy end_any on jams for update using (is_member());

create policy delete_own on jams for delete using (author_id = current_app_user() or is_admin());

grant select, insert, update, delete on jams to authenticated;
grant all privileges on jams to service_role;

alter publication supabase_realtime add table jams;

-- Audited like everything else, which is also what makes it ping Discord: the
-- notify trigger hangs off audit_log, so this needs no wiring of its own.
create trigger audit_jams after insert or update or delete on jams
  for each row execute function record_change();

-- Posting one should ping; marking one ended should not, or every tidy-up
-- would fire a card.
insert into notify_settings (event, enabled, cooldown_seconds, include_detail) values
  ('jams.insert', true,  0, false),
  ('jams.update', false, 0, false),
  ('jams.delete', false, 0, false)
on conflict (event) do nothing;
