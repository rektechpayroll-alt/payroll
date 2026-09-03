# Verity — Payroll approval

A payroll approval and profitability dashboard for UK small businesses, built as a real
full-stack Next.js application (not a static mockup). It's seeded with a sample client —
Harrow & Vale Property Group, a commercial real-estate agency — to demonstrate the product
in a realistic working state.

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
- **SQLite** via Node's built-in `node:sqlite` (no native build step, no external engine
  download — the database file is created and seeded automatically on first run)
- No ORM: a small hand-written query layer in `src/lib/queries.ts`

## Running it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000. The database is created at `data/verity.db` on first
request and seeded with sample data — delete that file to reset to the original seed.

## Project structure

```
src/
  app/
    (shell)/            route group sharing the sidebar layout
      page.tsx           dashboard — payroll approval
      profitability/     profitability index
      employees/         placeholder
      reports/           placeholder
      integrations/      placeholder
      settings/          placeholder
    api/
      lines/resolve/     POST — mark a flagged line resolved
      runs/approve/       POST — approve the current run (full or partial)
  components/            UI building blocks (ReviewPanel is the interactive core)
  lib/
    db.ts                schema + seed data
    queries.ts            data-access layer used by pages and API routes
    format.ts             currency formatting helpers
```

## Status

This is an early-stage prototype: one seeded company, no authentication, no real HMRC/BACS/
banking integrations — those are represented as UI only. It's a working demonstration of the
product concept and interaction design, built to be extended rather than treated as finished.

## Roadmap

See the payroll firm project notes for the fuller build roadmap, competitive differentiation
strategy, and UK payroll compliance research this prototype is based on.
