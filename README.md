# GitHub Copilot Signals

Turn GitHub's raw Copilot usage export into user-level adoption and agentic-engineering insights — entirely in your browser.

**GitHub tells you how Copilot is being used across your organisation. Copilot Signals shows you how adoption differs between your people.**

It accepts the `part-*.json` / `part-*.ndjson` files produced by GitHub's Copilot usage metrics export and never sends them anywhere — parsing and analytics run entirely client-side.

## Why this exists alongside GitHub's own dashboards

GitHub's aggregate Copilot dashboards answer "how much is Copilot used, org-wide." They don't easily answer "which of my people have moved past code completion into agent-first development, and who needs help getting there." Copilot Signals is a companion to those dashboards, not a replacement — it takes the same per-user export data and turns it into person-level adoption depth, agent contribution, and a punch list of enablement opportunities.

## The three views

- **Overview** — the leadership view. Headline adoption KPIs, adoption depth (GitHub's own `ai_adoption_phase` cohorts, aggregated), agent-contribution distribution, a Copilot surface adoption funnel, reported Auto-vs-named model routing, and clickable enablement opportunities.
- **People** — the operational view. A searchable, filterable, sortable table of every reported person with phase, consistency, agent share, reported Auto share, surfaces, completion acceptance, credits and last-active date. Selecting a person opens a detail drawer with their full adoption profile.
- **Core Data** — the existing raw-telemetry exploration window: daily activity, model/feature/language breakdowns, IDE mix, and per-person agent vs. user LoC. Kept because exploring the raw export is still useful on its own.

## Reported people, not licensed seats

The export tells you who showed up in the activity report, not who holds a license — GitHub's seat/license data is a separate resource with its own API. Copilot Signals only ever reports **reported people**, **active people**, and **no observed activity** — never "seats," "dormant seats," or "reclaim candidates." A future seat-assignment upload could legitimately add that language; today's export can't support it.

## Reported Auto is a lower bound, not a full picture

GitHub's `auto` model routing entry reflects only what the export reports as `auto` — GitHub may resolve Auto activity to a specific model behind the scenes, and that resolution doesn't necessarily show up as `auto` in every export. Anywhere this app shows an Auto-related figure, it's the reported share, and Auto-related UI shows "Not reported" rather than 0% when an export has no `auto` bucket at all.

## Use it

1. Open the site (GitHub Pages or a local static server).
2. Select every `part-*` file from a single GitHub Copilot export. NDJSON, JSON arrays, and `.json` files are supported.
3. Use the period, person and model filters to explore Overview, People and Core Data.

The included `data_example.json` is a fully anonymised, 2,109-record activity-export sample in the per-user metrics shape, with identifying and partition metadata removed and records wrapped in a JSON array. Load it with **Explore included sample**.

## Technical notes

This is a static site built with vanilla JavaScript ES modules and Chart.js — no build step, no backend, no runtime framework. The metrics engine (`src/metrics.js`) is pure and covered by `node --test`; run `npm test` to check it. GitHub's export schema can add fields over time; the viewer uses the stable top-level activity fields, GitHub's `ai_adoption_phase` cohort, and the supplied nested `totals_by_*` breakdowns when available.
