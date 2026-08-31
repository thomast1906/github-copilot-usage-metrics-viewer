# GitHub Copilot Signals V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Copilot usage viewer into "GitHub Copilot Signals" — a three-view app (Overview, People, Core Data) that turns the raw per-user export into adoption-depth, agent-contribution, and enablement signals GitHub's own aggregate dashboards don't surface.

**Architecture:** Extract a pure, dependency-free metrics engine (`src/metrics.js`) from the current monolithic `script.js`, test it in isolation with Node's built-in test runner, then build three thin rendering modules (`src/overview.js`, `src/people.js`, `src/coredata.js`) that consume the engine and Chart.js. `src/app.js` owns ingestion, global filter state, and view switching. `index.html` gains a tab shell; the existing chart-heavy markup moves under the Core Data tab largely unchanged.

**Tech Stack:** Vanilla JavaScript ES modules, Chart.js 4.4.7 (existing CDN `<script>` tag), HTML, CSS. Node.js 18+ `node --test` for engine unit tests (dev-only, not shipped to the browser). No build step, no framework, no backend.

**Spec:** `docs/superpowers/specs/2026-08-31-copilot-signals-v2.md` — the plan argues from this spec; read both before implementing any task.

## Global Constraints

- Name the product **GitHub Copilot Signals** (not "... Dashboard", not "... Usage Metrics Viewer") everywhere user-facing: `<title>`, hero brand mark, README.
- Positioning line, verbatim, must appear on the Overview: "GitHub tells you how Copilot is being used across your organisation. Copilot Signals shows you how adoption differs between your people."
- Parsing and analytics stay entirely client-side. No uploaded record is ever sent to a server.
- Deployable as a static GitHub Pages site: no build step, no bundler, no runtime framework, no backend.
- Use ES modules (`<script type="module">`), vanilla JS, HTML, CSS, and the existing Chart.js CDN tag only.
- Never use `seat`, `licensed seat`, `dormant seat`, or `reclaim candidate` in UI copy. Use `reported people`, `active people`, `no observed activity`.
- Preserve JSON-array and NDJSON ingestion, and keep `data_example.json` (already updated on this branch to the corrected 2,109-record shape with `ai_adoption_phase`) as the sample fixture — no changes to that file in this plan.
- Preserve the existing Core Data analytics window; do not remove or consolidate its charts in this plan.
- All automated tests pass with `npm test`. The app works from a local static server and on GitHub Pages without a build step.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | `"type": "module"`, `test` script running `node --test tests/`. No runtime dependencies. |
| `src/metrics.js` | Pure functions: observed activity, population, consistency, adoption phase, agent contribution, surfaces, completion acceptance, model routing, people index, enablement opportunities. No DOM access. |
| `src/parse.js` | Pure export parsing: `parseRecords(text)`, `mergeParsedFiles(...)`. No DOM access. |
| `src/coredata.js` | Refactor of the current `script.js` chart-rendering logic (daily pulse, routing trend, mode routing, repeat use, breakdown, IDE, LoC, most-active-people, existing people table). Renders into the Core Data view only. |
| `src/overview.js` | Headline KPIs, adoption depth, agent-contribution distribution, surface funnel, model routing panel, enablement opportunities. |
| `src/people.js` | People table, filters, sorting, person detail drawer. |
| `src/app.js` | Bootstraps `CopilotSignals`: file ingestion, global period/person/model filter state, view-tab switching, calls the three render modules. Replaces the top-level responsibilities currently in `script.js`. |
| `index.html` | Restructured into a tab shell (Overview / People / Core Data) around the existing upload panel. |
| `styles.css` | Adds tab, funnel, distribution, drawer, and phase-badge styles. Reuses the `.opportunity-grid` / `.opportunity-list` rules already present at `styles.css:3` (end of line) from earlier scaffolding. |
| `script.js` | Deleted once `src/*.js` replaces it (Task 14). |
| `tests/metrics.test.js` | `node:test` coverage for `src/metrics.js`, built up across Tasks 1–6. |
| `tests/parse.test.js` | `node:test` coverage for `src/parse.js` (Task 7). |
| `README.md` | Rewritten per spec's Documentation section (Task 15). |

---

### Task 1: Test harness, observed activity, population and consistency metrics

**Files:**
- Create: `package.json`
- Create: `src/metrics.js`
- Create: `tests/metrics.test.js`

**Interfaces:**
- Produces: `hasObservedActivity(row): boolean`, `computePopulation(rows): {reportedUsers: Set<string>, activeUsers: Set<string>, reportedCount: number, activeCount: number, noActivityCount: number}`, `computeConsistency(rows): Map<string, {activeDays: number, tier: 'one-day'|'occasional'|'sustained'}>`. Later tasks in this file import from these.

- [ ] **Step 1: Confirm the exact review-activity field name against the sample export**

Run:
```bash
node -e "const rows=JSON.parse(require('fs').readFileSync('data_example.json','utf8')); const keys=new Set(); rows.forEach(r=>Object.keys(r).forEach(k=>{if(/review/i.test(k))keys.add(k)})); console.log([...keys]);"
```
Expected: an array of top-level field names containing "review" (the spec's "active/passive code-review flag" — GitHub's export uses field names like `active_code_review` / `passive_code_review` style flags, but the exact names must come from this run). Note the printed names; use them verbatim in Step 3. If the array is empty, that signal does not exist in this export shape — skip it in `hasObservedActivity` and note that in a comment.

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "github-copilot-signals",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 3: Write the failing tests**

Create `tests/metrics.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasObservedActivity, computePopulation, computeConsistency } from '../src/metrics.js';

test('hasObservedActivity is true when generation count is positive', () => {
  assert.equal(hasObservedActivity({ code_generation_activity_count: 3 }), true);
});

test('hasObservedActivity is false when every signal is zero or absent', () => {
  assert.equal(hasObservedActivity({
    user_initiated_interaction_count: 0,
    code_generation_activity_count: 0,
    code_acceptance_activity_count: 0,
    used_agent: false,
    used_chat: false
  }), false);
});

test('hasObservedActivity is true for a used_agent flag even with zero counts', () => {
  assert.equal(hasObservedActivity({ code_generation_activity_count: 0, used_agent: true }), true);
});

test('hasObservedActivity is true for a positive CLI request count', () => {
  assert.equal(hasObservedActivity({ totals_by_cli: { request_count: 2 } }), true);
});

test('hasObservedActivity is true for a positive Copilot App request count', () => {
  assert.equal(hasObservedActivity({ totals_by_copilot_app: { request_count: 1 } }), true);
});

test('computePopulation counts reported, active and no-activity people once each', () => {
  const rows = [
    { user_login: 'a', day: '2026-06-01', code_generation_activity_count: 5 },
    { user_login: 'a', day: '2026-06-02', code_generation_activity_count: 0 },
    { user_login: 'b', day: '2026-06-01', code_generation_activity_count: 0 }
  ];
  const population = computePopulation(rows);
  assert.equal(population.reportedCount, 2);
  assert.equal(population.activeCount, 1);
  assert.equal(population.noActivityCount, 1);
});

test('computeConsistency buckets active days into one-day, occasional and sustained', () => {
  const rows = [
    { user_login: 'a', day: '2026-06-01', code_generation_activity_count: 1 },
    { user_login: 'b', day: '2026-06-01', code_generation_activity_count: 1 },
    { user_login: 'b', day: '2026-06-02', code_generation_activity_count: 1 },
    { user_login: 'b', day: '2026-06-03', code_generation_activity_count: 1 }
  ];
  const consistency = computeConsistency(rows);
  assert.equal(consistency.get('a').activeDays, 1);
  assert.equal(consistency.get('a').tier, 'one-day');
  assert.equal(consistency.get('b').activeDays, 3);
  assert.equal(consistency.get('b').tier, 'occasional');
});

test('computeConsistency only counts observed-active days, not raw row presence', () => {
  const rows = [
    { user_login: 'a', day: '2026-06-01', code_generation_activity_count: 0 },
    { user_login: 'a', day: '2026-06-02', code_generation_activity_count: 0 }
  ];
  const consistency = computeConsistency(rows);
  assert.equal(consistency.has('a'), false);
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/metrics.js'`.

- [ ] **Step 5: Implement `src/metrics.js`**

Use the field names discovered in Step 1 for the review-flag check. Replace `active_review_count` / `passive_review_count` below with whatever Step 1 printed (or drop that line if nothing was found):

```js
export function userLogin(row) {
  return row.user_login || row.User;
}

function isPositive(value) {
  return Number(value) > 0;
}

export function hasObservedActivity(row) {
  if (isPositive(row.user_initiated_interaction_count)) return true;
  if (isPositive(row.code_generation_activity_count)) return true;
  if (isPositive(row.code_acceptance_activity_count)) return true;
  if (isPositive(row.loc_added_sum) || isPositive(row.loc_deleted_sum)) return true;
  if (
    row.used_agent || row.used_chat || row.used_cli ||
    row.used_copilot_app || row.used_copilot_coding_agent || row.used_copilot_cloud_agent
  ) return true;
  if (isPositive(row.active_review_count) || isPositive(row.passive_review_count)) return true;
  if (isPositive(row.totals_by_cli?.request_count)) return true;
  if (isPositive(row.totals_by_copilot_app?.request_count)) return true;
  return false;
}

export function computePopulation(rows) {
  const reportedUsers = new Set();
  const activeUsers = new Set();
  rows.forEach((row) => {
    const user = userLogin(row);
    if (!user) return;
    reportedUsers.add(user);
    if (hasObservedActivity(row)) activeUsers.add(user);
  });
  return {
    reportedUsers,
    activeUsers,
    reportedCount: reportedUsers.size,
    activeCount: activeUsers.size,
    noActivityCount: reportedUsers.size - activeUsers.size
  };
}

export function computeConsistency(rows) {
  const activeDaysByUser = new Map();
  rows.forEach((row) => {
    const user = userLogin(row);
    if (!user || !hasObservedActivity(row)) return;
    if (!activeDaysByUser.has(user)) activeDaysByUser.set(user, new Set());
    activeDaysByUser.get(user).add(row.day);
  });
  const result = new Map();
  activeDaysByUser.forEach((days, user) => {
    const activeDays = days.size;
    const tier = activeDays === 1 ? 'one-day' : activeDays <= 5 ? 'occasional' : 'sustained';
    result.set(user, { activeDays, tier });
  });
  return result;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all 8 tests green.

- [ ] **Step 7: Commit**

```bash
git add package.json src/metrics.js tests/metrics.test.js
git commit -m "feat: add observed-activity, population and consistency metrics"
```

---

### Task 2: Adoption phase metrics

**Files:**
- Modify: `src/metrics.js`
- Modify: `tests/metrics.test.js`

**Interfaces:**
- Consumes: `userLogin(row)` from Task 1.
- Produces: `computeAdoptionPhase(rows): Map<string, {earliest: {day, phaseNumber, phase}, latest: {day, phaseNumber, phase}, movement: 'progressed'|'regressed'|'unchanged', agentFirst: boolean}>`, `PHASE_LABELS: {0: string, 1: string, 2: string, 3: string}`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/metrics.test.js`:

```js
import { computeAdoptionPhase, PHASE_LABELS } from '../src/metrics.js';

test('computeAdoptionPhase marks a single observation as unchanged, not progressed', () => {
  const rows = [{ user_login: 'a', day: '2026-06-10', ai_adoption_phase: { phase_number: 2, phase: 'Phase 2' } }];
  const phases = computeAdoptionPhase(rows);
  assert.equal(phases.get('a').movement, 'unchanged');
  assert.equal(phases.get('a').latest.phaseNumber, 2);
});

test('computeAdoptionPhase detects progression from earliest to latest reported phase', () => {
  const rows = [
    { user_login: 'a', day: '2026-06-01', ai_adoption_phase: { phase_number: 1, phase: 'Phase 1' } },
    { user_login: 'a', day: '2026-06-15', ai_adoption_phase: { phase_number: 3, phase: 'Phase 3' } }
  ];
  const phases = computeAdoptionPhase(rows);
  assert.equal(phases.get('a').movement, 'progressed');
  assert.equal(phases.get('a').agentFirst, true);
});

test('computeAdoptionPhase detects regression and is not order-dependent on row order', () => {
  const rows = [
    { user_login: 'a', day: '2026-06-15', ai_adoption_phase: { phase_number: 1, phase: 'Phase 1' } },
    { user_login: 'a', day: '2026-06-01', ai_adoption_phase: { phase_number: 2, phase: 'Phase 2' } }
  ];
  const phases = computeAdoptionPhase(rows);
  assert.equal(phases.get('a').movement, 'regressed');
});

test('computeAdoptionPhase treats phase 0 and phase 1 as not agent-first', () => {
  const rows = [{ user_login: 'a', day: '2026-06-01', ai_adoption_phase: { phase_number: 1, phase: 'Phase 1' } }];
  assert.equal(computeAdoptionPhase(rows).get('a').agentFirst, false);
});

test('computeAdoptionPhase skips rows with no phase data', () => {
  const rows = [{ user_login: 'a', day: '2026-06-01' }];
  assert.equal(computeAdoptionPhase(rows).has('a'), false);
});

test('PHASE_LABELS covers phase 0 through 3', () => {
  assert.equal(Object.keys(PHASE_LABELS).length, 4);
  assert.ok(PHASE_LABELS[0].toLowerCase().includes('passive'));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `computeAdoptionPhase is not a function`.

- [ ] **Step 3: Implement in `src/metrics.js`**

```js
export const PHASE_LABELS = {
  0: 'Passive / No cohort',
  1: 'Phase 1 · Code first',
  2: 'Phase 2 · Agent first',
  3: 'Phase 3 · Agent native'
};

export function computeAdoptionPhase(rows) {
  const observationsByUser = new Map();
  rows.forEach((row) => {
    const user = userLogin(row);
    const phaseInfo = row.ai_adoption_phase;
    if (!user || !phaseInfo || typeof phaseInfo.phase_number !== 'number') return;
    const observations = observationsByUser.get(user) || [];
    observations.push({ day: row.day, phaseNumber: phaseInfo.phase_number, phase: phaseInfo.phase });
    observationsByUser.set(user, observations);
  });
  const result = new Map();
  observationsByUser.forEach((observations, user) => {
    observations.sort((a, b) => a.day.localeCompare(b.day));
    const earliest = observations[0];
    const latest = observations[observations.length - 1];
    const movement = observations.length === 1
      ? 'unchanged'
      : latest.phaseNumber > earliest.phaseNumber
        ? 'progressed'
        : latest.phaseNumber < earliest.phaseNumber
          ? 'regressed'
          : 'unchanged';
    result.set(user, { earliest, latest, movement, agentFirst: latest.phaseNumber >= 2 });
  });
  return result;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/metrics.js tests/metrics.test.js
git commit -m "feat: add adoption-phase metrics"
```

---

### Task 3: Agent contribution metrics

**Files:**
- Modify: `src/metrics.js`
- Modify: `tests/metrics.test.js`

**Interfaces:**
- Consumes: `userLogin(row)`.
- Produces: `computeAgentContribution(rows): Map<string, {agentLoc: number, userLoc: number, share: number|null}>`, `bucketAgentShare(share): '0-20'|'20-40'|'40-60'|'60-80'|'80-100'|null`, and exported constant `AGENT_FEATURES: Set<string>` (reused by Task 4 and Task 5).

- [ ] **Step 1: Write the failing tests**

Append to `tests/metrics.test.js`:

```js
import { computeAgentContribution, bucketAgentShare } from '../src/metrics.js';

function featureRow(user, features) {
  return { user_login: user, day: '2026-06-01', totals_by_feature: features };
}

test('computeAgentContribution sums agent-mode and user-mode LoC separately', () => {
  const rows = [featureRow('a', [
    { feature: 'agent_edit', loc_added_sum: 50, loc_deleted_sum: 10 },
    { feature: 'code_completion', loc_added_sum: 20, loc_deleted_sum: 0 }
  ])];
  const contribution = computeAgentContribution(rows).get('a');
  assert.equal(contribution.agentLoc, 60);
  assert.equal(contribution.userLoc, 20);
  assert.equal(contribution.share, 0.75);
});

test('computeAgentContribution excludes CLI and Copilot App features from the denominator', () => {
  const rows = [featureRow('a', [
    { feature: 'copilot_cli', loc_added_sum: 500, loc_deleted_sum: 0 },
    { feature: 'copilot_app', loc_added_sum: 500, loc_deleted_sum: 0 },
    { feature: 'agent_edit', loc_added_sum: 10, loc_deleted_sum: 0 }
  ])];
  const contribution = computeAgentContribution(rows).get('a');
  assert.equal(contribution.agentLoc, 10);
  assert.equal(contribution.userLoc, 0);
  assert.equal(contribution.share, 1);
});

test('computeAgentContribution reports share as null, not zero, when the denominator is zero', () => {
  const rows = [featureRow('a', [])];
  assert.equal(computeAgentContribution(rows).get('a').share, null);
});

test('bucketAgentShare applies half-open boundaries', () => {
  assert.equal(bucketAgentShare(0), '0-20');
  assert.equal(bucketAgentShare(0.19), '0-20');
  assert.equal(bucketAgentShare(0.2), '20-40');
  assert.equal(bucketAgentShare(0.4), '40-60');
  assert.equal(bucketAgentShare(0.6), '60-80');
  assert.equal(bucketAgentShare(0.8), '80-100');
  assert.equal(bucketAgentShare(1), '80-100');
  assert.equal(bucketAgentShare(null), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `computeAgentContribution is not a function`.

- [ ] **Step 3: Implement in `src/metrics.js`**

```js
export const AGENT_FEATURES = new Set(['agent_edit', 'chat_panel_agent_mode', 'chat_panel_custom_mode']);
export const USER_FEATURES = new Set([
  'code_completion', 'chat_inline', 'chat_panel_ask_mode',
  'chat_panel_edit_mode', 'chat_panel_plan_mode', 'chat_panel_unknown_mode'
]);

function featureLoc(feature) {
  return Number(feature.loc_added_sum || 0) + Number(feature.loc_deleted_sum || 0);
}

export function computeAgentContribution(rows) {
  const byUser = new Map();
  rows.forEach((row) => {
    const user = userLogin(row);
    if (!user) return;
    const totals = byUser.get(user) || { agentLoc: 0, userLoc: 0 };
    (row.totals_by_feature || []).forEach((feature) => {
      if (AGENT_FEATURES.has(feature.feature)) totals.agentLoc += featureLoc(feature);
      else if (USER_FEATURES.has(feature.feature)) totals.userLoc += featureLoc(feature);
    });
    byUser.set(user, totals);
  });
  const result = new Map();
  byUser.forEach((totals, user) => {
    const denominator = totals.agentLoc + totals.userLoc;
    result.set(user, { ...totals, share: denominator > 0 ? totals.agentLoc / denominator : null });
  });
  return result;
}

export function bucketAgentShare(share) {
  if (share === null || share === undefined) return null;
  const percent = share * 100;
  if (percent < 20) return '0-20';
  if (percent < 40) return '20-40';
  if (percent < 60) return '40-60';
  if (percent < 80) return '60-80';
  return '80-100';
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/metrics.js tests/metrics.test.js
git commit -m "feat: add agent-contribution share and distribution bucketing"
```

---

### Task 4: Product surface and completion acceptance metrics

**Files:**
- Modify: `src/metrics.js`
- Modify: `tests/metrics.test.js`

**Interfaces:**
- Consumes: `userLogin(row)`, `AGENT_FEATURES` from Task 3.
- Produces: `computeSurfaces(rows): Map<string, {completion, chat, agent, cli, cloudCodingAgent, copilotApp: boolean}>`, `computeCompletionAcceptance(rows): Map<string, {shown: number, accepted: number, rate: number|null}>`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/metrics.test.js`:

```js
import { computeSurfaces, computeCompletionAcceptance } from '../src/metrics.js';

test('computeSurfaces marks completion true only from a positive code_completion generation count', () => {
  const rows = [featureRow('a', [{ feature: 'code_completion', code_generation_activity_count: 3 }])];
  assert.equal(computeSurfaces(rows).get('a').completion, true);
});

test('computeSurfaces marks agent true from used_agent even without feature rows', () => {
  const rows = [{ user_login: 'a', day: '2026-06-01', used_agent: true }];
  assert.equal(computeSurfaces(rows).get('a').agent, true);
});

test('computeSurfaces treats coding agent and cloud agent as one combined surface', () => {
  const codingOnly = computeSurfaces([{ user_login: 'a', day: '2026-06-01', used_copilot_coding_agent: true }]).get('a');
  const cloudOnly = computeSurfaces([{ user_login: 'b', day: '2026-06-01', used_copilot_cloud_agent: true }]).get('b');
  assert.equal(codingOnly.cloudCodingAgent, true);
  assert.equal(cloudOnly.cloudCodingAgent, true);
});

test('computeSurfaces marks CLI true from a positive totals_by_cli.request_count', () => {
  const rows = [{ user_login: 'a', day: '2026-06-01', totals_by_cli: { request_count: 4 } }];
  assert.equal(computeSurfaces(rows).get('a').cli, true);
});

test('computeCompletionAcceptance computes rate from shown and accepted completion activity only', () => {
  const rows = [featureRow('a', [
    { feature: 'code_completion', code_generation_activity_count: 20, code_acceptance_activity_count: 5 },
    { feature: 'chat_panel_agent_mode', code_generation_activity_count: 100, code_acceptance_activity_count: 100 }
  ])];
  const acceptance = computeCompletionAcceptance(rows).get('a');
  assert.equal(acceptance.shown, 20);
  assert.equal(acceptance.accepted, 5);
  assert.equal(acceptance.rate, 0.25);
});

test('computeCompletionAcceptance reports rate as null, not zero, when nothing was shown', () => {
  const rows = [featureRow('a', [])];
  assert.equal(computeCompletionAcceptance(rows).get('a').rate, null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `computeSurfaces is not a function`.

- [ ] **Step 3: Implement in `src/metrics.js`**

```js
export function computeSurfaces(rows) {
  const byUser = new Map();
  rows.forEach((row) => {
    const user = userLogin(row);
    if (!user) return;
    const surfaces = byUser.get(user) || {
      completion: false, chat: false, agent: false, cli: false, cloudCodingAgent: false, copilotApp: false
    };
    const features = row.totals_by_feature || [];
    const generated = (name) => features.some((f) => f.feature === name && isPositive(f.code_generation_activity_count));
    if (generated('code_completion')) surfaces.completion = true;
    if (row.used_chat || features.some((f) => f.feature?.startsWith('chat_') && isPositive(f.code_generation_activity_count))) surfaces.chat = true;
    if (row.used_agent || features.some((f) => AGENT_FEATURES.has(f.feature) && isPositive(f.code_generation_activity_count))) surfaces.agent = true;
    if (row.used_cli || isPositive(row.totals_by_cli?.request_count)) surfaces.cli = true;
    if (row.used_copilot_coding_agent || row.used_copilot_cloud_agent) surfaces.cloudCodingAgent = true;
    if (row.used_copilot_app || isPositive(row.totals_by_copilot_app?.request_count)) surfaces.copilotApp = true;
    byUser.set(user, surfaces);
  });
  return byUser;
}

export function computeCompletionAcceptance(rows) {
  const byUser = new Map();
  rows.forEach((row) => {
    const user = userLogin(row);
    if (!user) return;
    const totals = byUser.get(user) || { shown: 0, accepted: 0 };
    (row.totals_by_feature || []).forEach((feature) => {
      if (feature.feature !== 'code_completion') return;
      totals.shown += Number(feature.code_generation_activity_count || 0);
      totals.accepted += Number(feature.code_acceptance_activity_count || 0);
    });
    byUser.set(user, totals);
  });
  const result = new Map();
  byUser.forEach((totals, user) => {
    result.set(user, { ...totals, rate: totals.shown > 0 ? totals.accepted / totals.shown : null });
  });
  return result;
}
```

`isPositive` is already private to the module from Task 1 — reuse it, do not redefine it.

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/metrics.js tests/metrics.test.js
git commit -m "feat: add product-surface and completion-acceptance metrics"
```

---

### Task 5: Model routing metrics

**Files:**
- Modify: `src/metrics.js`
- Modify: `tests/metrics.test.js`

**Interfaces:**
- Consumes: `userLogin(row)`, `AGENT_FEATURES`.
- Produces: `computeModelRouting(rows): {hasAutoBucket: boolean, overall: {agent: {auto, named}, ask: {auto, named}}, byUserModel: Map<string, Map<string, number>>, byUserAgentMode: Map<string, {auto, named}>, agentAutoShare: number|null, askAutoShare: number|null}`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/metrics.test.js`:

```js
import { computeModelRouting } from '../src/metrics.js';

function modelFeatureRow(user, entries) {
  return { user_login: user, day: '2026-06-01', totals_by_model_feature: entries };
}

test('computeModelRouting reports hasAutoBucket false when no export row uses model "auto"', () => {
  const rows = [modelFeatureRow('a', [{ model: 'claude-4.6-sonnet', feature: 'agent_edit', code_generation_activity_count: 5 }])];
  const routing = computeModelRouting(rows);
  assert.equal(routing.hasAutoBucket, false);
  assert.equal(routing.agentAutoShare, null);
});

test('computeModelRouting splits Agent-mode generation into auto and named buckets', () => {
  const rows = [modelFeatureRow('a', [
    { model: 'auto', feature: 'agent_edit', code_generation_activity_count: 30 },
    { model: 'claude-4.6-sonnet', feature: 'chat_panel_custom_mode', code_generation_activity_count: 10 }
  ])];
  const routing = computeModelRouting(rows);
  assert.equal(routing.hasAutoBucket, true);
  assert.equal(routing.overall.agent.auto, 30);
  assert.equal(routing.overall.agent.named, 10);
  assert.equal(routing.agentAutoShare, 0.75);
});

test('computeModelRouting keeps Ask mode separate from Agent mode', () => {
  const rows = [modelFeatureRow('a', [
    { model: 'auto', feature: 'chat_panel_ask_mode', code_generation_activity_count: 4 },
    { model: 'gpt-5.6', feature: 'chat_panel_ask_mode', code_generation_activity_count: 16 }
  ])];
  const routing = computeModelRouting(rows);
  assert.equal(routing.overall.agent.auto, 0);
  assert.equal(routing.askAutoShare, 0.2);
});

test('computeModelRouting tracks per-person, per-model totals for the drawer', () => {
  const rows = [modelFeatureRow('a', [
    { model: 'auto', feature: 'agent_edit', code_generation_activity_count: 8 },
    { model: 'gpt-5.6', feature: 'agent_edit', code_generation_activity_count: 2 }
  ])];
  const perUser = computeModelRouting(rows).byUserModel.get('a');
  assert.equal(perUser.get('auto'), 8);
  assert.equal(perUser.get('gpt-5.6'), 2);
});

test('computeModelRouting tracks per-person Agent-mode auto/named totals for enablement checks', () => {
  const rows = [modelFeatureRow('a', [
    { model: 'auto', feature: 'agent_edit', code_generation_activity_count: 2 },
    { model: 'claude-4.6-sonnet', feature: 'agent_edit', code_generation_activity_count: 8 },
    { model: 'auto', feature: 'chat_panel_ask_mode', code_generation_activity_count: 100 }
  ])];
  const agentModeTotals = computeModelRouting(rows).byUserAgentMode.get('a');
  assert.equal(agentModeTotals.auto, 2);
  assert.equal(agentModeTotals.named, 8);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `computeModelRouting is not a function`.

- [ ] **Step 3: Implement in `src/metrics.js`**

```js
const ASK_MODE_FEATURE = 'chat_panel_ask_mode';

export function computeModelRouting(rows) {
  let hasAutoBucket = false;
  const overall = { agent: { auto: 0, named: 0 }, ask: { auto: 0, named: 0 } };
  const byUserModel = new Map();
  const byUserAgentMode = new Map();
  rows.forEach((row) => {
    const user = userLogin(row);
    (row.totals_by_model_feature || []).forEach((entry) => {
      if (!entry.model) return;
      const amount = Number(entry.code_generation_activity_count || 0);
      if (entry.model === 'auto') hasAutoBucket = true;
      const bucket = entry.model === 'auto' ? 'auto' : 'named';
      if (AGENT_FEATURES.has(entry.feature)) overall.agent[bucket] += amount;
      else if (entry.feature === ASK_MODE_FEATURE) overall.ask[bucket] += amount;
      if (!user) return;
      const perUser = byUserModel.get(user) || new Map();
      perUser.set(entry.model, (perUser.get(entry.model) || 0) + amount);
      byUserModel.set(user, perUser);
      if (AGENT_FEATURES.has(entry.feature)) {
        const agentTotals = byUserAgentMode.get(user) || { auto: 0, named: 0 };
        agentTotals[bucket] += amount;
        byUserAgentMode.set(user, agentTotals);
      }
    });
  });
  const share = (bucket) => (bucket.auto + bucket.named > 0 ? bucket.auto / (bucket.auto + bucket.named) : null);
  return {
    hasAutoBucket,
    overall,
    byUserModel,
    byUserAgentMode,
    agentAutoShare: share(overall.agent),
    askAutoShare: share(overall.ask)
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/metrics.js tests/metrics.test.js
git commit -m "feat: add model routing metrics"
```

---

### Task 6: People index and enablement opportunities

**Files:**
- Modify: `src/metrics.js`
- Modify: `tests/metrics.test.js`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: `buildPeopleIndex(rows): Map<string, PersonRecord>` where `PersonRecord = {active, consistency, phase, agentContribution, surfaces, acceptance, autoShare, credits, lastActive}`; `classifyEnablementOpportunities(peopleIndex, routing): {completionOnly, chatNotAgent, triedAgentNotSustained, noObservedActivity, lowAutoInAgent, highGenLowAcceptance: string[] | null}`. Both are consumed directly by `src/overview.js` (Task 9–11) and `src/people.js` (Task 12–13).

- [ ] **Step 1: Write the failing tests**

Append to `tests/metrics.test.js`:

```js
import { buildPeopleIndex, classifyEnablementOpportunities } from '../src/metrics.js';

test('buildPeopleIndex includes every reported person even with no activity', () => {
  const rows = [{ user_login: 'a', day: '2026-06-01', code_generation_activity_count: 0 }];
  const index = buildPeopleIndex(rows);
  assert.equal(index.has('a'), true);
  assert.equal(index.get('a').active, false);
});

test('buildPeopleIndex computes person-level reported Auto share across all their model activity', () => {
  const rows = [modelFeatureRow('a', [
    { model: 'auto', feature: 'agent_edit', code_generation_activity_count: 6 },
    { model: 'gpt-5.6', feature: 'chat_panel_ask_mode', code_generation_activity_count: 2 }
  ])];
  assert.equal(buildPeopleIndex(rows).get('a').autoShare, 0.75);
});

test('buildPeopleIndex sums ai_credits_used per person across all their rows', () => {
  const rows = [
    { user_login: 'a', day: '2026-06-01', ai_credits_used: 5 },
    { user_login: 'a', day: '2026-06-02', ai_credits_used: 7 }
  ];
  assert.equal(buildPeopleIndex(rows).get('a').credits, 12);
});

test('buildPeopleIndex tracks the latest observed-active day as lastActive', () => {
  const rows = [
    { user_login: 'a', day: '2026-06-01', code_generation_activity_count: 1 },
    { user_login: 'a', day: '2026-06-05', code_generation_activity_count: 0 }
  ];
  assert.equal(buildPeopleIndex(rows).get('a').lastActive, '2026-06-01');
});

test('classifyEnablementOpportunities flags completion-only people', () => {
  const rows = [featureRow('a', [{ feature: 'code_completion', code_generation_activity_count: 5 }])];
  const index = buildPeopleIndex(rows);
  const routing = computeModelRouting(rows);
  const opportunities = classifyEnablementOpportunities(index, routing);
  assert.deepEqual(opportunities.completionOnly, ['a']);
});

test('classifyEnablementOpportunities flags chat users who have not tried agent', () => {
  const rows = [{ user_login: 'a', day: '2026-06-01', used_chat: true }];
  const index = buildPeopleIndex(rows);
  const routing = computeModelRouting(rows);
  assert.deepEqual(classifyEnablementOpportunities(index, routing).chatNotAgent, ['a']);
});

test('classifyEnablementOpportunities returns null for lowAutoInAgent when the export has no auto bucket', () => {
  const rows = [featureRow('a', [{ feature: 'agent_edit', code_generation_activity_count: 5 }])];
  const index = buildPeopleIndex(rows);
  const routing = computeModelRouting(rows);
  assert.equal(classifyEnablementOpportunities(index, routing).lowAutoInAgent, null);
});

test('classifyEnablementOpportunities flags high generation, low acceptance', () => {
  const rows = [featureRow('a', [{ feature: 'code_completion', code_generation_activity_count: 20, code_acceptance_activity_count: 1 }])];
  const index = buildPeopleIndex(rows);
  const routing = computeModelRouting(rows);
  assert.deepEqual(classifyEnablementOpportunities(index, routing).highGenLowAcceptance, ['a']);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `buildPeopleIndex is not a function`.

- [ ] **Step 3: Implement in `src/metrics.js`**

```js
export function buildPeopleIndex(rows) {
  const population = computePopulation(rows);
  const consistency = computeConsistency(rows);
  const phases = computeAdoptionPhase(rows);
  const agentContribution = computeAgentContribution(rows);
  const surfaces = computeSurfaces(rows);
  const acceptance = computeCompletionAcceptance(rows);
  const routing = computeModelRouting(rows);

  const lastActiveByUser = new Map();
  const creditsByUser = new Map();
  rows.forEach((row) => {
    const user = userLogin(row);
    if (!user) return;
    creditsByUser.set(user, (creditsByUser.get(user) || 0) + Number(row.ai_credits_used || 0));
    if (!hasObservedActivity(row)) return;
    const current = lastActiveByUser.get(user);
    if (!current || row.day > current) lastActiveByUser.set(user, row.day);
  });

  const index = new Map();
  population.reportedUsers.forEach((user) => {
    const modelTotals = routing.byUserModel.get(user);
    let autoShare = null;
    if (modelTotals) {
      const autoAmount = modelTotals.get('auto') || 0;
      let namedAmount = 0;
      modelTotals.forEach((amount, model) => { if (model !== 'auto') namedAmount += amount; });
      if (autoAmount + namedAmount > 0) autoShare = autoAmount / (autoAmount + namedAmount);
    }
    index.set(user, {
      active: population.activeUsers.has(user),
      consistency: consistency.get(user) || { activeDays: 0, tier: null },
      phase: phases.get(user) || null,
      agentContribution: agentContribution.get(user) || { agentLoc: 0, userLoc: 0, share: null },
      surfaces: surfaces.get(user) || { completion: false, chat: false, agent: false, cli: false, cloudCodingAgent: false, copilotApp: false },
      acceptance: acceptance.get(user) || { shown: 0, accepted: 0, rate: null },
      autoShare,
      credits: creditsByUser.get(user) || 0,
      lastActive: lastActiveByUser.get(user) || null
    });
  });
  return index;
}

export function classifyEnablementOpportunities(peopleIndex, routing) {
  const opportunities = {
    completionOnly: [],
    chatNotAgent: [],
    triedAgentNotSustained: [],
    noObservedActivity: [],
    lowAutoInAgent: routing.hasAutoBucket ? [] : null,
    highGenLowAcceptance: []
  };
  peopleIndex.forEach((person, user) => {
    const s = person.surfaces;
    if (s.completion && !s.chat && !s.agent && !s.cli && !s.cloudCodingAgent && !s.copilotApp) {
      opportunities.completionOnly.push(user);
    }
    if (s.chat && !s.agent) opportunities.chatNotAgent.push(user);
    if (s.agent && person.consistency.activeDays >= 1 && person.consistency.activeDays <= 5) {
      opportunities.triedAgentNotSustained.push(user);
    }
    if (!person.active) opportunities.noObservedActivity.push(user);
    if (routing.hasAutoBucket) {
      const agentModeTotals = routing.byUserAgentMode.get(user);
      const agentGenerations = agentModeTotals ? agentModeTotals.auto + agentModeTotals.named : 0;
      const agentAutoShare = agentGenerations > 0 ? agentModeTotals.auto / agentGenerations : null;
      if (agentGenerations >= 5 && agentAutoShare < 0.25) opportunities.lowAutoInAgent.push(user);
    }
    if (person.acceptance.shown >= 20 && person.acceptance.rate !== null && person.acceptance.rate < 0.15) {
      opportunities.highGenLowAcceptance.push(user);
    }
  });
  return opportunities;
}
```

Note: `lowAutoInAgent`'s "reported Auto share below 25%" threshold is applied against the person's **Agent-mode-only** auto share (`byUserAgentMode`), not their overall `autoShare`, because the opportunity is specifically about Agent-mode routing. This is a documented interpretation of a spec bullet that doesn't repeat the mode scope explicitly — flag it in code review if the product owner meant something else.

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS, all tests green (30+ tests across Tasks 1–6).

- [ ] **Step 5: Commit**

```bash
git add src/metrics.js tests/metrics.test.js
git commit -m "feat: add people index and enablement-opportunity classification"
```

---

### Task 7: Data ingestion module

**Files:**
- Create: `src/parse.js`
- Create: `tests/parse.test.js`

**Interfaces:**
- Produces: `parseRecords(text: string): object[]`, `mergeParsedFiles(files: {text: string}[]): object[]`. Consumed by `src/app.js` (Task 14).

- [ ] **Step 1: Write the failing tests**

Create `tests/parse.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRecords, mergeParsedFiles } from '../src/parse.js';

test('parseRecords parses a JSON array export', () => {
  const records = parseRecords('[{"user_login":"a"},{"user_login":"b"}]');
  assert.equal(records.length, 2);
});

test('parseRecords parses NDJSON, one record per line', () => {
  const records = parseRecords('{"user_login":"a"}\n{"user_login":"b"}\n');
  assert.equal(records.length, 2);
});

test('parseRecords strips a leading UTF-8 BOM before parsing', () => {
  const records = parseRecords('﻿[{"user_login":"a"}]');
  assert.equal(records.length, 1);
});

test('parseRecords returns an empty array for blank input', () => {
  assert.deepEqual(parseRecords('   '), []);
});

test('parseRecords unwraps a {data: [...]} envelope', () => {
  const records = parseRecords('{"data":[{"user_login":"a"}]}');
  assert.equal(records.length, 1);
});

test('mergeParsedFiles flattens records from multiple files in order', () => {
  const records = mergeParsedFiles([
    { text: '[{"user_login":"a"}]' },
    { text: '{"user_login":"b"}' }
  ]);
  assert.deepEqual(records.map((r) => r.user_login), ['a', 'b']);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/parse.js'`.

- [ ] **Step 3: Implement `src/parse.js`**

```js
export function parseRecords(text) {
  const clean = text.replace(/^﻿/, '').trim();
  if (!clean) return [];
  try {
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : (parsed.data || parsed.rows || [parsed]);
  } catch {
    return clean.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  }
}

export function mergeParsedFiles(files) {
  return files.flatMap((file) => parseRecords(file.text));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/parse.js tests/parse.test.js
git commit -m "feat: extract export parsing into a standalone module"
```

---

### Task 8: Three-view HTML/CSS shell

**Files:**
- Modify: `index.html:1-89`
- Modify: `styles.css`

**Interfaces:**
- Produces: three `<section>` view containers (`#view-overview`, `#view-people`, `#view-coredata`), a `<nav class="view-tabs" role="tablist">` with three `<button role="tab">`, and CSS classes `.view-tabs`, `.view-tab`, `.view[hidden]`. Task 9–13 render into these sections; Task 14 wires the tab-switching JS.

- [ ] **Step 1: Rewrite the `<head>` title, description and hero copy**

In `index.html:6-8` and `index.html:18-20`, replace:

```html
  <meta name="description" content="A private, browser-based viewer for GitHub Copilot metrics exports.">
  <meta name="theme-color" content="#0b1220">
  <title>GitHub Copilot Signals Dashboard</title>
```
with:
```html
  <meta name="description" content="Turn GitHub's raw Copilot usage export into user-level adoption and agentic-engineering insights — entirely in your browser.">
  <meta name="theme-color" content="#0b1220">
  <title>GitHub Copilot Signals</title>
```

Replace the hero block at `index.html:17-21`:
```html
    <header class="hero">
      <div class="brand"><span class="brand-mark">✦</span> GitHub Copilot Signals Dashboard</div>
      <h1>See how teams are actually using GitHub Copilot.</h1>
      <p>Turn GitHub's detailed activity export into adoption, workflow, and model-routing signals. Processing stays entirely in your browser.</p>
    </header>
```
with:
```html
    <header class="hero">
      <div class="brand"><span class="brand-mark">✦</span> GitHub Copilot Signals</div>
      <h1>Understand who is adopting Copilot — and how deeply.</h1>
      <p>GitHub tells you how Copilot is being used across your organisation. Copilot Signals shows you how adoption differs between your people — entirely in your browser, from GitHub's own usage export.</p>
    </header>
```

- [ ] **Step 2: Add the view tab bar directly above the dashboard section**

In `index.html`, immediately before the existing `<section id="dashboard" hidden>` (`index.html:35`), insert:

```html
    <nav class="view-tabs" role="tablist" aria-label="Dashboard views" hidden id="viewTabs">
      <button class="view-tab" role="tab" id="tab-overview" aria-controls="view-overview" aria-selected="true" data-view="overview">Overview</button>
      <button class="view-tab" role="tab" id="tab-people" aria-controls="view-people" aria-selected="false" data-view="people" tabindex="-1">People</button>
      <button class="view-tab" role="tab" id="tab-coredata" aria-controls="view-coredata" aria-selected="false" data-view="coredata" tabindex="-1">Core Data</button>
    </nav>
```

- [ ] **Step 3: Wrap the toolbar and context note outside the per-view sections**

The toolbar (`index.html:36-48`) and context note (`index.html:50`) apply to every view (period/person filters are shared per the spec). Leave them as direct children of `<section id="dashboard" hidden>`, unchanged, positioned above the three new view sections.

- [ ] **Step 4: Split the existing dashboard body into `#view-overview`, `#view-people` and `#view-coredata`**

Replace `index.html:52-83` (the `metric-grid` through `table-card` sections, currently all direct children of `#dashboard`) with three sibling sections. Move the **existing** `metric-grid`, `insight-grid`, `chart-grid`, and `table-card` markup verbatim into `#view-coredata` for now — Tasks 9–13 will build real content for `#view-overview` and `#view-people` and trim duplicated pieces out of Core Data where the spec says so (the model/feature/language breakdown, IDE chart, LoC-by-person chart, and most-active-people chart stay in Core Data per the spec's "Core Data" section; the seat-terminology KPI cards and the current people table move to Overview/People and are removed from here in Task 9 and Task 12):

```html
      <section id="view-overview" class="view" role="tabpanel" aria-labelledby="tab-overview">
        <!-- Task 9, 10, 11 populate this -->
      </section>

      <section id="view-people" class="view" role="tabpanel" aria-labelledby="tab-people" hidden>
        <!-- Task 12, 13 populate this -->
      </section>

      <section id="view-coredata" class="view" role="tabpanel" aria-labelledby="tab-coredata" hidden>
        <section class="chart-grid">
          <article class="card wide"><div class="card-heading"><div><p class="eyebrow">DAILY PULSE</p><h3>Interactions and code generation</h3></div></div><canvas id="activityChart"></canvas></article>
          <article class="card wide"><div class="card-heading"><div><p class="eyebrow">MODEL CHOICE</p><h3>Daily routing — Auto versus named models</h3></div><span class="muted">model-attributed generation activity</span></div><canvas id="routingTrendChart"></canvas></article>
          <article class="card"><div class="card-heading"><div><p class="eyebrow">MODEL ROUTING</p><h3>Auto share by interaction mode</h3></div><span class="muted">% of generation</span></div><canvas id="modeRoutingChart"></canvas></article>
          <article class="card"><div class="card-heading"><div><p class="eyebrow">REPEAT USE</p><h3>How often people return</h3></div><span class="muted">active days</span></div><canvas id="repeatUseChart"></canvas></article>
          <article class="card"><div class="card-heading"><div><p class="eyebrow">BREAKDOWN</p><h3>Model, feature and language mix</h3></div><div class="dim-toggle" id="breakdownToggle"><button class="dim-btn active" data-dim="model">Model</button><button class="dim-btn" data-dim="feature">Feature</button><button class="dim-btn" data-dim="language">Language</button></div></div><div class="breakdown-scroll"><div id="breakdownInner"><canvas id="breakdownChart"></canvas></div></div></article>
          <article class="card"><div class="card-heading"><div><p class="eyebrow">ENVIRONMENTS</p><h3>IDE activity</h3></div></div><canvas id="ideChart"></canvas></article>
          <article class="card wide"><div class="card-heading"><div><p class="eyebrow">CODE CHANGES</p><h3>Agent-initiated vs user-initiated changes, by person <span class="info-tip" tabindex="0" title="Total lines added and deleted, attributed from GitHub's feature labels. Agent-initiated includes agent, edit, and custom modes; user-initiated includes code completion and non-agent chat actions.">ⓘ</span></h3></div><span class="muted" id="agentContributionNote"></span></div><canvas id="locChart"></canvas></article>
          <article class="card wide"><div class="card-heading"><div><p class="eyebrow">ADOPTION</p><h3>Most active people</h3></div><span class="muted">by interactions</span></div><canvas id="peopleChart"></canvas></article>
        </section>
      </section>
```

Note the `surfaceChart` card from the old `chart-grid` (`index.html:75`, `<article class="card"><div class="card-heading"><div><p class="eyebrow">PRODUCT SURFACES</p>...`) is **not** copied into Core Data — it moves to Overview as the surface funnel in Task 10.

- [ ] **Step 5: Add view-tab and view-visibility CSS**

Append to `styles.css`:

```css
.view-tabs{display:flex;gap:6px;margin-bottom:18px;border-bottom:1px solid var(--line)}
.view-tab{border:0;background:none;color:var(--muted);font:700 .85rem Manrope;padding:12px 16px;cursor:pointer;border-bottom:2px solid transparent}
.view-tab[aria-selected="true"]{color:var(--accent);border-bottom-color:var(--accent)}
.view-tab:hover{color:var(--ink)}
.view[hidden]{display:none}
@media(max-width:700px){.view-tabs{overflow-x:auto}}
```

- [ ] **Step 6: Verify the shell loads with no console errors**

Run a local static server (e.g. `python3 -m http.server 8000`) and open `http://localhost:8000`. Expected: upload panel renders; no JS runs yet to reveal the dashboard (Task 14 wires `script.js`'s replacement), so this is a visual/markup check only — confirm no HTML parse errors in DevTools console and that `#view-overview`, `#view-people`, `#view-coredata` all exist in the DOM inspector.

- [ ] **Step 7: Commit**

```bash
git add index.html styles.css
git commit -m "feat: restructure the page into an Overview/People/Core Data tab shell"
```

---

### Task 9: Overview — headline KPIs and adoption depth panel

**Files:**
- Create: `src/overview.js`
- Modify: `index.html` (`#view-overview`, from Task 8)
- Modify: `styles.css`

**Interfaces:**
- Consumes: `computePopulation`, `computeConsistency`, `buildPeopleIndex`, `PHASE_LABELS` from `src/metrics.js`.
- Produces: `renderOverviewHeadlines(container, {periodRows, peopleIndex, routing}): void` and `renderAdoptionDepth(container, peopleIndex): void`, both exported from `src/overview.js`. `src/app.js` (Task 14) calls these on every render.

- [ ] **Step 1: Add the KPI and adoption-depth markup to `#view-overview`**

Inside `<section id="view-overview" ...>` from Task 8, add:

```html
        <section class="metric-grid" id="headlineKpis">
          <article class="metric"><p>Active people</p><strong id="kpiActive">—</strong><span id="kpiActiveNote">of reported people</span></article>
          <article class="metric"><p>Agent-first</p><strong id="kpiAgentFirst">—</strong><span id="kpiAgentFirstNote">Phase 2–3</span></article>
          <article class="metric"><p>Sustained use</p><strong id="kpiSustained">—</strong><span id="kpiSustainedNote">6+ active days</span></article>
          <article class="metric"><p>Agent contribution</p><strong id="kpiAgentContribution">—</strong><span>of agent + user LoC</span></article>
          <article class="metric" id="kpiAutoCard"><p>Reported Auto in Agent</p><strong id="kpiAuto">—</strong><span>Agent workflows</span></article>
          <article class="metric"><p>No observed activity</p><strong id="kpiNoActivity">—</strong><span id="kpiNoActivityNote">of reported people</span></article>
        </section>

        <p class="positioning-line">GitHub tells you how Copilot is being used across your organisation. Copilot Signals shows you how adoption differs between your people.</p>

        <section class="card wide" id="adoptionDepthCard">
          <div class="card-heading"><div><p class="eyebrow">ADOPTION DEPTH</p><h3>Latest reported phase per person</h3></div></div>
          <div id="adoptionDepthBars" class="depth-bars"></div>
          <p id="adoptionDepthMovement" class="muted"></p>
        </section>
```

- [ ] **Step 2: Implement `renderOverviewHeadlines` in `src/overview.js`**

```js
import { PHASE_LABELS } from './metrics.js';

function setText(id, value) {
  document.querySelector('#' + id).textContent = value;
}

function pct(numerator, denominator) {
  return denominator ? `${Math.round((numerator / denominator) * 100)}%` : '—';
}

export function renderOverviewHeadlines({ population, peopleIndex, routing }) {
  setText('kpiActive', population.activeCount.toLocaleString());
  setText('kpiActiveNote', `${pct(population.activeCount, population.reportedCount)} of ${population.reportedCount.toLocaleString()} reported people`);

  let agentFirstCount = 0;
  let sustainedCount = 0;
  let agentLocTotal = 0;
  let userLocTotal = 0;
  peopleIndex.forEach((person) => {
    if (person.phase?.agentFirst) agentFirstCount += 1;
    if (person.active && person.consistency.tier === 'sustained') sustainedCount += 1;
    agentLocTotal += person.agentContribution.agentLoc;
    userLocTotal += person.agentContribution.userLoc;
  });
  setText('kpiAgentFirst', pct(agentFirstCount, population.reportedCount));
  setText('kpiAgentFirstNote', `${agentFirstCount.toLocaleString()} people, Phase 2–3`);
  setText('kpiSustained', pct(sustainedCount, population.activeCount));
  setText('kpiSustainedNote', `${sustainedCount.toLocaleString()} of ${population.activeCount.toLocaleString()} active people`);
  setText('kpiAgentContribution', pct(agentLocTotal, agentLocTotal + userLocTotal));
  setText('kpiNoActivity', population.noActivityCount.toLocaleString());
  setText('kpiNoActivityNote', `${pct(population.noActivityCount, population.reportedCount)} of reported people`);

  const autoCard = document.querySelector('#kpiAutoCard');
  if (routing.hasAutoBucket) {
    autoCard.hidden = false;
    setText('kpiAuto', routing.agentAutoShare === null ? 'Not reported' : `${Math.round(routing.agentAutoShare * 100)}%`);
  } else {
    setText('kpiAuto', 'Not reported');
  }
}

export function renderAdoptionDepth(peopleIndex) {
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
  let progressed = 0;
  let regressed = 0;
  let unchanged = 0;
  let total = 0;
  peopleIndex.forEach((person) => {
    if (!person.phase) return;
    total += 1;
    counts[person.phase.latest.phaseNumber] = (counts[person.phase.latest.phaseNumber] || 0) + 1;
    if (person.phase.movement === 'progressed') progressed += 1;
    else if (person.phase.movement === 'regressed') regressed += 1;
    else unchanged += 1;
  });
  const bars = document.querySelector('#adoptionDepthBars');
  bars.innerHTML = [0, 1, 2, 3].map((phaseNumber) => {
    const count = counts[phaseNumber] || 0;
    const percent = total ? Math.round((count / total) * 100) : 0;
    return `<div class="depth-row"><span class="depth-label">${PHASE_LABELS[phaseNumber]}</span><div class="depth-track"><div class="depth-fill" style="width:${percent}%"></div></div><span class="depth-percent">${percent}%</span></div>`;
  }).join('');
  document.querySelector('#adoptionDepthMovement').textContent = total
    ? `↑ ${progressed} progressed a phase · ↓ ${regressed} regressed a phase · ${unchanged} unchanged`
    : 'No phase data reported for this period.';
}
```

`population` here is `computePopulation(periodRows)` and `peopleIndex` is `buildPeopleIndex(periodRows)` — both computed once per render in `src/app.js` (Task 14) and passed down to avoid recomputing per panel.

- [ ] **Step 3: Add adoption-depth CSS**

Append to `styles.css`:

```css
.positioning-line{color:#b8c5d8;font-size:.92rem;line-height:1.5;margin:16px 0 20px;max-width:760px}
.depth-bars{display:flex;flex-direction:column;gap:10px;margin-top:12px}
.depth-row{display:grid;grid-template-columns:170px 1fr 46px;gap:10px;align-items:center;font-size:.82rem}
.depth-label{color:var(--muted)}
.depth-track{height:10px;background:#0c1524;border-radius:6px;overflow:hidden}
.depth-fill{height:100%;background:var(--accent)}
.depth-percent{text-align:right;color:var(--ink)}
@media(max-width:700px){.depth-row{grid-template-columns:1fr;gap:4px}.depth-track{height:8px}}
```

- [ ] **Step 4: Manual verification**

This module has no DOM available in `node --test`, so verify by wiring a temporary call from the browser console once Task 14 lands ingestion — defer full verification to Task 14 Step 6. For now, confirm `node --check src/overview.js` reports no syntax errors:

Run: `node --check src/overview.js`
Expected: no output (exit code 0).

- [ ] **Step 5: Commit**

```bash
git add src/overview.js index.html styles.css
git commit -m "feat: add Overview headline KPIs and adoption depth panel"
```

---

### Task 10: Overview — agent contribution distribution and surface funnel

**Files:**
- Modify: `src/overview.js`
- Modify: `index.html` (`#view-overview`)
- Modify: `styles.css`

**Interfaces:**
- Consumes: `bucketAgentShare` from `src/metrics.js`; `peopleIndex` from Task 9.
- Produces: `renderAgentContributionDistribution(peopleIndex, onViewPeople): void`, `renderSurfaceFunnel(peopleIndex, activeCount, onSurfaceClick): void`. `onViewPeople` / `onSurfaceClick` are callbacks Task 14 wires to switch to the People view with a filter applied.

- [ ] **Step 1: Add markup after the adoption-depth card in `#view-overview`**

```html
        <section class="card wide" id="agentDistributionCard">
          <div class="card-heading"><div><p class="eyebrow">AGENT-FIRST DEVELOPMENT</p><h3>Overall agent contribution: <span id="agentDistributionOverall">—</span></h3></div></div>
          <div id="agentDistributionBars" class="depth-bars"></div>
          <button class="text-button" id="viewPeopleFromAgent">View people →</button>
        </section>

        <section class="card wide" id="surfaceFunnelCard">
          <div class="card-heading"><div><p class="eyebrow">COPILOT SURFACE ADOPTION</p><h3>People using each surface</h3></div><span class="muted">of active people</span></div>
          <div id="surfaceFunnelBars" class="depth-bars"></div>
        </section>
```

- [ ] **Step 2: Implement in `src/overview.js`**

```js
import { bucketAgentShare } from './metrics.js';

const AGENT_SHARE_BUCKETS = ['0-20', '20-40', '40-60', '60-80', '80-100'];

export function renderAgentContributionDistribution(peopleIndex, onViewPeople) {
  let agentLocTotal = 0;
  let userLocTotal = 0;
  const counts = Object.fromEntries(AGENT_SHARE_BUCKETS.map((bucket) => [bucket, 0]));
  peopleIndex.forEach((person) => {
    agentLocTotal += person.agentContribution.agentLoc;
    userLocTotal += person.agentContribution.userLoc;
    const bucket = bucketAgentShare(person.agentContribution.share);
    if (bucket) counts[bucket] += 1;
  });
  document.querySelector('#agentDistributionOverall').textContent =
    agentLocTotal + userLocTotal ? `${Math.round((agentLocTotal / (agentLocTotal + userLocTotal)) * 100)}%` : '—';
  const maxCount = Math.max(1, ...Object.values(counts));
  document.querySelector('#agentDistributionBars').innerHTML = AGENT_SHARE_BUCKETS.map((bucket) => {
    const count = counts[bucket];
    const percent = Math.round((count / maxCount) * 100);
    return `<div class="depth-row"><span class="depth-label">${bucket}% agent</span><div class="depth-track"><div class="depth-fill" style="width:${percent}%"></div></div><span class="depth-percent">${count}</span></div>`;
  }).join('');
  document.querySelector('#viewPeopleFromAgent').onclick = () => onViewPeople();
}

const SURFACE_ORDER = [
  ['completion', 'Code completion'],
  ['chat', 'Chat'],
  ['agent', 'Agent'],
  ['cli', 'CLI'],
  ['cloudCodingAgent', 'Cloud/Coding Agent'],
  ['copilotApp', 'Copilot App']
];

export function renderSurfaceFunnel(peopleIndex, activeCount, onSurfaceClick) {
  const counts = Object.fromEntries(SURFACE_ORDER.map(([key]) => [key, 0]));
  peopleIndex.forEach((person) => {
    SURFACE_ORDER.forEach(([key]) => { if (person.surfaces[key]) counts[key] += 1; });
  });
  const maxCount = Math.max(1, ...Object.values(counts));
  document.querySelector('#surfaceFunnelBars').innerHTML = SURFACE_ORDER.map(([key, label]) => {
    const count = counts[key];
    const percent = Math.round((count / maxCount) * 100);
    const ofActive = activeCount ? `${Math.round((count / activeCount) * 100)}% of active` : '—';
    return `<div class="depth-row"><button class="depth-label depth-label-button" data-surface="${key}">${label}</button><div class="depth-track"><div class="depth-fill" style="width:${percent}%"></div></div><span class="depth-percent">${count.toLocaleString()} · ${ofActive}</span></div>`;
  }).join('');
  document.querySelector('#surfaceFunnelBars').querySelectorAll('[data-surface]').forEach((button) => {
    button.addEventListener('click', () => onSurfaceClick(button.dataset.surface));
  });
}
```

- [ ] **Step 3: Add clickable-label CSS**

Append to `styles.css`:

```css
.depth-label-button{background:none;border:0;color:var(--muted);font:inherit;padding:0;cursor:pointer;text-align:left}
.depth-label-button:hover{color:var(--accent);text-decoration:underline}
```

- [ ] **Step 4: Verify syntax**

Run: `node --check src/overview.js`
Expected: no output (exit code 0).

- [ ] **Step 5: Commit**

```bash
git add src/overview.js index.html styles.css
git commit -m "feat: add agent-contribution distribution and surface funnel panels"
```

---

### Task 11: Overview — model routing and enablement opportunities

**Files:**
- Modify: `src/overview.js`
- Modify: `index.html` (`#view-overview`)
- Modify: `styles.css`

**Interfaces:**
- Consumes: `routing` (from `computeModelRouting`), `opportunities` (from `classifyEnablementOpportunities`).
- Produces: `renderModelRoutingPanel(routing): void`, `renderEnablementOpportunities(opportunities, onOpportunityClick): void`.

- [ ] **Step 1: Add markup**

```html
        <section class="card wide" id="modelRoutingCard" hidden>
          <div class="card-heading"><div><p class="eyebrow">MODEL ROUTING</p><h3>Reported Auto versus named models</h3></div><span class="muted">GitHub may resolve Auto to the selected model; this reflects only what the export reports as <code>auto</code>.</span></div>
          <div id="modelRoutingBars" class="depth-bars"></div>
        </section>

        <section class="card wide opportunity-grid" id="enablementCard">
          <div>
            <p class="eyebrow">ENABLEMENT OPPORTUNITIES</p>
            <h4>Who might need a nudge</h4>
            <ul class="opportunity-list" id="enablementList"></ul>
          </div>
          <div>
            <h4>What each one means</h4>
            <p class="muted" id="enablementExplainer">Click a row to open the matching people in the People view.</p>
          </div>
        </section>
```

- [ ] **Step 2: Implement in `src/overview.js`**

```js
export function renderModelRoutingPanel(routing) {
  const card = document.querySelector('#modelRoutingCard');
  card.hidden = !routing.hasAutoBucket;
  if (!routing.hasAutoBucket) return;
  const modes = [
    ['Agent', routing.overall.agent, routing.agentAutoShare],
    ['Ask', routing.overall.ask, routing.askAutoShare]
  ];
  document.querySelector('#modelRoutingBars').innerHTML = modes.map(([label, bucket, share]) => {
    const percent = share === null ? 0 : Math.round(share * 100);
    const shareText = share === null ? 'Not reported' : `Auto ${percent}% · Named ${100 - percent}%`;
    return `<div class="depth-row"><span class="depth-label">${label}</span><div class="depth-track"><div class="depth-fill" style="width:${percent}%"></div></div><span class="depth-percent">${shareText}</span></div>`;
  }).join('');
}

const OPPORTUNITY_LABELS = {
  completionOnly: 'Completion-only',
  chatNotAgent: 'Chat → haven’t tried Agent',
  triedAgentNotSustained: 'Tried Agent, not sustained',
  noObservedActivity: 'No observed activity',
  lowAutoInAgent: 'Low reported Auto in Agent',
  highGenLowAcceptance: 'High generation, low acceptance'
};

export function renderEnablementOpportunities(opportunities, onOpportunityClick) {
  const list = document.querySelector('#enablementList');
  list.innerHTML = Object.entries(OPPORTUNITY_LABELS)
    .filter(([key]) => opportunities[key] !== null)
    .map(([key, label]) => {
      const count = opportunities[key].length;
      return `<li><button class="depth-label-button" data-opportunity="${key}">${label}</button><span>${count.toLocaleString()} people</span></li>`;
    }).join('');
  list.querySelectorAll('[data-opportunity]').forEach((button) => {
    button.addEventListener('click', () => onOpportunityClick(button.dataset.opportunity));
  });
}
```

- [ ] **Step 3: Verify syntax**

Run: `node --check src/overview.js`
Expected: no output (exit code 0).

- [ ] **Step 4: Commit**

```bash
git add src/overview.js index.html
git commit -m "feat: add model routing panel and enablement opportunities to Overview"
```

---

### Task 12: People — table with new columns and filters

**Files:**
- Create: `src/people.js`
- Modify: `index.html` (`#view-people`)
- Modify: `styles.css`

**Interfaces:**
- Consumes: `PHASE_LABELS` from `src/metrics.js`; `peopleIndex` from Task 6.
- Produces: `renderPeopleTable(container, peopleIndex, {sort, search, activeFilters}): void`, `applyPeopleFilters(peopleIndex, {search, activeFilters}): Map<string, PersonRecord>`. `src/app.js` (Task 14) owns the filter/sort state and calls these on change; `src/overview.js`'s click-through callbacks (Task 10, 11) set `activeFilters` before switching views.

- [ ] **Step 1: Add markup to `#view-people`**

```html
        <section class="table-card">
          <div class="card-heading">
            <div><p class="eyebrow">PEOPLE</p><h3>People in the selected period</h3></div>
            <div class="table-actions">
              <div class="dim-toggle" id="peopleFilterToggle">
                <button class="dim-btn active" data-filter="all">All</button>
                <button class="dim-btn" data-filter="phase0">Phase 0</button>
                <button class="dim-btn" data-filter="phase1">Phase 1</button>
                <button class="dim-btn" data-filter="phase2">Phase 2</button>
                <button class="dim-btn" data-filter="phase3">Phase 3</button>
                <button class="dim-btn" data-filter="completionOnly">Completion-only</button>
                <button class="dim-btn" data-filter="agent">Agent</button>
                <button class="dim-btn" data-filter="cli">CLI</button>
                <button class="dim-btn" data-filter="cloudCodingAgent">Cloud/Coding Agent</button>
                <button class="dim-btn" data-filter="autoAbove75">Auto &gt; 75%</button>
                <button class="dim-btn" data-filter="noActivity">No observed activity</button>
                <button class="dim-btn" data-filter="sustained">Sustained</button>
              </div>
              <input id="peopleSearch" type="search" placeholder="Search people">
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th class="sortable" data-sort="name">Person <span class="sort-indicator">↕</span></th>
                <th class="sortable" data-sort="phase">Phase <span class="sort-indicator">↕</span></th>
                <th class="sortable" data-sort="consistency">Consistency <span class="sort-indicator">↕</span></th>
                <th class="sortable" data-sort="agentShare">Agent share <span class="sort-indicator">↕</span></th>
                <th class="sortable" data-sort="autoShare">Reported Auto share <span class="sort-indicator">↕</span></th>
                <th>Surfaces</th>
                <th class="sortable" data-sort="acceptance">Completion acceptance <span class="sort-indicator">↕</span></th>
                <th class="sortable" data-sort="credits">AI credits <span class="sort-indicator">↕</span></th>
                <th class="sortable" data-sort="lastActive">Last active <span class="sort-indicator">↕</span></th>
              </tr></thead>
              <tbody id="peopleTableBody"></tbody>
            </table>
          </div>
        </section>
        <div id="personDrawer"></div>
```

- [ ] **Step 2: Implement filtering and rendering in `src/people.js`**

```js
import { PHASE_LABELS } from './metrics.js';

const FILTER_PREDICATES = {
  all: () => true,
  phase0: (p) => p.phase?.latest.phaseNumber === 0,
  phase1: (p) => p.phase?.latest.phaseNumber === 1,
  phase2: (p) => p.phase?.latest.phaseNumber === 2,
  phase3: (p) => p.phase?.latest.phaseNumber === 3,
  completionOnly: (p) => p.surfaces.completion && !p.surfaces.chat && !p.surfaces.agent && !p.surfaces.cli && !p.surfaces.cloudCodingAgent && !p.surfaces.copilotApp,
  agent: (p) => p.surfaces.agent,
  cli: (p) => p.surfaces.cli,
  cloudCodingAgent: (p) => p.surfaces.cloudCodingAgent,
  autoAbove75: (p) => p.autoShare !== null && p.autoShare > 0.75,
  noActivity: (p) => !p.active,
  sustained: (p) => p.consistency.tier === 'sustained'
};

export function applyPeopleFilters(peopleIndex, { search = '', activeFilter = 'all', opportunityUsers = null }) {
  const predicate = FILTER_PREDICATES[activeFilter] || FILTER_PREDICATES.all;
  const query = search.trim().toLowerCase();
  const result = new Map();
  peopleIndex.forEach((person, user) => {
    if (opportunityUsers && !opportunityUsers.includes(user)) return;
    if (query && !user.toLowerCase().includes(query)) return;
    if (!predicate(person)) return;
    result.set(user, person);
  });
  return result;
}

function formatPercent(value) {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function surfaceBadges(surfaces) {
  const labels = { completion: 'Completion', chat: 'Chat', agent: 'Agent', cli: 'CLI', cloudCodingAgent: 'Cloud/Coding Agent', copilotApp: 'Copilot App' };
  return Object.entries(labels)
    .filter(([key]) => surfaces[key])
    .map(([, label]) => `<span class="badge on">${label}</span>`)
    .join(' ') || '<span class="badge">None</span>';
}

export function renderPeopleTable(filteredIndex, sort, onRowClick) {
  const rows = [...filteredIndex.entries()].sort((a, b) => sortComparator(a, b, sort));
  document.querySelector('#peopleTableBody').innerHTML = rows.map(([user, person]) => `
    <tr data-user="${user}">
      <td>${user}</td>
      <td>${person.phase ? PHASE_LABELS[person.phase.latest.phaseNumber] : '—'}</td>
      <td>${person.consistency.tier || '—'}</td>
      <td>${formatPercent(person.agentContribution.share)}</td>
      <td>${formatPercent(person.autoShare)}</td>
      <td>${surfaceBadges(person.surfaces)}</td>
      <td>${formatPercent(person.acceptance.rate)}</td>
      <td>${Math.round(person.credits).toLocaleString()}</td>
      <td>${person.lastActive || 'Never'}</td>
    </tr>
  `).join('') || '<tr><td colspan="9">No people match the current filters.</td></tr>';
  document.querySelectorAll('#peopleTableBody tr[data-user]').forEach((row) => {
    row.addEventListener('click', () => onRowClick(row.dataset.user));
  });
}

const SORT_KEYS = {
  name: (person, user) => user,
  phase: (person) => person.phase?.latest.phaseNumber ?? -1,
  consistency: (person) => person.consistency.activeDays,
  agentShare: (person) => person.agentContribution.share ?? -1,
  autoShare: (person) => person.autoShare ?? -1,
  acceptance: (person) => person.acceptance.rate ?? -1,
  credits: (person) => person.credits,
  lastActive: (person) => person.lastActive || ''
};

function sortComparator([userA, personA], [userB, personB], { key, direction }) {
  const getValue = SORT_KEYS[key] || SORT_KEYS.name;
  const a = getValue(personA, userA);
  const b = getValue(personB, userB);
  const result = a < b ? -1 : a > b ? 1 : 0;
  return direction === 'asc' ? result : -result;
}
```

- [ ] **Step 3: Add badge/table CSS reuse**

The existing `.badge`, `.badge.on`, `.table-actions`, `.sortable` rules at `styles.css:2-3` already cover this table. No new CSS is required for Step 1–2 beyond what Task 8 already added.

- [ ] **Step 4: Verify syntax**

Run: `node --check src/people.js`
Expected: no output (exit code 0).

- [ ] **Step 5: Commit**

```bash
git add src/people.js index.html
git commit -m "feat: add People table with phase, consistency and share columns"
```

---

### Task 13: People — person detail drawer

**Files:**
- Modify: `src/people.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `PHASE_LABELS`; a single `PersonRecord` plus that person's `routing.byUserModel` entry (passed in by `src/app.js`).
- Produces: `openPersonDrawer(user, person, modelBreakdown): void`, `closePersonDrawer(): void`, both exported from `src/people.js`.

- [ ] **Step 1: Implement the drawer in `src/people.js`**

```js
let lastFocusedElement = null;

export function openPersonDrawer(user, person, modelBreakdown) {
  lastFocusedElement = document.activeElement;
  const total = [...modelBreakdown.values()].reduce((sum, value) => sum + value, 0);
  const modelRows = [...modelBreakdown.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([model, count]) => {
      const percent = total ? Math.round((count / total) * 100) : 0;
      return `<li>${model === 'auto' ? 'Auto' : model} <span>${percent}%</span></li>`;
    }).join('') || '<li>No model-attributed generation</li>';

  const host = document.querySelector('#personDrawer');
  host.innerHTML = `
    <div class="drawer-backdrop" id="drawerBackdrop"></div>
    <div class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle" id="drawerPanel">
      <button class="text-button drawer-close" id="drawerClose" aria-label="Close person detail">✕</button>
      <h3 id="drawerTitle">${user}</h3>
      <p class="muted">${person.phase ? PHASE_LABELS[person.phase.latest.phaseNumber] : 'No phase reported'}</p>
      <dl class="drawer-facts">
        <div><dt>Active days</dt><dd>${person.consistency.activeDays}</dd></div>
        <div><dt>Agent contribution</dt><dd>${person.agentContribution.share === null ? '—' : Math.round(person.agentContribution.share * 100) + '%'}</dd></div>
        <div><dt>Reported Auto share</dt><dd>${person.autoShare === null ? 'Not reported' : Math.round(person.autoShare * 100) + '%'}</dd></div>
        <div><dt>Completion acceptance</dt><dd>${person.acceptance.rate === null ? '—' : Math.round(person.acceptance.rate * 100) + '%'}</dd></div>
        <div><dt>AI credits</dt><dd>${Math.round(person.credits).toLocaleString()}</dd></div>
        <div><dt>Last active</dt><dd>${person.lastActive || 'Never'}</dd></div>
      </dl>
      <h4>Surfaces</h4>
      <ul class="drawer-surfaces">
        ${['completion', 'chat', 'agent', 'cli', 'cloudCodingAgent', 'copilotApp'].map((key) =>
          `<li>${person.surfaces[key] ? '✓' : '○'} ${key}</li>`).join('')}
      </ul>
      <h4>Models</h4>
      <ul class="drawer-models">${modelRows}</ul>
    </div>
  `;
  host.hidden = false;
  document.querySelector('#drawerBackdrop').addEventListener('click', closePersonDrawer);
  document.querySelector('#drawerClose').addEventListener('click', closePersonDrawer);
  document.addEventListener('keydown', handleDrawerKeydown);
  document.querySelector('#drawerClose').focus();
}

function handleDrawerKeydown(event) {
  if (event.key === 'Escape') {
    closePersonDrawer();
    return;
  }
  if (event.key !== 'Tab') return;
  const panel = document.querySelector('#drawerPanel');
  if (!panel) return;
  const focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function closePersonDrawer() {
  const host = document.querySelector('#personDrawer');
  host.innerHTML = '';
  host.hidden = true;
  document.removeEventListener('keydown', handleDrawerKeydown);
  lastFocusedElement?.focus();
}
```

- [ ] **Step 2: Add drawer CSS**

Append to `styles.css`:

```css
#personDrawer[hidden]{display:none}
.drawer-backdrop{position:fixed;inset:0;background:#04070ccc}
.drawer{position:fixed;top:0;right:0;bottom:0;width:min(420px,100vw);background:#0f192a;border-left:1px solid var(--line);padding:26px;overflow-y:auto;box-shadow:-30px 0 60px #0006}
.drawer-close{position:absolute;top:18px;right:18px}
.drawer-facts{display:grid;gap:10px;margin:18px 0}
.drawer-facts div{display:flex;justify-content:space-between;font-size:.85rem;border-bottom:1px solid #263550;padding-bottom:8px}
.drawer-facts dt{color:var(--muted)}
.drawer-surfaces,.drawer-models{list-style:none;padding:0;margin:8px 0 18px;display:grid;gap:6px;font-size:.85rem}
.drawer-models li{display:flex;justify-content:space-between}
@media(max-width:700px){.drawer{width:100vw}}
```

- [ ] **Step 3: Verify syntax**

Run: `node --check src/people.js`
Expected: no output (exit code 0).

- [ ] **Step 4: Commit**

```bash
git add src/people.js styles.css
git commit -m "feat: add accessible person detail drawer"
```

---

### Task 14: App bootstrap — ingestion, global filters, view switching, Core Data

**Files:**
- Create: `src/coredata.js` (adapted from the current `script.js:24-50`)
- Create: `src/app.js`
- Modify: `index.html:87` (`<script src="script.js"></script>` → `<script type="module" src="src/app.js"></script>`)
- Delete: `script.js`

**Interfaces:**
- Consumes: every export from `src/metrics.js`, `src/parse.js`, `src/overview.js`, `src/people.js`.
- Produces: the running application. Nothing downstream depends on this task's exports — it is the composition root.

- [ ] **Step 1: Port the existing chart-rendering logic into `src/coredata.js`**

Copy the chart-rendering methods from the current `script.js` (`chart()`, `options()`, `breakdown()`, `topN()`, `top()`, `label()`, `format()`, `sizeBreakdown()`, and the per-view render calls for `activityChart`, `routingTrendChart`, `modeRoutingChart`, `repeatUseChart`, `breakdownChart`, `ideChart`, `locChart`, `peopleChart`) into a single exported function so `src/app.js` can call it per render:

```js
let charts = {};

export function renderCoreData(periodRows, allRows, { breakdownDim, selectedModel }) {
  // Body: the exact logic currently in script.js:28-42 (byDay accumulation, features/routing
  // breakdown are Overview-only now and are dropped here — Overview Task 9-11 already covers
  // adoption/routing signals via peopleIndex/routing) plus the chart() calls for
  // activityChart, routingTrendChart, modeRoutingChart, repeatUseChart, breakdownChart, ideChart,
  // locChart and peopleChart from script.js:32-42.
  // Reuse chart(), options(), breakdown(), topN(), top(), label(), format(), sizeBreakdown()
  // verbatim from script.js:47-50, converted to local functions in this module and operating on
  // the local `charts` object instead of `this.charts`.
}
```

Do the mechanical port now: copy each of the eight helper methods from `script.js` (current `script.js:47-50` for `chart`/`options`/`top`/`topN`/`label`/`format`/`sizeBreakdown`, `script.js:23` for `breakdown`) as standalone functions in `src/coredata.js`, changing every `this.` reference to a local variable or function call, and changing `this.charts[id]` to the module-level `charts` object. The `surfaceChart` and the old people table (`renderTable`, `sortTable`) are **not** ported — those moved to `src/overview.js` (Task 10) and `src/people.js` (Task 12).

- [ ] **Step 2: Write `src/app.js`**

```js
import { parseRecords } from './parse.js';
import {
  userLogin, computePopulation, buildPeopleIndex, computeModelRouting, classifyEnablementOpportunities
} from './metrics.js';
import { renderOverviewHeadlines, renderAdoptionDepth, renderAgentContributionDistribution, renderSurfaceFunnel, renderModelRoutingPanel, renderEnablementOpportunities } from './overview.js';
import { applyPeopleFilters, renderPeopleTable, openPersonDrawer, closePersonDrawer } from './people.js';
import { renderCoreData } from './coredata.js';

class CopilotSignals {
  constructor() {
    this.rows = [];
    this.currentView = 'overview';
    this.tableSort = { key: 'name', direction: 'asc' };
    this.peopleFilter = { search: '', activeFilter: 'all', opportunityUsers: null };
    this.breakdownDim = 'model';
    this.bind();
  }

  bind() {
    document.querySelector('#fileInput').addEventListener('change', (e) => this.loadFiles([...e.target.files]));
    document.querySelector('#loadSample').addEventListener('click', () => this.loadSample());
    ['dateFilter', 'userFilter', 'modelFilter'].forEach((id) =>
      document.querySelector('#' + id).addEventListener('change', () => this.render()));
    document.querySelector('#resetFilters').addEventListener('click', () => this.resetFilters());
    document.querySelectorAll('.view-tab').forEach((tab) =>
      tab.addEventListener('click', () => this.switchView(tab.dataset.view)));
    document.querySelector('#peopleSearch').addEventListener('input', (e) => {
      this.peopleFilter.search = e.target.value;
      this.renderPeople();
    });
    document.querySelectorAll('#peopleFilterToggle .dim-btn').forEach((button) =>
      button.addEventListener('click', () => {
        this.peopleFilter.activeFilter = button.dataset.filter;
        this.peopleFilter.opportunityUsers = null;
        document.querySelectorAll('#peopleFilterToggle .dim-btn').forEach((b) => b.classList.toggle('active', b === button));
        this.renderPeople();
      }));
  }

  async loadSample() {
    try {
      const response = await fetch('./data_example.json');
      if (!response.ok) throw new Error('sample fetch failed');
      this.ingest(parseRecords(await response.text()));
    } catch {
      this.toast('Could not load the included sample. Try serving this folder locally.');
    }
  }

  async loadFiles(files) {
    try {
      const texts = await Promise.all(files.map((file) => file.text()));
      this.ingest(texts.flatMap((text) => parseRecords(text)));
    } catch (error) {
      console.error(error);
      this.toast('That file could not be read as a Copilot export.');
    }
  }

  ingest(rows) {
    this.rows = rows.filter((row) => row && row.day && userLogin(row));
    if (!this.rows.length) throw new Error('No records');
    this.populateFilters();
    document.querySelector('#uploadPanel').hidden = true;
    document.querySelector('#dashboard').hidden = false;
    document.querySelector('#viewTabs').hidden = false;
    this.render();
    this.toast(`${this.rows.length.toLocaleString()} daily records loaded`);
  }

  populateFilters() {
    const users = new Set(this.rows.map(userLogin));
    const models = new Set(this.rows.flatMap((r) => (r.totals_by_model_feature || []).map((m) => m.model)).filter(Boolean));
    this.populateSelect('userFilter', users, 'Everyone');
    this.populateSelect('modelFilter', models, 'All models');
  }

  populateSelect(id, values, label) {
    const select = document.querySelector('#' + id);
    const previous = select.value;
    select.innerHTML = `<option value="all">${label}</option>` +
      [...values].sort().map((v) => `<option value="${v}">${v}</option>`).join('');
    select.value = [...select.options].some((o) => o.value === previous) ? previous : 'all';
  }

  periodRows() {
    const maxDay = this.rows.reduce((max, r) => (max > r.day ? max : r.day), '');
    const days = +document.querySelector('#dateFilter').value || 0;
    const since = days ? new Date(new Date(maxDay + 'T00:00:00Z').getTime() - (days - 1) * 864e5).toISOString().slice(0, 10) : '';
    const user = document.querySelector('#userFilter').value;
    return this.rows.filter((r) => (!since || r.day >= since) && (user === 'all' || userLogin(r) === user));
  }

  switchView(view) {
    this.currentView = view;
    document.querySelectorAll('.view-tab').forEach((tab) => {
      const selected = tab.dataset.view === view;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll('.view').forEach((section) => {
      section.hidden = section.id !== `view-${view}`;
    });
  }

  goToPeopleWithFilter(activeFilter) {
    this.peopleFilter = { search: '', activeFilter, opportunityUsers: null };
    this.switchView('people');
    this.renderPeople();
  }

  goToPeopleWithOpportunity(opportunityKey) {
    this.peopleFilter = { search: '', activeFilter: 'all', opportunityUsers: this.lastOpportunities[opportunityKey] };
    this.switchView('people');
    this.renderPeople();
  }

  resetFilters() {
    document.querySelector('#dateFilter').value = '28';
    document.querySelector('#userFilter').value = 'all';
    document.querySelector('#modelFilter').value = 'all';
    this.peopleFilter = { search: '', activeFilter: 'all', opportunityUsers: null };
    document.querySelector('#peopleSearch').value = '';
    this.render();
  }

  render() {
    const rows = this.periodRows();
    const population = computePopulation(rows);
    this.peopleIndex = buildPeopleIndex(rows);
    this.routing = computeModelRouting(rows);
    this.lastOpportunities = classifyEnablementOpportunities(this.peopleIndex, this.routing);

    renderOverviewHeadlines({ population, peopleIndex: this.peopleIndex, routing: this.routing });
    renderAdoptionDepth(this.peopleIndex);
    renderAgentContributionDistribution(this.peopleIndex, () => this.goToPeopleWithFilter('all'));
    renderSurfaceFunnel(this.peopleIndex, population.activeCount, (surfaceKey) => this.goToPeopleWithFilter(surfaceKey));
    renderModelRoutingPanel(this.routing);
    renderEnablementOpportunities(this.lastOpportunities, (key) => this.goToPeopleWithOpportunity(key));

    this.renderPeople();
    renderCoreData(rows, this.rows, { breakdownDim: this.breakdownDim, selectedModel: document.querySelector('#modelFilter').value });
  }

  renderPeople() {
    const filtered = applyPeopleFilters(this.peopleIndex, this.peopleFilter);
    renderPeopleTable(filtered, this.tableSort, (user) => {
      closePersonDrawer();
      openPersonDrawer(user, this.peopleIndex.get(user), this.routing.byUserModel.get(user) || new Map());
    });
  }

  toast(message) {
    const toastEl = document.querySelector('#toast');
    toastEl.textContent = message;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 3500);
  }
}

document.addEventListener('DOMContentLoaded', () => new CopilotSignals());
```

- [ ] **Step 3: Update `index.html` and delete `script.js`**

In `index.html:87`, replace:
```html
  <script src="script.js"></script>
```
with:
```html
  <script type="module" src="src/app.js"></script>
```

```bash
git rm script.js
```

- [ ] **Step 4: Set the default period filter to 28 days**

In `index.html`, the `#dateFilter` currently defaults to `all`. Per the spec's Reset behavior ("Reset restores the selected period to 28 days"), set the default selection too — find the `<option value="28">Last 28 days</option>` inside `#dateFilter` and add `selected` to it, removing `selected`/default from `Entire export` if present.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS, all engine tests from Tasks 1–7 still green (this task doesn't touch `src/metrics.js` or `src/parse.js`).

- [ ] **Step 6: Manual smoke test**

Run a local static server (`python3 -m http.server 8000`) and open `http://localhost:8000`. Click "Explore included sample." Expected:
- The view tab bar appears with Overview selected.
- Headline KPIs populate with non-`—` values.
- Adoption depth, agent-contribution distribution and surface funnel bars render.
- Clicking a surface-funnel label or an enablement-opportunity row switches to the People tab with a filtered table.
- Clicking a person row opens the drawer; Escape closes it and returns focus to the row.
- Switching to the Core Data tab shows the original eight charts still rendering.
- No console errors.

- [ ] **Step 7: Commit**

```bash
git add index.html src/app.js src/coredata.js
git commit -m "feat: wire ingestion, global filters and view switching; retire script.js"
```

---

### Task 15: README rewrite

**Files:**
- Modify: `README.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Rewrite `README.md`**

Replace the full file content with:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for GitHub Copilot Signals V2 positioning"
```

---

### Task 16: Final acceptance-criteria verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the automated suite**

Run: `npm test`
Expected: PASS — every test from Tasks 1–7 green, zero failures.

- [ ] **Step 2: Verify phase totals equal reported people with a latest phase**

Run:
```bash
node -e "
import('./src/parse.js').then(async ({ parseRecords }) => {
  const { computeAdoptionPhase, computePopulation } = await import('./src/metrics.js');
  const fs = await import('node:fs');
  const rows = parseRecords(fs.readFileSync('data_example.json', 'utf8'));
  const phases = computeAdoptionPhase(rows);
  const population = computePopulation(rows);
  console.log('people with a phase:', phases.size, '<= reported:', population.reportedCount);
});
"
```
Expected: `people with a phase` is a number less than or equal to `reported`.

- [ ] **Step 3: Walk the manual checklist against the running app**

With the local static server still running and the sample loaded, confirm each acceptance criterion from the spec:
- Overview answers all four product questions (who's adopting, how, agent-first, model consumption) without scrolling into Core Data.
- Core Data's eight charts are all present and rendering.
- Cloud/Coding Agent appears exactly once in the surface funnel and in the People filter toggle — grep to confirm no duplicate:
  ```bash
  grep -c "Cloud/Coding Agent" index.html
  ```
  Expected: matches only the People filter button and the surface funnel label source (`SURFACE_ORDER` in `src/overview.js`), not two separate surfaces.
- Every enablement-opportunity row, clicked, produces a non-empty or correctly-empty People result set consistent with its count.
- No UI text contains "seat" — confirm:
  ```bash
  grep -in "seat" index.html src/*.js
  ```
  Expected: no matches.
- Loading the sample with a period filter of "Entire export" and toggling to a model with no `auto` entries shows "Not reported" on the Auto KPI and hides the model-routing panel content, not "0%".

- [ ] **Step 4: Confirm GitHub Pages compatibility**

Run: `node --check src/app.js src/metrics.js src/parse.js src/overview.js src/people.js src/coredata.js`
Expected: no output (exit code 0) — confirms no syntax requires a build step, and every module is a valid standalone ES module servable as a static file.

This task produces no commit — it's a verification gate. If any check fails, return to the relevant task, fix it there, and re-run this task.
