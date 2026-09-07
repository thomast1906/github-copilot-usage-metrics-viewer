import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasObservedActivity, computePopulation, computeConsistency,
  computeAdoptionPhase, PHASE_LABELS,
  computeAgentContribution, bucketAgentShare,
  computeSurfaces, computeCompletionAcceptance,
  computeModelRouting,
  buildPeopleIndex, classifyEnablementOpportunities
} from '../src/metrics.js';

function featureRow(user, features) {
  return { user_login: user, day: '2026-06-01', totals_by_feature: features };
}

function modelFeatureRow(user, entries) {
  return { user_login: user, day: '2026-06-01', totals_by_model_feature: entries };
}

// Task 1: observed activity, population, consistency

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

test('hasObservedActivity is true for an active or passive code-review flag', () => {
  assert.equal(hasObservedActivity({ used_copilot_code_review_active: true }), true);
  assert.equal(hasObservedActivity({ used_copilot_code_review_passive: true }), true);
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

// Task 2: adoption phase

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

// Task 3: agent contribution

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

// Task 4: product surfaces and completion acceptance

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

// Task 5: model routing

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

// Task 6: people index and enablement opportunities

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
