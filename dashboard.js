const API_BASE = (window.TradeProCore && window.TradeProCore.API_BASE) || "http://localhost:3000";

if (window.TradeProCore && window.TradeProCore.hasSession()) {
  window.TradeProCore.ensureAuthenticated().catch(() => {
    window.location = "index.html";
  });
} else if (localStorage.getItem("auth") !== "true" && sessionStorage.getItem("auth") !== "true") {
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
  { symbol: "AMEX:IWM", market: "stock", label: "IWM ETF" },
  { symbol: "AMEX:GLD", market: "stock", label: "GLD ETF" },
  { symbol: "FX:EURUSD", market: "forex", label: "EUR/USD" },
  { symbol: "FX:GBPUSD", market: "forex", label: "GBP/USD" },
  { symbol: "FX:USDJPY", market: "forex", label: "USD/JPY" },
  { symbol: "FX:USDCHF", market: "forex", label: "USD/CHF" },
  { symbol: "FX:AUDUSD", market: "forex", label: "AUD/USD" },
  { symbol: "FX:USDCAD", market: "forex", label: "USD/CAD" },
  { symbol: "BINANCE:BTCUSDT", market: "crypto", label: "BTC/USDT" },
  { symbol: "BINANCE:ETHUSDT", market: "crypto", label: "ETH/USDT" },
  { symbol: "BINANCE:SOLUSDT", market: "crypto", label: "SOL/USDT" },
  { symbol: "BINANCE:XRPUSDT", market: "crypto", label: "XRP/USDT" },
  { symbol: "BINANCE:BNBUSDT", market: "crypto", label: "BNB/USDT" },
  { symbol: "BINANCE:ADAUSDT", market: "crypto", label: "ADA/USDT" },
  { symbol: "BINANCE:DOGEUSDT", market: "crypto", label: "DOGE/USDT" },
  { symbol: "CME_MINI:ES1!", market: "futures", label: "S&P E-mini" },
  { symbol: "CME_MINI:NQ1!", market: "futures", label: "Nasdaq E-mini" },
  { symbol: "CBOT_MINI:YM1!", market: "futures", label: "Dow E-mini" },
  { symbol: "CME_MINI:RTY1!", market: "futures", label: "Russell 2000" },
  { symbol: "NYMEX:CL1!", market: "futures", label: "Crude Oil" },
  { symbol: "NYMEX:NG1!", market: "futures", label: "Natural Gas" },
  { symbol: "COMEX:GC1!", market: "futures", label: "Gold" },
  { symbol: "COMEX:SI1!", market: "futures", label: "Silver" },
  { symbol: "OPRA:AAPL240621C00200000", market: "options", label: "AAPL Call" },
  { symbol: "OPRA:AAPL240621P00180000", market: "options", label: "AAPL Put" },
  { symbol: "OPRA:MSFT240621C00400000", market: "options", label: "MSFT Call" },
  { symbol: "OPRA:TSLA240621P00150000", market: "options", label: "TSLA Put" },
  { symbol: "OPRA:NVDA240621C00900000", market: "options", label: "NVDA Call" }
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

const quickBox = document.getElementById("quickSymbols");
const clearListBtn = document.getElementById("clearListBtn");
const marketTypeEl = document.getElementById("marketType");
const riskHeatMapEl = document.getElementById("riskHeatMap");
const symbolInputEl = document.getElementById("symbol");
const voiceBtnEl = document.getElementById("voiceBtn");
const voiceStatusEl = document.getElementById("voiceStatus");
const themeSelectEl = document.getElementById("themeSelect");
const currencySelectEl = document.getElementById("currencySelect");

const RISK_BASE_BY_MARKET = {
  stock: 48,
  forex: 58,
  crypto: 84,
  futures: 74,
  options: 92
};

const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let voiceRecognition = null;
let voiceListening = false;

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
    if (Array.isArray(data.watchlist) && data.watchlist.length) {
      localStorage.setItem("wishlist", JSON.stringify(data.watchlist.slice(0, 20)));
    }
  } catch (error) {
    console.log("Watchlist hydrate warning:", error.message);
  }
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
  const value = raw.trim().toUpperCase();
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

function go(symbolInput, forcedMarketType) {
  const input = symbolInput || symbolInputEl.value;
  const marketType = forcedMarketType || marketTypeEl?.value || "auto";
  const symbol = normalizeSymbol(input, marketType);
  if (!symbol) {
    alert("Enter a valid symbol for stock, forex, crypto, futures, or options.");
    return;
  }

  addToWishlist(symbol);
  window.location = `stock.html?symbol=${encodeURIComponent(symbol)}`;
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
    .map(
      (symbol) => `
      <div class="wish-item">
        <div class="wish-main">
          <div class="wish-logo-wrap"><div class="wish-logo-fallback">${getLogoInitials(symbol)}</div></div>
          <div class="wish-meta">
            <a class="mono" href="stock.html?symbol=${encodeURIComponent(symbol)}">${escapeHtml(symbol)}</a>
            <p class="brand-sub wish-sub">Loading...</p>
          </div>
        </div>
        <button class="btn ghost" style="width:auto;padding:7px 10px;" onclick="removeFromWishlist('${symbol}')">Remove</button>
      </div>
    `
    )
    .join("");

  const rows = await Promise.all(list.map((symbol) => buildWishlistItem(symbol)));
  if (renderSeq !== watchlistRenderSeq) return;
  wrap.innerHTML = rows.join("");
}

const symbolProfileCache = new Map();
let watchlistRenderSeq = 0;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

async function fetchSymbolProfile(symbol) {
  const marketType = detectMarketFromSymbol(symbol);
  if (marketType !== "stock") return null;

  if (symbolProfileCache.has(symbol)) {
    return symbolProfileCache.get(symbol);
  }

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
      <button class="btn ghost" style="width:auto;padding:7px 10px;" onclick="removeFromWishlist('${symbol}')">Remove</button>
    </div>
  `;
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
      if (items.length === 0) return "";
      const pills = items
        .map(
          (item) => `<button class="pill" onclick="go('${item.symbol}','${item.market}')">${item.label}</button>`
        )
        .join("");
      return `<div style="width:100%;margin-top:2px;"><p class="brand-sub" style="margin:2px 0 8px 0;">${marketLabels[market]}</p>${pills}</div>`;
    })
    .join("");
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
            <div class="mono risk-symbol">${symbol}</div>
            <span class="risk-market">${market}</span>
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

function setVoiceStatus(message, isError = false) {
  if (!voiceStatusEl) return;
  voiceStatusEl.textContent = message || "";
  voiceStatusEl.style.color = isError ? "var(--bad)" : "var(--muted)";
}

function setVoiceListeningUI(isListening) {
  voiceListening = isListening;
  if (voiceBtnEl) voiceBtnEl.classList.toggle("listening", isListening);
  if (voiceStatusEl) voiceStatusEl.classList.toggle("listening", isListening);
}

function cleanSpokenSymbol(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/\b(OF|THE|PRICE|SHOW|ANALYZE|COMPARE|AND)\b/g, " ")
    .replace(/[^A-Z0-9:./!\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVoiceSymbolCandidate(value) {
  let symbol = String(value || "").toUpperCase().replace(/\s+/g, "");
  if (!symbol) return "";
  symbol = symbol.replace(/[.,!?;:]+$/g, "");

  // Common speech-recognition miss for crypto pairs: BTCUSD heard instead of BTCUSDT.
  if (/^(BTC|ETH|SOL|XRP|BNB|ADA|DOGE|LTC)USD$/.test(symbol)) {
    symbol = `${symbol}T`;
  }

  // If user says only base token (e.g., "BTC"), default to USDT pair.
  if (/^(BTC|ETH|SOL|XRP|BNB|ADA|DOGE|LTC)$/.test(symbol)) {
    symbol = `${symbol}USDT`;
  }

  // Format spoken crypto pairs as BASE/QUOTE for clearer input display.
  const cryptoPairMatch = symbol.match(/^([A-Z0-9]{2,10})(USDT|USDC|BUSD|USD)$/);
  if (cryptoPairMatch) {
    const [, base, quote] = cryptoPairMatch;
    symbol = `${base}/${quote}`;
  }

  return symbol;
}

function parseVoiceCommand(transcript) {
  const text = transcript.trim();

  const compareMatch = text.match(/^compare\s+(.+?)\s+and\s+(.+)$/i);
  if (compareMatch) {
    return {
      type: "compare",
      first: normalizeVoiceSymbolCandidate(cleanSpokenSymbol(compareMatch[1])),
      second: normalizeVoiceSymbolCandidate(cleanSpokenSymbol(compareMatch[2]))
    };
  }

  const analyzeMatch = text.match(/^analyze\s+(.+)$/i);
  if (analyzeMatch) {
    return { type: "analyze", symbol: normalizeVoiceSymbolCandidate(cleanSpokenSymbol(analyzeMatch[1])) };
  }

  const priceMatch = text.match(/^show\s+price\s+of\s+(.+)$/i);
  if (priceMatch) {
    return { type: "price", symbol: normalizeVoiceSymbolCandidate(cleanSpokenSymbol(priceMatch[1])) };
  }

  return { type: "analyze", symbol: normalizeVoiceSymbolCandidate(cleanSpokenSymbol(text)) };
}

function runVoiceCommand(transcript) {
  const parsed = parseVoiceCommand(transcript);

  if (parsed.type === "compare") {
    if (!parsed.first || !parsed.second) {
      setVoiceStatus("Could not parse compare command.", true);
      return;
    }
    symbolInputEl.value = parsed.first;
    addToWishlist(parsed.second);
    go(parsed.first);
    return;
  }

  const symbol = parsed.symbol;
  if (!symbol) {
    setVoiceStatus("Could not detect a valid symbol.", true);
    return;
  }

  symbolInputEl.value = symbol;
  go(symbol);
}

function startVoiceRecognition() {
  if (!SpeechRecognitionAPI) {
    setVoiceStatus("Voice recognition is not supported in this browser.", true);
    return;
  }
  if (voiceListening) return;

  voiceRecognition = new SpeechRecognitionAPI();
  voiceRecognition.lang = "en-US";
  voiceRecognition.continuous = false;
  voiceRecognition.interimResults = false;
  voiceRecognition.maxAlternatives = 1;

  voiceRecognition.onstart = () => {
    setVoiceListeningUI(true);
    setVoiceStatus("Listening");
  };

  voiceRecognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || "";
    setVoiceStatus(`Heard: "${transcript}"`);
    runVoiceCommand(transcript);
  };

  voiceRecognition.onerror = (event) => {
    setVoiceStatus(`Voice error: ${event.error}`, true);
  };

  voiceRecognition.onend = () => {
    setVoiceListeningUI(false);
  };

  voiceRecognition.start();
}

if (symbolInputEl) {
  symbolInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      go();
    }
  });
}

if (voiceBtnEl) {
  voiceBtnEl.addEventListener("click", startVoiceRecognition);
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

if (currencySelectEl && window.TradeProCore) {
  const currentCurrency = window.TradeProCore.getCurrency?.() || "USD";
  currencySelectEl.value = currentCurrency;
  currencySelectEl.addEventListener("change", () => {
    window.TradeProCore.setCurrency?.(currencySelectEl.value);
  });
  window.addEventListener("tp:currency-changed", (event) => {
    const nextCurrency = String(event?.detail?.currency || "").toUpperCase();
    if (!nextCurrency) return;
    currencySelectEl.value = nextCurrency;
  });
}

clearListBtn.addEventListener("click", () => {
  setStoredWatchlist([]);
  renderWishlist();
  renderRiskHeatMap();
});

renderQuickSymbols();
hydrateWatchlistFromServer().finally(() => {
  renderWishlist();
  renderRiskHeatMap();
});




