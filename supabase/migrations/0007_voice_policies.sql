-- Voice note permissions.
--
-- 0001 created the table with read and insert policies only, which left two
-- gaps: the listener could not mark a note as heard, and nobody could delete
-- one at all.
--
-- Marking something listened has to be done by whoever listened, which is
-- usually not the author — so the policy is open to both people, and a column
-- grant makes sure that is the only field either of them can change.

revoke update on voice_notes from authenticated;
grant update (listened_at) on voice_notes to authenticated;

drop policy if exists mark_listened on voice_notes;
create policy mark_listened on voice_notes for update using (is_member());

drop policy if exists delete_own on voice_notes;
create policy delete_own on voice_notes for delete using (author_id = current_app_user());
