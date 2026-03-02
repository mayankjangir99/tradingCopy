if (window.TradeProCore && window.TradeProCore.hasSession()) {
  window.TradeProCore.ensureAuthenticated().catch(() => {
    window.location = "index.html";
  });
} else if (localStorage.getItem("auth") !== "true" && sessionStorage.getItem("auth") !== "true") {
  window.location = "index.html";
}

const params = new URLSearchParams(window.location.search);
const SYMBOL = (params.get("symbol") || "NASDAQ:AAPL").toUpperCase();
const API_BASE =
  (window.TradeProCore && window.TradeProCore.API_BASE) ||
  window.TRADEPRO_CONFIG?.API_BASE ||
  localStorage.getItem("tp_api_base") ||
  document.querySelector('meta[name="tradepro-api-base"]')?.content ||
  "https://tradingcopy-0p0k.onrender.com";

const stockNameEl = document.getElementById("stockName");
const subTitleEl = document.getElementById("subTitle");
const strategySelect = document.getElementById("strategySelect");
const aiTfPills = document.getElementById("aiTfPills");

const aiPrimary = document.getElementById("aiPrimary");
const aiIndicators = document.getElementById("aiIndicators");
const aiSignals = document.getElementById("aiSignals");
const aiBacktest = document.getElementById("aiBacktest");
const confidenceScore = document.getElementById("confidenceScore");
const weightGrid = document.getElementById("weightGrid");
const marketModeBadge = document.getElementById("marketModeBadge");
const allocationPie = document.getElementById("allocationPie");
const allocationLegend = document.getElementById("allocationLegend");
const growthAreaChart = document.getElementById("growthAreaChart");
const growthChartTypeSelect = document.getElementById("growthChartType");
const chartEl = document.getElementById("chart");
const stockAlertNameInput = document.getElementById("stockAlertName");
const stockAlertDirectionSelect = document.getElementById("stockAlertDirection");
const stockAlertValueInput = document.getElementById("stockAlertValue");
const stockAlertCooldownInput = document.getElementById("stockAlertCooldown");
const stockAlertEmailInput = document.getElementById("stockAlertEmail");
const stockAlertHint = document.getElementById("stockAlertHint");
const stockAlertStatus = document.getElementById("stockAlertStatus");
const stockCreateAlertBtn = document.getElementById("stockCreateAlertBtn");
const stockAlertsList = document.getElementById("stockAlertsList");
const stockUseCurrentPriceBtn = document.getElementById("stockUseCurrentPriceBtn");
const stockWatchlistBtn = document.getElementById("stockWatchlistBtn");
const autoRefreshSelect = document.getElementById("autoRefreshSelect");
const stockPageStatus = document.getElementById("stockPageStatus");
const stockDataModeBadge = document.getElementById("stockDataModeBadge");
const stockHealthBadge = document.getElementById("stockHealthBadge");
const stockLastUpdated = document.getElementById("stockLastUpdated");

stockNameEl.textContent = SYMBOL;
subTitleEl.textContent = `TradingView market stream + AI analytics for ${SYMBOL}`;

const aiTimeframes = ["1m", "5m", "15m", "1h", "4h", "1D"];
let currentAiTf = "1D";
let currentChartTf = "D";
let lastAiSnapshot = null;
let resizeTimer = null;
let currentRealtimePrice = Number.NaN;
let aiRefreshTimer = null;

function setStockAlertStatus(message, isError = false) {
  if (!stockAlertStatus) return;
  stockAlertStatus.textContent = message || "";
  stockAlertStatus.style.color = isError ? "#ff8b94" : "";
}

function setStockPageStatus(message, isError = false) {
  if (!stockPageStatus) return;
  stockPageStatus.textContent = message || "";
  stockPageStatus.classList.toggle("bad", Boolean(isError));
}

function setStockDataMode(label, mode = "neutral") {
  if (!stockDataModeBadge) return;
  stockDataModeBadge.textContent = label || "Data";
  stockDataModeBadge.className = `technical-badge ${mode}`;
}

function setStockHealthStatus(label, mode = "neutral") {
  if (!stockHealthBadge) return;
  stockHealthBadge.textContent = label || "Provider Health";
  stockHealthBadge.className = `technical-badge ${mode}`;
}

function updateLastUpdated(ts = Date.now()) {
  if (!stockLastUpdated) return;
  stockLastUpdated.textContent = `Last updated ${new Date(ts).toLocaleTimeString()}`;
}

function getStoredWatchlist() {
  return JSON.parse(localStorage.getItem("wishlist") || "[]");
}

function isInWatchlist(symbol) {
  return getStoredWatchlist().includes(symbol);
}

function updateWatchlistButton() {
  if (!stockWatchlistBtn) return;
  stockWatchlistBtn.textContent = isInWatchlist(SYMBOL) ? "Remove Watchlist" : "Add to Watchlist";
}

async function syncWatchlistToServer(list) {
  if (!window.TradeProCore || !window.TradeProCore.hasSession()) return;
  try {
    await window.TradeProCore.apiFetch("/api/watchlist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watchlist: list })
    });
  } catch (error) {
    console.log("Watchlist sync warning:", error.message);
  }
}

async function toggleWatchlistMembership() {
  const list = getStoredWatchlist();
  const updated = isInWatchlist(SYMBOL)
    ? list.filter((item) => item !== SYMBOL)
    : [SYMBOL, ...list.filter((item) => item !== SYMBOL)].slice(0, 20);
  localStorage.setItem("wishlist", JSON.stringify(updated));
  await syncWatchlistToServer(updated);
  updateWatchlistButton();
  setStockPageStatus(isInWatchlist(SYMBOL) ? "Added to watchlist." : "Removed from watchlist.");
}

function applyAlertTargetValue(value) {
  if (!stockAlertValueInput) return;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return;
  stockAlertValueInput.value = numeric.toFixed(numeric >= 100 ? 2 : 4);
}

function applyRelativeAlertTarget(percent) {
  if (!Number.isFinite(currentRealtimePrice) || currentRealtimePrice <= 0) {
    setStockAlertStatus("Current price is not available yet.", true);
    return;
  }
  const nextValue = currentRealtimePrice * (1 + percent / 100);
  applyAlertTargetValue(nextValue);
  setStockAlertStatus(`Alert target set to ${formatMoney(nextValue, 4)}.`);
}

function rememberStockPreferences() {
  localStorage.setItem("tp_recent_symbol", SYMBOL);
  localStorage.setItem("tp_stock_strategy", strategySelect?.value || "swing");
  localStorage.setItem("tp_stock_refresh_ms", String(autoRefreshSelect?.value || "30000"));
  localStorage.setItem("tp_default_alert_cooldown", String(stockAlertCooldownInput?.value || "300"));
}

function hydrateStockPreferences() {
  const savedStrategy = localStorage.getItem("tp_stock_strategy");
  const savedRefresh = localStorage.getItem("tp_stock_refresh_ms");
  const savedCooldown = localStorage.getItem("tp_default_alert_cooldown");
  if (savedStrategy && strategySelect) strategySelect.value = savedStrategy;
  if (savedRefresh && autoRefreshSelect) autoRefreshSelect.value = savedRefresh;
  if (savedCooldown && stockAlertCooldownInput) stockAlertCooldownInput.value = savedCooldown;
}

async function apiFetchJson(path, options = {}) {
  if (!window.TradeProCore || !window.TradeProCore.hasSession()) {
    throw new Error("Unauthorized");
  }
  const response = await window.TradeProCore.apiFetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `API ${response.status}`);
  }
  return data;
}

async function validateCurrentSymbol() {
  try {
    const data = await apiFetchJson(`/api/symbol/resolve?symbol=${encodeURIComponent(SYMBOL)}`);
    if (!data.valid) throw new Error(data.error || "Invalid symbol.");
    if (!data.available) {
      setStockPageStatus(data.error || "Live data is temporarily unavailable. Showing fallback experience.", true);
      setStockHealthStatus("Provider Degraded", "negative");
    } else {
      setStockPageStatus(`Validated ${data.normalizedSymbol}.`);
    }
    return data;
  } catch (error) {
    setStockPageStatus(error.message, true);
    setStockDataMode("Invalid Symbol", "negative");
    throw error;
  }
}

function applyProviderHealth(health, isDegraded = false) {
  const providers = Array.isArray(health?.providers)
    ? health.providers.filter((item) => item.id !== "smtp")
    : [];
  const hasIssue = isDegraded || providers.some((item) => String(item.status || "").includes("not_"));
  setStockHealthStatus(hasIssue ? "Provider Degraded" : "Providers Healthy", hasIssue ? "negative" : "positive");
}

async function loadStockAlertMeta() {
  if (!window.TradeProCore || !window.TradeProCore.hasSession()) return;
  try {
    const data = await apiFetchJson("/api/alerts");
    const currentAlerts = (data.alerts || []).filter((item) => String(item.symbol || "").toUpperCase() === SYMBOL);
    const currentEvents = (data.events || []).filter((item) => String(item.symbol || "").toUpperCase() === SYMBOL);
    const email = String(data.notificationEmail || "").trim();
    if (stockAlertNameInput && !stockAlertNameInput.value.trim()) {
      stockAlertNameInput.value = `${SYMBOL} price alert`;
    }
    if (stockAlertHint) {
      stockAlertHint.textContent = email
        ? (data.emailDeliveryReady
          ? `Email alerts for ${SYMBOL} will be sent to ${email}.`
          : `Email recipient is ${email}, but backend SMTP is not configured yet.`)
        : "Email alerts need a saved account email, such as Google login.";
    }
    if (stockAlertEmailInput) {
      stockAlertEmailInput.disabled = !email;
      if (!email) stockAlertEmailInput.checked = false;
    }
    renderStockAlerts(currentAlerts, currentEvents);
  } catch (error) {
    setStockAlertStatus(error.message, true);
  }
}

function renderStockAlerts(alerts = [], events = []) {
  if (!stockAlertsList) return;
  if (!alerts.length && !events.length) {
    stockAlertsList.innerHTML = "<p class='brand-sub'>No alerts created for this symbol yet.</p>";
    return;
  }

  stockAlertsList.innerHTML = [
    ...alerts.map((alert) => `
      <div class="news-item">
        <h4>${alert.name}</h4>
        <p>${alert.conditions.map((item) => `${item.type}${Number.isFinite(Number(item.value)) ? ` @ ${item.value}` : ""}`).join(", ") || "No conditions"}</p>
        <p>Cooldown ${alert.cooldownSec}s | Email ${alert.channels?.email ? "On" : "Off"} | Last trigger ${alert.lastTriggeredAt ? new Date(alert.lastTriggeredAt).toLocaleString() : "Never"}</p>
        <div class="row row-tight" style="margin-top:8px;">
          <button class="btn ghost btn-auto" type="button" onclick="deleteStockAlert('${alert.id}')">Delete</button>
        </div>
      </div>
    `),
    ...events.slice(0, 4).map((event) => `
      <div class="news-item">
        <h4>Triggered ${new Date(event.triggeredAt).toLocaleString()}</h4>
        <p>${event.conditionResults?.map((item) => `${item.label || item.type}: observed ${item.observedText || item.observedValue} vs target ${Number.isFinite(Number(item.targetValue)) ? item.targetValue : "-"}`).join(" | ") || event.reason}</p>
        <p>Email ${event.channels?.email || "disabled"}${event.emailRecipient ? ` to ${event.emailRecipient}` : ""}</p>
      </div>
    `)
  ].join("");
}

async function deleteStockAlert(alertId) {
  try {
    await apiFetchJson(`/api/alerts/${encodeURIComponent(alertId)}`, { method: "DELETE" });
    setStockAlertStatus("Alert removed.");
    await loadStockAlertMeta();
  } catch (error) {
    setStockAlertStatus(error.message, true);
  }
}

async function createStockPageAlert() {
  const targetValue = Number(stockAlertValueInput?.value);
  if (!Number.isFinite(targetValue) || targetValue <= 0) {
    throw new Error("Enter a valid alert price.");
  }

  const payload = {
    name: stockAlertNameInput?.value.trim() || `${SYMBOL} price alert`,
    symbol: SYMBOL,
    logic: "AND",
    cooldownSec: Number(stockAlertCooldownInput?.value) || 300,
    channels: {
      inApp: true,
      email: Boolean(stockAlertEmailInput?.checked),
      telegram: false,
      whatsapp: false
    },
    conditions: [
      {
        type: stockAlertDirectionSelect?.value || "price_above",
        value: targetValue
      }
    ]
  };

  await apiFetchJson("/api/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  rememberStockPreferences();
}

function getResponsiveChartHeights() {
  const w = window.innerWidth || 1200;
  if (w <= 540) {
    return {
      main: 360,
      overview: 300,
      technical: 340,
      news: 340,
      area: 180
    };
  }
  if (w <= 980) {
    return {
      main: 500,
      overview: 340,
      technical: 380,
      news: 380,
      area: 200
    };
  }
  return {
    main: 760,
    overview: 390,
    technical: 420,
    news: 420,
    area: 220
  };
}

function logout() {
  if (window.TradeProCore) {
    window.TradeProCore.logout().finally(() => {
      window.location = "index.html";
    });
    return;
  }
  localStorage.removeItem("auth");
  sessionStorage.removeItem("auth");
  window.location = "index.html";
}

function toggleFullScreen() {
  const target = document.getElementById("chartCard");
  if (!document.fullscreenElement) target.requestFullscreen();
  else document.exitFullscreen();
}

function changeTimeframe() {
  currentChartTf = document.getElementById("timeframe").value;
  renderChart();
}

function refreshStockPageData() {
  setStockPageStatus("Refreshing stock page...");
  renderChart();
  renderSymbolInfoWidget();
  renderOverviewWidget();
  renderTechnicalWidget();
  renderNewsWidget();
  loadAiData();
  loadStockAlertMeta();
}

function renderChart() {
  const heights = getResponsiveChartHeights();
  chartEl.innerHTML = "";
  chartEl.style.height = `${heights.main}px`;
  new TradingView.widget({
    container_id: "chart",
    symbol: SYMBOL,
    interval: currentChartTf,
    timezone: "Etc/UTC",
    theme: "dark",
    style: "1",
    hide_side_toolbar: false,
    allow_symbol_change: false,
    width: "100%",
    height: heights.main,
    autosize: false
  });
}

function renderWidget(containerId, src, config) {
  const target = document.getElementById(containerId);
  if (!target) return;

  target.innerHTML = "";
  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  script.innerHTML = JSON.stringify(config);
  target.appendChild(script);
}

function renderSymbolInfoWidget() {
  renderWidget(
    "tv-symbol-info",
    "https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js",
    { symbol: SYMBOL, width: "100%", locale: "en", colorTheme: "dark", isTransparent: true }
  );
}

function renderOverviewWidget() {
  const heights = getResponsiveChartHeights();
  renderWidget(
    "tv-overview",
    "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js",
    {
      symbols: [[SYMBOL]],
      chartOnly: false,
      width: "100%",
      height: heights.overview,
      locale: "en",
      colorTheme: "dark",
      autosize: true,
      showVolume: true,
      showMA: true,
      hideDateRanges: false,
      hideMarketStatus: false,
      hideSymbolLogo: false,
      scalePosition: "right",
      scaleMode: "Normal",
      fontFamily: "Segoe UI, Tahoma, sans-serif"
    }
  );
}

function renderTechnicalWidget() {
  const heights = getResponsiveChartHeights();
  renderWidget(
    "technical-widget",
    "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js",
    {
      interval: "1m",
      width: "100%",
      height: heights.technical,
      symbol: SYMBOL,
      showIntervalTabs: true,
      displayMode: "single",
      locale: "en",
      colorTheme: "dark"
    }
  );
}

function renderNewsWidget() {
  const heights = getResponsiveChartHeights();
  renderWidget(
    "tv-news",
    "https://s3.tradingview.com/external-embedding/embed-widget-timeline.js",
    {
      feedMode: "symbol",
      symbol: SYMBOL,
      colorTheme: "dark",
      isTransparent: true,
      displayMode: "regular",
      width: "100%",
      height: heights.news,
      locale: "en"
    }
  );
}

function formatNumber(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function formatMoney(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  if (window.TradeProCore && typeof window.TradeProCore.formatMoney === "function") {
    return window.TradeProCore.formatMoney(n, { digits: decimals, assumeUSD: true });
  }
  const fallbackCurrency = String(localStorage.getItem("tp_currency") || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: fallbackCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals
    }).format(n);
  } catch {
    return `${fallbackCurrency} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })}`;
  }
}

function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function kpi(label, value, className = "") {
  return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value ${className}">${value}</div></div>`;
}

function statusClass(text) {
  const t = String(text || "").toLowerCase();
  if (t.includes("positive") || t.includes("buy") || t.includes("breakout") || t.includes("low")) return "positive";
  if (t.includes("negative") || t.includes("sell") || t.includes("fake") || t.includes("high")) return "negative";
  return "neutral";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAllocation(buy, hold, sell) {
  const b = Math.max(0, Number(buy) || 0);
  const h = Math.max(0, Number(hold) || 0);
  const s = Math.max(0, Number(sell) || 0);
  const total = b + h + s || 1;

  const buyPct = Math.round((b / total) * 100);
  const holdPct = Math.round((h / total) * 100);
  const sellPct = Math.max(0, 100 - buyPct - holdPct);
  return { buy: buyPct, hold: holdPct, sell: sellPct };
}

function deriveAllocationFromAi(aiData) {
  if (!aiData) return { buy: 34, hold: 33, sell: 33 };

  const confidence = clamp(Number(aiData?.confidence?.score || 50), 0, 100);
  const riskLevel = String(aiData?.risk?.level || "").toLowerCase();
  const action = String(aiData?.suggestion?.action || "").toLowerCase();
  const sentimentLabel = String(aiData?.sentiment?.label || "").toLowerCase();
  const posNews = Math.max(0, Number(aiData?.sentiment?.positive || 0));
  const negNews = Math.max(0, Number(aiData?.sentiment?.negative || 0));

  let buy = 30;
  let hold = 40;
  let sell = 30;

  // Confidence tilts toward buy/sell conviction and away from hold.
  const conviction = Math.round((confidence - 50) * 0.5);
  buy += conviction;
  sell -= conviction;
  hold -= Math.round(Math.abs(confidence - 50) * 0.25);

  // Primary AI action influence.
  if (action.includes("strong buy")) {
    buy += 26;
    hold -= 12;
    sell -= 14;
  } else if (action.includes("buy")) {
    buy += 16;
    hold -= 8;
    sell -= 8;
  } else if (action.includes("strong sell")) {
    sell += 26;
    hold -= 12;
    buy -= 14;
  } else if (action.includes("sell")) {
    sell += 16;
    hold -= 8;
    buy -= 8;
  } else if (action.includes("hold") || action.includes("wait")) {
    hold += 14;
    buy -= 7;
    sell -= 7;
  }

  // Risk bias.
  if (riskLevel.includes("low")) {
    buy += 8;
    hold += 2;
    sell -= 10;
  } else if (riskLevel.includes("medium")) {
    hold += 4;
  } else if (riskLevel.includes("high")) {
    sell += 12;
    hold += 4;
    buy -= 16;
  } else if (riskLevel.includes("extreme")) {
    sell += 18;
    hold += 6;
    buy -= 24;
  }

  // Sentiment bias.
  if (sentimentLabel.includes("positive")) {
    buy += 8;
    sell -= 8;
  } else if (sentimentLabel.includes("negative")) {
    sell += 8;
    buy -= 8;
  }

  // News balance fine-tuning.
  const newsBias = clamp((posNews - negNews) * 2, -10, 10);
  buy += newsBias;
  sell -= newsBias;

  // Keep hold meaningful and prevent negative slices.
  hold = clamp(hold, 10, 70);
  buy = clamp(buy, 5, 85);
  sell = clamp(sell, 5, 85);

  return normalizeAllocation(buy, hold, sell);
}

function renderAllocationPie(aiData) {
  const allocation = deriveAllocationFromAi(aiData);
  const buy = allocation.buy;
  const hold = allocation.hold;
  const sell = allocation.sell;
  const bias = buy >= hold && buy >= sell ? "BUY" : sell >= buy && sell >= hold ? "SELL" : "HOLD";
  const confidence = Math.max(buy, hold, sell);

  allocationPie.innerHTML = `
    <div class="allocation-pie-shell">
      <div
        class="allocation-pie allocation-pie-animated"
        style="background: conic-gradient(#2fd08b 0% ${buy}%, #57b6ff ${buy}% ${buy + hold}%, #ff6d7b ${buy + hold}% 100%);"
        title="Buy ${buy}% | Hold ${hold}% | Sell ${sell}%">
        <div class="allocation-center">
          <span class="allocation-center-label">Dominant Bias</span>
          <span class="allocation-center-value">${bias}</span>
          <span class="allocation-center-score">${confidence}%</span>
        </div>
      </div>
    </div>
  `;

  allocationLegend.innerHTML = `
    <span class="legend-item legend-item-strong">
      <span class="dot dot-green"></span>Buy ${buy}%
      <span class="legend-bar"><span class="legend-fill legend-fill-green" style="width:${buy}%"></span></span>
    </span>
    <span class="legend-item legend-item-strong">
      <span class="dot dot-blue"></span>Hold ${hold}%
      <span class="legend-bar"><span class="legend-fill legend-fill-blue" style="width:${hold}%"></span></span>
    </span>
    <span class="legend-item legend-item-strong">
      <span class="dot dot-red"></span>Sell ${sell}%
      <span class="legend-bar"><span class="legend-fill legend-fill-red" style="width:${sell}%"></span></span>
    </span>
  `;
}

function getSeriesBounds(seriesList) {
  const all = seriesList.flat().filter((v) => Number.isFinite(Number(v))).map(Number);
  if (all.length === 0) return { min: -1, max: 1 };
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.12;
  return { min: min - pad, max: max + pad };
}

function scaleY(value, min, max, height) {
  const range = max - min || 1;
  return height - ((value - min) / range) * height;
}

function pointsToPath(points, width, height, min, max) {
  return points.map((v, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = scaleY(v, min, max, height);
    return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function pointsToCoords(points, width, height, min, max) {
  return points.map((v, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = scaleY(v, min, max, height);
    return { x, y };
  });
}

function sanitizeSeries(values, fallback) {
  const source = Array.isArray(values) && values.length >= 2 ? values : fallback;
  return source.map((v, i) => {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const fb = Number(fallback[i] ?? 0);
    return Number.isFinite(fb) ? fb : 0;
  });
}

function renderAreaChart(aiData) {
  const fallback = [0, 0.8, 1.3, 1.7, 2.2, 2.8, 3.2, 3.9];
  const priceGrowth = sanitizeSeries(aiData?.growth?.pricePct, fallback);
  const emaFastGrowth = sanitizeSeries(aiData?.growth?.emaFastPct, priceGrowth);
  const emaSlowGrowth = sanitizeSeries(aiData?.growth?.emaSlowPct, priceGrowth);
  const chartType = growthChartTypeSelect?.value || "area";

  const heights = getResponsiveChartHeights();
  const width = Math.max(320, Math.floor(growthAreaChart.clientWidth || 700));
  const height = Math.max(170, heights.area - 10);
  const plotHeight = height - 24;
  const { min, max } = getSeriesBounds([priceGrowth, emaFastGrowth, emaSlowGrowth]);
  const p1Coords = pointsToCoords(priceGrowth, width, plotHeight, min, max);
  const p2Coords = pointsToCoords(emaFastGrowth, width, plotHeight, min, max);
  const p3Coords = pointsToCoords(emaSlowGrowth, width, plotHeight, min, max);

  const p1 = pointsToPath(priceGrowth, width, plotHeight, min, max);
  const p2 = pointsToPath(emaFastGrowth, width, plotHeight, min, max);
  const p3 = pointsToPath(emaSlowGrowth, width, plotHeight, min, max);
  const p1Last = p1Coords[p1Coords.length - 1];
  const p2Last = p2Coords[p2Coords.length - 1];
  const p3Last = p3Coords[p3Coords.length - 1];
  const zeroY = scaleY(0, min, max, plotHeight);

  const bars = chartType === "bars"
    ? priceGrowth.map((v, i) => {
      const x = (i / (priceGrowth.length - 1)) * width;
      const y = scaleY(v, min, max, plotHeight);
      const band = width / Math.max(10, priceGrowth.length);
      const barWidth = Math.max(3, band * 0.58);
      const left = Math.max(0, x - barWidth / 2);
      const top = Math.min(y, zeroY);
      const h = Math.max(1, Math.abs(zeroY - y));
      const color = v >= 0 ? "rgba(87, 182, 255, 0.48)" : "rgba(255, 109, 123, 0.42)";
      return `<rect x="${left.toFixed(2)}" y="${top.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${h.toFixed(2)}" fill="${color}" rx="2"></rect>`;
    }).join("")
    : "";

  const fillBlue = chartType === "area"
    ? `<path class="growth-fill growth-fill-blue" d="${p1} L ${width},${height} L 0,${height} Z" fill="url(#fillBlue)"></path>`
    : "";
  const fillGreen = chartType === "area"
    ? `<path class="growth-fill growth-fill-green" d="${p2} L ${width},${height} L 0,${height} Z" fill="url(#fillGreen)"></path>`
    : "";
  const fillOrange = chartType === "area"
    ? `<path class="growth-fill growth-fill-orange" d="${p3} L ${width},${height} L 0,${height} Z" fill="url(#fillOrange)"></path>`
    : "";

  growthAreaChart.innerHTML = `
    <svg class="growth-svg" viewBox="0 0 ${width} ${height}" width="100%" height="${heights.area}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="fillBlue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#57b6ff" stop-opacity="0.42"></stop>
          <stop offset="100%" stop-color="#57b6ff" stop-opacity="0.02"></stop>
        </linearGradient>
        <linearGradient id="fillGreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2fd08b" stop-opacity="0.34"></stop>
          <stop offset="100%" stop-color="#2fd08b" stop-opacity="0.02"></stop>
        </linearGradient>
        <linearGradient id="fillOrange" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffb155" stop-opacity="0.3"></stop>
          <stop offset="100%" stop-color="#ffb155" stop-opacity="0.02"></stop>
        </linearGradient>
        <linearGradient id="lineBlue" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#6fc7ff"></stop>
          <stop offset="100%" stop-color="#57b6ff"></stop>
        </linearGradient>
        <linearGradient id="lineGreen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#73efbe"></stop>
          <stop offset="100%" stop-color="#2fd08b"></stop>
        </linearGradient>
        <linearGradient id="lineOrange" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ffd08f"></stop>
          <stop offset="100%" stop-color="#ffb155"></stop>
        </linearGradient>
        <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.1" result="blur"></feGaussianBlur>
          <feMerge>
            <feMergeNode in="blur"></feMergeNode>
            <feMergeNode in="SourceGraphic"></feMergeNode>
          </feMerge>
        </filter>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(7,14,27,0.62)" rx="10"></rect>

      <line x1="0" y1="${Math.round(height * 0.25)}" x2="${width}" y2="${Math.round(height * 0.25)}" class="growth-grid-line"></line>
      <line x1="0" y1="${Math.round(height * 0.5)}" x2="${width}" y2="${Math.round(height * 0.5)}" class="growth-grid-line"></line>
      <line x1="0" y1="${Math.round(height * 0.75)}" x2="${width}" y2="${Math.round(height * 0.75)}" class="growth-grid-line"></line>
      <line x1="0" y1="${zeroY.toFixed(2)}" x2="${width}" y2="${zeroY.toFixed(2)}" class="growth-grid-line"></line>
      ${bars}
      ${fillBlue}
      ${fillGreen}
      ${fillOrange}

      <path class="growth-line growth-line-blue" d="${p1}" fill="none" stroke="url(#lineBlue)" stroke-width="2.2" filter="url(#lineGlow)"></path>
      <path class="growth-line growth-line-green" d="${p2}" fill="none" stroke="url(#lineGreen)" stroke-width="2.2" filter="url(#lineGlow)"></path>
      <path class="growth-line growth-line-orange" d="${p3}" fill="none" stroke="url(#lineOrange)" stroke-width="2.2" filter="url(#lineGlow)"></path>

      <circle class="growth-dot growth-dot-blue" cx="${p1Last.x.toFixed(2)}" cy="${p1Last.y.toFixed(2)}" r="3.8"></circle>
      <circle class="growth-dot growth-dot-green" cx="${p2Last.x.toFixed(2)}" cy="${p2Last.y.toFixed(2)}" r="3.8"></circle>
      <circle class="growth-dot growth-dot-orange" cx="${p3Last.x.toFixed(2)}" cy="${p3Last.y.toFixed(2)}" r="3.8"></circle>
    </svg>
  `;
}

if (growthChartTypeSelect) {
  growthChartTypeSelect.addEventListener("change", () => {
    renderAreaChart(lastAiSnapshot);
  });
}

function renderAiTfPills() {
  aiTfPills.innerHTML = aiTimeframes
    .map((tf) => `<button class="tf-pill ${tf === currentAiTf ? "active" : ""}" data-tf="${tf}">${tf}</button>`)
    .join("");

  aiTfPills.querySelectorAll(".tf-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentAiTf = btn.dataset.tf;
      renderAiTfPills();
      loadAiData();
    });
  });
}

function renderAiLoading() {
  const skeleton = `
    <div class="kpi">
      <div class="kpi-label">Loading</div>
      <div class="kpi-value">...</div>
    </div>
  `.repeat(6);
  aiPrimary.innerHTML = skeleton;
  aiIndicators.innerHTML = skeleton;
  aiSignals.innerHTML = skeleton;
  aiBacktest.innerHTML = skeleton;
  confidenceScore.textContent = "...";
  marketModeBadge.textContent = "Loading";
  marketModeBadge.className = "status neutral";
  weightGrid.innerHTML = "<div class='weight-item'><div class='kpi-label'>Loading confidence components...</div></div>";
}

function renderAiPayload(data, warningText = "") {
  const safeData = data || {};
  const metrics = safeData.metrics || {};
  const indicators = safeData.indicators || {};
  const suggestion = safeData.suggestion || {};
  const sentiment = safeData.sentiment || {};
  const backtest = safeData.backtest || {};
  const confidence = safeData.confidence || {};
  const weights = confidence.components || {};
  const warningCard = warningText
    ? `<div class="kpi"><div class="kpi-label">Data Status</div><div class="kpi-value">${warningText}</div></div>`
    : "";

  const ch = Number(metrics.change24hPct);
  currentRealtimePrice = Number(metrics.realtimePrice);
  aiPrimary.innerHTML = [
    warningCard,
    kpi("Real-time Price", formatMoney(metrics.realtimePrice, 4)),
    kpi("24h % Change", formatPercent(ch), ch >= 0 ? "good" : "bad"),
    kpi("Volume", formatNumber(metrics.volume, 0)),
    kpi("24h High", formatMoney(metrics.high24h, 4)),
    kpi("24h Low", formatMoney(metrics.low24h, 4)),
    kpi("Market Cap", metrics.marketCap ? formatMoney(metrics.marketCap, 0) : "N/A")
  ].join("");

  aiIndicators.innerHTML = [
    kpi("RSI", formatNumber(indicators.rsi, 2)),
    kpi("EMA Crossover", indicators.emaCrossover || "N/A"),
    kpi("MACD", `${formatNumber(indicators.macd?.value, 3)} / ${indicators.macd?.state || "N/A"}`),
    kpi("Bollinger", indicators.bollinger?.state || "N/A"),
    kpi("Volume Signal", indicators.volumeSignal || "N/A"),
    kpi("Risk", `${safeData.risk?.level || "Unknown"} ${safeData.risk?.emoji || ""}`)
  ].join("");

  aiSignals.innerHTML = [
    kpi("Strategy", safeData.strategy || "-"),
    kpi("Action", suggestion.action || "-"),
    kpi("Entry", formatMoney(suggestion.entry, 4)),
    kpi("Stoploss", formatMoney(suggestion.stopLoss, 4)),
    kpi("Target", formatMoney(suggestion.target, 4)),
    kpi("News", `${sentiment.label || "Neutral"} ${sentiment.emoji || ""}`)
  ].join("");

  confidenceScore.textContent = Number.isFinite(Number(confidence.score)) ? `${confidence.score}%` : "-";
  marketModeBadge.textContent = safeData.marketMode || "Neutral";
  marketModeBadge.className = `status ${statusClass(safeData.marketMode || "Neutral")}`;

  weightGrid.innerHTML = [
    `RSI ${weights.rsi?.weight || 0}% -> ${weights.rsi?.score ?? "-"}`,
    `EMA ${weights.ema?.weight || 0}% -> ${weights.ema?.score ?? "-"}`,
    `MACD ${weights.macd?.weight || 0}% -> ${weights.macd?.score ?? "-"}`,
    `Volume ${weights.volume?.weight || 0}% -> ${weights.volume?.score ?? "-"}`,
    `News ${weights.news?.weight || 0}% -> ${weights.news?.score ?? "-"}`
  ].map((line) => `<div class="weight-item"><div class="kpi-label">${line}</div></div>`).join("");

  aiBacktest.innerHTML = [
    kpi("Win rate", `${formatNumber(backtest.winRate, 1)}%`),
    kpi("Profit %", `${formatNumber(backtest.profitPct, 2)}%`, Number(backtest.profitPct) >= 0 ? "good" : "bad"),
    kpi("Max drawdown", `${formatNumber(backtest.maxDrawdownPct, 2)}%`),
    kpi("Trades", formatNumber(backtest.trades, 0)),
    kpi("Trend", safeData.marketMode || "-"),
    kpi("Sentiment + / -", `${sentiment.positive ?? 0} / ${sentiment.negative ?? 0}`)
  ].join("");

  renderAllocationPie(safeData);
  renderAreaChart(safeData);
}

async function fetchAiPayloadOnce(strategy) {
  const url = `${API_BASE}/api/ai/${encodeURIComponent(SYMBOL)}?tf=${encodeURIComponent(currentAiTf)}&strategy=${encodeURIComponent(strategy)}`;
  const response = window.TradeProCore && window.TradeProCore.hasSession()
    ? await window.TradeProCore.apiFetch(`/api/ai/${encodeURIComponent(SYMBOL)}?tf=${encodeURIComponent(currentAiTf)}&strategy=${encodeURIComponent(strategy)}`)
    : await fetch(url);
  if (!response.ok) throw new Error(`AI API ${response.status}`);
  return response.json();
}

async function loadAiData() {
  const strategy = strategySelect.value;
  rememberStockPreferences();
  const hadSnapshot = Boolean(lastAiSnapshot);
  if (!hadSnapshot) renderAiLoading();
  setStockPageStatus("Loading analytics...");
  try {
    let data;
    try {
      data = await fetchAiPayloadOnce(strategy);
    } catch (firstError) {
      console.log("AI fetch warning:", firstError.message);
      data = await fetchAiPayloadOnce(strategy);
    }
    const warningText = data?.warning || (data?.degraded ? "Showing fallback analytics." : "");
    renderAiPayload(data, warningText);
    lastAiSnapshot = data;
    setStockDataMode(data?.degraded ? "Fallback Data" : "Live Data", data?.degraded ? "negative" : "positive");
    applyProviderHealth(data?.providerHealth, Boolean(data?.degraded));
    setStockPageStatus(data?.degraded ? warningText || "Showing fallback analytics." : "Live analytics loaded.");
    updateLastUpdated(Date.now());
  } catch (error) {
    if (lastAiSnapshot) {
      renderAiPayload(lastAiSnapshot, `Live refresh failed: ${error.message}. Showing last successful data.`);
      setStockDataMode("Last Good Snapshot", "neutral");
      setStockPageStatus(`Refresh failed: ${error.message}`, true);
      updateLastUpdated(Date.now());
      return;
    }
    const err = `<div class="kpi"><div class="kpi-label">AI Error</div><div class="kpi-value">${error.message}</div></div>`;
    aiPrimary.innerHTML = err;
    aiIndicators.innerHTML = "";
    aiSignals.innerHTML = "";
    aiBacktest.innerHTML = "";
    confidenceScore.textContent = "-";
    marketModeBadge.textContent = "Neutral";
    marketModeBadge.className = "status neutral";
    weightGrid.innerHTML = "";
    renderAllocationPie(null);
    renderAreaChart(null);
    lastAiSnapshot = null;
    setStockDataMode("Unavailable", "negative");
    setStockHealthStatus("Provider Error", "negative");
    setStockPageStatus(error.message, true);
  }
}

strategySelect.addEventListener("change", () => {
  rememberStockPreferences();
  loadAiData();
});

if (stockCreateAlertBtn) {
  stockCreateAlertBtn.addEventListener("click", async () => {
    try {
      setStockAlertStatus("Creating alert...");
      await createStockPageAlert();
      setStockAlertStatus(`Alert created for ${SYMBOL}. The server will check it automatically.`);
      await loadStockAlertMeta();
    } catch (error) {
      setStockAlertStatus(error.message, true);
    }
  });
}

stockUseCurrentPriceBtn?.addEventListener("click", () => {
  if (!Number.isFinite(currentRealtimePrice) || currentRealtimePrice <= 0) {
    setStockAlertStatus("Current price is not available yet.", true);
    return;
  }
  applyAlertTargetValue(currentRealtimePrice);
  setStockAlertStatus(`Alert target set to current price ${formatMoney(currentRealtimePrice, 4)}.`);
});

document.querySelectorAll("[data-alert-adjust]").forEach((button) => {
  button.addEventListener("click", () => {
    applyRelativeAlertTarget(Number(button.getAttribute("data-alert-adjust") || 0));
  });
});

stockWatchlistBtn?.addEventListener("click", () => {
  toggleWatchlistMembership().catch((error) => {
    setStockPageStatus(error.message, true);
  });
});

function refreshResponsiveCharts() {
  renderChart();
  renderOverviewWidget();
  renderTechnicalWidget();
  renderNewsWidget();
  renderAreaChart(lastAiSnapshot);
}

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(refreshResponsiveCharts, 220);
});

function startAiAutoRefresh() {
  if (aiRefreshTimer) clearInterval(aiRefreshTimer);
  const intervalMs = Math.max(0, Number(autoRefreshSelect?.value || 30000));
  if (!intervalMs) {
    setStockPageStatus("Auto-refresh is off.");
    return;
  }
  aiRefreshTimer = setInterval(() => {
    if (document.visibilityState === "visible") {
      loadAiData();
    }
  }, intervalMs);
}

autoRefreshSelect?.addEventListener("change", () => {
  rememberStockPreferences();
  startAiAutoRefresh();
});

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    loadAiData();
  }
}

document.addEventListener("visibilitychange", handleVisibilityChange);

async function bootstrapStockPage() {
  hydrateStockPreferences();
  updateWatchlistButton();
  renderChart();
  renderSymbolInfoWidget();
  renderOverviewWidget();
  renderTechnicalWidget();
  renderNewsWidget();
  renderAiTfPills();
  renderAllocationPie(null);
  try {
    await validateCurrentSymbol();
  } catch {
    if (chartEl) {
      chartEl.innerHTML = "<div class='empty-state'>This symbol is invalid or unavailable right now. Try opening it from Dashboard search so it can be validated first.</div>";
    }
    return;
  }
  await Promise.allSettled([loadAiData(), loadStockAlertMeta()]);
  startAiAutoRefresh();
}

bootstrapStockPage().catch((error) => {
  setStockPageStatus(error.message, true);
});

window.deleteStockAlert = deleteStockAlert;
