# Verity — Payroll approval

A payroll approval and profitability dashboard for UK businesses of any size — priced across
three tiers from 0–100, 100–1,000, and 1,000+ employees — built as a real full-stack Next.js
application (not a static mockup). It's seeded with a sample client — Harrow & Vale Property
Group, a commercial real-estate agency — to demonstrate the product in a realistic working
state.

## Site map

- `/` — public marketing site (problem, product breakdown, competitor comparison, pricing), built from the
  project's differentiation strategy doc.
- `/product`, `/compare`, `/pricing` — supporting marketing pages.
- `/dashboard` — the working payroll approval + profitability demo (previously mounted at `/`).

## What it does

- **Exception-first payroll review.** Each pay run surfaces only what needs a human look —
  a bounced-payment risk, an NMW proximity warning, a routine tax-code variance, a commission
  split — tagged by severity and by where the issue originated (bank & payments, compliance,
  tax & statutory, commission & variable pay). Everything else validates automatically.
- **One-click, partial-aware approval.** Approving a run doesn't require every item resolved —
  it approves everyone it safely can and tells you what's still blocking, mirroring how payroll
  actually needs to work against a hard BACS deadline.
- **Profitability index.** A second view showing bonus budget headroom, a salary-vs-market
  benchmark, and a staffing-vs-demand read — turning the same payroll data into a planning tool,
  not just a compliance chore.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS v4)
- **Postgres** via `pg` (node-postgres) — works with any Postgres provider (Supabase,
  Vercel Postgres, Neon, a local install). Schema and seed data are created automatically
  on first request, same as the previous SQLite version.
- No ORM: a small hand-written query layer in `src/lib/queries.ts`

## Running it locally

```bash
npm install
cp .env.example .env.local   # point DATABASE_URL at your Postgres instance
npm run dev
```

Then open http://localhost:3000. The schema and demo company are created automatically
on first request — drop the tables (or point at a fresh database) to reset to the
original seed. See `DEPLOY.md` for deploying to Vercel with a Supabase database and
pushing the code to GitHub.

## Project structure

```
src/
  app/
    (marketing)/        public site — layout, home, /product, /compare, /pricing
    dashboard/          the payroll demo — sidebar layout, approval + profitability views
      page.tsx           dashboard — payroll approval
      profitability/     profitability index
      employees/         placeholder
      reports/           placeholder
      integrations/      placeholder
      settings/          placeholder
    api/
      lines/resolve/     POST — mark a flagged line resolved
      runs/approve/       POST — approve the current run (full or partial)
  components/
    marketing/           header/footer for the public site
    ...                  dashboard UI building blocks (ReviewPanel is the interactive core)
  lib/
    db.ts                schema + seed data
    queries.ts            data-access layer used by pages and API routes
    format.ts             currency formatting helpers
    pillars.ts            differentiation copy shared by the marketing pages
    competitors.ts         competitor teardown data shared by the marketing pages
```

## Status

This is an early-stage prototype: one seeded company, no authentication, no real HMRC/BACS/
banking integrations — those are represented as UI only. It's a working demonstration of the
product concept and interaction design, built to be extended rather than treated as finished.

## Roadmap

See the payroll firm project notes for the fuller build roadmap, competitive differentiation
strategy, and UK payroll compliance research this prototype is based on.
