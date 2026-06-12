/* Sitemap URL Health Checker — frontend client */
"use strict";

const socket = io();
const $ = (id) => document.getElementById(id);

/* redirect to login when the session expires */
const _fetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const r = await _fetch(...args);
  if (r.status === 401) location.href = "/login";
  return r;
};

let results = [];          // all UrlResult dicts received this run
let sortKey = null;
let sortAsc = true;
let renderQueued = false;

/* ── connection badge ─────────────────────────────────────── */
socket.on("connect", () => {
  const b = $("conn-status");
  b.textContent = "connected";
  b.classList.replace("offline", "online");
});
socket.on("disconnect", () => {
  const b = $("conn-status");
  b.textContent = "disconnected";
  b.classList.replace("online", "offline");
});

/* ── toast ────────────────────────────────────────────────── */
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2500);
}

function setStatus(msg) { $("status-line").textContent = msg; }
function setProgress(pct) { $("progress-bar").style.width = `${pct}%`; }

/* ── config ───────────────────────────────────────────────── */
async function loadConfig() {
  const cfg = await (await fetch("/api/config")).json();
  $("cfg-timeout").value = cfg.timeout;
  $("cfg-concurrent").value = cfg.max_concurrent;
  $("cfg-retries").value = cfg.retry_count;
  $("cfg-useragent").value = cfg.user_agent;
  $("cfg-redirects").checked = cfg.follow_redirects;
  $("cfg-ssl").checked = cfg.verify_ssl;
  $("cfg-head").checked = cfg.use_head_first;
  $("cfg-domainlimit").value = cfg.per_domain_limit;
}

async function saveConfig() {
  const body = {
    timeout: +$("cfg-timeout").value,
    max_concurrent: +$("cfg-concurrent").value,
    retry_count: +$("cfg-retries").value,
    user_agent: $("cfg-useragent").value,
    follow_redirects: $("cfg-redirects").checked,
    verify_ssl: $("cfg-ssl").checked,
    use_head_first: $("cfg-head").checked,
    per_domain_limit: +$("cfg-domainlimit").value,
  };
  await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  toast("Settings saved");
}

/* ── automation & alert settings ──────────────────────────── */
async function loadSettings() {
  const s = await (await fetch("/api/settings")).json();
  $("set-retention").value = s.retention_days;
  $("set-alerts-enabled").checked = s.alerts.enabled;
  $("set-minsuccess").value = s.alerts.min_success_rate;
  $("set-smtp-host").value = s.alerts.smtp_host;
  $("set-smtp-port").value = s.alerts.smtp_port;
  $("set-smtp-user").value = s.alerts.smtp_user;
  $("set-smtp-pass").value = s.alerts.smtp_password;
  $("set-mail-to").value = s.alerts.mail_to;
}

async function saveSettings() {
  const body = {
    retention_days: +$("set-retention").value,
    alerts: {
      enabled: $("set-alerts-enabled").checked,
      min_success_rate: +$("set-minsuccess").value,
      smtp_host: $("set-smtp-host").value.trim(),
      smtp_port: +$("set-smtp-port").value,
      smtp_user: $("set-smtp-user").value.trim(),
      smtp_password: $("set-smtp-pass").value,
      mail_from: $("set-smtp-user").value.trim(),
      mail_to: $("set-mail-to").value.trim(),
    },
  };
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  toast("Automation settings saved");
}

async function testAlert() {
  await saveSettings();
  const r = await fetch("/api/alerts/test", { method: "POST" });
  const d = await r.json().catch(() => ({}));
  toast(r.ok ? "Test email sent ✔" : (d.error || "Test email failed"));
}

async function changePassword() {
  const r = await fetch("/api/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current: $("pw-current").value, new: $("pw-new").value }),
  });
  const d = await r.json().catch(() => ({}));
  if (r.ok) { $("pw-current").value = $("pw-new").value = ""; toast("Password changed"); }
  else toast(d.error || "Password change failed");
}

/* ── schedules (one-time / daily / weekly / interval) ─────── */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function describeSchedule(s) {
  const from = s.start && !s.last_run ? ` (starts ${s.start.slice(0, 10)})` : "";
  if (s.type === "once")     return `📅 Once on ${s.date} at ${s.time}`;
  if (s.type === "daily")    return `🔁 Daily at ${s.time}${from}`;
  if (s.type === "weekly")   return `🔁 ${s.days.map((d) => WEEKDAYS[d]).join(", ")} at ${s.time}${from}`;
  if (s.type === "interval") return `⏱ Every ${s.interval_hours}h${from}`;
  return s.type;
}

function renderSchedules(list) {
  const ul = $("schedule-list");
  ul.innerHTML = "";
  for (const s of list) {
    const li = document.createElement("li");
    if (!s.enabled) li.classList.add("disabled-schedule");

    const desc = document.createElement("span");
    desc.textContent = describeSchedule(s);

    const meta = document.createElement("span");
    meta.className = "muted";
    if (s.type === "once" && s.last_run) meta.textContent = `✅ ran at ${s.last_run.replace("T", " ")}`;
    else if (!s.enabled) meta.textContent = "paused";
    else if (s.next_run) meta.textContent = `next: ${s.next_run.replace("T", " ")}`;
    if (s.last_run && s.type !== "once") meta.textContent += ` · last: ${s.last_run.replace("T", " ").slice(0, 16)}`;

    const toggle = document.createElement("button");
    toggle.className = "sched-btn";
    toggle.textContent = s.enabled ? "⏸" : "▶";
    toggle.title = s.enabled ? "Pause" : "Resume";
    toggle.onclick = async () => {
      const r = await fetch(`/api/schedules/${s.id}/toggle`, { method: "POST" });
      renderSchedules((await r.json()).schedules || []);
    };

    const del = document.createElement("button");
    del.className = "sched-btn danger-text";
    del.textContent = "✕";
    del.title = "Delete";
    del.onclick = async () => {
      const r = await fetch(`/api/schedules/${s.id}`, { method: "DELETE" });
      renderSchedules((await r.json()).schedules || []);
    };

    li.append(desc, meta, toggle, del);
    ul.appendChild(li);
  }
}

async function loadSchedules() {
  const d = await (await fetch("/api/schedules")).json();
  renderSchedules(d.schedules || []);
}

function updateSchedFields() {
  const t = $("sch-type").value;
  $("sch-days-wrap").classList.toggle("hidden", t !== "weekly");
  $("sch-interval-wrap").classList.toggle("hidden", t !== "interval");
  // weekly default: pre-check the weekday of the picked date
  if (t === "weekly" && !$("sch-days-wrap").querySelector("input:checked") && $("sch-datetime").value) {
    const mondayBased = (new Date($("sch-datetime").value).getDay() + 6) % 7;
    $("sch-days-wrap").querySelector(`input[value="${mondayBased}"]`).checked = true;
  }
}

async function addSchedule() {
  const t = $("sch-type").value;
  if (!$("sch-datetime").value) { toast("Pick a date and time first"); return; }
  const body = { type: t, datetime: $("sch-datetime").value };
  if (t === "interval") {
    body.interval_hours = +$("sch-interval").value;
  } else if (t === "weekly") {
    body.days = [...$("sch-days-wrap").querySelectorAll("input:checked")].map((c) => +c.value);
  }
  const r = await fetch("/api/schedules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) { toast(d.error || "Could not add schedule"); return; }
  renderSchedules(d.schedules);
  toast("Schedule added");
}

/* ── custom URL list ──────────────────────────────────────── */
async function loadCustomUrls() {
  const r = await fetch("/api/urls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: $("custom-urls-input").value }),
  });
  const d = await r.json();
  if (!r.ok) { toast(d.error || "No valid URLs"); return; }
  $("btn-check").disabled = false;
  setStatus(`✅ Loaded ${d.total} custom URLs. Ready to check.`);
  toast(`${d.total} URLs loaded`);
}

/* ── sitemaps ─────────────────────────────────────────────── */
function renderSitemaps(list) {
  const ul = $("sitemap-list");
  ul.innerHTML = "";
  list.forEach((url, i) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = url;
    const del = document.createElement("button");
    del.textContent = "✕";
    del.title = "Remove";
    del.onclick = async () => {
      const r = await fetch(`/api/sitemaps/${i}`, { method: "DELETE" });
      renderSitemaps((await r.json()).sitemaps || []);
    };
    li.append(span, del);
    ul.appendChild(li);
  });
  $("btn-fetch").disabled = list.length === 0;
}

async function loadSitemaps() {
  const data = await (await fetch("/api/sitemaps")).json();
  renderSitemaps(data.sitemaps || []);
}

async function addSitemap() {
  const input = $("sitemap-input");
  const url = input.value.trim();
  if (!url) return;
  const r = await fetch("/api/sitemaps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await r.json();
  if (!r.ok) { toast(data.error || "Could not add sitemap"); return; }
  input.value = "";
  renderSitemaps(data.sitemaps);
}

/* ── fetch / check lifecycle ──────────────────────────────── */
function setRunning(running) {
  $("btn-fetch").disabled = running;
  $("btn-check").disabled = running;
  $("btn-stop").disabled = !running;
  ["btn-export-csv", "btn-export-excel", "btn-export-json"]
    .forEach((id) => { $(id).disabled = running || results.length === 0; });
}

$("btn-fetch").onclick = () => {
  setRunning(true);
  setProgress(0);
  setStatus("Fetching sitemaps…");
  socket.emit("fetch_urls");
};

$("btn-check").onclick = () => {
  results = [];
  setRunning(true);
  setProgress(0);
  socket.emit("start_check");
};

$("btn-stop").onclick = () => {
  socket.emit("stop_check");
  setStatus("Stopping…");
};

socket.on("fetch_progress", (d) =>
  setStatus(`Parsed ${d.sitemap} — ${d.url_count} URLs so far`));

socket.on("fetch_complete", (d) => {
  setRunning(false);
  $("btn-check").disabled = d.total === 0;
  setStatus(`✅ Extracted ${d.total} URLs. Ready to check.`);
  setProgress(100);
  toast(`${d.total} URLs extracted`);
});

socket.on("fetch_error", (d) => {
  setRunning(false);
  setStatus(`⚠ ${d.error}`);
  toast(d.error);
});

socket.on("check_started", (d) =>
  setStatus(`Checking 0 / ${d.total} URLs…`));

socket.on("check_progress", (d) => {
  results.push(d.result);
  setProgress((d.done / d.total) * 100);
  setStatus(`Checking ${d.done} / ${d.total} URLs…`);
  scheduleRender();
});

socket.on("check_complete", (d) => {
  setRunning(false);
  $("btn-check").disabled = false;
  setStatus(d.stopped
    ? `■ Stopped after ${results.length} URLs.`
    : `✅ Done — checked ${d.total} URLs. Saved as run #${d.run_id} — compare it on the History page.`);
  setProgress(100);
  renderAll();
  toast(d.stopped ? "Check stopped" : "Check complete");
});

socket.on("check_error", (d) => {
  setRunning(false);
  setStatus(`⚠ ${d.error}`);
  toast(d.error);
});

/* ── charts ───────────────────────────────────────────────── */
const statusChart = new Chart($("chart-status"), {
  type: "doughnut",
  data: {
    labels: ["2xx", "3xx", "4xx", "5xx", "Error"],
    datasets: [{
      data: [0, 0, 0, 0, 0],
      backgroundColor: ["#16a34a", "#d97706", "#dc2626", "#991b1b", "#6b7280"],
    }],
  },
  options: { responsive: true, maintainAspectRatio: false,
             plugins: { legend: { position: "bottom" } } },
});

const TIME_BUCKETS = ["<200ms", "200-500", "500-1000", "1-2s", ">2s"];
const timesChart = new Chart($("chart-times"), {
  type: "bar",
  data: {
    labels: TIME_BUCKETS,
    datasets: [{
      data: [0, 0, 0, 0, 0],
      backgroundColor: ["#16a34a", "#65a30d", "#d97706", "#ea580c", "#dc2626"],
    }],
  },
  options: { responsive: true, maintainAspectRatio: false,
             plugins: { legend: { display: false } },
             scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
});

function timeBucket(ms) {
  if (ms < 200) return 0;
  if (ms < 500) return 1;
  if (ms < 1000) return 2;
  if (ms < 2000) return 3;
  return 4;
}

/* ── rendering (throttled to ~5 fps during a run) ─────────── */
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => { renderQueued = false; renderAll(); }, 200);
}

function renderAll() {
  renderStats();
  renderCharts();
  renderDashTables();
  renderResultsTable();
}

function renderStats() {
  const total = results.length;
  const ok = results.filter((r) => r.ok).length;
  const errors = results.filter((r) => r.category === "error" ||
                                       r.category === "4xx" || r.category === "5xx").length;
  const times = results.filter((r) => r.response_time_ms != null)
                       .map((r) => r.response_time_ms);
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
  const slow = times.filter((t) => t > 2000).length;

  $("stat-total").textContent = total;
  $("stat-success").textContent = total ? `${((ok / total) * 100).toFixed(1)}%` : "–";
  $("stat-avg").textContent = avg != null ? `${Math.round(avg)} ms` : "–";
  $("stat-slow").textContent = slow;
  $("stat-errors").textContent = errors;
}

function renderCharts() {
  const cats = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, error: 0 };
  const buckets = [0, 0, 0, 0, 0];
  for (const r of results) {
    cats[r.category] = (cats[r.category] || 0) + 1;
    if (r.response_time_ms != null) buckets[timeBucket(r.response_time_ms)]++;
  }
  statusChart.data.datasets[0].data =
    [cats["2xx"], cats["3xx"], cats["4xx"], cats["5xx"], cats.error];
  timesChart.data.datasets[0].data = buckets;
  statusChart.update("none");
  timesChart.update("none");
}

/* Fix 5 — Top 10 slowest + error URL tables */
function renderDashTables() {
  const slowBody = $("slow-table").querySelector("tbody");
  slowBody.innerHTML = "";
  [...results]
    .filter((r) => r.response_time_ms != null)
    .sort((a, b) => b.response_time_ms - a.response_time_ms)
    .slice(0, 10)
    .forEach((r) => {
      const tr = document.createElement("tr");
      tr.dataset.url = r.url;
      tr.append(td(r.url), statusTd(r), td(Math.round(r.response_time_ms)));
      slowBody.appendChild(tr);
    });

  const errBody = $("error-table").querySelector("tbody");
  errBody.innerHTML = "";
  results
    .filter((r) => !r.ok)
    .slice(0, 100)
    .forEach((r) => {
      const tr = document.createElement("tr");
      tr.dataset.url = r.url;
      tr.append(td(r.url), statusTd(r), td(r.error || ""));
      errBody.appendChild(tr);
    });
}

function td(text) {
  const cell = document.createElement("td");
  cell.textContent = text ?? "";
  return cell;
}

function statusTd(r) {
  const cell = document.createElement("td");
  const pill = document.createElement("span");
  pill.className = "status-pill " +
    (r.status_code ? `s${String(r.status_code)[0]}` : "serr");
  pill.textContent = r.status_code ?? "ERR";
  cell.appendChild(pill);
  return cell;
}

/* ── results table: search / filter / sort ────────────────── */
function visibleResults() {
  const q = $("search-input").value.trim().toLowerCase();
  const cat = $("filter-status").value;
  let rows = results.filter((r) =>
    (!q || r.url.toLowerCase().includes(q)) &&
    (!cat || r.category === cat));
  if (sortKey) {
    rows = [...rows].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortAsc ? cmp : -cmp;
    });
  }
  return rows;
}

function renderResultsTable() {
  const rows = visibleResults();
  const body = $("results-table").querySelector("tbody");
  body.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const r of rows.slice(0, 2000)) {
    const tr = document.createElement("tr");
    tr.dataset.url = r.url;
    const timeCell = td(r.response_time_ms != null ? Math.round(r.response_time_ms) : "–");
    if (r.response_time_ms > 2000) timeCell.classList.add("slow");
    tr.append(td(r.url), statusTd(r), timeCell, td(r.method),
              td(r.error || (r.final_url ? `→ ${r.final_url}` : "")));
    frag.appendChild(tr);
  }
  body.appendChild(frag);
  $("results-count").textContent =
    rows.length === results.length
      ? `${results.length} results`
      : `${rows.length} of ${results.length} results`;
}

$("search-input").addEventListener("input", renderResultsTable);
$("filter-status").addEventListener("change", renderResultsTable);

document.querySelectorAll("#results-table th").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (sortKey === key) sortAsc = !sortAsc;
    else { sortKey = key; sortAsc = true; }
    renderResultsTable();
  });
});

/* ── Fix 4 — context menu: copy URL / copy row / open ─────── */
const menu = $("context-menu");
let menuRow = null;

document.addEventListener("contextmenu", (e) => {
  const tr = e.target.closest("tr[data-url]");
  if (!tr) { menu.classList.add("hidden"); return; }
  e.preventDefault();
  menuRow = tr;
  menu.classList.remove("hidden");
  const { innerWidth: w, innerHeight: h } = window;
  menu.style.left = `${Math.min(e.clientX, w - menu.offsetWidth - 8)}px`;
  menu.style.top = `${Math.min(e.clientY, h - menu.offsetHeight - 8)}px`;
});

document.addEventListener("click", () => menu.classList.add("hidden"));
window.addEventListener("scroll", () => menu.classList.add("hidden"), true);

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} copied`);
  } catch {
    toast("Clipboard requires HTTPS or localhost");
  }
}

menu.addEventListener("click", (e) => {
  const action = e.target.closest("button")?.dataset.action;
  if (!action || !menuRow) return;
  const url = menuRow.dataset.url;
  if (action === "copy-url") copyText(url, "URL");
  else if (action === "copy-row") {
    const cells = [...menuRow.querySelectorAll("td")].map((c) => c.textContent.trim());
    copyText(cells.join("\t"), "Row");
  } else if (action === "open") window.open(url, "_blank");
  menu.classList.add("hidden");
});

/* ── export ───────────────────────────────────────────────── */
async function exportResults(fmt) {
  const r = await fetch(`/api/export/${fmt}`, { method: "POST" });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    toast(data.error || "Export failed");
    return;
  }
  const blob = await r.blob();
  const name = (r.headers.get("Content-Disposition") || "")
    .match(/filename="?([^";]+)"?/)?.[1] || `results.${fmt}`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

$("btn-export-csv").onclick = () => exportResults("csv");
$("btn-export-excel").onclick = () => exportResults("excel");
$("btn-export-json").onclick = () => exportResults("json");

/* ── wire up remaining controls ───────────────────────────── */
$("btn-add-sitemap").onclick = addSitemap;
$("sitemap-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addSitemap();
});
$("btn-clear-sitemaps").onclick = async () => {
  const r = await fetch("/api/sitemaps", { method: "DELETE" });
  renderSitemaps((await r.json()).sitemaps || []);
};
$("btn-save-config").onclick = saveConfig;
$("btn-save-settings").onclick = saveSettings;
$("btn-add-schedule").onclick = addSchedule;
$("sch-type").onchange = updateSchedFields;
$("btn-test-alert").onclick = testAlert;
$("btn-change-pw").onclick = changePassword;
$("btn-load-urls").onclick = loadCustomUrls;

/* ── init: restore previous results if the server has some ── */
(async function init() {
  updateSchedFields();
  // sensible default for the one-time picker: tomorrow 09:00
  const d = new Date(Date.now() + 86400000);
  $("sch-datetime").value =
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T09:00`;
  $("sch-datetime").min = new Date().toISOString().slice(0, 16);
  await loadConfig();
  await loadSettings();
  await loadSchedules();
  await loadSitemaps();
  const data = await (await fetch("/api/results")).json();
  if (data.results?.length) {
    results = data.results;
    renderAll();
    setStatus(`Loaded ${results.length} results from the last run.`);
    setRunning(false);
  }
  if (data.total_urls > 0) $("btn-check").disabled = false;
})();
