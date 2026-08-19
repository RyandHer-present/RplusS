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
