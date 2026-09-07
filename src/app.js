import { parseRecords } from './parse.js';
import {
  userLogin, computePopulation, buildPeopleIndex, computeModelRouting, classifyEnablementOpportunities
} from './metrics.js';
import { renderOverviewHeadlines, renderAdoptionStory, renderAdoptionMomentum, renderDataConfidence, renderAdoptionDepth, renderAgentContributionDistribution, renderSurfaceFunnel, renderModelRoutingPanel, renderActionQueue } from './overview.js';
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
    document.querySelector('#shareView').addEventListener('click', () => this.copyViewLink());
    document.querySelector('#exportPeople').addEventListener('click', () => this.exportPeople());
    document.querySelectorAll('.view-tab').forEach((tab) =>
      tab.addEventListener('click', () => this.switchView(tab.dataset.view)));
    document.querySelector('#viewTabs').addEventListener('keydown', (event) => this.handleTabKeydown(event));
    document.querySelector('#peopleSearch').addEventListener('input', (e) => {
      this.peopleFilter.search = e.target.value;
      this.renderPeople();
    });
    document.querySelectorAll('#peopleFilterToggle .dim-btn').forEach((button) =>
      button.addEventListener('click', () => {
        this.peopleFilter.activeFilter = button.dataset.filter;
        this.peopleFilter.opportunityUsers = null;
        document.querySelector('#peopleFilterMenu').open = false;
        document.querySelectorAll('#peopleFilterToggle .dim-btn').forEach((b) => b.classList.toggle('active', b === button));
        this.updatePeopleFilterUI();
        this.renderPeople();
      }));
    document.querySelectorAll('.sortable').forEach((th) => {
      const sort = () => {
        const key = th.dataset.sort;
        this.tableSort = { key, direction: this.tableSort.key === key && this.tableSort.direction === 'desc' ? 'asc' : 'desc' };
        this.renderPeople();
      };
      th.addEventListener('click', sort);
      th.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); sort(); }
      });
    });
    document.querySelectorAll('#breakdownToggle .dim-btn').forEach((button) =>
      button.addEventListener('click', () => {
        this.breakdownDim = button.dataset.dim;
        document.querySelectorAll('#breakdownToggle .dim-btn').forEach((b) => b.classList.toggle('active', b === button));
        this.render();
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
    this.restoreUrlState();
    document.querySelector('#uploadPanel').hidden = true;
    document.querySelector('#dashboard').hidden = false;
    document.querySelector('#viewTabs').hidden = false;
    document.querySelector('.shell').classList.add('has-data');
    this.switchView(this.currentView);
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
    select.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = label;
    select.appendChild(allOption);
    [...values].sort().forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
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
      tab.toggleAttribute('aria-current', selected);
      tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll('.view').forEach((section) => {
      section.hidden = section.id !== `view-${view}`;
    });
    if (this.rows.length) this.syncUrlState();
  }

  handleTabKeydown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll('.view-tab')];
    const current = tabs.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    this.switchView(tabs[next].dataset.view);
  }

  goToPeopleWithFilter(activeFilter) {
    this.peopleFilter = { search: '', activeFilter, opportunityUsers: null };
    this.switchView('people');
    this.updatePeopleFilterUI();
    this.renderPeople();
  }

  goToPeopleWithOpportunity(opportunityKey) {
    this.peopleFilter = { search: '', activeFilter: 'all', opportunityUsers: this.lastOpportunities[opportunityKey] };
    this.switchView('people');
    this.updatePeopleFilterUI();
    this.renderPeople();
  }

  resetFilters() {
    document.querySelector('#dateFilter').value = '28';
    document.querySelector('#userFilter').value = 'all';
    document.querySelector('#modelFilter').value = 'all';
    this.peopleFilter = { search: '', activeFilter: 'all', opportunityUsers: null };
    document.querySelector('#peopleSearch').value = '';
    this.breakdownDim = 'model';
    document.querySelectorAll('#breakdownToggle .dim-btn').forEach((button) => button.classList.toggle('active', button.dataset.dim === 'model'));
    this.updatePeopleFilterUI();
    this.render();
  }

  render() {
    const rows = this.periodRows();
    const population = computePopulation(rows);
    this.peopleIndex = buildPeopleIndex(rows);
    this.routing = computeModelRouting(rows);
    this.lastOpportunities = classifyEnablementOpportunities(this.peopleIndex, this.routing);

    renderAdoptionStory({ population, peopleIndex: this.peopleIndex });
    renderAdoptionMomentum(this.peopleIndex);
    renderDataConfidence({ rows, peopleIndex: this.peopleIndex, routing: this.routing });
    renderOverviewHeadlines({ population, peopleIndex: this.peopleIndex, routing: this.routing });
    renderAdoptionDepth(this.peopleIndex, (phase) => this.goToPeopleWithFilter(`phase${phase}`));
    renderAgentContributionDistribution(this.peopleIndex, (bucket) => this.goToPeopleWithFilter(bucket ? `agent${bucket}` : 'all'));
    renderSurfaceFunnel(this.peopleIndex, population.activeCount, (surfaceKey) => this.goToPeopleWithFilter(surfaceKey === 'completion' ? 'completionOnly' : surfaceKey));
    renderModelRoutingPanel(this.routing);
    renderActionQueue(this.lastOpportunities, (key) => this.goToPeopleWithOpportunity(key));

    this.renderPeople();
    renderCoreData(rows, this.rows, { breakdownDim: this.breakdownDim, selectedModel: document.querySelector('#modelFilter').value });
    this.syncUrlState();
  }

  renderPeople() {
    const filtered = applyPeopleFilters(this.peopleIndex, this.peopleFilter);
    this.updatePeopleFilterUI();
    renderPeopleTable(filtered, this.tableSort, (user) => {
      closePersonDrawer();
      openPersonDrawer(user, this.peopleIndex.get(user), this.routing.byUserModel.get(user) || new Map());
    });
    this.syncUrlState();
  }

  restoreUrlState() {
    const state = new URLSearchParams(window.location.search);
    ['dateFilter', 'userFilter', 'modelFilter'].forEach((id) => {
      const value = state.get(id.replace('Filter', ''));
      const select = document.querySelector('#' + id);
      if (value && [...select.options].some((option) => option.value === value)) select.value = value;
    });
    this.currentView = ['overview', 'people', 'coredata'].includes(state.get('view')) ? state.get('view') : 'overview';
    this.peopleFilter.search = state.get('search') || '';
    this.peopleFilter.activeFilter = state.get('segment') || 'all';
    document.querySelector('#peopleSearch').value = this.peopleFilter.search;
    this.breakdownDim = ['model', 'feature', 'language'].includes(state.get('breakdown')) ? state.get('breakdown') : 'model';
    document.querySelectorAll('#breakdownToggle .dim-btn').forEach((button) => button.classList.toggle('active', button.dataset.dim === this.breakdownDim));
  }

  syncUrlState() {
    const state = new URLSearchParams();
    const values = { view: this.currentView, date: document.querySelector('#dateFilter').value, user: document.querySelector('#userFilter').value, model: document.querySelector('#modelFilter').value, segment: this.peopleFilter.activeFilter, search: this.peopleFilter.search, breakdown: this.breakdownDim };
    Object.entries(values).forEach(([key, value]) => { if (value && value !== 'all' && value !== 'overview' && value !== 'model') state.set(key, value); });
    const query = state.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }

  async copyViewLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      this.toast('View link copied — recipients will still need the same export.');
    } catch {
      this.toast('Could not copy the link. Copy the address bar to share this view.');
    }
  }

  exportPeople() {
    const people = applyPeopleFilters(this.peopleIndex, this.peopleFilter);
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const header = ['Person', 'Phase', 'Active days', 'Agent contribution', 'Reported Auto share', 'Surfaces', 'Completion acceptance', 'AI credits', 'Last active'];
    const rows = [...people.entries()].map(([user, person]) => [
      user, person.phase?.latest.phaseNumber ?? '', person.consistency.activeDays,
      person.agentContribution.share === null ? '' : Math.round(person.agentContribution.share * 100) / 100,
      person.autoShare === null ? '' : Math.round(person.autoShare * 100) / 100,
      Object.entries(person.surfaces).filter(([, used]) => used).map(([surface]) => surface).join('; '),
      person.acceptance.rate === null ? '' : Math.round(person.acceptance.rate * 100) / 100,
      person.credits, person.lastActive || ''
    ].map(escape).join(','));
    const blob = new Blob([[header.map(escape).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'copilot-signals-people.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  updatePeopleFilterUI() {
    const { activeFilter, opportunityUsers } = this.peopleFilter;
    document.querySelectorAll('#peopleFilterToggle .dim-btn').forEach((button) => button.classList.toggle('active', button.dataset.filter === activeFilter && !opportunityUsers));
    const selected = document.querySelector(`#peopleFilterToggle [data-filter="${activeFilter}"]`);
    const filterLabel = document.querySelector('#peopleFilterLabel');
    filterLabel.textContent = opportunityUsers ? 'Enablement opportunity' : selected?.textContent || 'All people';
    const status = document.querySelector('#peopleFilterStatus');
    const count = applyPeopleFilters(this.peopleIndex, this.peopleFilter).size;
    status.textContent = opportunityUsers ? `${count} people in this enablement opportunity.`
      : activeFilter === 'all' ? `${count} people in the selected period.` : `${count} people in ${filterLabel.textContent}.`;
  }

  toast(message) {
    const toastEl = document.querySelector('#toast');
    toastEl.textContent = message;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 3500);
  }
}

document.addEventListener('DOMContentLoaded', () => new CopilotSignals());
