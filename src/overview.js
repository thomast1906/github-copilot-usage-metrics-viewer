import { PHASE_LABELS, bucketAgentShare } from './metrics.js';

function setText(id, value) {
  const element = document.querySelector('#' + id);
  if (element) element.textContent = value;
}

function pct(numerator, denominator) {
  return denominator ? `${Math.round((numerator / denominator) * 100)}%` : '—';
}

export function renderAdoptionStory({ population, peopleIndex }) {
  let agentFirst = 0;
  let sustained = 0;
  let phaseReported = 0;
  peopleIndex.forEach((person) => {
    if (person.phase) phaseReported += 1;
    if (person.phase?.agentFirst) agentFirst += 1;
    if (person.active && person.consistency.tier === 'sustained') sustained += 1;
  });

  const activeShare = pct(population.activeCount, population.reportedCount);
  const agentShare = pct(agentFirst, phaseReported);
  setText('adoptionStoryHeadline', population.reportedCount
    ? `${activeShare} of reported people were active. ${agentShare} of people with a reported phase are agent-first.`
    : 'No people are reported in this period.');

  const next = population.noActivityCount
    ? `${population.noActivityCount} people have no observed activity; start with that cohort.`
    : sustained < population.activeCount
      ? `${population.activeCount - sustained} active people have not yet reached sustained use.`
      : 'Activity is sustained across the selected population; explore surfaces and contribution depth.';
  setText('adoptionStoryNext', next);
}

export function renderAdoptionMomentum(peopleIndex) {
  let progressed = 0;
  let regressed = 0;
  let sustained = 0;
  let phaseReported = 0;
  peopleIndex.forEach((person) => {
    if (person.phase) {
      phaseReported += 1;
      if (person.phase.movement === 'progressed') progressed += 1;
      if (person.phase.movement === 'regressed') regressed += 1;
    }
    if (person.active && person.consistency.tier === 'sustained') sustained += 1;
  });
  const headline = !phaseReported ? 'No phase movement reported yet.'
    : progressed > regressed ? `${progressed} people progressed a phase.`
      : regressed > progressed ? `${regressed} people regressed a phase.`
        : 'No net phase movement reported.';
  setText('adoptionMomentumHeadline', headline);
  setText('adoptionMomentumDetail', `${sustained} people have sustained use · ${progressed} progressed · ${regressed} regressed · ${phaseReported} with a reported phase`);
}

export function renderDataConfidence({ rows, peopleIndex, routing }) {
  const phasePeople = [...peopleIndex.values()].filter((person) => person.phase).length;
  const hasLoc = rows.some((row) => (row.totals_by_feature || []).some((feature) =>
    Number(feature.loc_added_sum || 0) > 0 || Number(feature.loc_deleted_sum || 0) > 0));
  const notes = [
    `This period contains ${peopleIndex.size.toLocaleString()} reported people across ${new Set(rows.map((row) => row.day)).size} reported days.`,
    phasePeople ? `Adoption phase is reported for ${phasePeople.toLocaleString()} people; people without a phase are excluded from phase percentages.` : 'Adoption phase is not present in this export, so phase analysis is unavailable.',
    hasLoc ? 'Agent contribution is an attribution of reported lines changed. It covers recognised agent/edit/custom and completion/chat features only; it is not a measure of code quality or total delivery.' : 'Lines-changed fields are not present, so agent-contribution percentages should be treated as unavailable.',
    routing.hasAutoBucket ? 'Auto routing reflects entries labelled “auto” in this export. It does not reveal any model GitHub may have resolved behind Auto.' : 'This export does not report an “auto” model bucket, so Auto-routing analysis is hidden.',
    'Team or organisation metadata is not part of this export. Add it upstream or provide a roster mapping before comparing cohorts.'
  ];
  setText('dataConfidenceSummary', `${phasePeople}/${peopleIndex.size} people have a reported phase · ${routing.hasAutoBucket ? 'Auto routing reported' : 'No Auto routing data'}`);
  document.querySelector('#dataConfidenceList').innerHTML = notes.map((note) => `<li>${note}</li>`).join('');
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
  if (!autoCard) return;
  if (routing.hasAutoBucket) {
    autoCard.hidden = false;
    setText('kpiAuto', routing.agentAutoShare === null ? 'Not reported' : `${Math.round(routing.agentAutoShare * 100)}%`);
  } else {
    setText('kpiAuto', 'Not reported');
  }
}

export function renderAdoptionDepth(peopleIndex, onPhaseClick) {
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
  const phaseNotReported = peopleIndex.size - total;
  const bars = document.querySelector('#adoptionDepthBars');
  bars.innerHTML = [0, 1, 2, 3].map((phaseNumber) => {
    const count = counts[phaseNumber] || 0;
    const percent = total ? Math.round((count / total) * 100) : 0;
    return `<div class="depth-row"><button class="depth-label depth-label-button" data-phase="${phaseNumber}" aria-label="Show ${PHASE_LABELS[phaseNumber]} people">${PHASE_LABELS[phaseNumber]}</button><div class="depth-track"><div class="depth-fill" style="width:${percent}%"></div></div><span class="depth-percent">${count} · ${percent}%</span></div>`;
  }).join('');
  bars.querySelectorAll('[data-phase]').forEach((button) => {
    button.addEventListener('click', () => onPhaseClick(button.dataset.phase));
  });
  document.querySelector('#adoptionDepthMovement').textContent = total
    ? `↑ ${progressed} progressed a phase · ↓ ${regressed} regressed a phase · ${unchanged} unchanged · ${phaseNotReported} phase not reported`
    : 'No phase data reported for this period.';
}

const AGENT_SHARE_BUCKETS = ['0-20', '20-40', '40-60', '60-80', '80-100'];

export function renderAgentContributionDistribution(peopleIndex, onBucketClick) {
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
    return `<div class="depth-row"><button class="depth-label depth-label-button" data-agent-bucket="${bucket}">${bucket}% agent</button><div class="depth-track"><div class="depth-fill" style="width:${percent}%"></div></div><span class="depth-percent">${count}</span></div>`;
  }).join('');
  document.querySelector('#agentDistributionBars').querySelectorAll('[data-agent-bucket]').forEach((button) => {
    button.addEventListener('click', () => onBucketClick(button.dataset.agentBucket));
  });
  document.querySelector('#viewPeopleFromAgent').onclick = () => onBucketClick(null);
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

export function renderActionQueue(opportunities, onOpportunityClick) {
  const definitions = {
        completionOnly: 'Used Completion, but no Chat, Agent, CLI, Cloud/Coding Agent, or Copilot App.',
        chatNotAgent: 'Used Chat, but has not used Agent.',
        triedAgentNotSustained: 'Used Agent on 1–5 active days.',
        noObservedActivity: 'No observed activity in the selected period.',
        lowAutoInAgent: 'At least 5 Agent-mode generations and reported Auto below 25%.',
        highGenLowAcceptance: 'At least 20 shown completions and acceptance below 15%.'
  };
  const priority = ['noObservedActivity', 'completionOnly', 'chatNotAgent', 'triedAgentNotSustained', 'highGenLowAcceptance', 'lowAutoInAgent'];
  const items = priority.filter((key) => opportunities[key]?.length).slice(0, 3);
  const list = document.querySelector('#actionQueueList');
  list.innerHTML = items.length ? items.map((key) => `<li><span class="action-queue-rank">${items.indexOf(key) + 1}</span><div><button data-opportunity="${key}">${OPPORTUNITY_LABELS[key]}</button><p>${definitions[key]}</p></div><strong>${opportunities[key].length.toLocaleString()} people</strong></li>`).join('')
    : '<li class="action-queue-empty">No priority cohorts appear in the selected period.</li>';
  list.querySelectorAll('[data-opportunity]').forEach((button) => {
    button.addEventListener('click', () => onOpportunityClick(button.dataset.opportunity));
  });
}
