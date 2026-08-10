# Copilot Signals

A private, browser-only dashboard for the current GitHub Copilot activity export. It is designed around the `part-*.json` / `part-*.ndjson` files produced by GitHub’s newer export, rather than the old premium-request CSV.

## What it shows

- Seat engagement: reported vs active people, chat and agent adoption
- Daily interactions and code-generation activity
- Model routing, including **Auto vs named model** totals and a day-by-day comparison
- Product-surface adoption across chat, agent, CLI, coding agent, cloud agent, and the Copilot app
- Feature, language and IDE activity
- Accepted activity, lines added, and reported AI credit use
- A per-person table for the selected period

The dashboard deliberately does not present the new export as monthly quota data. Its top-level totals are user/day activity, while the feature/model/language values are nested breakdowns; summing them across categories would double-count.

## Use it

1. Open the site (GitHub Pages or a local static server).
2. Select every `part-*` file from a single GitHub Copilot activity export. NDJSON, JSON arrays, and `.json` files are supported.
3. Use the period, person and model filters to explore the data.

All parsing and analytics happen locally in the browser; uploaded exports are not sent anywhere.

`data_example.csv` remains supported as a lightweight legacy fallback. The included `part-*.ndjson` file is the primary sample and can be loaded with **Explore included sample**.

## Technical notes

This is a static site built with vanilla JavaScript and Chart.js. It needs no build step or backend. GitHub’s export schema can add fields over time; the viewer uses the stable top-level activity fields and the supplied nested totals (`totals_by_*`) when available.
