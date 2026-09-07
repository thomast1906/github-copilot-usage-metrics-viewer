import { PHASE_LABELS, bucketAgentShare } from './metrics.js';

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
