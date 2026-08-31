# GitHub Copilot Signals V2 Product Specification

## Product proposition

**Name:** GitHub Copilot Signals

Use **GitHub Copilot Signals** in product chrome and documentation. Do not append
“Viewer” or “Dashboard” to the product name.

**Promise:** Turn GitHub's raw Copilot usage export into user-level adoption and agentic-engineering insights — entirely in your browser.

**Positioning:** GitHub tells you how Copilot is being used across your organisation. Copilot Signals shows you how adoption differs between your people.

The product is a companion to GitHub's aggregate dashboards, not a replacement for them. Its distinctive job is to turn per-user export records into adoption depth, enablement opportunities, and coherent individual profiles.

## Product questions

The default experience must answer four questions:

1. **Who is actually adopting Copilot?** Active people, people with no observed activity, and one-day, occasional, or sustained users.
2. **How are they using it?** Code completion, Chat, Agent, CLI, Cloud/Coding Agent, and Copilot App adoption.
3. **Are they becoming agent-first?** Adoption phase, phase movement, and agent contribution by person and across the selected population.
4. **How are models being consumed?** Reported Auto versus named model usage, individual model usage, and AI credits.

## Information architecture

V2 has three views:

Overview is the default view after data loads. People and Core Data are peer
views in the primary navigation. The initial period is 28 days and the initial
person selection is Everyone.

### Overview

The leadership and rollout-owner view. It contains:

- Six headline adoption KPIs.
- Adoption depth and phase movement.
- Agent-contribution distribution.
- Product-surface adoption funnel.
- Reported Auto versus named model routing when the export contains an `auto` bucket.
- Enablement opportunities that open filtered People results.

The content order is headline KPIs, Adoption Depth, Agent-first Development,
Copilot Surface Adoption, Model Routing, and Enablement Opportunities. This
order makes adoption depth and agent contribution the primary story rather than
placing raw telemetry first.

### People

The operational view. It contains:

- Search, sorting, and composable filters.
- Phase, consistency, agent share, reported Auto share, surfaces, completion acceptance, credits, and last active columns.
- A person detail drawer with adoption, activity, surface, model, acceptance, and credit context.

### Core Data

The current dashboard's analytical window remains available in V2. It contains the existing:

- Daily interactions and generation trend.
- Model routing trend and by-mode chart.
- Repeat-use chart.
- Model, feature, and language breakdown.
- IDE breakdown.
- Product-surface chart.
- Per-person agent/user LoC chart.
- Most-active-people chart.

Core Data is preserved because the raw telemetry exploration is useful. Removing or consolidating it is outside V2 scope and should be based on observed usage after release.

## Metric definitions

### Population terminology

- **Reported people:** distinct `user_login` values represented in the selected export period.
- **Active people:** reported people with observed activity on at least one selected day.
- **No observed activity:** reported people with no observed activity in the selected period.
- Do not use `seat`, `licensed seat`, `dormant seat`, or `reclaim candidate` unless a future seat-assignment input is present.

Observed activity is true when any of these signals is present:

- A positive top-level interaction, generation, acceptance, or LoC count.
- A true `used_agent`, `used_chat`, `used_cli`, `used_copilot_app`, `used_copilot_coding_agent`, `used_copilot_cloud_agent`, or active/passive code-review flag.
- A positive CLI request count or Copilot App request count.

### Consistency

- **One day:** active on exactly 1 distinct day.
- **Occasional:** active on 2–5 distinct days.
- **Sustained:** active on at least 6 distinct days.

Only observed-active days count. Merely having a user/day record does not count as an active day.

### Adoption phase

Use `ai_adoption_phase.phase_number` and `ai_adoption_phase.phase` directly:

- 0: Passive / No Cohort.
- 1: Phase 1 / Code first.
- 2: Phase 2 / Agent first.
- 3: Phase 3 / Agent native.

For a selected period, a person's current phase is their latest reported phase. Phase movement compares their earliest and latest phase within the selected period:

- Latest > earliest: progressed.
- Latest < earliest: regressed.
- Latest = earliest: unchanged.
- A person with one phase observation is unchanged, not progressed or regressed.

**Agent-first** means latest phase 2 or 3.

### Agent contribution

Use IDE feature LoC only:

- Agent-initiated features: `agent_edit`, `chat_panel_agent_mode`, and `chat_panel_custom_mode`.
- User-initiated features: `code_completion`, `chat_inline`, `chat_panel_ask_mode`, `chat_panel_edit_mode`, `chat_panel_plan_mode`, and `chat_panel_unknown_mode`.
- Exclude `copilot_cli`, `copilot_app`, `others`, Cloud/Coding Agent activity, and unknown features from the denominator.
- LoC for a feature is `loc_added_sum + loc_deleted_sum`.
- Agent share is agent LoC divided by agent plus user LoC.
- When the denominator is zero, agent share is unavailable, not 0%.

Distribution buckets are 0–20%, 20–40%, 40–60%, 60–80%, and 80–100%. Boundary rules are `[0,20)`, `[20,40)`, `[40,60)`, `[60,80)`, and `[80,100]`.

### Product surfaces

- Completion: positive activity in `totals_by_feature` for `code_completion`.
- Chat: `used_chat` or positive activity in a `chat_*` feature.
- Agent: `used_agent` or positive activity in `agent_edit`, `chat_panel_agent_mode`, or `chat_panel_custom_mode`.
- CLI: `used_cli` or positive `totals_by_cli.request_count`.
- Cloud/Coding Agent: logical OR of `used_copilot_coding_agent` and `used_copilot_cloud_agent`.
- Copilot App: `used_copilot_app` or positive `totals_by_copilot_app.request_count`.

GitHub documents Coding Agent and Cloud Agent as aliases, so V2 presents one combined surface and never counts them as separate adoption stages.

The surface display is a progression view, not a strict mathematical funnel: people can use a later-listed surface without using every earlier surface.

### Model routing

- Use `totals_by_model_feature` generation counts.
- `model === "auto"` is the reported Auto bucket; all other non-empty models are named/resolved.
- Agent mode comprises `agent_edit`, `chat_panel_agent_mode`, and `chat_panel_custom_mode`.
- Ask mode is `chat_panel_ask_mode`.
- Hide Auto KPIs and routing comparisons when no `auto` bucket exists in the selected data.
- Label the metric **Reported Auto share** and explain that GitHub may resolve Auto activity to the selected model, so the value reflects only what the export reports as `auto`.
- Never model-filter top-level totals or AI credits, because those fields are not broken down by model.

### Completion acceptance

- Shown completions are `code_generation_activity_count` within `code_completion` feature rows.
- Accepted completions are `code_acceptance_activity_count` within `code_completion` feature rows.
- Acceptance rate is accepted divided by shown.
- When shown is zero, acceptance rate is unavailable.

## Headline Overview KPIs

The Overview shows:

1. Active people and percentage of reported people.
2. Agent-first percentage and count, based on latest Phase 2–3.
3. Sustained-use percentage and count among active people.
4. Overall agent contribution.
5. Reported Auto share in Agent workflows, conditionally shown.
6. No observed activity count and percentage of reported people.

When Reported Auto is unavailable, its card displays `Not reported` rather than `0%`.
Agent-first percentage uses all reported people in the selection as its
denominator. People without a reported adoption phase are not agent-first and
are called out as `Phase not reported` in the Adoption Depth text summary rather
than silently assigned to Phase 0.

## Enablement opportunities

Every opportunity is clickable and applies a People filter:

- **Completion-only:** used Completion, but not Chat, Agent, CLI, Cloud/Coding Agent, or Copilot App.
- **Chat, not Agent:** used Chat but not Agent.
- **Tried Agent, not sustained:** used Agent on 1–5 distinct days.
- **No observed activity:** no observed activity in the selected period.
- **Low reported Auto in Agent:** at least 5 model-attributed Agent generations and reported Auto share below 25%; hidden if no Auto bucket exists.
- **High generation, low acceptance:** at least 20 shown completions and completion acceptance below 15%.

Counts and thresholds appear in explanatory tooltips. A person may belong to multiple opportunities.

## People view

The table columns are:

- Person.
- Phase.
- Consistency.
- Agent share.
- Reported Auto share.
- Surfaces.
- Completion acceptance.
- AI credits.
- Last active.

Filters are:

- Phase 0, 1, 2, or 3.
- Completion-only.
- Chat.
- Agent.
- CLI.
- Cloud/Coding Agent.
- Copilot App.
- Reported Auto above 75%.
- No observed activity.
- Sustained.
- Enablement-opportunity identifier.

Selecting a person opens a drawer showing:

- Latest phase and human-readable phase label.
- Active days out of selected calendar days.
- Agent contribution.
- Reported Auto routing share.
- Surface checklist.
- Model distribution.
- Completion acceptance.
- AI credits.
- Last-active date.

## Filters and state

- Period and person filters apply to Overview, People, and Core Data.
- Model is a Core Data dimension filter only. It must not change Overview population KPIs, People totals, AI credits, or top-level activity totals.
- Clicking an Overview chart segment or opportunity opens People with the matching filter.
- Clicking a phase, agent-contribution bucket, or surface opens People with the
  corresponding filter. “Completion only” is available as an explicit surface
  drill-down even though it is a derived segment rather than a GitHub field.
- Reset restores the selected period to 28 days, person to Everyone, and clears People/Core Data filters.
- The export's maximum `day` anchors relative periods; the browser's current date does not.

## Privacy and delivery constraints

- Parsing and analytics remain entirely client-side.
- No uploaded record is sent to a server.
- Keep the product deployable as a static GitHub Pages site.
- Use vanilla JavaScript ES modules, HTML, CSS, and the existing Chart.js CDN.
- Add no runtime framework or backend.
- Preserve JSON array and NDJSON ingestion.
- Keep the corrected anonymised `data_example.json` as the sample fixture.

## Accessibility and responsive behavior

- All view tabs, filters, chart drill-down controls, rows, and drawer controls are keyboard accessible.
- The active view uses `aria-current="page"`.
- The person drawer uses `role="dialog"`, has an accessible name, traps focus while open, closes with Escape, and restores focus to its trigger.
- Charts have adjacent text summaries or tables so insights do not depend on canvas pixels.
- At widths below 700px, KPI cards stack, tables scroll horizontally, and the drawer occupies the viewport.

## Documentation

README copy must:

- Use the GitHub Copilot Signals name and product promise.
- Explain the aggregate-GitHub versus user-level-Signals distinction.
- Describe Overview, People, and Core Data.
- Define Reported people and explain why the app does not claim licensed-seat counts.
- Explain the Reported Auto limitation.
- State that the included sample follows the per-user metrics shape, removes identifying/partition metadata, and wraps records in a JSON array.

## Non-goals

- Replacing GitHub's aggregate usage, code-generation, or impact dashboards.
- Removing the existing core analytics window.
- Claiming licensed-seat counts or reclaim candidates without a seat-assignment input.
- Team membership joins.
- Pull-request impact, ROI, or time-to-merge analytics.
- Persisting uploaded data.
- Adding authentication, a backend, or a build framework.

## Acceptance criteria

- The default Overview answers all four product questions without scrolling through raw breakdown charts.
- The current core charts remain accessible under Core Data and retain their useful dimensions.
- Phase totals equal the number of reported people with a latest phase.
- Active-day counts use observed-active days and pass regression tests covering zero-activity rows.
- Agent contribution excludes CLI and Copilot App LoC and passes a regression test using the included sample's feature shapes.
- Cloud/Coding Agent appears once.
- Clicking every enablement opportunity produces a matching People result set.
- No UI uses `seat` terminology.
- Auto-related UI degrades to `Not reported` when the selected export has no `auto` bucket.
- All automated tests pass with `npm test`.
- The application works from a local static server and on GitHub Pages without a build step.
