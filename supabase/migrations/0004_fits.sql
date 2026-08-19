-- Daily fit pics.
--
-- One photo a day keeps your streak; more than one a day is allowed but does
-- not count for more. Streaks are per person, not shared.

create table fits (
  id         uuid primary key default gen_random_uuid(),
  author_id  user_id not null references users(id),
  media_id   uuid    not null references media(id) on delete cascade,
  caption    text,
  -- The calendar day this counts toward, in the poster's own timezone. Storing
  -- the resolved date rather than deriving it from created_at avoids a photo
  -- posted at 11pm counting as the next day for someone in another zone.
  day        date    not null,
  created_at timestamptz not null default now()
);

create index fits_day_idx    on fits (day desc);
create index fits_author_idx on fits (author_id, day desc);

alter table fits enable row level security;

create policy read_all   on fits for select using (is_member());
create policy write_own  on fits for insert with check (author_id = current_app_user());
create policy edit_own   on fits for update using (author_id = current_app_user());
create policy delete_own on fits for delete using (author_id = current_app_user());

grant select, insert, update, delete on fits to authenticated;
grant all privileges on fits to service_role;

alter publication supabase_realtime add table fits;
