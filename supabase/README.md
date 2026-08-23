# Supabase setup

One-time steps to bring a fresh project up. Nothing here needs repeating.

## 1. Run the schema

Supabase dashboard → **SQL Editor** → paste `migrations/0001_init.sql` → **Run**.

## 2. Create the two auth accounts

Dashboard → **Authentication** → **Users** → **Add user** → *Create new user*, twice:

| Email | Password |
| --- | --- |
| `ry@rpluss.local` | generate a long random one |
| `sarah@rpluss.local` | generate a different long random one |

Tick **Auto Confirm User** so no email verification is needed. These passwords are
never typed by a human — the login function uses them on your behalf.

## 3. Link the accounts to the app users

Copy each new user's UID from that same screen, then in the SQL Editor:

```sql
update users set auth_uid = '<ry-uid>'    where id = 'ry';
update users set auth_uid = '<sarah-uid>' where id = 'sarah';
```

## 4. Store the PIN hashes

Locally, for each PIN:

```
node scripts/hash-pin.mjs 0000
```

Then paste the *output* (never the PIN) into the SQL Editor:

```sql
insert into pins (user_id, pin_hash) values
  ('ry',    '<output for Ry''s PIN>'),
  ('sarah', '<output for Sarah''s PIN>');
```

## 5. Set the function secrets

Dashboard → **Edge Functions** → **Secrets**, add four:

- `RY_AUTH_EMAIL`, `RY_AUTH_PASSWORD`
- `SARAH_AUTH_EMAIL`, `SARAH_AUTH_PASSWORD`

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically — do not add them.

## 6. Deploy the function

```
npx supabase functions deploy pin-login --project-ref <ref>
```

## 7. Point the app at the project

Add to `.env.local` (gitignored) and to the deploy environment:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

## Keeping the project awake

Free projects pause after 7 days with no activity. Normal use prevents it; if you
both go quiet for a week, the dashboard has a one-click restore.

---

# Backblaze B2 setup

## Secrets

Set in Dashboard → Edge Functions → Secrets:

- `B2_BUCKET` — bucket name
- `B2_ENDPOINT` — the S3 endpoint, e.g. `https://s3.ca-east-006.backblazeb2.com`
- `B2_KEY_ID`, `B2_APP_KEY` — an application key scoped to that bucket

**Do not guess the endpoint region.** Read it back from Backblaze:

```
curl -u "<keyId>:<appKey>" https://api.backblazeb2.com/b2api/v3/b2_authorize_account
```

The `s3ApiUrl` in the response is authoritative. A wrong region does not produce a
helpful error — the signature simply fails to match.

## CORS (required, and easy to miss)

A new bucket permits **no** browser requests. Server-side tests pass happily while
every upload from the site fails with a bare "failed to fetch", because the browser
blocks it before Backblaze is ever contacted.

Apply once, via `b2_update_bucket`:

```json
[{
  "corsRuleName": "rplussBrowser",
  "allowedOrigins": ["https://ryandher-present.github.io", "http://localhost:5173"],
  "allowedOperations": ["s3_put", "s3_get", "s3_head"],
  "allowedHeaders": ["*"],
  "exposeHeaders": ["etag"],
  "maxAgeSeconds": 3600
}]
```

Adding a new origin later (a custom domain, a different dev port) means updating
this list, or uploads from it will fail the same way.

## 7. The visit alert

Optional. Posts a Discord card when anyone opens the site, immediately, on every
open — with the address, whether they are signed in, and whether the browser has
been seen before.

Run `migrations/0011_visit_alerts.sql` in the SQL Editor, then:

Dashboard -> **Edge Functions** -> **Secrets**, add one:

- `DISCORD_WEBHOOK_URL` — the webhook URL from Discord

Then deploy. The function must answer callers who are not signed in, since the
whole point is to hear about strangers, so it is deployed the same way as
`pin-login`:

```
npx supabase functions deploy visit --no-verify-jwt --project-ref <ref>
```

The URL belongs in that secret and nowhere else. Do not put it in `.env` — that
file is committed and compiled into the bundle, so a webhook there is readable
by everyone who opens the site. That is not hypothetical: it is what happened to
the first one, and it had to be deleted after a stranger found it and posted
through it.

**To switch the alerts off**, clear the `DISCORD_WEBHOOK_URL` secret; the
function then does nothing. Deleting the webhook in Discord also works and is
instant. The quiet period between alerts from one address is `COOLDOWN_SECONDS`
at the top of `functions/visit/index.ts`.

## 8. Pings for everything else

Optional, and independent of step 7 — that one covers opening the site, this one
covers what happens inside it: signing in, wrong PINs, messages, fits, gallery
posts, voice notes, notes, edits and unsends.

It hangs a single trigger on `audit_log`, which already records every insert,
update and delete worth knowing about, so there is no per-table wiring and
anything audited later is picked up for free.

The webhook goes in **Vault**, not in a migration — migrations are committed.
In the SQL Editor, once:

```sql
select vault.create_secret('<your webhook url>', 'discord_webhook_url');
```

Then run `migrations/0012_notify_discord.sql`, and redeploy the login function
so sign-ins get recorded:

```
npx supabase functions deploy pin-login --no-verify-jwt --project-ref <ref>
```

**Turning individual pings on and off** is plain SQL — nothing to redeploy:

```sql
-- stop pinging on every message
update notify_settings set enabled = false where event = 'messages.insert';

-- quieter instead: one ping per person per 15 minutes
update notify_settings set cooldown_seconds = 900 where event = 'messages.insert';

-- stop quoting what was written
update notify_settings set include_detail = false where event = 'messages.insert';

-- see everything and its current state
select * from notify_settings order by event;
```

The `*` row is the fallback for any event with no row of its own.

**To switch all of these off**, drop the Vault secret:

```sql
select vault.delete_secret('discord_webhook_url');
```

Note this is a *second* copy of the webhook — step 7's alert reads its own from
the `visit` function's secrets. Rotating the webhook means changing both.
