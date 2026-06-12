/* History page — trends, run list, run compare */
"use strict";

const $ = (id) => document.getElementById(id);
let runs = [];

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2500);
}

async function api(path) {
  const r = await fetch(path);
  if (r.status === 401) { location.href = "/login"; throw new Error("auth"); }
  return r.json();
}

function td(text) {
  const cell = document.createElement("td");
  cell.textContent = text ?? "";
  return cell;
}

function pill(status) {
  const span = document.createElement("span");
  span.className = "status-pill " + (status ? `s${String(status)[0]}` : "serr");
  span.textContent = status ?? "ERR";
  const cell = document.createElement("td");
  cell.appendChild(span);
  return cell;
}

function shortDate(iso) {
  return iso ? iso.replace("T", " ").slice(5, 16) : "";
}

/* ── trend chart ──────────────────────────────────────────── */
let trendChart = null;
function renderTrend() {
  const ordered = [...runs].reverse(); // oldest → newest
  if (ordered.length === 0) return;
  $("trend-empty").classList.add("hidden");
  trendChart = new Chart($("chart-trend"), {
    type: "line",
    data: {
      labels: ordered.map((r) => `#${r.id} ${shortDate(r.finished_at)}`),
      datasets: [
        {
          label: "Success rate %",
          data: ordered.map((r) => r.success_rate),
          borderColor: "#16a34a", backgroundColor: "#16a34a33",
          yAxisID: "y", tension: 0.25, fill: true,
        },
        {
          label: "Avg response (ms)",
          data: ordered.map((r) => r.avg_ms),
          borderColor: "#4f46e5", backgroundColor: "#4f46e5",
          yAxisID: "y1", tension: 0.25,
        },
        {
          label: "Errors",
          data: ordered.map((r) => r.count_4xx + r.count_5xx + r.count_err),
          borderColor: "#dc2626", backgroundColor: "#dc2626",
          yAxisID: "y1", tension: 0.25, hidden: true,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y:  { min: 0, max: 100, title: { display: true, text: "Success %" } },
        y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false },
              title: { display: true, text: "ms / errors" } },
      },
    },
  });
}

/* ── run list ─────────────────────────────────────────────── */
function renderRuns() {
  const body = $("runs-table").querySelector("tbody");
  body.innerHTML = "";
  for (const r of runs) {
    const tr = document.createElement("tr");
    if (r.stopped) tr.classList.add("stopped-run");
    tr.append(
      td(`#${r.id}`), td(shortDate(r.finished_at)),
      td(r.trigger_type + (r.stopped ? " (stopped)" : "")),
      td(r.total), td(r.count_2xx), td(r.count_3xx),
      td(r.count_4xx), td(r.count_5xx), td(r.count_err),
      td(r.success_rate != null ? `${r.success_rate}%` : "–"),
      td(r.avg_ms != null ? Math.round(r.avg_ms) : "–"),
      td(r.slow_count),
    );
    const actions = document.createElement("td");
    const view = document.createElement("button");
    view.className = "btn ghost small";
    view.textContent = "View";
    view.onclick = () => showDetail(r.id);
    actions.appendChild(view);
    tr.appendChild(actions);
    body.appendChild(tr);
  }
}

/* ── compare ──────────────────────────────────────────────── */
function fillCompareSelects() {
  const oldSel = $("cmp-old"), newSel = $("cmp-new");
  oldSel.innerHTML = newSel.innerHTML = "";
  for (const r of runs) {
    const label = `#${r.id} — ${shortDate(r.finished_at)} (${r.total} URLs)`;
    oldSel.add(new Option(label, r.id));
    newSel.add(new Option(label, r.id));
  }
  // default: newest vs previous
  if (runs.length >= 2) {
    newSel.value = runs[0].id;
    oldSel.value = runs[1].id;
  }
}

function fillBucket(tbodyId, countId, rows, makeRow) {
  $(countId).textContent = rows.length;
  const body = $(tbodyId);
  body.innerHTML = "";
  if (rows.length === 0) {
    const tr = document.createElement("tr");
    const cell = td("— none —");
    cell.colSpan = 4;
    cell.className = "muted";
    tr.appendChild(cell);
    body.appendChild(tr);
    return;
  }
  for (const row of rows.slice(0, 300)) body.appendChild(makeRow(row));
}

async function compare() {
  const oldId = $("cmp-old").value, newId = $("cmp-new").value;
  if (!oldId || !newId) return;
  if (+oldId === +newId) { toast("Pick two different runs"); return; }
  const d = await api(`/api/compare/${oldId}/${newId}`);
  if (d.error) { toast(d.error); return; }
  $("cmp-results").classList.remove("hidden");
  $("cmp-summary").textContent =
    `#${oldId} → #${newId}: +${d.added_urls} new URLs, −${d.removed_urls} removed`;

  fillBucket("tb-new-errors", "cnt-new-errors", d.new_errors, (e) => {
    const tr = document.createElement("tr");
    tr.append(td(e.url),
              e.was_in_old ? pill(e.old_status) : td("(new URL)"),
              pill(e.new_status));
    if (e.error) tr.lastChild.title = e.error;
    return tr;
  });
  fillBucket("tb-fixed", "cnt-fixed", d.fixed, (e) => {
    const tr = document.createElement("tr");
    tr.append(td(e.url), pill(e.old_status), pill(e.new_status));
    return tr;
  });
  fillBucket("tb-still", "cnt-still", d.still_broken, (e) => {
    const tr = document.createElement("tr");
    tr.append(td(e.url), pill(e.old_status), pill(e.new_status));
    return tr;
  });
  fillBucket("tb-slower", "cnt-slower", d.slower, (e) => {
    const tr = document.createElement("tr");
    const delta = td(`+${e.delta_ms}`);
    delta.className = "slow";
    tr.append(td(e.url), td(e.old_ms), td(e.new_ms), delta);
    return tr;
  });
}

/* ── run detail ───────────────────────────────────────────── */
async function showDetail(runId) {
  const d = await api(`/api/runs/${runId}`);
  if (d.error) { toast(d.error); return; }
  $("detail-card").classList.remove("hidden");
  $("detail-title").textContent =
    `Run #${runId} — ${shortDate(d.run.finished_at)} (${d.run.total} URLs, ${d.run.success_rate}% success)`;
  const body = $("detail-table").querySelector("tbody");
  body.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const r of d.results.slice(0, 3000)) {
    const tr = document.createElement("tr");
    const timeCell = td(r.response_time_ms != null ? Math.round(r.response_time_ms) : "–");
    if (r.response_time_ms > 2000) timeCell.classList.add("slow");
    tr.append(td(r.url), pill(r.status_code), timeCell,
              td(r.error || (r.final_url ? `→ ${r.final_url}` : "")));
    frag.appendChild(tr);
  }
  body.appendChild(frag);
  $("detail-card").scrollIntoView({ behavior: "smooth" });
}

/* ── init ─────────────────────────────────────────────────── */
$("btn-compare").onclick = compare;

(async function init() {
  const [runData, settings] = await Promise.all([api("/api/runs"), api("/api/settings")]);
  runs = runData.runs || [];
  $("retention-note").textContent = `(kept for ${settings.retention_days} days)`;
  renderTrend();
  renderRuns();
  fillCompareSelects();
  if (runs.length >= 2) compare(); // auto-compare latest two runs
})();
