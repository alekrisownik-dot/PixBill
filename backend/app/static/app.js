"use strict";

const $view = document.getElementById("view");
const $title = document.getElementById("title");
const $back = document.getElementById("back");
const $tabbar = document.getElementById("tabbar");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ICONS = {
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  upload: '<path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  offline: '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.8"/><path d="M19 12.9a10 10 0 0 0-2.2-1.6"/><path d="M2 8.8a15 15 0 0 1 4.2-2.7"/><path d="M22 8.8a15 15 0 0 0-11.3-3.7"/><path d="M12 20h.01"/>',
  receipt: '<path d="M5 3v18l2.3-1.5L9.7 21l2.3-1.5 2.3 1.5 2.4-1.5L19 21V3l-2.3 1.5L14.3 3 12 4.5 9.7 3 7.3 4.5z"/><path d="M9 9h6M9 13h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const money = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
const fmt = (grosze) => money.format((grosze || 0) / 100);

function toGrosze(text) {
  const clean = String(text).replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(parseFloat(clean) * 100);
}
function toGroszeSigned(text) {
  const clean = String(text).replace(/\s/g, "").replace(",", ".").replace("−", "-");
  if (!/^-?\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(parseFloat(clean) * 100);
}
const fromGrosze = (g) => (g == null ? "" : (g / 100).toFixed(2).replace(".", ","));

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => today().slice(0, 7);
function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const i = y * 12 + (m - 1) + delta;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}
function monthName(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
}
const shortMonth = (month) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pl-PL", { month: "short" });
};
const dayLabel = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" });

function change(pct, grosze) {
  if (pct == null) return grosze > 0 ? `<span class="muted">nowe w tym miesiącu</span>` : "";
  if (pct === 0) return `<span class="muted">bez zmian</span>`;
  const cls = pct > 0 ? "up" : "down";
  const arrow = pct > 0 ? "▲" : "▼";
  return `<span class="delta ${cls}">${arrow} ${Math.abs(pct)}% · ${pct > 0 ? "+" : "−"}${fmt(Math.abs(grosze))}</span>`;
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("show");
    toastTimer = setTimeout(() => (el.hidden = true), 250);
  }, 2500);
}

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function animateIn(direction = "fade") {
  if (reduceMotion) return;
  const items = [...$view.children];
  items.forEach((el, i) => el.style.setProperty("--i", Math.min(i, 8)));
  $view.querySelectorAll(".list li").forEach((li, j) => li.style.setProperty("--j", Math.min(j, 10)));
  $view.classList.remove("enter", "from-right", "from-left", "from-fade");
  void $view.offsetWidth;
  $view.classList.add("enter", `from-${direction === "forward" ? "right" : direction === "back" ? "left" : "fade"}`);
  countUp();
}

const lastCounts = {};
function countUp() {
  $view.querySelectorAll("[data-count]").forEach((el) => {
    const target = Number(el.dataset.count);
    const key = el.dataset.key || "x";
    const from = lastCounts[key] ?? 0;
    lastCounts[key] = target;
    if (reduceMotion || from === target) return;
    const start = performance.now();
    const duration = 750;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(Math.round(from + (target - from) * eased));
      if (t < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

class AuthError extends Error {}
class OfflineError extends Error {
  constructor() {
    super("Brak połączenia z serwerem");
  }
}

const offline = { active: false, since: null };
function setOffline(isOffline, cachedAt = null) {
  offline.active = isOffline;
  offline.since = cachedAt;
  const pill = document.getElementById("net");
  if (pill) pill.hidden = !isOffline;
}

function cacheGet(path) {
  try {
    return JSON.parse(localStorage.getItem("api:" + path));
  } catch {
    return null;
  }
}
function cachePut(path, data) {
  try {
    const text = JSON.stringify({ at: Date.now(), data });
    if (text.length < 300000) localStorage.setItem("api:" + path, text);
  } catch {}
}

async function api(path, { method = "GET", body, form } = {}) {
  const opts = { method, credentials: "same-origin", headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), form ? 60000 : 8000);
  opts.signal = controller.signal;
  let res;
  try {
    res = await fetch(path, opts);
    if ([502, 503, 504].includes(res.status)) throw new OfflineError();
  } catch (err) {
    if (err instanceof AuthError) throw err;
    const cached = method === "GET" ? cacheGet(path) : null;
    if (cached) {
      setOffline(true, cached.at);
      return cached.data;
    }
    setOffline(true);
    throw new OfflineError();
  } finally {
    clearTimeout(timer);
  }
  if (offline.active) {
    setOffline(false);
    syncOutbox();
  }
  if (res.status === 401 && path !== "/api/login") throw new AuthError();
  if (!res.ok) {
    let detail = `Błąd ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
      else if (Array.isArray(data.detail)) detail = "Sprawdź wpisane dane";
    } catch {}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  const data = await res.json();
  if (method === "GET") cachePut(path, data);
  return data;
}

const newClientId = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

let dbPromise = null;
function outboxDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("pixbill", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("outbox", { keyPath: "client_id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function outboxTx(mode, fn) {
  const db = await outboxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox", mode);
    const result = fn(tx.objectStore("outbox"));
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
  });
}
const outboxAdd = (item) => outboxTx("readwrite", (s) => s.put({ created_at: Date.now(), ...item }));
const outboxDelete = (id) => outboxTx("readwrite", (s) => s.delete(id));
async function outboxAll() {
  try {
    const items = await outboxTx("readonly", (s) => s.getAll());
    return items.sort((a, b) => a.created_at - b.created_at);
  } catch {
    return [];
  }
}

async function sendOutboxItem(item) {
  if (item.kind === "expense") {
    await api("/api/expenses", { method: "POST", body: { ...item.body, client_id: item.client_id } });
  } else if (item.kind === "receipt") {
    const form = new FormData();
    form.append("file", item.blob, item.name || "paragon.jpg");
    form.append("client_id", item.client_id);
    await api("/api/receipts", { method: "POST", form });
  }
}

let syncing = false;
async function syncOutbox({ manual = false } = {}) {
  if (syncing) return;
  syncing = true;
  let sent = 0;
  try {
    for (const item of await outboxAll()) {
      try {
        await sendOutboxItem(item);
        await outboxDelete(item.client_id);
        sent++;
      } catch (err) {
        if (err instanceof OfflineError || err instanceof AuthError) break;
        await outboxAdd({ ...item, error: err.message });
      }
    }
  } finally {
    syncing = false;
  }
  if (sent) {
    toast(`Wysłano zapisane offline: ${sent}`);
    if (["#/", "", "#/expenses", "#/outbox"].includes(location.hash)) route();
  } else if (manual && offline.active) {
    toast("Nadal brak połączenia z serwerem");
  }
  updateOutboxBadge();
}

async function updateOutboxBadge() {
  const count = (await outboxAll()).length;
  const add = document.querySelector('.tabbar a.add');
  if (add) add.dataset.pending = count || "";
}

window.addEventListener("online", () => syncOutbox());
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && syncOutbox());
setInterval(async () => {
  if ((await outboxAll()).length) syncOutbox();
}, 30000);

let categoriesCache = null;
async function categories(force = false) {
  if (!categoriesCache || force) categoriesCache = await api("/api/categories?include_archived=true");
  return categoriesCache;
}
const activeCategories = async () => (await categories()).filter((c) => !c.archived);
const categoryById = async (id) => (await categories()).find((c) => c.id === id);

let charts = [];
function destroyCharts() {
  charts.forEach((c) => c.destroy());
  charts = [];
}
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

if (window.Chart) {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.animation = reduceMotion ? false : { duration: 900, easing: "easeOutQuart" };
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.displayColors = false;
}

const stagger = (ctx) =>
  ctx.type === "data" && ctx.mode === "default" ? ctx.dataIndex * 70 + ctx.datasetIndex * 140 : 0;

const donutCenter = {
  id: "donutCenter",
  afterDraw(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const active = chart.getActiveElements()[0];
    const data = chart.data.datasets[0].data;
    const total = data.reduce((a, b) => a + b, 0);
    const label = active ? chart.data.labels[active.index] : "Razem";
    const value = active ? data[active.index] : total;
    const share = active && total ? ` · ${Math.round((value / total) * 100)}%` : "";
    const x = (chartArea.left + chartArea.right) / 2;
    const y = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = cssVar("--muted");
    ctx.font = `500 13px ${Chart.defaults.font.family}`;
    ctx.fillText(label + share, x, y - 14);
    ctx.fillStyle = cssVar("--text");
    ctx.font = `600 20px ${cssVar("--font-num")}`;
    ctx.fillText(fmt(value), x, y + 10);
    ctx.restore();
  },
};

function donut(canvas, labels, values, colors) {
  charts.push(
    new Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors, borderColor: cssVar("--card"), borderWidth: 3, borderRadius: 6, hoverOffset: 12 }],
      },
      options: {
        maintainAspectRatio: false,
        cutout: "66%",
        layout: { padding: 8 },
        animation: reduceMotion ? false : { animateRotate: true, animateScale: true, duration: 1100, easing: "easeOutQuart" },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        onHover: (e, els, chart) => requestAnimationFrame(() => chart.draw()),
      },
      plugins: [donutCenter],
    })
  );
}

function bars(canvas, labels, datasets) {
  charts.push(
    new Chart(canvas, {
      type: "bar",
      data: { labels, datasets },
      options: {
        maintainAspectRatio: false,
        animation: reduceMotion ? false : { delay: stagger, duration: 700, easing: "easeOutBack" },
        plugins: {
          legend: { display: datasets.length > 1, labels: { color: cssVar("--muted") } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.raw)}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: cssVar("--muted") } },
          y: {
            grid: { color: cssVar("--line") },
            ticks: { color: cssVar("--muted"), callback: (v) => `${Math.round(v / 100)} zł` },
          },
        },
      },
    })
  );
}

const state = { month: thisMonth() };

function monthSwitch(month, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "month-switch";
  wrap.innerHTML = `<button aria-label="Poprzedni miesiąc">${icon("left")}</button><strong>${esc(monthName(month))}</strong><button aria-label="Następny miesiąc">${icon("right")}</button>`;
  const [prev, , next] = wrap.children;
  const switchTo = async (m, direction) => {
    destroyCharts();
    try {
      await onChange(m);
      animateIn(direction);
    } catch (err) {
      handleError(err);
    }
  };
  prev.onclick = () => switchTo(shiftMonth(month, -1), "back");
  next.onclick = () => switchTo(shiftMonth(month, 1), "forward");
  next.disabled = month >= thisMonth();
  return wrap;
}

function expenseRow(e, cat) {
  const label = e.description || e.merchant || cat?.name || "Wydatek";
  const sub = [dayLabel(e.spent_on), cat?.name, { receipt: "paragon", recurring: "opłata stała" }[e.source]].filter(Boolean).join(" · ");
  return `<li><a href="#/expense/${e.id}">
    <span class="dot" style="background:${esc(cat?.color || "#999")}"></span>
    <span class="grow"><div class="t">${esc(label)}</div><div class="small muted">${esc(sub)}</div></span>
    <span class="amount">${fmt(e.amount_grosze)}</span></a></li>`;
}

async function viewLogin() {
  setChrome("PixBill", { tabbar: false });
  $view.innerHTML = `<form class="login">
      <img src="/icons/icon-192.png" alt="">
      <h2>PixBill</h2>
      <p class="muted">Domowe wydatki z paragonów</p>
      <label for="pw">Hasło</label>
      <input id="pw" type="password" autocomplete="current-password" required>
      <button class="btn primary">Zaloguj</button>
    </form>`;
  const form = $view.querySelector("form");
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await api("/api/login", { method: "POST", body: { password: form.pw.value } });
      location.hash = "#/";
    } catch (err) {
      toast(err.message);
    }
  };
  form.pw.focus();
}

async function viewDashboard() {
  setChrome("Pulpit");
  const month = state.month;
  const [summary, trend, expenses, pending, cats, products] = await Promise.all([
    api(`/api/stats/month?month=${month}`),
    api(`/api/stats/trend?months=6&until=${month}`),
    api(`/api/expenses?month=${month}`),
    api(`/api/receipts?status=processed`).then(async (p) => p.concat(await api(`/api/receipts?status=failed`), await api(`/api/receipts?status=pending`))),
    categories(),
    api(`/api/products?month=${month}&limit=5`).catch(() => []),
  ]);
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));

  $view.innerHTML = "";
  $view.append(monthSwitch(month, (m) => ((state.month = m), viewDashboard())));

  const toCheck = pending.filter((r) => r.status !== "pending").length;
  const reading = pending.length - toCheck;
  if (pending.length) {
    $view.insertAdjacentHTML(
      "beforeend",
      `<a class="banner" href="#/receipts">${icon(toCheck ? "receipt" : "clock")}<span>${toCheck ? `Paragony do sprawdzenia: ${toCheck}` : ""}${
        toCheck && reading ? " · " : ""
      }${reading ? `Odczytywane: ${reading}` : ""}</span><span class="chev">${icon("right")}</span></a>`
    );
  }

  const queued = await outboxAll();
  if (queued.length) {
    $view.insertAdjacentHTML(
      "beforeend",
      `<a class="banner outbox" href="#/outbox">${icon("upload")}<span>Czeka na wysłanie: ${queued.length}<span class="small muted"> · trafi do statystyk po wysłaniu</span></span><span class="chev">${icon("right")}</span></a>`
    );
  }
  if (offline.active) $view.insertAdjacentHTML("beforeend", offlineNote());

  const withSpend = summary.categories.filter((c) => c.total_grosze > 0);
  $view.insertAdjacentHTML(
    "beforeend",
    `<section class="card receipt">
      <div class="receipt-head"><span>Suma PLN</span><span>${esc(monthName(month))}</span></div>
      <div class="big" data-count="${summary.total_grosze}" data-key="month-total">${fmt(summary.total_grosze)}</div>
      <div class="receipt-foot">${summary.previous_total_grosze ? change(summary.change_percent, summary.change_grosze) + ` <span class="muted small">względem: ${esc(monthName(summary.previous_month))}</span>` : `<span class="muted small">Brak danych z poprzedniego miesiąca</span>`}</div>
    </section>
    <section class="card">
      <h2>Podział na sekcje</h2>
      ${withSpend.length ? `<div class="chart-box"><canvas id="pie"></canvas></div>` : `<div class="empty">Brak wydatków w tym miesiącu</div>`}
      <ul class="list">${summary.categories
        .map(
          (c) => `<li><a href="#/category/${c.category_id}">
            <span class="dot" style="background:${esc(c.color)}"></span>
            <span class="grow"><div class="t">${esc(c.name)}</div><div class="small">${change(c.change_percent, c.change_grosze)}</div>
              <div class="share"><i style="--w:${summary.total_grosze ? (c.total_grosze / summary.total_grosze) * 100 : 0}%;background:${esc(c.color)}"></i></div></span>
            <span class="amount">${fmt(c.total_grosze)}<div class="small muted">${summary.total_grosze ? Math.round((c.total_grosze / summary.total_grosze) * 100) : 0}%</div></span>
          </a></li>`
        )
        .join("")}</ul>
    </section>
    <section class="card">
      <h2>Ostatnie 6 miesięcy</h2>
      <div class="chart-box bar"><canvas id="trend"></canvas></div>
    </section>
    ${products.length ? `<section class="card">
      <h2>Najwięcej wydane na produkty</h2>
      <ul class="list">${products.map(productRow).join("")}</ul>
      <a class="btn" href="#/products">Wszystkie produkty</a>
    </section>` : ""}
    <section class="card">
      <h2>Ostatnie wydatki</h2>
      ${expenses.length ? `<ul class="list">${expenses.slice(0, 5).map((e) => expenseRow(e, catMap[e.category_id])).join("")}</ul>
        <a class="btn" href="#/expenses">Wszystkie wydatki</a>` : `<div class="empty">Dodaj pierwszy wydatek przyciskiem +</div>`}
    </section>`
  );

  if (withSpend.length) {
    donut(
      document.getElementById("pie"),
      withSpend.map((c) => c.name),
      withSpend.map((c) => c.total_grosze),
      withSpend.map((c) => c.color)
    );
  }
  bars(
    document.getElementById("trend"),
    trend.map((p) => shortMonth(p.month)),
    [{ label: "Suma", data: trend.map((p) => p.total_grosze), backgroundColor: cssVar("--accent"), borderRadius: 6 }]
  );
}

async function viewExpenses() {
  setChrome("Wydatki");
  const month = state.month;
  const catFilter = state.expenseCategory ?? null;
  const [expenses, cats] = await Promise.all([
    api(`/api/expenses?month=${month}${catFilter ? `&category_id=${catFilter}` : ""}`),
    categories(),
  ]);
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));
  const total = expenses.reduce((s, e) => s + e.amount_grosze, 0);

  $view.innerHTML = `<a class="search-field" href="#/search">${icon("search")}<span>Szukaj: sklep, opis, produkt…</span></a>`;
  $view.append(monthSwitch(month, (m) => ((state.month = m), viewExpenses())));
  $view.insertAdjacentHTML(
    "beforeend",
    `<div class="chips" style="margin-bottom:12px">
      <button class="chip" data-cat="" aria-pressed="${!catFilter}">Wszystkie</button>
      ${cats.filter((c) => !c.archived).map((c) => `<button class="chip" data-cat="${c.id}" aria-pressed="${catFilter === c.id}"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</button>`).join("")}
    </div>
    <section class="card">
      <h2>${expenses.length} wydatków · ${fmt(total)}</h2>
      ${queuedRows(await outboxAll(), month, catFilter, catMap)}
      ${expenses.length ? `<ul class="list">${expenses.map((e) => expenseRow(e, catMap[e.category_id])).join("")}</ul>` : `<div class="empty">Nic tu nie ma</div>`}
    </section>`
  );
  $view.querySelectorAll(".chip").forEach((b) => {
    b.onclick = () => {
      state.expenseCategory = b.dataset.cat ? Number(b.dataset.cat) : null;
      viewExpenses();
    };
  });
}

async function viewAdd() {
  setChrome("Dodaj wydatek");
  $view.innerHTML = `
    <div class="actions">
      <label class="action primary" for="photo"><span class="ic">${icon("camera")}</span><span><b>Zrób zdjęcie paragonu</b><span class="sub">Kwotę, sklep i datę odczytam sam</span></span></label>
      <input id="photo" type="file" accept="image/*" capture="environment" hidden>
      <label class="action" for="gallery"><span class="ic">${icon("image")}</span><span><b>Zdjęcie z galerii</b><span class="sub">Paragon sfotografowany wcześniej</span></span></label>
      <input id="gallery" type="file" accept="image/*" hidden>
      <a class="action" href="#/new"><span class="ic">${icon("pencil")}</span><span><b>Wpisz ręcznie</b><span class="sub">Kwota, opis i sekcja</span></span></a>
      <a class="action" href="#/recurring/new"><span class="ic">${icon("repeat")}</span><span><b>Opłata stała</b><span class="sub">Czynsz, internet, abonament: co miesiąc</span></span></a>
    </div>
    <p class="small muted hint">Paragon odczyta się w tle, więc możesz od razu robić zdjęcia kolejnych.</p>`;
  const upload = async (input) => {
    const file = input.files[0];
    if (!file) return;
    const client_id = newClientId();
    const form = new FormData();
    form.append("file", file);
    form.append("client_id", client_id);
    $view.innerHTML = `<div class="card empty"><div class="spinner"></div>Wysyłam zdjęcie…</div>`;
    try {
      const r = await api("/api/receipts", { method: "POST", form });
      location.hash = `#/receipt/${r.id}`;
    } catch (err) {
      if (err instanceof OfflineError) {
        await outboxAdd({ client_id, kind: "receipt", blob: file, name: file.name, type: file.type });
        updateOutboxBadge();
        toast("Brak połączenia. Zdjęcie czeka w telefonie, wyślę je po połączeniu.");
        location.hash = "#/";
        return;
      }
      toast(err.message);
      viewAdd();
    }
  };
  document.getElementById("photo").onchange = (e) => upload(e.target);
  document.getElementById("gallery").onchange = (e) => upload(e.target);
}

async function expenseForm({ initial = {}, submitLabel, onSubmit, extraButtons = "" }) {
  const cats = await activeCategories();
  const selected = initial.category_id ?? null;
  const items = (initial.items || []).filter((i) => i.name);
  const html = `<form class="card" id="ef" novalidate>
      <label for="amount">Kwota (zł)</label>
      <input id="amount" inputmode="decimal" placeholder="0,00" value="${esc(fromGrosze(initial.amount_grosze))}" required>
      <label>Sekcja</label>
      <div class="chips" id="cats">${cats
        .map((c) => `<button type="button" class="chip" data-id="${c.id}" aria-pressed="${c.id === selected}"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</button>`)
        .join("")}</div>
      <label for="description">Opis</label>
      <input id="description" maxlength="500" placeholder="np. zakupy na weekend" value="${esc(initial.description || "")}">
      <div class="row2">
        <div><label for="spent_on">Data</label><input id="spent_on" type="date" value="${esc(initial.spent_on || today())}" required></div>
        <div><label for="merchant">Sklep</label><input id="merchant" maxlength="200" value="${esc(initial.merchant || "")}"></div>
      </div>
      <details class="items"${items.length ? " open" : ""}>
        <summary><span>Pozycje z paragonu</span><span class="small muted" id="items-sum"></span></summary>
        <ul class="item-rows" id="item-rows"></ul>
        <button type="button" class="btn small-btn" id="add-item">${icon("plus")} Dodaj pozycję</button>
      </details>
      <p></p>
      <button class="btn primary">${esc(submitLabel)}</button>
      ${extraButtons}
    </form>`;
  return {
    html,
    bind() {
      const form = document.getElementById("ef");
      let categoryId = selected;
      form.querySelectorAll("#cats .chip").forEach((chip) => {
        chip.onclick = () => {
          categoryId = Number(chip.dataset.id);
          form.querySelectorAll("#cats .chip").forEach((c) => c.setAttribute("aria-pressed", c === chip));
        };
      });
      const rows = form.querySelector("#item-rows");
      const sumEl = form.querySelector("#items-sum");
      const addRow = (item = {}) => {
        const li = document.createElement("li");
        li.innerHTML = `<input class="i-name" maxlength="200" placeholder="Produkt" value="${esc(item.name || "")}">
          <input class="i-price" inputmode="decimal" placeholder="0,00" value="${esc(fromGrosze(item.price_grosze))}">
          <button type="button" class="icon-btn i-del" aria-label="Usuń pozycję">${icon("x")}</button>`;
        li.querySelector(".i-del").onclick = () => (li.remove(), updateSum());
        rows.append(li);
        return li;
      };
      const readItems = () =>
        [...rows.children]
          .map((li) => ({ name: li.querySelector(".i-name").value.trim(), price: li.querySelector(".i-price").value }))
          .filter((i) => i.name || i.price.trim());
      const updateSum = () => {
        const list = readItems();
        if (!list.length) return (sumEl.textContent = "opcjonalnie");
        const sum = list.reduce((s, i) => s + (toGroszeSigned(i.price) || 0), 0);
        const amount = toGrosze(form.amount.value);
        const diff = amount ? amount - sum : 0;
        sumEl.innerHTML = `${list.length} · ${fmt(sum)}${diff ? ` <span class="warn-text">(różnica ${fmt(diff)})</span>` : ""}`;
      };
      items.forEach(addRow);
      form.querySelector("#add-item").onclick = () => (addRow().querySelector(".i-name").focus(), updateSum());
      rows.addEventListener("input", updateSum);
      form.amount.addEventListener("input", updateSum);
      updateSum();

      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const amount = toGrosze(form.amount.value);
        if (!amount) return toast("Wpisz poprawną kwotę, np. 45,99");
        const itemList = readItems();
        const bad = itemList.find((i) => !i.name || toGroszeSigned(i.price) == null);
        if (bad) return toast(`Popraw pozycję „${bad.name || "bez nazwy"}”: potrzebna nazwa i cena, np. 6,99`);
        if (!categoryId) return toast("Wybierz sekcję");
        if (!form.spent_on.value) return toast("Wybierz datę");
        const btn = form.querySelector(".btn.primary");
        btn.disabled = true;
        try {
          await onSubmit({
            amount_grosze: amount,
            category_id: categoryId,
            description: form.description.value.trim(),
            spent_on: form.spent_on.value,
            merchant: form.merchant.value.trim() || null,
            items: itemList.map((i) => ({ name: i.name, price_grosze: toGroszeSigned(i.price) })),
          });
        } catch (err) {
          if (err instanceof AuthError) throw err;
          toast(err.message);
          btn.disabled = false;
        }
      };
      return form;
    },
  };
}

async function viewNewExpense() {
  setChrome("Ręczny wpis", { back: "#/add" });
  const f = await expenseForm({
    submitLabel: "Zapisz wydatek",
    onSubmit: async (data) => {
      const client_id = newClientId();
      try {
        await api("/api/expenses", { method: "POST", body: { ...data, client_id } });
        toast("Zapisano");
      } catch (err) {
        if (!(err instanceof OfflineError)) throw err;
        await outboxAdd({ client_id, kind: "expense", body: data });
        updateOutboxBadge();
        toast("Brak połączenia. Zapisano w telefonie, wyślę po połączeniu.");
      }
      location.hash = "#/";
    },
  });
  $view.innerHTML = f.html;
  f.bind().amount.focus();
}

async function viewExpense(id) {
  setChrome("Wydatek", { back: "#/expenses" });
  const expense = await api(`/api/expenses/${id}`);
  const receipt = expense.receipt_id ? await api(`/api/receipts/${expense.receipt_id}`) : null;
  const f = await expenseForm({
    initial: expense,
    submitLabel: "Zapisz zmiany",
    extraButtons: `<button type="button" class="btn danger" id="del">Usuń wydatek</button>`,
    onSubmit: async (data) => {
      await api(`/api/expenses/${id}`, { method: "PATCH", body: data });
      toast("Zapisano");
      history.back();
    },
  });
  $view.innerHTML = f.html + (receipt ? receiptPhotoCard(receipt) : "");
  f.bind();
  document.getElementById("del").onclick = async () => {
    if (!confirm("Usunąć ten wydatek?")) return;
    await api(`/api/expenses/${id}`, { method: "DELETE" });
    toast("Usunięto");
    location.hash = "#/expenses";
  };
}

function receiptPhotoCard(r, scanning = false) {
  if (!r.has_photo) {
    return `<section class="card"><h2>Zdjęcie paragonu</h2><div class="small muted">Zdjęcie usunięte ${r.photo_deleted_at ? dayLabel(r.photo_deleted_at.slice(0, 10)) : ""}. Dane zostały zapisane.</div></section>`;
  }
  let note = "";
  if (r.photo_delete_after) {
    const days = Math.max(0, Math.ceil((new Date(r.photo_delete_after) - new Date()) / 86400000));
    note = `<div class="small muted" style="margin-top:8px">Zdjęcie zostanie usunięte za ${days} ${days === 1 ? "dzień" : "dni"}.</div>`;
  }
  return `<section class="card"><h2>Zdjęcie paragonu</h2><div class="scan${scanning ? " active" : ""}"><img class="receipt-photo" src="/api/receipts/${r.id}/photo" alt="Zdjęcie paragonu"></div>${note}</section>`;
}

async function viewReceipts() {
  setChrome("Paragony", { back: "#/" });
  const all = await api("/api/receipts");
  const open = all.filter((r) => r.status !== "confirmed");
  const label = { pending: "Odczytywanie…", processed: "Do sprawdzenia", failed: "Nie udało się odczytać" };
  $view.innerHTML = `<section class="card"><h2>Do sprawdzenia</h2>${
    open.length
      ? `<ul class="list">${open
          .map(
            (r) => `<li><a href="#/receipt/${r.id}">
              <span class="grow"><div class="t">${esc(r.ocr_result?.merchant || "Paragon")}</div>
              <div class="small muted">${esc(label[r.status])} · wgrany ${dayLabel(r.uploaded_at.slice(0, 10))}</div></span>
              <span class="amount">${r.ocr_result?.total_grosze ? fmt(r.ocr_result.total_grosze) : ""}</span></a></li>`
          )
          .join("")}</ul>`
      : `<div class="empty">${icon("check")}<p>Wszystkie paragony sprawdzone</p></div>`
  }</section>`;
}

let pollTimer;
async function viewReceipt(id) {
  setChrome("Sprawdź paragon", { back: "#/receipts" });
  const r = await api(`/api/receipts/${id}`);

  if (r.status === "confirmed") {
    location.hash = r.expense_id ? `#/expense/${r.expense_id}` : "#/receipts";
    return;
  }
  if (r.status === "pending") {
    $view.innerHTML = `<section class="card empty"><div class="spinner"></div>Odczytuję paragon…<div class="small">Na laptopie z kartą graficzną trwa to zwykle kilka–kilkanaście sekund. Możesz wyjść, paragon poczeka na liście.</div></section>${receiptPhotoCard(r, true)}`;
    pollTimer = setTimeout(() => {
      if (location.hash === `#/receipt/${id}`) viewReceipt(id).catch(handleError);
    }, 3000);
    return;
  }

  const ocr = r.ocr_result || {};
  const failed = r.status === "failed";
  const f = await expenseForm({
    initial: {
      amount_grosze: ocr.total_grosze,
      spent_on: ocr.date || today(),
      merchant: ocr.merchant,
      category_id: ocr.suggested_category_id,
      description: "",
      items: ocr.items || [],
    },
    submitLabel: "Zatwierdź i zapisz",
    extraButtons: `${failed ? `<button type="button" class="btn" id="retry">Spróbuj odczytać ponownie</button>` : ""}
      <button type="button" class="btn danger" id="discard">Odrzuć paragon</button>`,
    onSubmit: async (data) => {
      await api(`/api/receipts/${id}/confirm`, { method: "POST", body: data });
      toast("Zapisano. Zdjęcie zostanie usunięte za 10 dni.");
      location.hash = "#/";
    },
  });

  $view.innerHTML =
    (failed ? `<div class="banner">Nie udało się odczytać paragonu. Wpisz dane ręcznie albo spróbuj ponownie.</div>` : `<p class="small muted">Sprawdź odczytane dane i pozycje. Popraw, jeśli coś się nie zgadza.</p>`) +
    f.html +
    receiptPhotoCard(r);
  f.bind();

  document.getElementById("discard").onclick = async () => {
    if (!confirm("Odrzucić paragon? Zdjęcie zostanie usunięte od razu.")) return;
    await api(`/api/receipts/${id}`, { method: "DELETE" });
    toast("Odrzucono");
    location.hash = "#/receipts";
  };
  const retry = document.getElementById("retry");
  if (retry) {
    retry.onclick = async () => {
      await api(`/api/receipts/${id}/retry`, { method: "POST" });
      viewReceipt(id);
    };
  }
}

async function viewCategories() {
  setChrome("Sekcje");
  const month = state.month;
  const summary = await api(`/api/stats/month?month=${month}`);
  const cats = await activeCategories();
  const byId = Object.fromEntries(summary.categories.map((c) => [c.category_id, c]));

  $view.innerHTML = "";
  $view.append(monthSwitch(month, (m) => ((state.month = m), viewCategories())));
  $view.insertAdjacentHTML(
    "beforeend",
    `<section class="card"><h2>Porównanie z: ${esc(monthName(summary.previous_month))}</h2>
      <div class="chart-box bar" style="height:${Math.max(200, summary.categories.length * 44)}px"><canvas id="cmp"></canvas></div>
    </section>
    <section class="card"><ul class="list">${cats
      .map((c) => {
        const s = byId[c.id];
        return `<li><a href="#/category/${c.id}">
          <span class="dot" style="background:${esc(c.color)}"></span>
          <span class="grow"><div class="t">${esc(c.name)}</div><div class="small">${s ? change(s.change_percent, s.change_grosze) : `<span class="muted">brak wydatków</span>`}</div></span>
          <span class="amount">${fmt(s?.total_grosze || 0)}</span></a></li>`;
      })
      .join("")}</ul></section>`
  );

  if (summary.categories.length) {
    const rows = summary.categories;
    charts.push(
      new Chart(document.getElementById("cmp"), {
        type: "bar",
        data: {
          labels: rows.map((c) => c.name),
          datasets: [
            { label: shortMonth(summary.previous_month), data: rows.map((c) => c.previous_grosze), backgroundColor: "rgba(140,147,160,0.45)", borderRadius: 4 },
            { label: shortMonth(month), data: rows.map((c) => c.total_grosze), backgroundColor: rows.map((c) => c.color), borderRadius: 4 },
          ],
        },
        options: {
          indexAxis: "y",
          maintainAspectRatio: false,
          animation: reduceMotion ? false : { delay: stagger, duration: 700, easing: "easeOutQuart" },
          plugins: {
            legend: { labels: { color: cssVar("--muted") } },
            tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.raw)}` } },
          },
          scales: {
            x: { grid: { color: cssVar("--line") }, ticks: { color: cssVar("--muted"), callback: (v) => `${Math.round(v / 100)} zł` } },
            y: { grid: { display: false }, ticks: { color: cssVar("--text") } },
          },
        },
      })
    );
  } else {
    document.getElementById("cmp").parentElement.outerHTML = `<div class="empty">Brak wydatków w obu miesiącach</div>`;
  }
}

async function viewCategory(id) {
  const cat = await categoryById(id);
  if (!cat) throw new Error("Nie ma takiej sekcji");
  setChrome(cat.name, { back: "#/categories" });
  const month = state.month;
  const [trend, expenses] = await Promise.all([
    api(`/api/stats/trend?months=12&until=${month}&category_id=${id}`),
    api(`/api/expenses?month=${month}&category_id=${id}`),
  ]);
  const total = expenses.reduce((s, e) => s + e.amount_grosze, 0);
  const prev = trend.length > 1 ? trend[trend.length - 2].total_grosze : 0;
  const nonZero = trend.filter((p) => p.total_grosze > 0);
  const avg = nonZero.length ? Math.round(nonZero.reduce((s, p) => s + p.total_grosze, 0) / nonZero.length) : 0;

  $view.innerHTML = "";
  $view.append(monthSwitch(month, (m) => ((state.month = m), viewCategory(id))));
  $view.insertAdjacentHTML(
    "beforeend",
    `<section class="card">
      <h2>${esc(cat.name)} · ${esc(monthName(month))}</h2>
      <div class="big" data-count="${total}" data-key="cat-${id}">${fmt(total)}</div>
      <div class="small">${prev ? change(Math.round(((total - prev) / prev) * 1000) / 10, total - prev) : ""}</div>
      <div class="small muted">Średnio miesięcznie (gdy były wydatki): ${fmt(avg)}</div>
    </section>
    <section class="card"><h2>Ostatnie 12 miesięcy</h2><div class="chart-box bar"><canvas id="ct"></canvas></div></section>
    <section class="card"><h2>Wydatki</h2>${
      expenses.length ? `<ul class="list">${expenses.map((e) => expenseRow(e, cat)).join("")}</ul>` : `<div class="empty">Brak wydatków w tym miesiącu</div>`
    }</section>`
  );
  bars(
    document.getElementById("ct"),
    trend.map((p) => shortMonth(p.month)),
    [{ label: cat.name, data: trend.map((p) => p.total_grosze), backgroundColor: cat.color, borderRadius: 6 }]
  );
}

async function viewSettings() {
  setChrome("Ustawienia");
  const [cats, recurring] = await Promise.all([categories(true), api("/api/recurring")]);
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));
  const monthlyTotal = recurring.filter((r) => r.active).reduce((s, r) => s + r.amount_grosze, 0);
  $view.innerHTML = `<section class="card"><h2>Opłaty stałe${monthlyTotal ? ` · ${fmt(monthlyTotal)} / mies.` : ""}</h2>
      ${recurring.length ? `<ul class="list">${recurring
        .map((r) => {
          const c = catMap[r.category_id];
          return `<li><a href="#/recurring/${r.id}">
            <span class="dot" style="background:${esc(c?.color || "#999")}"></span>
            <span class="grow"><div class="t">${esc(r.description)}</div>
              <div class="small muted">${r.active ? `co miesiąc, ${r.day_of_month}. dnia` : "wstrzymana"} · ${esc(c?.name || "")}</div></span>
            <span class="amount">${fmt(r.amount_grosze)}</span></a></li>`;
        })
        .join("")}</ul>` : `<div class="small muted">Czynsz, internet, abonamenty: dodaj je raz, a aplikacja co miesiąc sama dopisze je do wydatków.</div><p></p>`}
      <a class="btn" href="#/recurring/new">+ Nowa opłata stała</a>
    </section>
    <section class="card"><h2>Sekcje</h2>
      <ul class="list">${cats
        .map(
          (c) => `<li><a href="#/edit-category/${c.id}">
            <span class="dot" style="background:${esc(c.color)}"></span>
            <span class="grow"><div class="t">${esc(c.name)}</div>${c.archived ? `<div class="small muted">ukryta</div>` : ""}</span>
            <span class="muted">›</span></a></li>`
        )
        .join("")}</ul>
      <a class="btn" href="#/edit-category/new">+ Nowa sekcja</a>
    </section>
    ${exportCard()}
    <section class="card"><h2>Instalacja na telefonie</h2>
      <div class="small muted">Android (Chrome): menu ⋮ → „Zainstaluj aplikację”.<br>iPhone (Safari): Udostępnij → „Do ekranu początkowego”.</div>
    </section>
    <button class="btn danger" id="logout">Wyloguj</button>`;
  bindExport();
  document.getElementById("logout").onclick = async () => {
    await api("/api/logout", { method: "POST" });
    categoriesCache = null;
    location.hash = "#/login";
  };
}

async function viewEditCategory(id) {
  const isNew = id === "new";
  const cat = isNew ? { name: "", color: "#607d8b", archived: false } : await categoryById(Number(id));
  if (!cat) throw new Error("Nie ma takiej sekcji");
  setChrome(isNew ? "Nowa sekcja" : "Edytuj sekcję", { back: "#/settings" });
  $view.innerHTML = `<form class="card" id="cf">
      <label for="name">Nazwa</label>
      <input id="name" maxlength="80" required value="${esc(cat.name)}">
      <label for="color">Kolor</label>
      <input id="color" type="color" value="${esc(cat.color)}">
      <p></p>
      <button class="btn primary">Zapisz</button>
      ${isNew ? "" : `<button type="button" class="btn" id="arch">${cat.archived ? "Przywróć sekcję" : "Ukryj sekcję"}</button>`}
    </form>
    ${isNew ? "" : `<p class="small muted">Ukryta sekcja nie pojawia się przy dodawaniu wydatków, ale jej dotychczasowe wydatki zostają w statystykach.</p>`}`;
  const form = document.getElementById("cf");
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const body = { name: form.name.value.trim(), color: form.color.value };
    if (!body.name) return toast("Wpisz nazwę");
    try {
      if (isNew) await api("/api/categories", { method: "POST", body: { ...body, position: (await categories()).length } });
      else await api(`/api/categories/${id}`, { method: "PATCH", body });
      await categories(true);
      toast("Zapisano");
      location.hash = "#/settings";
    } catch (err) {
      toast(err.message);
    }
  };
  const arch = document.getElementById("arch");
  if (arch) {
    arch.onclick = async () => {
      await api(`/api/categories/${id}`, { method: "PATCH", body: { archived: !cat.archived } });
      await categories(true);
      location.hash = "#/settings";
    };
  }
}

async function viewRecurring(id) {
  const isNew = id === "new";
  const item = isNew
    ? { description: "", amount_grosze: null, category_id: null, day_of_month: 1, active: true }
    : (await api("/api/recurring")).find((r) => r.id === id);
  if (!item) throw new Error("Nie ma takiej opłaty stałej");
  setChrome(isNew ? "Nowa opłata stała" : "Opłata stała", { back: "#/settings" });
  const cats = await activeCategories();
  $view.innerHTML = `<form class="card" id="rf" novalidate>
      <label for="description">Nazwa</label>
      <input id="description" maxlength="500" placeholder="np. Czynsz, Netflix, Internet" value="${esc(item.description)}" required>
      <div class="row2">
        <div><label for="amount">Kwota (zł)</label><input id="amount" inputmode="decimal" placeholder="0,00" value="${esc(fromGrosze(item.amount_grosze))}"></div>
        <div><label for="day">Dzień miesiąca</label><input id="day" type="number" min="1" max="28" inputmode="numeric" value="${item.day_of_month}"></div>
      </div>
      <label>Sekcja</label>
      <div class="chips" id="cats">${cats
        .map((c) => `<button type="button" class="chip" data-id="${c.id}" aria-pressed="${c.id === item.category_id}"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</button>`)
        .join("")}</div>
      <p class="small muted">${isNew
        ? "Opłata dopisze się do wydatków co miesiąc w wybranym dniu. Jeśli ten dzień już minął w tym miesiącu, dopisze się od razu."
        : "Zmiany dotyczą kolejnych miesięcy. Wydatki już dopisane możesz poprawić na liście wydatków (np. gdy rachunek był inny)."}</p>
      <button class="btn primary">Zapisz</button>
      ${isNew ? "" : `<button type="button" class="btn" id="toggle">${item.active ? "Wstrzymaj" : "Wznów"}</button>
        <button type="button" class="btn danger" id="del">Usuń opłatę stałą</button>`}
    </form>`;
  const form = document.getElementById("rf");
  let categoryId = item.category_id;
  form.querySelectorAll("#cats .chip").forEach((chip) => {
    chip.onclick = () => {
      categoryId = Number(chip.dataset.id);
      form.querySelectorAll("#cats .chip").forEach((c) => c.setAttribute("aria-pressed", c === chip));
    };
  });
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const amount = toGrosze(form.amount.value);
    const day = Number(form.day.value);
    if (!form.description.value.trim()) return toast("Wpisz nazwę");
    if (!amount) return toast("Wpisz poprawną kwotę, np. 43,00");
    if (!(day >= 1 && day <= 28)) return toast("Dzień miesiąca: od 1 do 28");
    if (!categoryId) return toast("Wybierz sekcję");
    const body = { description: form.description.value.trim(), amount_grosze: amount, day_of_month: day, category_id: categoryId };
    try {
      if (isNew) await api("/api/recurring", { method: "POST", body });
      else await api(`/api/recurring/${id}`, { method: "PATCH", body });
      toast("Zapisano");
      location.hash = "#/settings";
    } catch (err) {
      if (err instanceof AuthError) throw err;
      toast(err.message);
    }
  };
  if (!isNew) {
    document.getElementById("toggle").onclick = async () => {
      await api(`/api/recurring/${id}`, { method: "PATCH", body: { active: !item.active } });
      toast(item.active ? "Wstrzymano" : "Wznowiono");
      location.hash = "#/settings";
    };
    document.getElementById("del").onclick = async () => {
      if (!confirm("Usunąć opłatę stałą? Wydatki dopisane wcześniej zostaną w historii.")) return;
      await api(`/api/recurring/${id}`, { method: "DELETE" });
      toast("Usunięto");
      location.hash = "#/settings";
    };
  }
}

function offlineNote() {
  const when = offline.since
    ? new Date(offline.since).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;
  return `<div class="banner info">${icon("offline")}<span>Brak połączenia z serwerem.${when ? ` Pokazuję dane z ${esc(when)}.` : ""}</span></div>`;
}

function queuedRows(queued, month, categoryId, catMap) {
  const rows = queued.filter(
    (q) => q.kind === "expense" && q.body.spent_on.startsWith(month) && (!categoryId || q.body.category_id === categoryId)
  );
  if (!rows.length) return "";
  return `<ul class="list queued">${rows
    .map((q) => {
      const cat = catMap[q.body.category_id];
      return `<li><a href="#/outbox">
        <span class="dot" style="background:${esc(cat?.color || "#999")}"></span>
        <span class="grow"><div class="t">${esc(q.body.description || q.body.merchant || cat?.name || "Wydatek")}</div>
          <div class="small muted">${dayLabel(q.body.spent_on)} · czeka na wysłanie</div></span>
        <span class="amount">${fmt(q.body.amount_grosze)}</span></a></li>`;
    })
    .join("")}</ul>`;
}

let outboxUrls = [];
async function viewOutbox() {
  setChrome("Do wysłania", { back: "#/" });
  outboxUrls.forEach((u) => URL.revokeObjectURL(u));
  outboxUrls = [];
  const [queued, cats] = await Promise.all([outboxAll(), categories().catch(() => [])]);
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));
  $view.innerHTML = `<p class="small muted">Te zapisy są tylko w telefonie. Wyślą się same, gdy telefon połączy się z serwerem (Tailscale albo sieć domowa).</p>
    <section class="card">${
      queued.length
        ? `<ul class="list">${queued
            .map((q) => {
              let thumb = "", title, sub, amount = "";
              if (q.kind === "receipt") {
                const url = URL.createObjectURL(q.blob);
                outboxUrls.push(url);
                thumb = `<img class="thumb" src="${url}" alt="">`;
                title = "Zdjęcie paragonu";
                sub = "odczytam je po wysłaniu";
              } else {
                const cat = catMap[q.body.category_id];
                thumb = `<span class="dot" style="background:${esc(cat?.color || "#999")}"></span>`;
                title = q.body.description || q.body.merchant || cat?.name || "Wydatek";
                sub = `${dayLabel(q.body.spent_on)}${cat ? " · " + cat.name : ""}`;
                amount = fmt(q.body.amount_grosze);
              }
              const added = new Date(q.created_at).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
              return `<li>${thumb}
                <span class="grow"><div class="t">${esc(title)}</div>
                  <div class="small muted">${esc(sub)} · zapisano ${esc(added)}</div>
                  ${q.error ? `<div class="small up">Serwer odrzucił: ${esc(q.error)}</div>` : ""}</span>
                <span class="amount">${amount}</span>
                <button class="icon-btn small-x" data-del="${esc(q.client_id)}" aria-label="Usuń z kolejki">×</button></li>`;
            })
            .join("")}</ul>`
        : `<div class="empty">${icon("check")}<p>Wszystko wysłane</p></div>`
    }</section>
    ${queued.length ? `<button class="btn primary" id="sync">Wyślij teraz</button>` : ""}`;
  document.getElementById("sync")?.addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    ev.target.textContent = "Wysyłam…";
    await syncOutbox({ manual: true });
    viewOutbox().then(() => animateIn());
  });
  $view.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm("Usunąć ten zapis? Nie zostanie wysłany.")) return;
      await outboxDelete(b.dataset.del);
      updateOutboxBadge();
      viewOutbox();
    };
  });
}

function productRow(p) {
  return `<li><a href="#/product/${encodeURIComponent(p.product_key)}">
    <span class="grow"><div class="t">${esc(p.name)}</div><div class="small muted">${p.count}× · ostatnio ${fmt(p.last_price_grosze)}, ${dayLabel(p.last_date)}</div></span>
    <span class="amount">${fmt(p.total_grosze)}</span></a></li>`;
}

const foldText = (t) => t.replace(/ł/g, "l").replace(/Ł/g, "L").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function highlight(text, words) {
  const folded = foldText(text);
  const marks = new Array(text.length).fill(false);
  for (const w of words) {
    for (let i = folded.indexOf(w); i >= 0; i = folded.indexOf(w, i + 1)) marks.fill(true, i, i + w.length);
  }
  let out = "", open = false;
  for (let i = 0; i < text.length; i++) {
    if (marks[i] !== open) (out += marks[i] ? "<mark>" : "</mark>"), (open = marks[i]);
    out += esc(text[i]);
  }
  return out + (open ? "</mark>" : "");
}

let searchTimer;
async function viewSearch() {
  setChrome("Szukaj", { back: "#/expenses" });
  const cats = await categories();
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));
  $view.innerHTML = `<label class="search-field input">${icon("search")}<input id="q" type="search" placeholder="Sklep, opis, produkt…" value="${esc(state.search || "")}" autocomplete="off"></label>
    <div class="chips" id="range">
      ${[["", "Cały czas"], ["12", "Ostatni rok"], ["3", "3 miesiące"]].map(([v, l]) => `<button class="chip" data-v="${v}" aria-pressed="${(state.searchRange || "") === v}">${l}</button>`).join("")}
    </div>
    <div id="results"></div>`;
  const input = document.getElementById("q");
  const results = document.getElementById("results");
  const run = async () => {
    const q = input.value.trim();
    state.search = q;
    if (!q) {
      results.innerHTML = `<div class="empty small muted">Wpisz nazwę sklepu, opis albo produkt z paragonu, np. „masło” albo „orlen”.</div>`;
      return;
    }
    const params = new URLSearchParams({ q });
    if (state.searchRange) {
      const d = new Date();
      d.setMonth(d.getMonth() - Number(state.searchRange));
      params.set("date_from", d.toISOString().slice(0, 10));
    }
    try {
      const [found, products] = await Promise.all([
        api(`/api/expenses/search?${params}`),
        api(`/api/products?q=${encodeURIComponent(q)}&limit=5`).catch(() => []),
      ]);
      if (input.value.trim() !== q) return;
      const words = foldText(q).split(/\s+/).filter(Boolean);
      const total = found.reduce((s, e) => s + e.amount_grosze, 0);
      results.innerHTML =
        (products.length ? `<section class="card"><h2>Produkty</h2><ul class="list">${products.map(productRow).join("")}</ul></section>` : "") +
        `<section class="card"><h2>${found.length} ${found.length === 1 ? "wydatek" : "wydatków"} · ${fmt(total)}</h2>${
          found.length
            ? `<ul class="list">${found
                .map((e) => {
                  const cat = catMap[e.category_id];
                  const hits = e.items.filter((i) => words.some((w) => foldText(i.name).includes(w)));
                  const label = e.description || e.merchant || cat?.name || "Wydatek";
                  const sub = [new Date(e.spent_on + "T12:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" }), e.description && e.merchant ? e.merchant : null, cat?.name].filter(Boolean).join(" · ");
                  return `<li><a href="#/expense/${e.id}">
                    <span class="dot" style="background:${esc(cat?.color || "#999")}"></span>
                    <span class="grow"><div class="t">${highlight(label, words)}</div><div class="small muted">${highlight(sub, words)}</div>
                      ${hits.length ? `<div class="small hits">${hits.slice(0, 3).map((i) => `${highlight(i.name, words)} <span class="num">${fmt(i.price_grosze)}</span>`).join(" · ")}</div>` : ""}</span>
                    <span class="amount">${fmt(e.amount_grosze)}</span></a></li>`;
                })
                .join("")}</ul>`
            : `<div class="empty">Nic nie znalazłem</div>`
        }</section>`;
    } catch (err) {
      if (err instanceof OfflineError) results.innerHTML = `<div class="card empty small">Wyszukiwarka działa tylko z połączeniem z serwerem.</div>`;
      else handleError(err);
    }
  };
  input.oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(run, 250);
  };
  $view.querySelectorAll("#range .chip").forEach((b) => {
    b.onclick = () => {
      state.searchRange = b.dataset.v;
      $view.querySelectorAll("#range .chip").forEach((c) => c.setAttribute("aria-pressed", c === b));
      run();
    };
  });
  await run();
  input.focus();
}

async function viewProducts() {
  setChrome("Produkty", { back: "#/" });
  const month = state.productsAll ? null : state.month;
  const products = await api(`/api/products?limit=200${month ? `&month=${month}` : ""}`);
  $view.innerHTML = "";
  if (month) $view.append(monthSwitch(month, (m) => ((state.month = m), viewProducts())));
  $view.insertAdjacentHTML(
    "beforeend",
    `<div class="chips" style="margin-bottom:12px">
      <button class="chip" data-all="" aria-pressed="${!state.productsAll}">Wybrany miesiąc</button>
      <button class="chip" data-all="1" aria-pressed="${!!state.productsAll}">Cały czas</button>
    </div>
    <section class="card">${
      products.length
        ? `<h2>${products.length} produktów · ${fmt(products.reduce((s, p) => s + p.total_grosze, 0))}</h2><ul class="list">${products.map(productRow).join("")}</ul>`
        : `<div class="empty">${icon("tag")}<p>Brak pozycji z paragonów${month ? " w tym miesiącu" : ""}.</p><p class="small">Pozycje zapisują się przy zatwierdzaniu paragonu.</p></div>`
    }</section>`
  );
  $view.querySelectorAll("[data-all]").forEach((b) => {
    b.onclick = () => ((state.productsAll = !!b.dataset.all), viewProducts().then(() => animateIn("fade")));
  });
}

async function viewProduct(key) {
  key = decodeURIComponent(key);
  const history = await api(`/api/products/history?key=${encodeURIComponent(key)}`);
  if (!history.length) throw new Error("Nie ma takiego produktu");
  const last = history[history.length - 1];
  setChrome(last.name, { back: "#/products" });
  const prices = history.filter((h) => h.price_grosze > 0).map((h) => h.price_grosze);
  const first = prices[0], now = prices[prices.length - 1];
  const total = prices.reduce((a, b) => a + b, 0);
  $view.innerHTML = `<section class="card receipt">
      <div class="receipt-head"><span>Ostatnia cena</span><span>${esc(dayLabel(last.spent_on))}</span></div>
      <div class="big">${fmt(now)}</div>
      <div class="receipt-foot">${prices.length > 1 && first ? change(Math.round(((now - first) / first) * 1000) / 10, now - first) + ` <span class="muted small">od pierwszego zakupu</span>` : `<span class="muted small">Kupione raz</span>`}</div>
    </section>
    <section class="card stats3">
      <div><div class="small muted">Kupione</div><b class="num">${prices.length}×</b></div>
      <div><div class="small muted">Łącznie</div><b class="num">${fmt(total)}</b></div>
      <div><div class="small muted">Najtaniej</div><b class="num">${fmt(Math.min(...prices))}</b></div>
    </section>
    ${prices.length > 1 ? `<section class="card"><h2>Cena w czasie</h2><div class="chart-box bar"><canvas id="ph"></canvas></div></section>` : ""}
    <section class="card"><h2>Zakupy</h2><ul class="list">${history
      .slice()
      .reverse()
      .map(
        (h) => `<li><a href="#/expense/${h.expense_id}"><span class="grow"><div class="t">${esc(h.merchant || "Sklep")}</div><div class="small muted">${new Date(h.spent_on + "T12:00:00").toLocaleDateString("pl-PL")} · ${esc(h.name)}</div></span><span class="amount">${fmt(h.price_grosze)}</span></a></li>`
      )
      .join("")}</ul></section>`;
  if (prices.length > 1) {
    const points = history.filter((h) => h.price_grosze > 0);
    charts.push(
      new Chart(document.getElementById("ph"), {
        type: "line",
        data: {
          labels: points.map((h) => dayLabel(h.spent_on)),
          datasets: [{ label: "Cena", data: points.map((h) => h.price_grosze), borderColor: cssVar("--accent"), backgroundColor: cssVar("--accent"), stepped: "before", pointRadius: 4, borderWidth: 2 }],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${fmt(ctx.raw)} · ${points[ctx.dataIndex].merchant || ""}` } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: cssVar("--muted") } },
            y: { grid: { color: cssVar("--line") }, ticks: { color: cssVar("--muted"), callback: (v) => fmt(v) } },
          },
        },
      })
    );
  }
}

function exportCard() {
  const year = today().slice(0, 4);
  return `<section class="card"><h2>Eksport do Excela</h2>
    <div class="row2">
      <div><label for="ex-from">Od</label><input id="ex-from" type="date" value="${year}-01-01"></div>
      <div><label for="ex-to">Do</label><input id="ex-to" type="date" value="${today()}"></div>
    </div>
    <p class="small muted">Plik .xlsx z dwoma arkuszami: wydatki i pozycje z paragonów.</p>
    <a class="btn" id="ex-go" href="/api/export/xlsx" download>${icon("download")} Pobierz plik</a>
  </section>`;
}
function bindExport() {
  const go = document.getElementById("ex-go");
  const update = () => {
    const p = new URLSearchParams();
    const from = document.getElementById("ex-from").value, to = document.getElementById("ex-to").value;
    if (from) p.set("date_from", from);
    if (to) p.set("date_to", to);
    go.href = `/api/export/xlsx?${p}`;
  };
  document.getElementById("ex-from").onchange = update;
  document.getElementById("ex-to").onchange = update;
  update();
}

const routes = [
  [/^#\/?$/, viewDashboard, "dashboard"],
  [/^#\/login$/, viewLogin],
  [/^#\/expenses$/, viewExpenses, "expenses"],
  [/^#\/expense\/(\d+)$/, viewExpense, "expenses"],
  [/^#\/add$/, viewAdd, "add"],
  [/^#\/new$/, viewNewExpense, "add"],
  [/^#\/receipts$/, viewReceipts, "dashboard"],
  [/^#\/receipt\/(\d+)$/, viewReceipt, "add"],
  [/^#\/categories$/, viewCategories, "categories"],
  [/^#\/category\/(\d+)$/, viewCategory, "categories"],
  [/^#\/settings$/, viewSettings, "settings"],
  [/^#\/edit-category\/(\d+|new)$/, viewEditCategory, "settings"],
  [/^#\/recurring\/(\d+|new)$/, viewRecurring, "settings"],
  [/^#\/outbox$/, viewOutbox, "dashboard"],
  [/^#\/search$/, viewSearch, "expenses"],
  [/^#\/products$/, viewProducts, "dashboard"],
  [/^#\/product\/(.+)$/, viewProduct, "dashboard"],
];

function setChrome(title, { back = null, tabbar = true } = {}) {
  $title.textContent = title;
  $back.hidden = !back;
  $back.onclick = () => (location.hash = back);
  $tabbar.hidden = !tabbar;
}

function handleError(err) {
  if (err instanceof AuthError) {
    location.hash = "#/login";
    return;
  }
  if (err instanceof OfflineError) {
    $view.innerHTML = `<section class="card empty">
        ${icon("offline")}
        <p><strong>Brak połączenia z serwerem</strong></p>
        <p class="small">Tych danych nie ma jeszcze zapisanych w telefonie. Nowe wydatki i zdjęcia paragonów możesz dodawać dalej: wyślą się same po połączeniu.</p>
        <a class="btn primary" href="#/add">Dodaj wydatek</a>
        <button class="btn" onclick="route()">Spróbuj ponownie</button>
      </section>`;
    return;
  }
  console.error(err);
  $view.innerHTML = `<div class="card empty">Coś poszło nie tak: ${esc(err.message)}<p><button class="btn" onclick="route()">Spróbuj ponownie</button></p></div>`;
}

const TAB_ORDER = ["#/", "#/expenses", "#/add", "#/categories", "#/settings"];
let lastHash = null;

function navDirection(from, to) {
  if (from === null) return "fade";
  const a = TAB_ORDER.indexOf(from), b = TAB_ORDER.indexOf(to);
  if (a >= 0 && b >= 0) return b > a ? "forward" : b < a ? "back" : "fade";
  if (a >= 0) return "forward";
  if (b >= 0) return "back";
  return "fade";
}

async function route() {
  clearTimeout(pollTimer);
  destroyCharts();
  const hash = location.hash || "#/";
  for (const [pattern, view, tab] of routes) {
    const match = hash.match(pattern);
    if (!match) continue;
    document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
    window.scrollTo(0, 0);
    const direction = navDirection(lastHash, hash === "#" ? "#/" : hash);
    lastHash = hash === "#" ? "#/" : hash;
    try {
      await view(...match.slice(1).map((v) => (/^\d+$/.test(v) ? Number(v) : v)));
      animateIn(direction);
    } catch (err) {
      handleError(err);
    }
    return;
  }
  location.hash = "#/";
}

window.addEventListener("hashchange", route);
route();
syncOutbox();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
