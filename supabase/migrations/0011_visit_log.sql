-- Visit alerting.
--
-- One row per source IP. Written only by the `visit-alert` Edge Function using
-- the service role. The browser never reads or writes this table, so it gets no
-- policies at all — RLS is enabled and denies everything by default, which is
-- what we want for a table that is effectively a security log.

create table if not exists visit_log (
  ip          text primary key,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  hits        integer     not null default 0,
  -- When Discord was last told about this address. Null means never.
  last_alert  timestamptz,
  user_agent  text,
  referrer    text
);

alter table visit_log enable row level security;

-- Supports the global hourly cap, which asks how many addresses were alerted
-- on recently.
create index if not exists visit_log_last_alert_idx on visit_log (last_alert desc);
