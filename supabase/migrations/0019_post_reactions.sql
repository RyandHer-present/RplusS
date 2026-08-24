-- Reactions on things that are not chat messages.
--
-- A separate table rather than a column added to `reactions`, which is keyed
-- straight to messages and works. Widening it would mean a nullable foreign
-- key and a rule that the database could not express, in exchange for saving
-- one small table.
--
-- The pair (entity, entity_id) points at a row in whichever table `entity`
-- names. There is deliberately no foreign key: it cannot point at five tables
-- at once, so deletion is handled where the deletion happens.

create table if not exists post_reactions (
  entity     text not null check (entity in ('gallery', 'fits', 'notes', 'voice_notes', 'jams')),
  entity_id  uuid not null,
  user_id    user_id not null references users(id),
  emoji      text not null,
  created_at timestamptz not null default now(),
  -- One of each emoji per person per thing; reacting again removes it.
  primary key (entity, entity_id, user_id, emoji)
);

create index post_reactions_target_idx on post_reactions (entity, entity_id);

alter table post_reactions enable row level security;

create policy read_all on post_reactions for select using (is_member());

create policy write_own on post_reactions for insert with check (user_id = current_app_user());

create policy delete_own on post_reactions for delete using (user_id = current_app_user() or is_admin());

grant select, insert, delete on post_reactions to authenticated;

grant all privileges on post_reactions to service_role;

alter publication supabase_realtime add table post_reactions;
