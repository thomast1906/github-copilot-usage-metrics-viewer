# GitHub Copilot Signals Dashboard

A private, browser-based analytics viewer for GitHub Copilot usage exports. It turns user-level activity data into adoption, workflow, model-routing, and code-generation signals—without sending the export to a server.

It accepts the `part-*.json` / `part-*.ndjson` files produced by GitHub’s current Copilot usage metrics export.

## What this product is

This is not a Premium Requests or monthly-quota tracker. It is a self-service companion dashboard for exploring Copilot usage and adoption data at a person, model, feature, and product-surface level.

Use it to understand questions such as:

- Is Copilot adoption broad and sustained, or concentrated among a few people?
- How much activity is routed through Auto versus named models?
- Which Copilot surfaces and workflows are actually being used?
- How do agent-initiated and user-initiated code changes compare?

## What it shows

- Seat engagement: reported vs active people, chat and agent adoption
- Daily interactions and code-generation activity
- Model routing, including **Auto vs named model** totals and a day-by-day comparison
- Auto-routing share by Agent and Ask mode, plus repeat-use segments
- Product-surface adoption across chat, agent, CLI, coding agent, cloud agent, and the Copilot app
- Feature, language and IDE activity, in a single dimension-toggled breakdown panel
- Agent-initiated vs user-initiated code changes per person — split using the same agent/edit/custom-mode definition GitHub's own dashboard uses for "Agent Contribution", but broken out by person instead of only as an org-wide number
- Inline-completion acceptance rate, per person
- Accepted activity, lines added, and reported AI credit use
- A per-person table for the selected period

The dashboard deliberately does not present the export as monthly quota data. Its top-level totals are user/day activity, while the feature/model/language values are nested breakdowns; summing them across categories would double-count.

## Use it

1. Open the site (GitHub Pages or a local static server).
2. Select every `part-*` file from a single GitHub GitHub Copilot export. NDJSON, JSON arrays, and `.json` files are supported.
3. Use the period, person and model filters to explore the data.

All parsing and analytics happen locally in the browser; uploaded exports are not sent anywhere.

The included `data_example.json` is a fully anonymised, 2,109-record activity-export sample and can be loaded with **Explore included sample**. It contains no original user, organisation, or enterprise identifiers.

## Technical notes

This is a static site built with vanilla JavaScript and Chart.js. It needs no build step or backend. GitHub’s export schema can add fields over time; the viewer uses the stable top-level activity fields and the supplied nested totals (`totals_by_*`) when available.
