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
    document.querySelectorAll('.sortable').forEach((th) =>
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        this.tableSort = { key, direction: this.tableSort.key === key && this.tableSort.direction === 'desc' ? 'asc' : 'desc' };
        this.renderPeople();
      }));
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
