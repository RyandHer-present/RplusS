-- Gallery posts.
--
-- `media` rows are shared by fits, chat attachments and voice notes, so the
-- gallery needs its own table rather than inferring membership from kind.

create table gallery (
  id         uuid primary key default gen_random_uuid(),
  author_id  user_id not null references users(id),
  media_id   uuid    not null references media(id) on delete cascade,
  caption    text,
  created_at timestamptz not null default now()
);

create index gallery_created_idx on gallery (created_at desc);

alter table gallery enable row level security;

create policy read_all   on gallery for select using (is_member());
create policy write_own  on gallery for insert with check (author_id = current_app_user());
create policy edit_own   on gallery for update using (author_id = current_app_user());
create policy delete_own on gallery for delete using (author_id = current_app_user());

grant select, insert, update, delete on gallery to authenticated;
grant all privileges on gallery to service_role;

alter publication supabase_realtime add table gallery;

-- Voice notes already exist from 0001. Deleting one should take its media row
-- with it, otherwise the audio lingers in storage with nothing pointing at it.
create or replace function drop_orphan_media() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from media
  where id = old.media_id
    and not exists (select 1 from voice_notes where media_id = old.media_id)
    and not exists (select 1 from gallery     where media_id = old.media_id)
    and not exists (select 1 from fits        where media_id = old.media_id)
    and not exists (select 1 from messages    where media_id = old.media_id);
  return old;
end;
$$;

drop trigger if exists voice_notes_cleanup on voice_notes;
create trigger voice_notes_cleanup after delete on voice_notes
  for each row execute function drop_orphan_media();

drop trigger if exists gallery_cleanup on gallery;
create trigger gallery_cleanup after delete on gallery
  for each row execute function drop_orphan_media();

drop trigger if exists fits_cleanup on fits;
create trigger fits_cleanup after delete on fits
  for each row execute function drop_orphan_media();
