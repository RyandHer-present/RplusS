-- Resetting the connect four score.
--
-- Deliberately not a delete. Clearing the counter should not throw away the
-- games themselves, so a reset just moves a line forward in time and the score
-- counts only what was played after it. The boards stay, and an admin can
-- still read the whole history.
--
-- Exactly one row, like the vibe table.

create table game_settings (
  id             int primary key default 1 check (id = 1),
  score_reset_at timestamptz,
  reset_by       text,
  reset_at       timestamptz
);

insert into game_settings (id) values (1);

alter table game_settings enable row level security;

-- Both of you can see where the line is, since it explains the score you are
-- looking at. Only admin can move it.
create policy read_all  on game_settings for select using (is_member());
create policy admin_set on game_settings for update using (is_admin());

grant select, update on game_settings to authenticated;
grant all privileges on game_settings to service_role;

alter publication supabase_realtime add table game_settings;
