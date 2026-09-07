import { userLogin } from './metrics.js';

const charts = {};

function activity(row) {
  return Number(row.user_initiated_interaction_count || 0) + Number(row.code_generation_activity_count || 0) + Number(row.code_acceptance_activity_count || 0);
}

function breakdown(rows, key, dimension, metric, selectedModel) {
  const out = {};
  rows.forEach((row) => (row[key] || []).forEach((entry) => {
    if (!entry[dimension]) return;
    if (dimension === 'model' && selectedModel !== 'all' && entry.model !== selectedModel) return;
    out[entry[dimension]] = (out[entry[dimension]] || 0) + Number(entry[metric] || 0);
  }));
  return out;
}

function people(periodRows, allRows) {
  const peopleMap = {};
  const lastActive = {};
  allRows.forEach((row) => {
    if (activity(row) > 0) {
      const user = userLogin(row);
      if (!lastActive[user] || row.day > lastActive[user]) lastActive[user] = row.day;
    }
  });
  periodRows.forEach((row) => {
    const user = userLogin(row);
    const p = peopleMap[user] || (peopleMap[user] = {
      days: 0, interactions: 0, generation: 0, accepted: 0, credits: 0,
      agentLoc: 0, userLoc: 0, compShown: 0, compAccepted: 0,
      agent: false, chat: false, cli: false, active: false
    });
    p.days += 1;
    p.interactions += Number(row.user_initiated_interaction_count || 0);
    p.generation += Number(row.code_generation_activity_count || 0);
    p.accepted += Number(row.code_acceptance_activity_count || 0);
    p.credits += Number(row.ai_credits_used || 0);
    p.agent = p.agent || !!row.used_agent;
    p.chat = p.chat || !!row.used_chat;
    p.cli = p.cli || !!row.used_cli;
    p.active = p.active || activity(row) > 0;
    (row.totals_by_feature || []).forEach((feature) => {
      const loc = Number(feature.loc_added_sum || 0) + Number(feature.loc_deleted_sum || 0);
      if (/agent|edit|custom/i.test(feature.feature || '')) p.agentLoc += loc;
      else p.userLoc += loc;
      if (feature.feature === 'code_completion') {
        p.compShown += Number(feature.code_generation_activity_count || 0);
        p.compAccepted += Number(feature.code_acceptance_activity_count || 0);
      }
    });
  });
  Object.entries(peopleMap).forEach(([user, p]) => {
    p.acceptRate = p.compShown ? (p.compAccepted / p.compShown) * 100 : -1;
    p.lastActive = lastActive[user] || null;
  });
  return peopleMap;
}

function sizeBreakdown(dim, count) {
  const inner = document.querySelector('#breakdownInner');
  inner.style.height = dim === 'model' ? `${Math.max(320, count * 34 + 36)}px` : '';
}

function format(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function label(value) {
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function topN(o, n = 8) {
  const entries = Object.entries(o).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n);
  return { labels: entries.map((x) => label(x[0])), values: entries.map((x) => x[1]) };
}

function options(donut, legend = donut) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { display: legend, labels: { color: '#b9c6d9', boxWidth: 10, font: { size: 11 } } },
      tooltip: { callbacks: { label: (c) => `${c.label || c.dataset.label}: ${format(c.raw ?? c.parsed.y ?? c.parsed)}` } }
    },
    scales: donut ? {} : {
      x: { ticks: { color: '#8ea0b9', maxRotation: 0, autoSkip: true }, grid: { color: '#20304a' } },
      y: { ticks: { color: '#8ea0b9' }, grid: { color: '#20304a' }, beginAtZero: true }
    }
  };
}

function chart(id, type, data) {
  if (charts[id]) charts[id].destroy();
  const canvas = document.querySelector('#' + id);
  let config;
  if (type === 'line') {
    config = { type, data, options: options(false, true) };
  } else if (type === 'stackedBar' || type === 'stackedBarH') {
    config = { type: 'bar', data, options: options(false, true) };
    config.options.scales.x.stacked = true;
    config.options.scales.y.stacked = true;
    if (type === 'stackedBarH') config.options.indexAxis = 'y';
  } else if (type === 'multiBar') {
    config = { type: 'bar', data, options: options(false, true) };
  } else {
    const labels = data.labels || [];
    const values = data.values || [];
    config = {
      type: 'bar',
      data: { labels, datasets: [{ data: values, backgroundColor: ['#83f1c5', '#7da8ff', '#e69cff', '#ffb86b', '#61d6ed', '#a4b5ff', '#ff8ea1', '#b5d77a', '#d7a7ff', '#f2d68c', '#80c5ad', '#eaa3c1'] }] },
      options: options(false)
    };
    config.options.indexAxis = 'y';
    if (type === 'scrollBar') config.options.maintainAspectRatio = false;
  }
  charts[id] = new Chart(canvas, config);
}

function setText(id, value) {
  document.querySelector('#' + id).textContent = value;
}

export function renderCoreData(periodRows, allRows, { breakdownDim, selectedModel }) {
  const byDay = {};
  const routing = { Agent: { auto: 0, named: 0 }, Ask: { auto: 0, named: 0 } };
  periodRows.forEach((row) => {
    const day = byDay[row.day] || (byDay[row.day] = { interactions: 0, generation: 0, auto: 0, named: 0 });
    day.interactions += Number(row.user_initiated_interaction_count || 0);
    day.generation += Number(row.code_generation_activity_count || 0);
    (row.totals_by_model_feature || []).forEach((entry) => {
      if (selectedModel !== 'all' && entry.model !== selectedModel) return;
      const amount = Number(entry.code_generation_activity_count || 0);
      const type = entry.model === 'auto' ? 'auto' : 'named';
      day[type] += amount;
      const mode = entry.feature?.includes('agent') ? 'Agent' : entry.feature?.includes('ask') ? 'Ask' : null;
      if (mode) routing[mode][type] += amount;
    });
  });

  const days = Object.keys(byDay).sort();
  const share = (mode) => {
    const bucket = routing[mode];
    return bucket.auto + bucket.named ? Math.round((bucket.auto / (bucket.auto + bucket.named)) * 100) : null;
  };
  const agentAuto = share('Agent');
  const askAuto = share('Ask');

  setText('reportTitle', 'GitHub Copilot');
  setText('reportMeta', days.length
    ? `${days[0]} – ${days[days.length - 1]} · ${periodRows.length.toLocaleString()} user/day records`
    : 'No records match these filters');

  chart('activityChart', 'line', {
    labels: days,
    datasets: [
      { label: 'Interactions', data: days.map((d) => byDay[d].interactions), borderColor: '#83f1c5', backgroundColor: '#83f1c522', fill: true, tension: .35 },
      { label: 'Code generation', data: days.map((d) => byDay[d].generation), borderColor: '#7da8ff', tension: .35 }
    ]
  });

  chart('routingTrendChart', 'stackedBar', {
    labels: days,
    datasets: [
      { label: 'Auto', data: days.map((d) => byDay[d].auto), backgroundColor: '#ffb86b' },
      { label: 'Named models', data: days.map((d) => byDay[d].named), backgroundColor: '#e69cff' }
    ]
  });

  chart('modeRoutingChart', 'multiBar', {
    labels: ['Agent workflows', 'Ask mode'],
    datasets: [
      { label: 'Auto', data: [agentAuto || 0, askAuto || 0], backgroundColor: '#ffb86b' },
      { label: 'Named models', data: [agentAuto === null ? 0 : 100 - agentAuto, askAuto === null ? 0 : 100 - askAuto], backgroundColor: '#e69cff' }
    ]
  });

  const peopleStats = people(periodRows, allRows);
  const repeat = { 'One day': 0, 'Occasional (2–5)': 0, 'Sustained (6+)': 0 };
  Object.values(peopleStats).filter((p) => p.active).forEach((p) => {
    repeat[p.days === 1 ? 'One day' : p.days <= 5 ? 'Occasional (2–5)' : 'Sustained (6+)'] += 1;
  });
  chart('repeatUseChart', 'bar', { labels: Object.keys(repeat), values: Object.values(repeat) });

  const breakdownSources = {
    model: ['totals_by_model_feature', 'model', 'code_generation_activity_count'],
    feature: ['totals_by_feature', 'feature', 'user_initiated_interaction_count'],
    language: ['totals_by_language_feature', 'language', 'code_generation_activity_count']
  };
  const [bKey, bDim, bMetric] = breakdownSources[breakdownDim];
  const breakdownData = topN(breakdown(periodRows, bKey, bDim, bMetric, selectedModel), breakdownDim === 'model' ? Infinity : 8);
  sizeBreakdown(breakdownDim, breakdownData.labels.length);
  chart('breakdownChart', breakdownDim === 'model' ? 'scrollBar' : 'bar', breakdownData);

  chart('ideChart', 'bar', topN(breakdown(periodRows, 'totals_by_ide', 'ide', 'user_initiated_interaction_count', selectedModel)));

  const locPeople = Object.entries(peopleStats)
    .filter(([, p]) => p.agentLoc + p.userLoc > 0)
    .sort((a, b) => (b[1].agentLoc + b[1].userLoc) - (a[1].agentLoc + a[1].userLoc))
    .slice(0, 12);
  const agentLocTotal = Object.values(peopleStats).reduce((n, p) => n + p.agentLoc, 0);
  const userLocTotal = Object.values(peopleStats).reduce((n, p) => n + p.userLoc, 0);
  chart('locChart', 'stackedBarH', {
    labels: locPeople.map((x) => x[0]),
    datasets: [
      { label: 'Agent-initiated', data: locPeople.map((x) => x[1].agentLoc), backgroundColor: '#7da8ff' },
      { label: 'User-initiated', data: locPeople.map((x) => x[1].userLoc), backgroundColor: '#83f1c5' }
    ]
  });
  setText('agentContributionNote', agentLocTotal + userLocTotal
    ? `${Math.round((agentLocTotal / (agentLocTotal + userLocTotal)) * 100)}% agent-initiated org-wide`
    : 'No LOC activity');

  chart('peopleChart', 'bar', topN(Object.fromEntries(Object.entries(peopleStats).map(([u, p]) => [u, p.interactions])), 12));
}
