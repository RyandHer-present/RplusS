-- Message updates: who may change what.
--
-- The original policy only allowed updating messages you did not send, which
-- covered delivery receipts but made it impossible to pin your own message.
--
-- Widening the policy alone would let either person rewrite the other's words.
-- Column-level grants solve it properly: `body` is simply not updatable by
-- anyone, so a message can never be edited after it is sent, while the three
-- state columns stay open to both.

drop policy if exists mark_received on messages;

revoke update on messages from authenticated;
grant update (delivered_at, seen_at, pinned) on messages to authenticated;

create policy update_state on messages for update using (is_member());
