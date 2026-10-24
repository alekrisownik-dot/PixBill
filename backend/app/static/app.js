"use strict";

const $view = document.getElementById("view");
const $title = document.getElementById("title");
const $back = document.getElementById("back");
const $tabbar = document.getElementById("tabbar");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const money = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
const fmt = (grosze) => money.format((grosze || 0) / 100);

function toGrosze(text) {
  const clean = String(text).replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
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
  return `<span class="${cls}">${arrow} ${Math.abs(pct)}% (${pct > 0 ? "+" : "−"}${fmt(Math.abs(grosze))})</span>`;
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2500);
}

class AuthError extends Error {}

async function api(path, { method = "GET", body, form } = {}) {
  const opts = { method, credentials: "same-origin", headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
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
  return res.status === 204 ? null : res.json();
}

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

function donut(canvas, labels, values, colors) {
  charts.push(
    new Chart(canvas, {
      type: "doughnut",
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: cssVar("--card"), borderWidth: 2 }] },
      options: {
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${fmt(ctx.raw)}` } },
        },
      },
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
  wrap.innerHTML = `<button aria-label="Poprzedni miesiąc">‹</button><strong>${esc(monthName(month))}</strong><button aria-label="Następny miesiąc">›</button>`;
  const [prev, , next] = wrap.children;
  prev.onclick = () => onChange(shiftMonth(month, -1));
  next.onclick = () => onChange(shiftMonth(month, 1));
  next.disabled = month >= thisMonth();
  return wrap;
}

function expenseRow(e, cat) {
  const label = e.description || e.merchant || cat?.name || "Wydatek";
  const sub = [dayLabel(e.spent_on), cat?.name, e.source === "receipt" ? "paragon" : null].filter(Boolean).join(" · ");
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
      <p class="muted">Wydatki z paragonów</p>
      <label for="pw">Hasło</label>
      <input id="pw" type="password" autocomplete="current-password" required>
      <p></p>
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
  const [summary, trend, expenses, pending, cats] = await Promise.all([
    api(`/api/stats/month?month=${month}`),
    api(`/api/stats/trend?months=6&until=${month}`),
    api(`/api/expenses?month=${month}`),
    api(`/api/receipts?status=processed`).then(async (p) => p.concat(await api(`/api/receipts?status=failed`), await api(`/api/receipts?status=pending`))),
    categories(),
  ]);
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));

  $view.innerHTML = "";
  $view.append(monthSwitch(month, (m) => ((state.month = m), viewDashboard())));

  const toCheck = pending.filter((r) => r.status !== "pending").length;
  const reading = pending.length - toCheck;
  if (pending.length) {
    $view.insertAdjacentHTML(
      "beforeend",
      `<a class="banner" href="#/receipts">${toCheck ? `🧾 Paragony do sprawdzenia: ${toCheck}` : ""}${
        toCheck && reading ? " · " : ""
      }${reading ? `⏳ Odczytywane: ${reading}` : ""}</a>`
    );
  }

  const withSpend = summary.categories.filter((c) => c.total_grosze > 0);
  $view.insertAdjacentHTML(
    "beforeend",
    `<section class="card">
      <h2>Wydano w tym miesiącu</h2>
      <div class="big">${fmt(summary.total_grosze)}</div>
      <div class="small">${summary.previous_total_grosze ? change(summary.change_percent, summary.change_grosze) + ` <span class="muted">vs ${esc(monthName(summary.previous_month))}</span>` : `<span class="muted">brak danych z poprzedniego miesiąca</span>`}</div>
    </section>
    <section class="card">
      <h2>Podział na sekcje</h2>
      ${withSpend.length ? `<div class="chart-box"><canvas id="pie"></canvas></div>` : `<div class="empty">Brak wydatków w tym miesiącu</div>`}
      <ul class="list">${summary.categories
        .map(
          (c) => `<li><a href="#/category/${c.category_id}">
            <span class="dot" style="background:${esc(c.color)}"></span>
            <span class="grow"><div class="t">${esc(c.name)}</div><div class="small">${change(c.change_percent, c.change_grosze)}</div></span>
            <span class="amount">${fmt(c.total_grosze)}<div class="small muted">${summary.total_grosze ? Math.round((c.total_grosze / summary.total_grosze) * 100) : 0}%</div></span>
          </a></li>`
        )
        .join("")}</ul>
    </section>
    <section class="card">
      <h2>Ostatnie 6 miesięcy</h2>
      <div class="chart-box bar"><canvas id="trend"></canvas></div>
    </section>
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

  $view.innerHTML = "";
  $view.append(monthSwitch(month, (m) => ((state.month = m), viewExpenses())));
  $view.insertAdjacentHTML(
    "beforeend",
    `<div class="chips" style="margin-bottom:12px">
      <button class="chip" data-cat="" aria-pressed="${!catFilter}">Wszystkie</button>
      ${cats.filter((c) => !c.archived).map((c) => `<button class="chip" data-cat="${c.id}" aria-pressed="${catFilter === c.id}"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</button>`).join("")}
    </div>
    <section class="card">
      <h2>${expenses.length} wydatków · ${fmt(total)}</h2>
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
    <label class="btn primary huge" for="photo">📷 Zrób zdjęcie paragonu</label>
    <input id="photo" type="file" accept="image/*" capture="environment" hidden>
    <label class="btn huge" for="gallery" style="margin-top:10px">🖼️ Wybierz zdjęcie z galerii</label>
    <input id="gallery" type="file" accept="image/*" hidden>
    <a class="btn huge" href="#/new" style="margin-top:10px">✏️ Wpisz ręcznie</a>
    <p class="small muted" style="text-align:center">Paragon odczyta się w tle. Możesz w tym czasie robić zdjęcia kolejnych.</p>`;
  const upload = async (input) => {
    const file = input.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    $view.innerHTML = `<div class="card empty"><div class="spinner"></div>Wysyłam zdjęcie…</div>`;
    try {
      const r = await api("/api/receipts", { method: "POST", form });
      location.hash = `#/receipt/${r.id}`;
    } catch (err) {
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
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const amount = toGrosze(form.amount.value);
        if (!amount) return toast("Wpisz poprawną kwotę, np. 45,99");
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
      await api("/api/expenses", { method: "POST", body: data });
      toast("Zapisano");
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

function receiptPhotoCard(r) {
  if (!r.has_photo) {
    return `<section class="card"><h2>Zdjęcie paragonu</h2><div class="small muted">Zdjęcie usunięte ${r.photo_deleted_at ? dayLabel(r.photo_deleted_at.slice(0, 10)) : ""}. Dane zostały zapisane.</div></section>`;
  }
  let note = "";
  if (r.photo_delete_after) {
    const days = Math.max(0, Math.ceil((new Date(r.photo_delete_after) - new Date()) / 86400000));
    note = `<div class="small muted" style="margin-top:8px">Zdjęcie zostanie usunięte za ${days} ${days === 1 ? "dzień" : "dni"}.</div>`;
  }
  return `<section class="card"><h2>Zdjęcie paragonu</h2><img class="receipt-photo" src="/api/receipts/${r.id}/photo" alt="Zdjęcie paragonu">${note}</section>`;
}

async function viewReceipts() {
  setChrome("Paragony", { back: "#/" });
  const all = await api("/api/receipts");
  const open = all.filter((r) => r.status !== "confirmed");
  const label = { pending: "⏳ Odczytywanie…", processed: "Do sprawdzenia", failed: "⚠️ Nie udało się odczytać" };
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
      : `<div class="empty">Wszystkie paragony sprawdzone 👍</div>`
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
    $view.innerHTML = `<section class="card empty"><div class="spinner"></div>Odczytuję paragon…<div class="small">Na laptopie z kartą graficzną trwa to zwykle kilka–kilkanaście sekund. Możesz wyjść, paragon poczeka na liście.</div></section>${receiptPhotoCard(r)}`;
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

  const items = (ocr.items || []).filter((i) => i.name);
  $view.innerHTML =
    (failed ? `<div class="banner">Nie udało się odczytać paragonu. Wpisz dane ręcznie albo spróbuj ponownie.</div>` : `<p class="small muted">Sprawdź odczytane dane i popraw, jeśli coś się nie zgadza.</p>`) +
    f.html +
    (items.length
      ? `<section class="card"><h2>Odczytane pozycje</h2><ul class="list ocr-items">${items
          .map((i) => `<li><span class="grow">${esc(i.name)}</span><span class="amount">${i.price_grosze != null ? fmt(i.price_grosze) : ""}</span></li>`)
          .join("")}</ul></section>`
      : "") +
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
      <div class="big">${fmt(total)}</div>
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
  const cats = await categories(true);
  $view.innerHTML = `<section class="card"><h2>Sekcje</h2>
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
    <section class="card"><h2>Instalacja na telefonie</h2>
      <div class="small muted">Android (Chrome): menu ⋮ → „Zainstaluj aplikację”.<br>iPhone (Safari): Udostępnij → „Do ekranu początkowego”.</div>
    </section>
    <button class="btn danger" id="logout">Wyloguj</button>`;
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
  console.error(err);
  $view.innerHTML = `<div class="card empty">Coś poszło nie tak: ${esc(err.message)}<p><button class="btn" onclick="route()">Spróbuj ponownie</button></p></div>`;
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
    try {
      await view(...match.slice(1).map((v) => (/^\d+$/.test(v) ? Number(v) : v)));
    } catch (err) {
      handleError(err);
    }
    return;
  }
  location.hash = "#/";
}

window.addEventListener("hashchange", route);
route();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
