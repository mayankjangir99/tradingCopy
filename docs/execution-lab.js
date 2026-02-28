const API_BASE = (window.TradeProCore && window.TradeProCore.API_BASE) || "http://localhost:3000";

if (!window.TradeProCore || !window.TradeProCore.hasSession()) {
  window.location = "index.html";
} else {
  window.TradeProCore.ensureAuthenticated().catch(() => {
    window.location = "index.html";
  });
}

function q(id) {
  return document.getElementById(id);
}

function fmt(v, d = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
}

function kpi(label, value, cls = "") {
  return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value ${cls}">${value}</div></div>`;
}

async function apiFetchJson(path, options = {}) {
  if (!window.TradeProCore || !window.TradeProCore.hasSession()) {
    window.location = "index.html";
    throw new Error("Unauthorized");
  }
  const response = await window.TradeProCore.apiFetch(path, options);
  if (response.status === 401) {
    window.location = "index.html";
    throw new Error("Unauthorized");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `API ${response.status}`);
  return data;
}

async function loadAlerts() {
  const data = await apiFetchJson("/api/alerts");
  const alerts = data.alerts || [];
  const events = data.events || [];
  q("alertsList").innerHTML = [
    ...alerts.map((a) => `
      <div class="news-item">
        <h4>${a.name} | ${a.symbol} | ${a.logic}</h4>
        <p>Conditions: ${a.conditions.map((c) => `${c.type}${Number.isFinite(c.value) ? `(${c.value})` : ""}`).join(", ") || "-"}</p>
        <p>Cooldown: ${a.cooldownSec}s | Active: ${a.isActive ? "Yes" : "No"} | Last trigger: ${a.lastTriggeredAt ? new Date(a.lastTriggeredAt).toLocaleString() : "-"}</p>
      </div>
    `),
    ...events.slice(0, 10).map((e) => `
      <div class="news-item">
        <h4>Triggered: ${e.name} (${e.symbol})</h4>
        <p>${new Date(e.triggeredAt).toLocaleString()} | inApp=${e.channels?.inApp} email=${e.channels?.email} tg=${e.channels?.telegram} wa=${e.channels?.whatsapp}</p>
      </div>
    `)
  ].join("") || "<p class='brand-sub'>No alerts yet.</p>";
}

async function createAlert() {
  const type = q("alertConditionType").value;
  const val = Number(q("alertConditionValue").value);
  const conditionNeedsValue = ["price_above", "price_below", "rsi_above", "rsi_below"].includes(type);
  const payload = {
    name: q("alertName").value.trim(),
    symbol: q("alertSymbol").value.trim(),
    logic: q("alertLogic").value,
    cooldownSec: Number(q("alertCooldown").value) || 300,
    channels: { inApp: true, email: false, telegram: false, whatsapp: false },
    conditions: [{ type, value: conditionNeedsValue ? val : null }]
  };
  await apiFetchJson("/api/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await loadAlerts();
}

async function evalAlerts() {
  await apiFetchJson("/api/alerts/evaluate", { method: "POST" });
  await loadAlerts();
}

function renderBacktestMetrics(item) {
  const m = item?.metrics || {};
  q("backtestMetrics").innerHTML = [
    kpi("Trades", String(m.trades || 0)),
    kpi("Win Rate", `${fmt(m.winRate || 0, 2)}%`),
    kpi("Expectancy", `${fmt(m.expectancyPct || 0, 4)}%`),
    kpi("Max Drawdown", `${fmt(m.maxDrawdownPct || 0, 2)}%`, Number(m.maxDrawdownPct || 0) > 10 ? "bad" : ""),
    kpi("Sharpe", fmt(m.sharpe || 0, 3), Number(m.sharpe || 0) >= 1 ? "good" : ""),
    kpi("Ending Equity", fmt(m.endingEquity || 0, 4))
  ].join("");
}

function renderBacktestList(items) {
  q("backtestList").innerHTML = (items || []).slice(0, 20).map((x) => `
    <div class="news-item">
      <h4>${x.symbol} | ${x.strategy} | ${x.timeframe}</h4>
      <p>${new Date(x.createdAt).toLocaleString()} | Trades: ${x.metrics?.trades} | Win: ${fmt(x.metrics?.winRate || 0, 2)}%</p>
      <p>
        <a href="${API_BASE}/api/backtest/${x.id}/export.csv" target="_blank" rel="noreferrer">CSV</a>
        &nbsp;|&nbsp;
        <a href="${API_BASE}/api/backtest/${x.id}/export.pdf" target="_blank" rel="noreferrer">PDF</a>
      </p>
    </div>
  `).join("") || "<p class='brand-sub'>No backtests yet.</p>";
}

async function runBacktest() {
  const strategy = q("btStrategy").value;
  const p1 = Number(q("btParam1").value);
  const p2 = Number(q("btParam2").value);
  const p3 = Number(q("btParam3").value);
  const params = strategy === "rsi_reversion"
    ? { rsiPeriod: p1, entryRsi: p2, exitRsi: p3 }
    : { fastPeriod: p1, slowPeriod: p2 };
  const payload = {
    symbol: q("btSymbol").value.trim(),
    timeframe: q("btTimeframe").value,
    strategy,
    params
  };
  const result = await apiFetchJson("/api/backtest/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  renderBacktestMetrics(result);
  const history = await apiFetchJson("/api/backtest/history");
  renderBacktestList(history.items || []);
}

async function loadBacktestHistory() {
  const history = await apiFetchJson("/api/backtest/history");
  renderBacktestList(history.items || []);
  if (history.items?.[0]) renderBacktestMetrics(history.items[0]);
  else q("backtestMetrics").innerHTML = "";
}

function on(id, event, handler) {
  const el = q(id);
  if (!el) return;
  el.addEventListener(event, handler);
}

async function bootstrap() {
  on("createAlertBtn", "click", async () => {
    try { await createAlert(); } catch (error) { alert(error.message); }
  });
  on("evalAlertsBtn", "click", async () => {
    try { await evalAlerts(); } catch (error) { alert(error.message); }
  });
  on("runBacktestBtn", "click", async () => {
    try { await runBacktest(); } catch (error) { alert(error.message); }
  });
  on("backtestHistoryBtn", "click", async () => {
    try { await loadBacktestHistory(); } catch (error) { alert(error.message); }
  });
  await Promise.allSettled([loadAlerts(), loadBacktestHistory()]);
}

bootstrap().catch((error) => {
  console.log("Execution Lab bootstrap warning:", error.message);
});
