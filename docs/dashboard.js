const API_BASE =
  (window.TradeProCore && window.TradeProCore.API_BASE) ||
  window.TRADEPRO_CONFIG?.API_BASE ||
  localStorage.getItem("tp_api_base") ||
  document.querySelector('meta[name="tradepro-api-base"]')?.content ||
  "https://tradingcopy-0p0k.onrender.com";

const authBootstrapPromise = window.TradeProCore && window.TradeProCore.hasSession()
  ? window.TradeProCore.ensureAuthenticated().catch(() => {
    window.location = "index.html";
    return null;
  })
  : null;

if (!authBootstrapPromise && localStorage.getItem("auth") !== "true" && sessionStorage.getItem("auth") !== "true") {
  window.location = "index.html";
}

const quickSymbols = [
  { symbol: "NASDAQ:AAPL", market: "stock", label: "AAPL" },
  { symbol: "NASDAQ:NVDA", market: "stock", label: "NVDA" },
  { symbol: "NYSE:MSFT", market: "stock", label: "MSFT" },
  { symbol: "NASDAQ:GOOGL", market: "stock", label: "GOOGL" },
  { symbol: "NASDAQ:AMZN", market: "stock", label: "AMZN" },
  { symbol: "NASDAQ:TSLA", market: "stock", label: "TSLA" },
  { symbol: "NYSE:JPM", market: "stock", label: "JPM" },
  { symbol: "NYSE:KO", market: "stock", label: "KO" },
  { symbol: "AMEX:SPY", market: "stock", label: "SPY ETF" },
  { symbol: "AMEX:QQQ", market: "stock", label: "QQQ ETF" },
  { symbol: "FX:EURUSD", market: "forex", label: "EUR/USD" },
  { symbol: "FX:GBPUSD", market: "forex", label: "GBP/USD" },
  { symbol: "BINANCE:BTCUSDT", market: "crypto", label: "BTC/USDT" },
  { symbol: "BINANCE:ETHUSDT", market: "crypto", label: "ETH/USDT" },
  { symbol: "BINANCE:SOLUSDT", market: "crypto", label: "SOL/USDT" },
  { symbol: "CME_MINI:ES1!", market: "futures", label: "S&P E-mini" },
  { symbol: "NYMEX:CL1!", market: "futures", label: "Crude Oil" },
  { symbol: "COMEX:GC1!", market: "futures", label: "Gold" },
  { symbol: "OPRA:AAPL240621C00200000", market: "options", label: "AAPL Call" },
  { symbol: "OPRA:TSLA240621P00150000", market: "options", label: "TSLA Put" }
];

const CRYPTO_BASE_TOKENS = new Set(["BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "LTC"]);
const FUTURES_MAP = {
  ES: "CME_MINI:ES1!",
  NQ: "CME_MINI:NQ1!",
  YM: "CBOT_MINI:YM1!",
  RTY: "CME_MINI:RTY1!",
  CL: "NYMEX:CL1!",
  NG: "NYMEX:NG1!",
  GC: "COMEX:GC1!",
  SI: "COMEX:SI1!",
  HG: "COMEX:HG1!",
  ZN: "CBOT:ZN1!",
  ZB: "CBOT:ZB1!"
};
const RISK_BASE_BY_MARKET = {
  stock: 48,
  forex: 58,
  crypto: 84,
  futures: 74,
  options: 92
};
const quickBox = document.getElementById("quickSymbols");
const clearListBtn = document.getElementById("clearListBtn");
const marketTypeEl = document.getElementById("marketType");
const riskHeatMapEl = document.getElementById("riskHeatMap");
const symbolInputEl = document.getElementById("symbol");
const themeSelectEl = document.getElementById("themeSelect");
const searchStatusEl = document.getElementById("searchStatus");
const analyzeBtn = document.getElementById("analyzeBtn");
const dashboardSummaryEl = document.getElementById("dashboardSummary");
const dashboardSummaryStatusEl = document.getElementById("dashboardSummaryStatus");
const dashboardGreetingEl = document.getElementById("dashboardGreeting");
const dashboardGreetingNameEl = document.getElementById("dashboardGreetingName");
const onboardingCardEl = document.getElementById("onboardingCard");
const onboardingStepsEl = document.getElementById("onboardingSteps");
const dismissOnboardingBtn = document.getElementById("dismissOnboardingBtn");

let watchlistRenderSeq = 0;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeGreetingName(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");

  if (!cleaned) return "Trader";

  return cleaned
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getGreetingName(user = {}) {
  return normalizeGreetingName(
    user.displayName ||
    user.username ||
    String(user.email || "").split("@")[0] ||
    "Trader"
  );
}

function renderDashboardGreeting(user = {}, animate = false) {
  if (!dashboardGreetingEl || !dashboardGreetingNameEl) return;
  const name = getGreetingName(user);
  dashboardGreetingNameEl.textContent = name;
  dashboardGreetingEl.classList.remove("is-visible", "is-settled");
  if (!animate) {
    dashboardGreetingEl.classList.add("is-visible", "is-settled");
    return;
  }
  void dashboardGreetingEl.offsetWidth;
  dashboardGreetingEl.classList.add("is-visible");
  window.setTimeout(() => {
    dashboardGreetingEl.classList.add("is-settled");
  }, 820);
}

function setSearchStatus(message, isError = false) {
  if (!searchStatusEl) return;
  searchStatusEl.textContent = message || "";
  searchStatusEl.classList.toggle("bad", Boolean(isError));
}

function setAnalyzeBusy(busy, label = "Analyze") {
  if (!analyzeBtn) return;
  if (!analyzeBtn.dataset.defaultLabel) analyzeBtn.dataset.defaultLabel = analyzeBtn.textContent || label;
  analyzeBtn.disabled = busy;
  analyzeBtn.textContent = busy ? label : analyzeBtn.dataset.defaultLabel;
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

function openNotesWindow() {
  const features = [
    "width=1040",
    "height=760",
    "left=120",
    "top=80",
    "resizable=yes",
    "scrollbars=yes"
  ].join(",");
  const popup = window.open("notes.html", "tradepro_notes", features);
  if (!popup) {
    window.location = "notes.html";
    return;
  }
  popup.focus();
}

function normalizeForex(value) {
  const pair = value.replace(/\//g, "");
  if (/^[A-Z]{6}$/.test(pair)) return `FX:${pair}`;
  return "";
}

function normalizeCrypto(value) {
  const cleaned = value.replace(/\//g, "");
  if (/^[A-Z0-9]+(USDT|USDC|BUSD|USD)$/.test(cleaned)) return `BINANCE:${cleaned}`;
  if (CRYPTO_BASE_TOKENS.has(cleaned)) return `BINANCE:${cleaned}USDT`;
  return "";
}

function normalizeFutures(value) {
  const cleaned = value.replace(/\s+/g, "");
  if (FUTURES_MAP[cleaned]) return FUTURES_MAP[cleaned];
  if (/^[A-Z]{1,4}1!$/.test(cleaned)) return `CME_MINI:${cleaned}`;
  return "";
}

function normalizeOptions(value) {
  if (/^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(value)) return `OPRA:${value}`;
  return "";
}

function normalizeStock(value) {
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(value)) return "";
  return `NASDAQ:${value}`;
}

function normalizeSymbol(raw, marketType = "auto") {
  const value = String(raw || "").trim().toUpperCase();
  if (!value) return "";
  if (value.includes(":")) return value;

  if (marketType === "forex") return normalizeForex(value) || `FX:${value}`;
  if (marketType === "crypto") return normalizeCrypto(value) || `BINANCE:${value}`;
  if (marketType === "futures") return normalizeFutures(value) || `CME_MINI:${value}`;
  if (marketType === "options") return normalizeOptions(value) || `OPRA:${value}`;
  if (marketType === "stock") return normalizeStock(value);

  return (
    normalizeOptions(value) ||
    normalizeForex(value) ||
    normalizeCrypto(value) ||
    normalizeFutures(value) ||
    normalizeStock(value)
  );
}

function rememberSearchDefaults(symbol, marketType) {
  localStorage.setItem("tp_recent_symbol", String(symbol || ""));
  localStorage.setItem("tp_recent_market_type", String(marketType || "auto"));
}

async function validateSymbolBeforeNavigation(symbol) {
  if (!window.TradeProCore || !window.TradeProCore.hasSession()) {
    return { valid: true, normalizedSymbol: symbol, available: true };
  }
  const response = await window.TradeProCore.apiFetch(`/api/symbol/resolve?symbol=${encodeURIComponent(symbol)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Symbol validation failed.");
  }
  return data;
}

async function go(symbolInput, forcedMarketType) {
  const input = symbolInput || symbolInputEl.value;
  const marketType = forcedMarketType || marketTypeEl?.value || "auto";
  const symbol = normalizeSymbol(input, marketType);
  if (!symbol) {
    setSearchStatus("Enter a valid stock, forex, crypto, futures, or options symbol.", true);
    return;
  }

  try {
    setAnalyzeBusy(true, "Checking...");
    setSearchStatus(`Validating ${symbol}...`);
    const result = await validateSymbolBeforeNavigation(symbol);
    if (!result.valid) {
      setSearchStatus(result.error || "Symbol validation failed.", true);
      return;
    }
    if (!result.available) {
      setSearchStatus(result.error || "Live data is temporarily unavailable. Opening fallback stock page.", true);
    } else {
      setSearchStatus(`Validated ${result.normalizedSymbol}. Opening stock page...`);
    }
    addToWishlist(result.normalizedSymbol || symbol);
    rememberSearchDefaults(result.normalizedSymbol || symbol, marketType);
    window.location = `stock.html?symbol=${encodeURIComponent(result.normalizedSymbol || symbol)}`;
  } catch (error) {
    setSearchStatus(String(error.message || "Symbol validation failed."), true);
  } finally {
    setAnalyzeBusy(false);
  }
}

function getStoredWatchlist() {
  return JSON.parse(localStorage.getItem("wishlist") || "[]");
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

function setStoredWatchlist(list) {
  localStorage.setItem("wishlist", JSON.stringify(list));
  syncWatchlistToServer(list);
}

async function hydrateWatchlistFromServer() {
  if (!window.TradeProCore || !window.TradeProCore.hasSession()) return;
  try {
    const response = await window.TradeProCore.apiFetch("/api/watchlist");
    if (!response.ok) return;
    const data = await response.json();
    if (Array.isArray(data.watchlist)) {
      localStorage.setItem("wishlist", JSON.stringify(data.watchlist.slice(0, 20)));
    }
  } catch (error) {
    console.log("Watchlist hydrate warning:", error.message);
  }
}

function addToWishlist(symbol) {
  const list = getStoredWatchlist();
  if (!list.includes(symbol)) {
    list.unshift(symbol);
    setStoredWatchlist(list.slice(0, 20));
  }
}

function removeFromWishlist(symbol) {
  const list = getStoredWatchlist();
  const updated = list.filter((item) => item !== symbol);
  setStoredWatchlist(updated);
  renderWishlist();
  renderRiskHeatMap();
  loadDashboardSummary();
  renderOnboarding();
}

function detectMarketFromSymbol(symbol) {
  if (symbol.startsWith("FX:")) return "forex";
  if (symbol.startsWith("BINANCE:")) return "crypto";
  if (symbol.startsWith("OPRA:")) return "options";
  if (symbol.includes("1!") || symbol.startsWith("CME_") || symbol.startsWith("NYMEX:") || symbol.startsWith("COMEX:") || symbol.startsWith("CBOT")) {
    return "futures";
  }
  return "stock";
}

function symbolHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 100000;
  }
  return hash;
}

function getRiskScore(symbol) {
  const market = detectMarketFromSymbol(symbol);
  let score = RISK_BASE_BY_MARKET[market] || 50;
  const drift = (symbolHash(symbol) % 25) - 12;
  score += drift;

  if (market === "stock" && /(SPY|QQQ|IWM|DIA|VTI|VOO|IVV)/.test(symbol)) score -= 10;
  if (market === "crypto" && /BTCUSDT|ETHUSDT/.test(symbol)) score -= 8;
  if (market === "options" && /[CP]\d{8}$/.test(symbol)) score += 3;

  return Math.max(5, Math.min(99, score));
}

function getRiskClass(score) {
  if (score >= 80) return "risk-extreme";
  if (score >= 65) return "risk-high";
  if (score >= 45) return "risk-medium";
  return "risk-low";
}

function renderRiskHeatMap() {
  if (!riskHeatMapEl) return;
  const list = getStoredWatchlist();

  if (list.length === 0) {
    riskHeatMapEl.innerHTML = "<p class='brand-sub'>Add symbols to your watchlist to generate the heat map.</p>";
    return;
  }

  riskHeatMapEl.innerHTML = list
    .slice(0, 20)
    .map((symbol, index) => {
      const score = getRiskScore(symbol);
      const market = detectMarketFromSymbol(symbol);
      const riskClass = getRiskClass(score);
      const level = riskClass.replace("risk-", "").toUpperCase();
      return `
        <div class="risk-cell ${riskClass}" style="--risk-pct:${score}; --card-delay:${(index * 55)}ms;">
          <div class="risk-top">
            <div class="mono risk-symbol">${escapeHtml(symbol)}</div>
            <span class="risk-market">${escapeHtml(market)}</span>
          </div>
          <div class="risk-body">
            <div class="risk-ring"><span class="risk-score">${score}%</span></div>
            <div class="risk-meter"><span class="risk-meter-fill"></span></div>
            <div class="risk-level">${level} RISK</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function getTickerFromSymbol(symbol) {
  const text = String(symbol || "").toUpperCase();
  if (!text) return "--";
  if (!text.includes(":")) return text;
  return text.split(":").slice(1).join(":") || text;
}

function getLogoInitials(symbol) {
  const ticker = getTickerFromSymbol(symbol).replace(/[^A-Z0-9]/g, "");
  if (!ticker) return "?";
  return ticker.slice(0, 2);
}

const symbolProfileCache = new Map();

async function fetchSymbolProfile(symbol) {
  const marketType = detectMarketFromSymbol(symbol);
  if (marketType !== "stock") return null;
  if (symbolProfileCache.has(symbol)) return symbolProfileCache.get(symbol);

  const endpoint = `/api/profile/${encodeURIComponent(symbol)}`;
  try {
    const response = window.TradeProCore && window.TradeProCore.hasSession()
      ? await window.TradeProCore.apiFetch(endpoint)
      : await fetch(`${API_BASE}${endpoint}`);

    if (!response.ok) {
      symbolProfileCache.set(symbol, null);
      return null;
    }

    const data = await response.json();
    const profile = {
      ticker: String(data.ticker || getTickerFromSymbol(symbol)).toUpperCase(),
      name: String(data.name || "").trim(),
      logo: String(data.logo || "").trim()
    };

    symbolProfileCache.set(symbol, profile);
    return profile;
  } catch (error) {
    console.log("Watchlist profile warning:", error.message);
    symbolProfileCache.set(symbol, null);
    return null;
  }
}

async function buildWishlistItem(symbol) {
  const marketType = detectMarketFromSymbol(symbol);
  const profile = await fetchSymbolProfile(symbol);
  const ticker = escapeHtml(profile?.ticker || getTickerFromSymbol(symbol));
  const companyName = escapeHtml(profile?.name || marketType.toUpperCase());
  const logo = String(profile?.logo || "").trim();
  const logoHtml = logo
    ? `<img class="wish-logo" src="${logo}" alt="${ticker} logo" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='grid';"><div class="wish-logo-fallback" style="display:none;">${getLogoInitials(symbol)}</div>`
    : `<div class="wish-logo-fallback">${getLogoInitials(symbol)}</div>`;

  return `
    <div class="wish-item">
      <div class="wish-main">
        <div class="wish-logo-wrap">${logoHtml}</div>
        <div class="wish-meta">
          <a class="mono" href="stock.html?symbol=${encodeURIComponent(symbol)}">${escapeHtml(symbol)}</a>
          <p class="brand-sub wish-sub">${companyName}</p>
        </div>
      </div>
      <div class="row row-tight">
        <button class="btn ghost btn-auto" type="button" onclick="go('${symbol}','${marketType}')">Open</button>
        <button class="btn ghost btn-auto" type="button" onclick="removeFromWishlist('${symbol}')">Remove</button>
      </div>
    </div>
  `;
}

async function renderWishlist() {
  const list = getStoredWatchlist();
  const wrap = document.getElementById("wishlist");

  if (list.length === 0) {
    wrap.innerHTML = "<p class='brand-sub'>Your watchlist is empty.</p>";
    return;
  }

  const renderSeq = ++watchlistRenderSeq;
  wrap.innerHTML = list
    .map((symbol) => `
      <div class="wish-item">
        <div class="wish-main">
          <div class="wish-logo-wrap"><div class="wish-logo-fallback">${getLogoInitials(symbol)}</div></div>
          <div class="wish-meta">
            <a class="mono" href="stock.html?symbol=${encodeURIComponent(symbol)}">${escapeHtml(symbol)}</a>
            <p class="brand-sub wish-sub">Loading...</p>
          </div>
        </div>
      </div>
    `)
    .join("");

  const rows = await Promise.all(list.map((symbol) => buildWishlistItem(symbol)));
  if (renderSeq !== watchlistRenderSeq) return;
  wrap.innerHTML = rows.join("");
}

function renderQuickSymbols() {
  const marketLabels = {
    stock: "Stocks & ETFs",
    forex: "Forex",
    crypto: "Crypto",
    futures: "Futures",
    options: "Options"
  };

  const orderedMarkets = ["stock", "forex", "crypto", "futures", "options"];
  quickBox.innerHTML = orderedMarkets
    .map((market) => {
      const items = quickSymbols.filter((item) => item.market === market);
      if (!items.length) return "";
      const pills = items
        .map((item) => `<button class="pill" type="button" onclick="go('${item.symbol}','${item.market}')">${item.label}</button>`)
        .join("");
      return `<div style="width:100%;margin-top:2px;"><p class="brand-sub" style="margin:2px 0 8px 0;">${marketLabels[market]}</p>${pills}</div>`;
    })
    .join("");
}

function fmtChange(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function renderDashboardSummary(payload = {}) {
  const totalWatchlist = Number(payload.totalWatchlist || 0);
  const alertsTriggeredToday = Number(payload.alertsTriggeredToday || 0);
  const marketStatus = String(payload.marketStatus || "idle");
  const topGainer = payload.topGainer;
  const topLoser = payload.topLoser;

  dashboardSummaryEl.innerHTML = [
    `<div class="kpi"><div class="kpi-label">Watchlist</div><div class="kpi-value">${totalWatchlist}</div></div>`,
    `<div class="kpi"><div class="kpi-label">Top Gainer</div><div class="kpi-value good">${topGainer ? `${escapeHtml(topGainer.symbol)} ${fmtChange(topGainer.change24hPct)}` : "-"}</div></div>`,
    `<div class="kpi"><div class="kpi-label">Top Loser</div><div class="kpi-value ${topLoser && Number(topLoser.change24hPct) < 0 ? "bad" : ""}">${topLoser ? `${escapeHtml(topLoser.symbol)} ${fmtChange(topLoser.change24hPct)}` : "-"}</div></div>`,
    `<div class="kpi"><div class="kpi-label">Alerts Today</div><div class="kpi-value">${alertsTriggeredToday}</div></div>`,
    `<div class="kpi"><div class="kpi-label">Market Feed</div><div class="kpi-value">${escapeHtml(marketStatus)}</div></div>`,
    `<div class="kpi"><div class="kpi-label">Theme</div><div class="kpi-value">${escapeHtml(document.documentElement.getAttribute("data-theme") || "dark")}</div></div>`
  ].join("");
  dashboardSummaryStatusEl.textContent = "Summary updated from your watchlist and alert history.";
}

async function loadDashboardSummary() {
  if (!dashboardSummaryEl || !window.TradeProCore) return;
  dashboardSummaryStatusEl.textContent = "Loading watchlist summary...";
  dashboardSummaryEl.innerHTML = `<div class="kpi"><div class="kpi-label">Loading</div><div class="kpi-value">...</div></div>`.repeat(6);
  try {
    const response = await window.TradeProCore.apiFetch("/api/dashboard/summary");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Summary unavailable.");
    renderDashboardSummary(data);
  } catch (error) {
    dashboardSummaryStatusEl.textContent = String(error.message || "Summary unavailable.");
    dashboardSummaryEl.innerHTML = `<div class="kpi"><div class="kpi-label">Summary</div><div class="kpi-value bad">Unavailable</div></div>`;
  }
}

function renderOnboarding() {
  if (!onboardingCardEl || localStorage.getItem("tp_onboarding_hidden") === "true") {
    if (onboardingCardEl) onboardingCardEl.style.display = "none";
    return;
  }

  onboardingCardEl.style.display = "";
  const watchlist = getStoredWatchlist();
  const lastSymbol = localStorage.getItem("tp_recent_symbol") || "";
  const steps = [
    {
      done: watchlist.length > 0,
      title: "Search and open a symbol",
      detail: lastSymbol ? `Recent: ${lastSymbol}` : "Try AAPL, NVDA, BTCUSDT, or EURUSD."
    },
    {
      done: watchlist.length > 0,
      title: "Build a watchlist",
      detail: watchlist.length ? `${watchlist.length} symbols saved.` : "Add at least one asset so the dashboard can track risk and movers."
    },
    {
      done: false,
      title: "Create a stock alert",
      detail: "Open any stock page and use the Price Alert card with email enabled."
    },
    {
      done: false,
      title: "Review live vs fallback data",
      detail: "Stock pages now show whether analytics come from live market data or fallback data."
    }
  ];

  onboardingStepsEl.innerHTML = steps.map((step) => `
    <div class="news-item">
      <h4>${step.done ? "Completed" : "Next"}: ${escapeHtml(step.title)}</h4>
      <p>${escapeHtml(step.detail)}</p>
    </div>
  `).join("");
}

function hydrateSearchDefaults() {
  const recentSymbol = localStorage.getItem("tp_recent_symbol");
  const recentMarketType = localStorage.getItem("tp_recent_market_type");
  if (symbolInputEl && recentSymbol) symbolInputEl.value = recentSymbol;
  if (marketTypeEl && recentMarketType) marketTypeEl.value = recentMarketType;
}

if (symbolInputEl) {
  symbolInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") go();
  });
}

if (themeSelectEl && window.TradeProCore) {
  window.TradeProCore.hydrateTheme?.().finally(() => {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    themeSelectEl.value = currentTheme;
  });
  themeSelectEl.addEventListener("change", () => {
    window.TradeProCore.setTheme?.(themeSelectEl.value);
  });
}

renderDashboardGreeting(window.TradeProCore?.getUser?.() || {}, false);
authBootstrapPromise?.then((data) => {
  if (data?.user) renderDashboardGreeting(data.user, true);
});

clearListBtn?.addEventListener("click", () => {
  setStoredWatchlist([]);
  renderWishlist();
  renderRiskHeatMap();
  loadDashboardSummary();
  renderOnboarding();
});

dismissOnboardingBtn?.addEventListener("click", () => {
  localStorage.setItem("tp_onboarding_hidden", "true");
  if (onboardingCardEl) onboardingCardEl.style.display = "none";
});

hydrateSearchDefaults();
renderQuickSymbols();
hydrateWatchlistFromServer().finally(() => {
  renderWishlist();
  renderRiskHeatMap();
  loadDashboardSummary();
  renderOnboarding();
});
setSearchStatus("Validate a symbol before opening the stock page.");

window.go = go;
window.removeFromWishlist = removeFromWishlist;
window.openNotesWindow = openNotesWindow;
window.logout = logout;
