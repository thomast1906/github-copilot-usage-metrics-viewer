import { PHASE_LABELS } from './metrics.js';

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

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
  document.querySelectorAll('.sortable').forEach((th) => {
    const indicator = th.querySelector('.sort-indicator');
    indicator.textContent = th.dataset.sort === sort.key ? (sort.direction === 'desc' ? '↓' : '↑') : '↕';
  });
  const rows = [...filteredIndex.entries()].sort((a, b) => sortComparator(a, b, sort));
  document.querySelector('#peopleTableBody').innerHTML = rows.map(([user, person]) => `
    <tr data-user="${escapeHtml(user)}">
      <td>${escapeHtml(user)}</td>
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

let lastFocusedElement = null;

export function openPersonDrawer(user, person, modelBreakdown) {
  lastFocusedElement = document.activeElement;
  const total = [...modelBreakdown.values()].reduce((sum, value) => sum + value, 0);
  const modelRows = [...modelBreakdown.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([model, count]) => {
      const percent = total ? Math.round((count / total) * 100) : 0;
      return `<li>${model === 'auto' ? 'Auto' : escapeHtml(model)} <span>${percent}%</span></li>`;
    }).join('') || '<li>No model-attributed generation</li>';

  const host = document.querySelector('#personDrawer');
  host.innerHTML = `
    <div class="drawer-backdrop" id="drawerBackdrop"></div>
    <div class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle" id="drawerPanel">
      <button class="text-button drawer-close" id="drawerClose" aria-label="Close person detail">✕</button>
      <h3 id="drawerTitle">${escapeHtml(user)}</h3>
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
