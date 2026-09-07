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
  if (row.used_copilot_code_review_active || row.used_copilot_code_review_passive) return true;
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
  const share = (bucket) => (hasAutoBucket && bucket.auto + bucket.named > 0 ? bucket.auto / (bucket.auto + bucket.named) : null);
  return {
    hasAutoBucket,
    overall,
    byUserModel,
    byUserAgentMode,
    agentAutoShare: share(overall.agent),
    askAutoShare: share(overall.ask)
  };
}

// Enablement-opportunity thresholds. These are uncalibrated defaults carried
// over from the spec, not tuned values — adjust here once the app has run
// against a real organisation's export.
const LOW_AUTO_AGENT_GENERATION_FLOOR = 5;
const LOW_AUTO_SHARE_CEILING = 0.25;
const HIGH_GEN_SHOWN_FLOOR = 20;
const LOW_ACCEPTANCE_CEILING = 0.15;
const NOT_SUSTAINED_MIN_DAYS = 1;
const NOT_SUSTAINED_MAX_DAYS = 5;

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
    if (s.agent && person.consistency.activeDays >= NOT_SUSTAINED_MIN_DAYS && person.consistency.activeDays <= NOT_SUSTAINED_MAX_DAYS) {
      opportunities.triedAgentNotSustained.push(user);
    }
    if (!person.active) opportunities.noObservedActivity.push(user);
    if (routing.hasAutoBucket) {
      const agentModeTotals = routing.byUserAgentMode.get(user);
      const agentGenerations = agentModeTotals ? agentModeTotals.auto + agentModeTotals.named : 0;
      const agentAutoShare = agentGenerations > 0 ? agentModeTotals.auto / agentGenerations : null;
      if (agentGenerations >= LOW_AUTO_AGENT_GENERATION_FLOOR && agentAutoShare < LOW_AUTO_SHARE_CEILING) {
        opportunities.lowAutoInAgent.push(user);
      }
    }
    if (person.acceptance.shown >= HIGH_GEN_SHOWN_FLOOR && person.acceptance.rate !== null && person.acceptance.rate < LOW_ACCEPTANCE_CEILING) {
      opportunities.highGenLowAcceptance.push(user);
    }
  });
  return opportunities;
}
