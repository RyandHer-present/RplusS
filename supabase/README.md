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
