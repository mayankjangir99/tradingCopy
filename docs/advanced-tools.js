function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function money(v) {
  if (window.TradeProCore && typeof window.TradeProCore.formatMoney === "function") {
    return window.TradeProCore.formatMoney(n(v), { digits: 2, assumeUSD: false });
  }
  const value = n(v);
  const fallbackCurrency = String(localStorage.getItem("tp_currency") || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: fallbackCurrency,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${fallbackCurrency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
}

function pct(v) {
  return `${n(v).toFixed(2)}%`;
}

function kpi(label, value, cls = "") {
  return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value ${cls}">${value}</div></div>`;
}

function setOut(id, html) {
  document.getElementById(id).innerHTML = html;
}

document.getElementById("ptRun").addEventListener("click", () => {
  const cost = n(document.getElementById("ptCost").value);
  const cur = n(document.getElementById("ptCurrent").value);
  const eq = n(document.getElementById("ptEquity").value);
  const debt = n(document.getElementById("ptDebt").value);
  const gold = n(document.getElementById("ptGold").value);
  const cash = n(document.getElementById("ptCash").value);
  const pnl = cur - cost;
  const total = Math.max(cur, 1);
  setOut("ptOut", [
    kpi("Net P/L", money(pnl), pnl >= 0 ? "good" : "bad"),
    kpi("Equity Allocation", pct((eq / total) * 100)),
    kpi("Debt Allocation", pct((debt / total) * 100)),
    kpi("Gold Allocation", pct((gold / total) * 100)),
    kpi("Cash Allocation", pct((cash / total) * 100))
  ].join(""));
});

document.getElementById("btRun").addEventListener("click", () => {
  const cap = n(document.getElementById("btCapital").value);
  const trades = Math.max(1, n(document.getElementById("btTrades").value));
  const wr = n(document.getElementById("btWinRate").value) / 100;
  const avgW = n(document.getElementById("btAvgWin").value) / 100;
  const avgL = n(document.getElementById("btAvgLoss").value) / 100;
  const years = Math.max(1, n(document.getElementById("btYears").value));
  const exp = wr * avgW - (1 - wr) * avgL;
  const end = cap * Math.pow(1 + exp, trades);
  const cagr = (Math.pow(end / Math.max(1, cap), 1 / years) - 1) * 100;
  setOut("btOut", [
    kpi("Expectancy / Trade", pct(exp * 100)),
    kpi("Projected Ending Capital", money(end)),
    kpi("Implied CAGR", pct(cagr))
  ].join(""));
});

const ALERT_KEY = "tp_alert_engine";
function getAlerts() {
  return JSON.parse(localStorage.getItem(ALERT_KEY) || "[]");
}
function saveAlerts(alerts) {
  localStorage.setItem(ALERT_KEY, JSON.stringify(alerts.slice(-50)));
}

document.getElementById("aeAdd").addEventListener("click", () => {
  const symbol = String(document.getElementById("aeSymbol").value || "").toUpperCase().trim();
  const current = n(document.getElementById("aeCurrent").value);
  const target = n(document.getElementById("aeTarget").value);
  const side = document.getElementById("aeSide").value;
  if (!symbol) return;
  const alerts = getAlerts();
  alerts.push({ symbol, current, target, side, ts: Date.now() });
  saveAlerts(alerts);
  setOut("aeOut", kpi("Alert Added", `${symbol} ${side} ${target}`));
});

document.getElementById("aeCheck").addEventListener("click", () => {
  const alerts = getAlerts();
  if (alerts.length === 0) {
    setOut("aeOut", kpi("Status", "No alerts stored."));
    return;
  }
  const hit = alerts.filter((a) => (a.side === "above" ? a.current >= a.target : a.current <= a.target));
  setOut("aeOut", [
    kpi("Stored Alerts", String(alerts.length)),
    kpi("Triggered", String(hit.length), hit.length > 0 ? "good" : "")
  ].join(""));
});

document.getElementById("obRun").addEventListener("click", () => {
  const type = document.getElementById("obType").value;
  const side = document.getElementById("obSide").value;
  const strike = n(document.getElementById("obStrike").value);
  const premium = n(document.getElementById("obPremium").value);
  const spot = n(document.getElementById("obSpot").value);
  const qty = Math.max(1, n(document.getElementById("obLots").value, 1));
  const intrinsic = type === "call" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  const longPnl = (intrinsic - premium) * qty;
  const pnl = side === "buy" ? longPnl : -longPnl;
  const breakeven = type === "call" ? strike + premium : strike - premium;
  setOut("obOut", [
    kpi("Breakeven", String(breakeven.toFixed(2))),
    kpi("PnL at Expiry", money(pnl), pnl >= 0 ? "good" : "bad")
  ].join(""));
});

document.getElementById("rbRun").addEventListener("click", () => {
  const total = n(document.getElementById("rbTotal").value);
  const eqCur = n(document.getElementById("rbEqCur").value);
  const eqTar = n(document.getElementById("rbEqTar").value);
  const debtCur = n(document.getElementById("rbDebtCur").value);
  const debtTar = n(document.getElementById("rbDebtTar").value);
  const goldCur = n(document.getElementById("rbGoldCur").value);
  const goldTar = Math.max(0, 100 - eqTar - debtTar);
  setOut("rbOut", [
    kpi("Equity Action", money(((eqTar - eqCur) / 100) * total)),
    kpi("Debt Action", money(((debtTar - debtCur) / 100) * total)),
    kpi("Gold Action", money(((goldTar - goldCur) / 100) * total))
  ].join(""));
});

document.getElementById("txRun").addEventListener("click", () => {
  const stcg = n(document.getElementById("txStcg").value);
  const ltcg = n(document.getElementById("txLtcg").value);
  const stRate = n(document.getElementById("txStcgRate").value) / 100;
  const ltRate = n(document.getElementById("txLtcgRate").value) / 100;
  const tax = stcg * stRate + ltcg * ltRate;
  setOut("txOut", [
    kpi("Estimated Tax", money(tax)),
    kpi("Post-tax Profit", money(stcg + ltcg - tax))
  ].join(""));
});

document.getElementById("rcRun").addEventListener("click", () => {
  const capital = n(document.getElementById("rcCapital").value);
  const riskPct = n(document.getElementById("rcRiskPct").value) / 100;
  const entry = n(document.getElementById("rcEntry").value);
  const stop = n(document.getElementById("rcStop").value);
  const riskAmt = capital * riskPct;
  const perUnitRisk = Math.max(0.0001, Math.abs(entry - stop));
  const qty = Math.floor(riskAmt / perUnitRisk);
  const pos = qty * entry;
  setOut("rcOut", [
    kpi("Risk Capital", money(riskAmt)),
    kpi("Max Quantity", String(qty)),
    kpi("Position Size", money(pos))
  ].join(""));
});

const JOURNAL_KEY = "tp_trade_journal";
function getJournal() {
  return JSON.parse(localStorage.getItem(JOURNAL_KEY) || "[]");
}
function saveJournal(items) {
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(items.slice(-200)));
}
function renderJournal() {
  const list = getJournal();
  const pnl = list.reduce((a, b) => a + n(b.pnl), 0);
  setOut("tjOut", [
    kpi("Entries", String(list.length)),
    kpi("Total PnL", money(pnl), pnl >= 0 ? "good" : "bad")
  ].join(""));
  document.getElementById("tjList").innerHTML = list.slice(-8).reverse().map((e) => `
    <div class="news-item">
      <h4>${e.symbol} | ${e.setup}</h4>
      <p>PnL: ${money(e.pnl)} | ${e.note || "-"}</p>
    </div>
  `).join("");
}
document.getElementById("tjAdd").addEventListener("click", () => {
  const entry = {
    symbol: String(document.getElementById("tjSymbol").value || "").toUpperCase().trim(),
    pnl: n(document.getElementById("tjPnl").value),
    setup: String(document.getElementById("tjSetup").value || "").trim(),
    note: String(document.getElementById("tjNote").value || "").trim(),
    ts: Date.now()
  };
  if (!entry.symbol) return;
  const list = getJournal();
  list.push(entry);
  saveJournal(list);
  renderJournal();
});
document.getElementById("tjClear").addEventListener("click", () => {
  localStorage.removeItem(JOURNAL_KEY);
  renderJournal();
});

function parseSeries(text) {
  return String(text || "")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isFinite(x));
}
function corr(a, b) {
  const nPts = Math.min(a.length, b.length);
  if (nPts < 2) return 0;
  const x = a.slice(0, nPts);
  const y = b.slice(0, nPts);
  const mx = x.reduce((s, v) => s + v, 0) / nPts;
  const my = y.reduce((s, v) => s + v, 0) / nPts;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < nPts; i += 1) {
    const vx = x[i] - mx;
    const vy = y[i] - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  return num / Math.sqrt(Math.max(1e-9, dx * dy));
}
document.getElementById("coRun").addEventListener("click", () => {
  const a = parseSeries(document.getElementById("coA").value);
  const b = parseSeries(document.getElementById("coB").value);
  const c = corr(a, b);
  const tag = c > 0.7 ? "High Positive" : c < -0.7 ? "High Negative" : "Moderate/Low";
  setOut("coOut", [kpi("Correlation", c.toFixed(4)), kpi("Risk Tag", tag)].join(""));
});

document.getElementById("ssRun").addEventListener("click", () => {
  const total = n(document.getElementById("ssTotal").value);
  const ew = n(document.getElementById("ssEqWt").value) / 100;
  const dw = n(document.getElementById("ssDebtWt").value) / 100;
  const gw = n(document.getElementById("ssGoldWt").value) / 100;
  const es = n(document.getElementById("ssEqShock").value) / 100;
  const ds = n(document.getElementById("ssDebtShock").value) / 100;
  const gs = n(document.getElementById("ssGoldShock").value) / 100;
  const next = total * (ew * (1 + es) + dw * (1 + ds) + gw * (1 + gs));
  const pnl = next - total;
  setOut("ssOut", [
    kpi("Projected Value", money(next)),
    kpi("Scenario P/L", money(pnl), pnl >= 0 ? "good" : "bad")
  ].join(""));
});

renderJournal();
