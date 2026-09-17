# Deploying Verity: GitHub + Supabase + Vercel

This app is ready to deploy — the data layer runs on Postgres and there's no local-file
storage left to worry about. The steps below need your own GitHub, Supabase and Vercel
logins, so they're written for you to run yourself (nothing here needs anything beyond
copy-pasting commands and clicking through web dashboards you're already signed into).

Total time: about 15 minutes.

## 1. Get the code onto your machine

You should have received `verity-payroll.zip` in this conversation. Unzip it wherever
you keep projects, e.g.:

```bash
cd ~/Documents
unzip verity-payroll.zip
cd verity-payroll
```

The `.git` folder is included, so your commit history comes with it — you don't need to
run `git init`.

## 2. Push it to GitHub

Create an empty repository on GitHub first (don't initialize it with a README or
`.gitignore` — you already have both):

- Go to https://github.com/new
- Name it (e.g. `verity-payroll`), choose Public or Private, click **Create repository**
- Leave the "Quick setup" page open — it shows your repo's URL

Then, back in your terminal, inside the unzipped `verity-payroll` folder:

```bash
git remote add origin https://github.com/<your-username>/verity-payroll.git
git branch -M main
git push -u origin main
```

GitHub will prompt you to sign in (browser popup or a personal access token) — use
whichever method GitHub offers you; this is between you and GitHub, nothing to paste
into this chat.

## 3. Create a Supabase project (the database)

1. Go to https://supabase.com/dashboard and sign in (or create an account)
2. Click **New project** — pick any name and region, and set a database password
   (Supabase will ask you to choose one; save it somewhere, e.g. a password manager)
3. Wait ~2 minutes for the project to finish provisioning
4. Go to **Project Settings → Database → Connection string**
5. Select the **Transaction pooler** tab (not "Direct connection") — this matters:
   Vercel's serverless functions open a lot of short-lived connections, and the
   pooler (port 6543) is built for that, while the direct connection (port 5432)
   will run out of connections under real traffic
6. Copy that connection string — it looks like
   `postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-xxxxx.pooler.supabase.com:6543/postgres`
7. Replace `[YOUR-PASSWORD]` with the database password you set in step 2

Keep this string handy for the next step — you'll paste it into Vercel, not into a file
you commit to GitHub.

## 4. Import into Vercel and deploy

1. Go to https://vercel.com/new and sign in (GitHub sign-in is easiest)
2. Click **Import** next to the `verity-payroll` repo you just pushed
   (authorize Vercel to access your GitHub account if it asks)
3. Before clicking Deploy, expand **Environment Variables** and add:
   - Name: `DATABASE_URL`
   - Value: the Supabase pooler connection string from step 3
4. Click **Deploy**

Vercel will build and deploy the app. On first request to any page, the app creates its
tables and seeds the demo company automatically — same as running it locally, just
against your Supabase database instead of a local one.

Once it's live, Vercel gives you a URL like `verity-payroll.vercel.app` — that's a real,
public URL, which is what you'll need for the n8n automation step (n8n can't call
`localhost`, but it can call this).

## 5. Verify it worked

Open your Vercel URL and go to `/dashboard`. You should see the same seeded payroll run
(Harrow & Vale Property Group, 4 flagged lines) as the local demo. Try resolving a line
or approving the run — those write to your real Supabase database, so refreshing the
page should keep the change.

## Updating the live site later

Any time you want to ship a change: commit it, `git push`, and Vercel redeploys
automatically — no manual steps beyond that.

## What's next

Once this is live, we can wire up the n8n automation you asked about (a scheduled run
that flags exceptions automatically and leaves you just the approvals) — it needs the
public URL from step 4 as its target, so it was blocked until deployment existed. Ping
me with the live URL once it's up and I'll pick that back up.
