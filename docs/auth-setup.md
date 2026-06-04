# Auth setup (email/password login) — store-ready

This documents the one-time backend setup the email login needs. The app code is
already built (`profileStore.js`, `AuthModal.jsx`, Profile → Account tab).

## 1. Enable the Email provider (Supabase dashboard)

1. Open your project → **Authentication** → **Providers** → **Email**.
2. Make sure **Email** is **Enabled**.
3. Turn **"Confirm email" OFF** for instant signup (recommended for launch — no
   "check your inbox" round-trip). You can turn it on later for stronger verification.
4. Keep **"Allow anonymous sign-ins" ON** (Authentication → Settings) — guests rely on it.

## 2. Account-deletion RPC (REQUIRED by Apple + Google Play)

Both stores require in-app account deletion. The app calls `supabase.rpc('delete_user')`.
Create that function once: **Dashboard → SQL Editor → New query → paste → Run.**

```sql
-- Deletes the calling user's data rows AND their auth account.
-- SECURITY DEFINER so it can remove the auth.users row; locked to the caller.
create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Remove app data first. Add a line for every table keyed by the user id.
  delete from public.profiles where id = uid;
  -- delete from public.<your_table> where user_id = uid;  -- repeat as needed

  -- Finally remove the auth user (cascades sessions/identities).
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated;
```

> Add a `delete from ...` line for each table that stores per-user rows, so a
> deletion truly wipes everything (store requirement: delete *all* user data).

## 3. Password-reset redirect

Forgot-password emails link back to the app. In **Authentication → URL Configuration**:
- **Site URL**: your production URL (e.g. `https://prison-empire.vercel.app`).
- Add the same URL under **Redirect URLs**.

## 4. Legal pages (REQUIRED by both stores)

`public/privacy.html` and `public/terms.html` are scaffolded and linked from the
signup screen. Before submitting to the stores:
- Replace `CHANGE_ME@example.com` with a real support email.
- Review the text; the live URLs are `/privacy.html` and `/terms.html`.

## 5. Store packaging (later milestone)

The app is a web app; to be *in* the App Store / Play Store it must be wrapped.
Recommended: **Capacitor** (one web codebase → iOS + Android). Store-listing
requirements already handled in-app: optional login (guest play), account
deletion, privacy policy + terms URLs.
