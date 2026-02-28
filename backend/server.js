const express = require("express");
const cors = require("cors");
const axios = require("axios");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const { RSI, EMA, MACD, BollingerBands, ATR } = require("technicalindicators");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const FINNHUB_KEY = process.env.FINNHUB_KEY;
const AUTH_SECRET = process.env.AUTH_SECRET || "tradepro-local-dev-secret";
const ACCESS_TTL_SECONDS = Number(process.env.ACCESS_TTL_SECONDS || 900);
const REFRESH_TTL_SECONDS = Number(process.env.REFRESH_TTL_SECONDS || 604800);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || "";
const ALPACA_SANDBOX_KEY = process.env.ALPACA_SANDBOX_KEY || "";
const ALPACA_SANDBOX_SECRET = process.env.ALPACA_SANDBOX_SECRET || "";
const OANDA_SANDBOX_TOKEN = process.env.OANDA_SANDBOX_TOKEN || "";
const OANDA_SANDBOX_ACCOUNT_ID = process.env.OANDA_SANDBOX_ACCOUNT_ID || "";
const BROKER_WEBHOOK_SECRET = process.env.BROKER_WEBHOOK_SECRET || "";
const DB_FILE = path.join(__dirname, "data", "app-db.json");
const REGISTER_EXPORT_FILE = path.join(__dirname, "..", "registered-users.csv");
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 180);
const RATE_LIMIT_AUTH_MAX_REQUESTS = Number(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS || 700);
const ENABLE_PAPER_TRADING_FEATURE = String(process.env.ENABLE_PAPER_TRADING_FEATURE || "false").toLowerCase() === "true";
const ENABLE_PORTFOLIO_FEATURE = String(process.env.ENABLE_PORTFOLIO_FEATURE || "false").toLowerCase() === "true";
const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_.-]{2,23}$/;

const CRYPTO_EXCHANGES = new Set(["BINANCE", "COINBASE", "BYBIT", "KRAKEN", "BITFINEX"]);
const FOREX_EXCHANGES = new Set(["FX", "FOREX", "OANDA", "FX_IDC"]);
const FUTURES_EXCHANGES = new Set(["CME", "CME_MINI", "CBOT", "CBOT_MINI", "COMEX", "NYMEX", "ICEUS", "NYBOT"]);
const OPTIONS_EXCHANGES = new Set(["OPRA", "CBOE", "AMEX", "ISE", "NASDAQ"]);
const OPTION_PATTERN = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;
const FUTURES_TO_YAHOO = {
  ES: "ES=F",
  NQ: "NQ=F",
  YM: "YM=F",
  RTY: "RTY=F",
  CL: "CL=F",
  NG: "NG=F",
  GC: "GC=F",
  SI: "SI=F",
  HG: "HG=F",
  ZN: "ZN=F",
  ZB: "ZB=F"
};
const TIMEFRAME_CONFIG = {
  "1m": { interval: "1m", range: "5d", bars24h: 1440 },
  "5m": { interval: "5m", range: "1mo", bars24h: 288 },
  "15m": { interval: "15m", range: "1mo", bars24h: 96 },
  "1h": { interval: "60m", range: "3mo", bars24h: 24 },
  "4h": { interval: "60m", range: "6mo", bars24h: 6 },
  "1D": { interval: "1d", range: "1y", bars24h: 1 }
};

app.use(cors());
app.use(express.json());

const requestBuckets = new Map();
const revokedRefreshTokens = new Set();
const liveFeedState = {
  clients: new Map(),
  lastTickAt: 0
};

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signToken(payload, expiresInSeconds) {
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const exp = nowSeconds() + expiresInSeconds;
  const body = toBase64Url(JSON.stringify({ ...payload, exp }));
  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const [header, body, signature] = String(token || "").split(".");
    if (!header || !body || !signature) return null;
    const expected = crypto.createHmac("sha256", AUTH_SECRET).update(`${header}.${body}`).digest("base64url");
    if (expected !== signature) return null;
    const payload = JSON.parse(fromBase64Url(body));
    if (!payload || typeof payload !== "object") return null;
    if (!payload.exp || payload.exp < nowSeconds()) return null;
    return payload;
  } catch {
    return null;
  }
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password || "")).digest("hex");
}

function createUserId() {
  if (typeof crypto.randomUUID === "function") {
    return `u-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `u-${crypto.randomBytes(6).toString("hex")}`;
}

function validateRegistrationInput(username, password) {
  if (!USERNAME_REGEX.test(username)) {
    return "Username must start with a letter and be 3-24 characters (letters, numbers, _, ., -).";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must include at least one letter and one number.";
  }
  return "";
}

function ensureDbFile() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(DB_FILE)) return;

  const defaultDb = {
    users: [
      {
        id: "u-admin",
        username: "admin",
        passwordHash: hashPassword("1234"),
        role: "admin",
        displayName: "Admin Trader"
      }
    ],
    watchlists: {
      "u-admin": []
    },
    preferences: {
      "u-admin": {
        defaultStrategy: "swing",
        defaultAiTf: "1D",
        theme: "dark",
        activeWorkspaceId: "ws-default",
        workspaces: [
          {
            id: "ws-default",
            name: "Default Workspace",
            layout: {
              dashboardPanels: ["watchlist", "risk-heatmap", "planning-tools"],
              density: "comfortable"
            },
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ]
      }
    },
    paperTrading: {
      "u-admin": {
        cash: 100000,
        positions: {},
        orders: [],
        closedTrades: [],
        updatedAt: Date.now()
      }
    },
    alerts: {
      "u-admin": []
    },
    alertEvents: {
      "u-admin": []
    },
    backtests: {
      "u-admin": []
    },
    teamSpaces: {},
    brokerSandbox: {
      "u-admin": {
        connected: false,
        provider: "",
        accountId: "",
        buyingPower: 100000,
        maxOrderValuePct: 25,
        status: "disconnected",
        updatedAt: Date.now(),
        orderHistory: []
      }
    },
    activityLogs: {
      "u-admin": []
    }
  };

  fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), "utf8");
}

function readDb() {
  ensureDbFile();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      watchlists: parsed.watchlists && typeof parsed.watchlists === "object" ? parsed.watchlists : {},
      preferences: parsed.preferences && typeof parsed.preferences === "object" ? parsed.preferences : {},
      paperTrading: parsed.paperTrading && typeof parsed.paperTrading === "object" ? parsed.paperTrading : {},
      alerts: parsed.alerts && typeof parsed.alerts === "object" ? parsed.alerts : {},
      alertEvents: parsed.alertEvents && typeof parsed.alertEvents === "object" ? parsed.alertEvents : {},
      backtests: parsed.backtests && typeof parsed.backtests === "object" ? parsed.backtests : {},
      teamSpaces: parsed.teamSpaces && typeof parsed.teamSpaces === "object" ? parsed.teamSpaces : {},
      brokerSandbox: parsed.brokerSandbox && typeof parsed.brokerSandbox === "object" ? parsed.brokerSandbox : {},
      activityLogs: parsed.activityLogs && typeof parsed.activityLogs === "object" ? parsed.activityLogs : {}
    };
  } catch {
    return {
      users: [],
      watchlists: {},
      preferences: {},
      paperTrading: {},
      alerts: {},
      alertEvents: {},
      backtests: {},
      teamSpaces: {},
      brokerSandbox: {},
      activityLogs: {}
    };
  }
}

function writeDb(db) {
  ensureDbFile();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function appendRegistrationExport(user) {
  try {
    const dir = path.dirname(REGISTER_EXPORT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const hasFile = fs.existsSync(REGISTER_EXPORT_FILE);
    if (!hasFile) {
      const header = [
        "registered_at_utc",
        "user_id",
        "username",
        "display_name",
        "role"
      ].join(",");
      fs.writeFileSync(REGISTER_EXPORT_FILE, `${header}\n`, "utf8");
    }

    const row = [
      new Date().toISOString(),
      user.id,
      user.username,
      user.displayName || "",
      user.role || "user"
    ]
      .map(csvCell)
      .join(",");

    fs.appendFileSync(REGISTER_EXPORT_FILE, `${row}\n`, "utf8");
  } catch (error) {
    console.log("Registration export warning:", error.message);
  }
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role || "user",
    displayName: user.displayName || user.username
  };
}

function issueTokens(userId, username, role) {
  const accessToken = signToken({ sub: userId, username, role, tokenType: "access" }, ACCESS_TTL_SECONDS);
  const refreshToken = signToken({ sub: userId, username, role, tokenType: "refresh" }, REFRESH_TTL_SECONDS);
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS };
}

function getBearerToken(req) {
  const authHeader = String(req.headers.authorization || "");
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

function authRequired(req, res, next) {
  const token = getBearerToken(req);
  const payload = verifyToken(token);
  if (!payload || payload.tokenType !== "access") {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.user = payload;
  next();
}

function rateLimit(req, res, next) {
  const keyBase = req.ip || req.socket.remoteAddress || "unknown";
  const authPayload = verifyToken(getBearerToken(req));
  const key = authPayload?.sub ? `${keyBase}:${authPayload.sub}` : keyBase;
  const maxRequests = authPayload?.sub ? RATE_LIMIT_AUTH_MAX_REQUESTS : RATE_LIMIT_MAX_REQUESTS;
  const now = Date.now();
  const current = requestBuckets.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > current.resetAt) {
    current.count = 0;
    current.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  current.count += 1;
  requestBuckets.set(key, current);

  if (current.count > maxRequests) {
    return res.status(429).json({ error: "Too many requests" });
  }

  next();
}

app.use(rateLimit);

app.use((req, res, next) => {
  if (!ENABLE_PAPER_TRADING_FEATURE && (req.path.startsWith("/api/paper") || req.path.startsWith("/api/broker"))) {
    return res.status(410).json({ error: "Paper trading feature is disabled" });
  }
  if (!ENABLE_PORTFOLIO_FEATURE && req.path.startsWith("/api/portfolio/analytics")) {
    return res.status(410).json({ error: "Portfolio feature is disabled" });
  }
  next();
});

app.use((req, res, next) => {
  const tokenPayload = verifyToken(getBearerToken(req));
  if (!tokenPayload || tokenPayload.tokenType !== "access") return next();

  const startedAt = Date.now();
  res.on("finish", () => {
    try {
      const shouldLog = req.method !== "GET" || req.path.startsWith("/api/workspaces") || req.path.startsWith("/api/theme");
      if (!shouldLog) return;
      if (req.path.startsWith("/api/live/stream")) return;

      const db = readDb();
      pushActivityLog(db, tokenPayload.sub, {
        type: "api_call",
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt
      });
      writeDb(db);
    } catch (error) {
      console.log("Activity log warning:", error.message);
    }
  });
  next();
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toFixedNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function createEntityId(prefix) {
  return `${prefix}-${crypto.randomBytes(5).toString("hex")}`;
}

function ensureUserFeatureState(db, userId) {
  if (!db.paperTrading[userId]) {
    db.paperTrading[userId] = {
      cash: 100000,
      positions: {},
      orders: [],
      closedTrades: [],
      updatedAt: Date.now()
    };
  }
  if (!db.alerts[userId]) db.alerts[userId] = [];
  if (!db.alertEvents[userId]) db.alertEvents[userId] = [];
  if (!db.backtests[userId]) db.backtests[userId] = [];
  if (!db.teamSpaces || typeof db.teamSpaces !== "object") db.teamSpaces = {};
  if (!db.brokerSandbox || typeof db.brokerSandbox !== "object") db.brokerSandbox = {};
  if (!db.brokerSandbox[userId]) {
    db.brokerSandbox[userId] = {
      connected: false,
      provider: "",
      accountId: "",
      buyingPower: 100000,
      maxOrderValuePct: 25,
      status: "disconnected",
      updatedAt: Date.now(),
      orderHistory: []
    };
  }
  if (!Array.isArray(db.brokerSandbox[userId].orderHistory)) db.brokerSandbox[userId].orderHistory = [];
  if (!db.activityLogs || typeof db.activityLogs !== "object") db.activityLogs = {};
  if (!db.activityLogs[userId]) db.activityLogs[userId] = [];
  if (!db.preferences[userId]) db.preferences[userId] = {};
  if (!Array.isArray(db.preferences[userId].workspaces)) {
    db.preferences[userId].workspaces = [
      {
        id: "ws-default",
        name: "Default Workspace",
        layout: { dashboardPanels: ["watchlist", "risk-heatmap", "planning-tools"], density: "comfortable" },
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];
  }
  if (!db.preferences[userId].activeWorkspaceId) {
    db.preferences[userId].activeWorkspaceId = db.preferences[userId].workspaces[0]?.id || "ws-default";
  }
  if (!db.preferences[userId].theme) {
    db.preferences[userId].theme = "dark";
  }
}

function pushActivityLog(db, userId, activity) {
  ensureUserFeatureState(db, userId);
  db.activityLogs[userId].push({
    id: createEntityId("evt"),
    ts: Date.now(),
    ...activity
  });
  db.activityLogs[userId] = db.activityLogs[userId].slice(-1000);
}

function ensureTeamShape(team) {
  if (!team.members || typeof team.members !== "object") team.members = {};
  if (!Array.isArray(team.watchlist)) team.watchlist = [];
  if (!Array.isArray(team.notes)) team.notes = [];
}

function findUserByUsername(db, username) {
  const needle = String(username || "").trim().toLowerCase();
  if (!needle) return null;
  return db.users.find((u) => String(u.username || "").toLowerCase() === needle) || null;
}

function normalizeSocialProvider(providerRaw) {
  const value = String(providerRaw || "").trim().toLowerCase();
  if (value === "google" || value === "google.com") return "google.com";
  if (value === "apple" || value === "apple.com") return "apple.com";
  return "";
}

function findUserBySocialIdentity(db, provider, providerUserId) {
  const safeProvider = String(provider || "");
  const safeId = String(providerUserId || "");
  if (!safeProvider || !safeId) return null;
  return db.users.find((u) => u.authProvider === safeProvider && u.authProviderUserId === safeId) || null;
}

function buildSocialUsername(db, email, provider, providerUserId) {
  const emailLocal = String(email || "").split("@")[0] || "";
  const fallback = `${provider.split(".")[0]}_${providerUserId.slice(-8)}`.toLowerCase();
  const cleaned = String(emailLocal || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "")
    .replace(/^[^a-z]+/, "");
  const base = cleaned.length >= 3 ? cleaned : `user_${providerUserId.slice(-8)}`.replace(/^[^a-z]+/, "u");
  let candidate = base.slice(0, 24);
  if (!USERNAME_REGEX.test(candidate)) candidate = `u${candidate}`.slice(0, 24);

  if (!findUserByUsername(db, candidate)) return candidate;
  for (let i = 1; i < 1000; i += 1) {
    const next = `${candidate.slice(0, 20)}_${i}`.slice(0, 24);
    if (USERNAME_REGEX.test(next) && !findUserByUsername(db, next)) return next;
  }
  return `u${Date.now().toString(36).slice(-8)}`;
}

function firebaseProviderMatches(firebaseUser, provider) {
  const providers = Array.isArray(firebaseUser?.providerUserInfo) ? firebaseUser.providerUserInfo : [];
  return providers.some((item) => String(item?.providerId || "").toLowerCase() === provider);
}

async function verifyFirebaseIdToken(idToken) {
  if (!FIREBASE_WEB_API_KEY) {
    throw new Error("FIREBASE_WEB_API_KEY is not configured on server.");
  }
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`;
  const response = await axios.post(url, { idToken }, { timeout: 10000 });
  const users = Array.isArray(response.data?.users) ? response.data.users : [];
  if (!users.length) {
    throw new Error("Invalid Firebase token.");
  }
  return users[0];
}

function ensureSocialUser(db, provider, firebaseUser) {
  const providerUserId = String(
    firebaseUser?.providerUserInfo?.find((p) => String(p?.providerId || "").toLowerCase() === provider)?.rawId ||
    firebaseUser?.localId ||
    ""
  ).trim();
  if (!providerUserId) {
    throw new Error("Missing provider identity.");
  }

  const email = String(firebaseUser?.email || "").trim().toLowerCase();
  const displayName = String(firebaseUser?.displayName || "").trim();
  let user =
    findUserBySocialIdentity(db, provider, providerUserId) ||
    (email ? db.users.find((u) => String(u.email || "").toLowerCase() === email) : null);
  if (user) {
    if (!user.authProvider) user.authProvider = provider;
    if (!user.authProviderUserId) user.authProviderUserId = providerUserId;
    if (!user.email && email) user.email = email;
    if (!user.displayName && displayName) user.displayName = displayName;
    return user;
  }

  const username = buildSocialUsername(db, email, provider, providerUserId);
  user = {
    id: createUserId(),
    username,
    passwordHash: "",
    role: "user",
    displayName: displayName || username,
    email,
    authProvider: provider,
    authProviderUserId: providerUserId
  };
  db.users.push(user);
  db.watchlists[user.id] = [];
  db.preferences[user.id] = {
    defaultStrategy: "swing",
    defaultAiTf: "1D",
    theme: "dark",
    activeWorkspaceId: "ws-default",
    workspaces: [
      {
        id: "ws-default",
        name: "Default Workspace",
        layout: { dashboardPanels: ["watchlist", "risk-heatmap", "planning-tools"], density: "comfortable" },
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ]
  };
  return user;
}

function resolveTeamAccess(db, teamId, userId) {
  const team = db.teamSpaces?.[teamId];
  if (!team) return { ok: false, status: 404, error: "Team space not found" };
  ensureTeamShape(team);
  const role = String(team.members?.[userId] || "");
  if (!role) return { ok: false, status: 403, error: "No access to this team space" };
  return { ok: true, team, role };
}

function cleanSymbolInput(input) {
  return String(input || "").trim().toUpperCase();
}

function toPositiveInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function toOptionalNumber(value) {
  if (value === null || value === undefined) return Number.NaN;
  if (typeof value === "string" && value.trim() === "") return Number.NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

function splitSymbol(input) {
  const symbol = decodeURIComponent(String(input || "")).trim().toUpperCase();
  if (!symbol) {
    return {
      original: "",
      apiSymbol: "",
      isCrypto: false,
      exchange: "",
      symbolOnly: "",
      marketType: "stock"
    };
  }

  if (!symbol.includes(":")) {
    const marketType = OPTION_PATTERN.test(symbol) ? "options" : "stock";
    return { original: symbol, apiSymbol: symbol, isCrypto: false, exchange: "", symbolOnly: symbol, marketType };
  }

  const [exchangeRaw, ...rest] = symbol.split(":");
  const exchange = exchangeRaw.trim();
  const symbolOnly = rest.join(":").trim();

  const isCrypto = CRYPTO_EXCHANGES.has(exchange);
  const isForex = FOREX_EXCHANGES.has(exchange);
  const isFutures = FUTURES_EXCHANGES.has(exchange) || /1!$/.test(symbolOnly);
  const isOptions = OPTIONS_EXCHANGES.has(exchange) && OPTION_PATTERN.test(symbolOnly);

  let marketType = "stock";
  if (isCrypto) marketType = "crypto";
  else if (isForex) marketType = "forex";
  else if (isFutures) marketType = "futures";
  else if (isOptions || OPTION_PATTERN.test(symbolOnly)) marketType = "options";

  return {
    original: symbol,
    apiSymbol: isCrypto ? symbol : symbolOnly,
    isCrypto,
    exchange,
    symbolOnly,
    marketType
  };
}

function toYahooTicker(symbolInfo) {
  if (symbolInfo.marketType === "crypto") {
    const pair = symbolInfo.symbolOnly || symbolInfo.apiSymbol;
    const m = pair.match(/^([A-Z0-9]+)(USDT|USDC|BUSD|USD)$/);
    if (m) return `${m[1]}-USD`;
    return pair.replace("/", "-");
  }

  if (symbolInfo.marketType === "forex") {
    const pair = (symbolInfo.symbolOnly || "").replace("/", "");
    if (/^[A-Z]{6}$/.test(pair)) return `${pair}=X`;
  }

  if (symbolInfo.marketType === "futures") {
    const root = (symbolInfo.symbolOnly || "").replace(/[^A-Z]/g, "").slice(0, 3);
    if (FUTURES_TO_YAHOO[root]) return FUTURES_TO_YAHOO[root];
  }

  if (symbolInfo.marketType === "options") {
    const option = symbolInfo.symbolOnly || "";
    const m = option.match(/^([A-Z]{1,6})\d{6}[CP]\d{8}$/);
    if (m) return m[1];
  }

  if (/1!$/.test(symbolInfo.symbolOnly || "")) {
    const root = (symbolInfo.symbolOnly || "").replace(/[^A-Z]/g, "").slice(0, 3);
    if (FUTURES_TO_YAHOO[root]) return FUTURES_TO_YAHOO[root];
  }

  if (OPTION_PATTERN.test(symbolInfo.symbolOnly || "")) {
    return (symbolInfo.symbolOnly || "").match(/^([A-Z]{1,6})/)?.[1] || symbolInfo.symbolOnly;
  }

  return symbolInfo.symbolOnly || symbolInfo.apiSymbol;
}

async function fetchFinnhubNews(symbolInfo) {
  try {
    if (!FINNHUB_KEY) return [];

    if (symbolInfo.isCrypto) {
      const response = await axios.get("https://finnhub.io/api/v1/news", {
        params: { category: "crypto", token: FINNHUB_KEY },
        timeout: 10000
      });
      return Array.isArray(response.data) ? response.data : [];
    }

    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const formatDate = (d) => d.toISOString().split("T")[0];

    const response = await axios.get("https://finnhub.io/api/v1/company-news", {
      params: {
        symbol: symbolInfo.apiSymbol,
        from: formatDate(fromDate),
        to: formatDate(toDate),
        token: FINNHUB_KEY
      },
      timeout: 10000
    });

    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.log("News Warning:", error.response?.data || error.message);
    return [];
  }
}

function sentimentFromNews(news) {
  const positiveWords = ["gain", "growth", "beat", "surge", "record", "upgrade", "bullish", "rally"];
  const negativeWords = ["loss", "drop", "fall", "lawsuit", "downgrade", "miss", "risk", "bearish"];

  let positive = 0;
  let negative = 0;

  news.slice(0, 20).forEach((item) => {
    const text = `${item.headline || ""} ${item.summary || ""}`.toLowerCase();
    if (positiveWords.some((w) => text.includes(w))) positive += 1;
    if (negativeWords.some((w) => text.includes(w))) negative += 1;
  });

  const score = clamp(50 + (positive - negative) * 5, 0, 100);
  const label = score > 58 ? "Positive" : score < 42 ? "Negative" : "Neutral";
  const emoji = score > 58 ? "??" : score < 42 ? "??" : "?";

  return { positive, negative, score: Math.round(score), label, emoji };
}

async function fetchYahooCandles(yahooTicker, tf) {
  const cfg = TIMEFRAME_CONFIG[tf] || TIMEFRAME_CONFIG["1D"];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}`;

  const response = await axios.get(url, {
    params: { interval: cfg.interval, range: cfg.range },
    timeout: 12000
  });

  const result = response.data?.chart?.result?.[0];
  if (!result || !Array.isArray(result.timestamp)) {
    throw new Error("No candle data");
  }

  const quote = result.indicators?.quote?.[0] || {};
  const rows = result.timestamp
    .map((ts, i) => ({
      ts,
      open: Number(quote.open?.[i]),
      high: Number(quote.high?.[i]),
      low: Number(quote.low?.[i]),
      close: Number(quote.close?.[i]),
      volume: Number(quote.volume?.[i])
    }))
    .filter((r) => Number.isFinite(r.close));

  if (rows.length < 40) {
    throw new Error("Not enough candle data");
  }

  return { rows, meta: result.meta || {}, cfg };
}

async function fetchMarketCap(yahooTicker, marketType) {
  if (marketType !== "stock") return null;

  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooTicker)}`;
    const response = await axios.get(url, {
      params: { modules: "price" },
      timeout: 10000
    });

    return response.data?.quoteSummary?.result?.[0]?.price?.marketCap?.raw ?? null;
  } catch {
    return null;
  }
}

async function fetchLatestPriceForSymbol(symbol) {
  const symbolInfo = splitSymbol(symbol);
  const yahooTicker = toYahooTicker(symbolInfo);
  const { rows } = await fetchYahooCandles(yahooTicker, "1m");
  const last = rows[rows.length - 1];
  if (!last || !Number.isFinite(last.close)) throw new Error("No latest price");
  return Number(last.close);
}

function evaluateLimitFill(order, currentPrice) {
  if (order.orderType !== "limit") return true;
  if (!Number.isFinite(order.limitPrice)) return false;
  if (order.side === "buy") return currentPrice <= order.limitPrice;
  if (order.side === "sell") return currentPrice >= order.limitPrice;
  return false;
}

function safeBrokerView(state) {
  return {
    connected: Boolean(state.connected),
    provider: String(state.provider || ""),
    accountId: String(state.accountId || ""),
    buyingPower: toFixedNumber(Number(state.buyingPower || 0), 2),
    maxOrderValuePct: toFixedNumber(Number(state.maxOrderValuePct || 25), 2),
    status: String(state.status || "disconnected"),
    updatedAt: Number(state.updatedAt || 0),
    recentOrders: (state.orderHistory || []).slice(-40).reverse()
  };
}

function normalizeBrokerProvider(raw) {
  const p = String(raw || "paper-broker").trim().toLowerCase();
  if (["paper-broker", "alpaca-sandbox", "oanda-sandbox"].includes(p)) return p;
  return "paper-broker";
}

function providerCredentialsStatus(provider) {
  if (provider === "alpaca-sandbox") {
    return {
      ok: Boolean(ALPACA_SANDBOX_KEY && ALPACA_SANDBOX_SECRET),
      missing: [
        !ALPACA_SANDBOX_KEY ? "ALPACA_SANDBOX_KEY" : "",
        !ALPACA_SANDBOX_SECRET ? "ALPACA_SANDBOX_SECRET" : ""
      ].filter(Boolean)
    };
  }
  if (provider === "oanda-sandbox") {
    return {
      ok: Boolean(OANDA_SANDBOX_TOKEN),
      missing: [
        !OANDA_SANDBOX_TOKEN ? "OANDA_SANDBOX_TOKEN" : ""
      ].filter(Boolean)
    };
  }
  return { ok: true, missing: [] };
}

function mapSymbolForProvider(symbol, provider) {
  const info = splitSymbol(symbol);
  if (provider === "alpaca-sandbox") {
    if (info.marketType === "stock") return { ok: true, symbol: info.symbolOnly || info.apiSymbol };
    if (info.marketType === "crypto") {
      const pair = (info.symbolOnly || info.apiSymbol || "").replace("/", "");
      const m = pair.match(/^([A-Z0-9]+)(USDT|USDC|BUSD|USD)$/);
      if (!m) return { ok: false, error: "Unsupported crypto pair for Alpaca sandbox" };
      const quote = m[2] === "USD" ? "USD" : "USD";
      return { ok: true, symbol: `${m[1]}/${quote}` };
    }
    return { ok: false, error: "Alpaca sandbox supports stock/crypto symbols only" };
  }

  if (provider === "oanda-sandbox") {
    if (info.marketType !== "forex") return { ok: false, error: "OANDA sandbox supports forex pairs only" };
    const pair = (info.symbolOnly || "").replace("/", "");
    if (!/^[A-Z]{6}$/.test(pair)) return { ok: false, error: "Invalid forex symbol for OANDA sandbox" };
    return { ok: true, symbol: `${pair.slice(0, 3)}_${pair.slice(3)}` };
  }

  return { ok: true, symbol };
}

async function placeExternalSandboxOrder(provider, broker, order) {
  if (provider === "alpaca-sandbox") {
    const mapped = mapSymbolForProvider(order.symbol, provider);
    if (!mapped.ok) throw new Error(mapped.error);
    const payload = {
      symbol: mapped.symbol,
      qty: String(order.quantity),
      side: order.side,
      type: "market",
      time_in_force: "day"
    };
    const response = await axios.post("https://paper-api.alpaca.markets/v2/orders", payload, {
      headers: {
        "APCA-API-KEY-ID": ALPACA_SANDBOX_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SANDBOX_SECRET,
        "Content-Type": "application/json"
      },
      timeout: 12000
    });
    return {
      providerOrderId: String(response.data?.id || ""),
      rawStatus: String(response.data?.status || "accepted"),
      accepted: true
    };
  }

  if (provider === "oanda-sandbox") {
    const mapped = mapSymbolForProvider(order.symbol, provider);
    if (!mapped.ok) throw new Error(mapped.error);
    const accountId = broker.accountId || OANDA_SANDBOX_ACCOUNT_ID;
    if (!accountId) throw new Error("OANDA account id is required");
    const units = order.side === "buy" ? String(order.quantity) : String(-order.quantity);
    const payload = {
      order: {
        units,
        instrument: mapped.symbol,
        timeInForce: "FOK",
        type: "MARKET",
        positionFill: "DEFAULT"
      }
    };
    const response = await axios.post(
      `https://api-fxpractice.oanda.com/v3/accounts/${encodeURIComponent(accountId)}/orders`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${OANDA_SANDBOX_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 12000
      }
    );
    return {
      providerOrderId: String(response.data?.orderFillTransaction?.id || response.data?.orderCreateTransaction?.id || ""),
      rawStatus: String(response.data?.orderFillTransaction ? "filled" : "accepted"),
      accepted: true
    };
  }

  return { providerOrderId: "", rawStatus: "simulated", accepted: true };
}

function mapProviderStatusToInternal(rawStatus) {
  const s = String(rawStatus || "").toLowerCase();
  if (["filled", "fill", "done_for_day"].includes(s)) return "filled";
  if (["partially_filled", "partial_fill"].includes(s)) return "partial";
  if (["canceled", "cancelled", "expired", "done"].includes(s)) return "canceled";
  if (["rejected"].includes(s)) return "rejected";
  if (["accepted", "new", "pending_new", "pending", "open"].includes(s)) return "pending";
  return "pending";
}

function applyBrokerAccounting(broker, brokerOrder, side, amount) {
  if (brokerOrder.accountingApplied) return;
  if (!Number.isFinite(amount) || amount <= 0) return;
  if (side === "buy") {
    broker.buyingPower = Math.max(0, Number(broker.buyingPower || 0) - amount);
  } else if (side === "sell") {
    broker.buyingPower = Number(broker.buyingPower || 0) + amount;
  }
  brokerOrder.accountingApplied = true;
}

function applyProviderFillToPaperAndBroker(db, userId, brokerOrder, status, filledPrice, reason) {
  ensureUserFeatureState(db, userId);
  const broker = db.brokerSandbox[userId];
  const paper = db.paperTrading[userId];
  const normalized = mapProviderStatusToInternal(status);
  brokerOrder.providerStatus = String(status || brokerOrder.providerStatus || "");
  brokerOrder.updatedAt = Date.now();
  if (reason) brokerOrder.reason = String(reason);

  const paperOrder = (paper.orders || []).find((o) => o.id === brokerOrder.paperOrderId);
  const price = Number.isFinite(Number(filledPrice)) ? Number(filledPrice) : Number(brokerOrder.filledPrice || brokerOrder.requestedPrice || 0);

  if (normalized === "filled") {
    if (paperOrder && paperOrder.status === "open") {
      fillPaperOrder(paper, paperOrder, Number.isFinite(price) && price > 0 ? price : Number(brokerOrder.requestedPrice || 0), "broker_provider_fill");
    }
    brokerOrder.status = "filled";
    if (Number.isFinite(price) && price > 0) brokerOrder.filledPrice = price;
    const amount = Number.isFinite(price) && price > 0 ? price * Number(brokerOrder.quantity || 0) : Number(brokerOrder.orderValue || 0);
    applyBrokerAccounting(broker, brokerOrder, brokerOrder.side, amount);
    return;
  }

  if (normalized === "canceled" || normalized === "rejected") {
    brokerOrder.status = normalized;
    if (paperOrder && paperOrder.status === "open") {
      paperOrder.status = normalized;
      paperOrder.reason = normalized === "canceled" ? "provider_canceled" : "provider_rejected";
      paperOrder.updatedAt = Date.now();
    }
    return;
  }

  brokerOrder.status = "pending";
}

async function fetchExternalOrderStatus(provider, broker, providerOrderId) {
  if (provider === "alpaca-sandbox") {
    const response = await axios.get(`https://paper-api.alpaca.markets/v2/orders/${encodeURIComponent(providerOrderId)}`, {
      headers: {
        "APCA-API-KEY-ID": ALPACA_SANDBOX_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SANDBOX_SECRET
      },
      timeout: 12000
    });
    return {
      providerStatus: String(response.data?.status || "unknown"),
      filledPrice: Number(response.data?.filled_avg_price),
      reason: ""
    };
  }

  if (provider === "oanda-sandbox") {
    return {
      providerStatus: "accepted",
      filledPrice: Number.NaN,
      reason: "manual_webhook_preferred"
    };
  }

  return {
    providerStatus: "simulated",
    filledPrice: Number.NaN,
    reason: ""
  };
}

async function buildBrokerRiskPreview(db, userId, payload) {
  ensureUserFeatureState(db, userId);
  const broker = db.brokerSandbox[userId];
  const paper = db.paperTrading[userId];
  const symbol = cleanSymbolInput(payload?.symbol);
  const side = String(payload?.side || "").toLowerCase();
  const quantity = toPositiveInt(payload?.quantity, 0);
  const stopLoss = toOptionalNumber(payload?.stopLoss);
  const takeProfit = toOptionalNumber(payload?.takeProfit);
  if (!symbol || !["buy", "sell"].includes(side) || quantity <= 0) {
    throw new Error("Invalid trade payload");
  }
  if (!broker.connected) throw new Error("Sandbox broker is not connected");
  const provider = normalizeBrokerProvider(broker.provider);
  const cred = providerCredentialsStatus(provider);
  if (!cred.ok) throw new Error(`Missing provider credentials: ${cred.missing.join(", ")}`);
  const mapped = mapSymbolForProvider(symbol, provider);
  if (!mapped.ok) throw new Error(mapped.error);

  const marketPrice = await fetchLatestPriceForSymbol(symbol);
  const orderValue = marketPrice * quantity;
  const maxOrderValue = (Number(broker.buyingPower || 0) * Number(broker.maxOrderValuePct || 25)) / 100;
  const checks = [];

  checks.push({
    id: "max_order_value",
    ok: orderValue <= maxOrderValue,
    message: `Order value ${toFixedNumber(orderValue, 2)} must be <= ${toFixedNumber(maxOrderValue, 2)}`
  });
  if (side === "buy") {
    checks.push({
      id: "buying_power",
      ok: orderValue <= Number(broker.buyingPower || 0),
      message: `Buying power ${toFixedNumber(broker.buyingPower, 2)} vs order ${toFixedNumber(orderValue, 2)}`
    });
  } else {
    const posQty = Number(paper.positions?.[symbol]?.qty || 0);
    checks.push({
      id: "position_qty",
      ok: posQty >= quantity,
      message: `Sell qty ${quantity} requires position >= ${quantity} (current ${posQty})`
    });
  }

  if (Number.isFinite(stopLoss) && Number.isFinite(takeProfit)) {
    checks.push({
      id: "sl_tp_logic",
      ok: side === "buy" ? stopLoss < marketPrice && takeProfit > marketPrice : stopLoss > marketPrice && takeProfit < marketPrice,
      message: "Stop-loss / take-profit placement must bracket current price correctly"
    });
  }

  const ok = checks.every((c) => c.ok);
  return {
    ok,
    symbol,
    provider,
    providerSymbol: mapped.symbol || symbol,
    side,
    quantity,
    marketPrice: toFixedNumber(marketPrice, 6),
    orderValue: toFixedNumber(orderValue, 2),
    checks
  };
}

function computePaperSummary(state, livePrices) {
  const positions = Object.values(state.positions || {});
  let marketValue = 0;
  let unrealizedPnl = 0;
  for (const pos of positions) {
    const price = Number(livePrices[pos.symbol]);
    const qty = Number(pos.qty || 0);
    if (!Number.isFinite(price) || qty <= 0) continue;
    marketValue += price * qty;
    unrealizedPnl += (price - pos.avgPrice) * qty;
  }
  const realizedPnl = (state.closedTrades || []).reduce((sum, t) => sum + Number(t.realizedPnl || 0), 0);
  const equity = Number(state.cash || 0) + marketValue;
  return {
    cash: toFixedNumber(state.cash || 0, 2),
    marketValue: toFixedNumber(marketValue, 2),
    unrealizedPnl: toFixedNumber(unrealizedPnl, 2),
    realizedPnl: toFixedNumber(realizedPnl, 2),
    equity: toFixedNumber(equity, 2),
    positionsCount: positions.length,
    openOrders: (state.orders || []).filter((o) => o.status === "open").length
  };
}

function mergePosition(state, symbol, qty, fillPrice, stopLoss, takeProfit) {
  const normalizedStopLoss = Number.isFinite(stopLoss) && stopLoss > 0 ? stopLoss : null;
  const normalizedTakeProfit = Number.isFinite(takeProfit) && takeProfit > 0 ? takeProfit : null;
  const existing = state.positions[symbol];
  if (!existing) {
    state.positions[symbol] = {
      symbol,
      qty,
      avgPrice: fillPrice,
      stopLoss: normalizedStopLoss,
      takeProfit: normalizedTakeProfit,
      openedAt: Date.now()
    };
    return;
  }
  const totalQty = existing.qty + qty;
  const weightedPrice = ((existing.avgPrice * existing.qty) + (fillPrice * qty)) / totalQty;
  existing.qty = totalQty;
  existing.avgPrice = weightedPrice;
  if (Number.isFinite(normalizedStopLoss)) existing.stopLoss = normalizedStopLoss;
  if (Number.isFinite(normalizedTakeProfit)) existing.takeProfit = normalizedTakeProfit;
}

function closePositionQty(state, symbol, qty, fillPrice, reason) {
  const position = state.positions[symbol];
  if (!position || qty <= 0) return { ok: false, error: "No position" };
  if (position.qty < qty) return { ok: false, error: "Insufficient position quantity" };

  const realized = (fillPrice - position.avgPrice) * qty;
  state.cash += fillPrice * qty;
  position.qty -= qty;
  if (position.qty <= 0) {
    delete state.positions[symbol];
  }

  state.closedTrades.push({
    id: createEntityId("trade"),
    symbol,
    qty,
    entryPrice: toFixedNumber(position.avgPrice, 6),
    exitPrice: toFixedNumber(fillPrice, 6),
    realizedPnl: toFixedNumber(realized, 2),
    reason: reason || "manual",
    closedAt: Date.now()
  });
  return { ok: true, realized };
}

function fillPaperOrder(state, order, fillPrice, reason = "filled") {
  if (order.status !== "open") return;
  order.status = "filled";
  order.filledPrice = toFixedNumber(fillPrice, 6);
  order.filledAt = Date.now();
  order.reason = reason;

  if (order.side === "buy") {
    const cost = fillPrice * order.quantity;
    if (state.cash < cost) {
      order.status = "rejected";
      order.reason = "insufficient_cash";
      return;
    }
    state.cash -= cost;
    mergePosition(state, order.symbol, order.quantity, fillPrice, order.stopLoss, order.takeProfit);
    return;
  }

  const closed = closePositionQty(state, order.symbol, order.quantity, fillPrice, reason);
  if (!closed.ok) {
    order.status = "rejected";
    order.reason = closed.error;
  }
}

async function runPaperAutomation(state) {
  const openOrders = (state.orders || []).filter((o) => o.status === "open");
  const symbols = new Set([
    ...openOrders.map((o) => o.symbol),
    ...Object.keys(state.positions || {})
  ]);
  if (symbols.size === 0) return {};

  const prices = {};
  await Promise.all(
    Array.from(symbols).map(async (symbol) => {
      try {
        prices[symbol] = await fetchLatestPriceForSymbol(symbol);
      } catch {
        // Keep missing prices undefined.
      }
    })
  );

  for (const order of openOrders) {
    const px = Number(prices[order.symbol]);
    if (!Number.isFinite(px)) continue;
    if (evaluateLimitFill(order, px)) {
      fillPaperOrder(state, order, px, "limit_hit");
    }
  }

  for (const symbol of Object.keys(state.positions || {})) {
    const pos = state.positions[symbol];
    const px = Number(prices[symbol]);
    if (!Number.isFinite(px)) continue;
    if (Number.isFinite(pos.stopLoss) && px <= pos.stopLoss) {
      closePositionQty(state, symbol, pos.qty, px, "stop_loss");
      continue;
    }
    if (Number.isFinite(pos.takeProfit) && px >= pos.takeProfit) {
      closePositionQty(state, symbol, pos.qty, px, "take_profit");
    }
  }

  state.updatedAt = Date.now();
  return prices;
}

function computeSeriesReturns(equityCurve) {
  const returns = [];
  for (let i = 1; i < equityCurve.length; i += 1) {
    const prev = equityCurve[i - 1];
    const next = equityCurve[i];
    if (!Number.isFinite(prev) || !Number.isFinite(next) || prev === 0) continue;
    returns.push((next - prev) / prev);
  }
  return returns;
}

function summarizeBacktest(trades, equityCurve) {
  const returns = computeSeriesReturns(equityCurve);
  const tradeReturns = trades.map((t) => t.returnPct / 100);
  const wins = tradeReturns.filter((r) => r > 0);
  const losses = tradeReturns.filter((r) => r <= 0);
  const winRate = tradeReturns.length ? (wins.length / tradeReturns.length) * 100 : 0;
  const expectancy = tradeReturns.length
    ? tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length
    : 0;

  let peak = equityCurve[0] || 1;
  let maxDrawdown = 0;
  for (const v of equityCurve) {
    if (v > peak) peak = v;
    const dd = (peak - v) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length
    ? returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length
    : 0;
  const stdev = Math.sqrt(Math.max(variance, 1e-12));
  const sharpe = stdev > 0 ? (mean / stdev) * Math.sqrt(252) : 0;

  return {
    trades: tradeReturns.length,
    winRate: toFixedNumber(winRate, 2),
    expectancyPct: toFixedNumber(expectancy * 100, 4),
    maxDrawdownPct: toFixedNumber(maxDrawdown * 100, 2),
    sharpe: toFixedNumber(sharpe, 3),
    avgWinPct: toFixedNumber((wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0) * 100, 3),
    avgLossPct: toFixedNumber((losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0) * 100, 3),
    endingEquity: toFixedNumber(equityCurve[equityCurve.length - 1] || 1, 4)
  };
}

function runBacktestEmaCrossDetailed(closes, fastPeriod = 9, slowPeriod = 21) {
  const fast = emaSeries(closes, fastPeriod);
  const slow = emaSeries(closes, slowPeriod);
  const trades = [];
  const equityCurve = [1];
  let equity = 1;
  let entry = null;

  for (let i = 0; i < closes.length; i += 1) {
    if (!Number.isFinite(fast[i]) || !Number.isFinite(slow[i])) {
      equityCurve.push(equity);
      continue;
    }

    const bullish = fast[i] > slow[i];
    if (entry === null && bullish) {
      entry = { price: closes[i], index: i };
    } else if (entry && !bullish) {
      const ret = (closes[i] - entry.price) / entry.price;
      equity *= 1 + ret;
      trades.push({
        entryIndex: entry.index,
        exitIndex: i,
        entryPrice: entry.price,
        exitPrice: closes[i],
        returnPct: ret * 100
      });
      entry = null;
    }
    equityCurve.push(equity);
  }

  if (entry) {
    const lastIdx = closes.length - 1;
    const ret = (closes[lastIdx] - entry.price) / entry.price;
    equity *= 1 + ret;
    trades.push({
      entryIndex: entry.index,
      exitIndex: lastIdx,
      entryPrice: entry.price,
      exitPrice: closes[lastIdx],
      returnPct: ret * 100
    });
    equityCurve.push(equity);
  }

  return { trades, equityCurve };
}

function runBacktestRsiReversion(closes, rsiPeriod = 14, entryRsi = 30, exitRsi = 55) {
  const rsi = RSI.calculate({ values: closes, period: rsiPeriod });
  const alignedRsi = new Array(closes.length - rsi.length).fill(null).concat(rsi);
  const trades = [];
  const equityCurve = [1];
  let equity = 1;
  let entry = null;

  for (let i = 0; i < closes.length; i += 1) {
    const r = alignedRsi[i];
    if (!Number.isFinite(r)) {
      equityCurve.push(equity);
      continue;
    }

    if (!entry && r <= entryRsi) {
      entry = { price: closes[i], index: i };
    } else if (entry && r >= exitRsi) {
      const ret = (closes[i] - entry.price) / entry.price;
      equity *= 1 + ret;
      trades.push({
        entryIndex: entry.index,
        exitIndex: i,
        entryPrice: entry.price,
        exitPrice: closes[i],
        returnPct: ret * 100
      });
      entry = null;
    }
    equityCurve.push(equity);
  }

  if (entry) {
    const lastIdx = closes.length - 1;
    const ret = (closes[lastIdx] - entry.price) / entry.price;
    equity *= 1 + ret;
    trades.push({
      entryIndex: entry.index,
      exitIndex: lastIdx,
      entryPrice: entry.price,
      exitPrice: closes[lastIdx],
      returnPct: ret * 100
    });
    equityCurve.push(equity);
  }

  return { trades, equityCurve };
}

function normalizeAlert(alert) {
  const cleanSymbol = cleanSymbolInput(alert.symbol);
  const logic = String(alert.logic || "AND").toUpperCase() === "OR" ? "OR" : "AND";
  const channels = alert.channels && typeof alert.channels === "object" ? alert.channels : {};
  const conditions = Array.isArray(alert.conditions) ? alert.conditions : [];
  return {
    id: String(alert.id || createEntityId("alert")),
    name: String(alert.name || cleanSymbol || "Alert"),
    symbol: cleanSymbol,
    logic,
    isActive: alert.isActive !== false,
    cooldownSec: Math.max(30, Number(alert.cooldownSec || 300)),
    channels: {
      inApp: channels.inApp !== false,
      email: Boolean(channels.email),
      telegram: Boolean(channels.telegram),
      whatsapp: Boolean(channels.whatsapp)
    },
    conditions: conditions
      .map((c) => ({
        type: String(c.type || "").trim().toLowerCase(),
        value: Number(c.value)
      }))
      .filter((c) => c.type),
    lastTriggeredAt: Number(alert.lastTriggeredAt || 0)
  };
}

async function evaluateAlertCondition(symbol, condition) {
  const type = condition.type;
  const val = Number(condition.value);
  if (!symbol) return false;

  if (type === "price_above" || type === "price_below") {
    const px = await fetchLatestPriceForSymbol(symbol);
    return type === "price_above" ? px > val : px < val;
  }

  if (type === "rsi_above" || type === "rsi_below") {
    const symbolInfo = splitSymbol(symbol);
    const yahooTicker = toYahooTicker(symbolInfo);
    const { rows } = await fetchYahooCandles(yahooTicker, "1D");
    const closes = rows.map((r) => r.close);
    const rsiSeries = RSI.calculate({ values: closes, period: 14 });
    const latestRsi = rsiSeries[rsiSeries.length - 1];
    if (!Number.isFinite(latestRsi)) return false;
    return type === "rsi_above" ? latestRsi > val : latestRsi < val;
  }

  if (type === "news_positive" || type === "news_negative") {
    const news = await fetchFinnhubNews(splitSymbol(symbol));
    const sentiment = sentimentFromNews(news);
    return type === "news_positive"
      ? sentiment.positive > sentiment.negative
      : sentiment.negative > sentiment.positive;
  }

  return false;
}

async function evaluateAlertRule(alert) {
  if (!alert.isActive || !alert.symbol || !Array.isArray(alert.conditions) || alert.conditions.length === 0) {
    return { fired: false, matches: [] };
  }

  const matches = [];
  for (const condition of alert.conditions) {
    try {
      matches.push(await evaluateAlertCondition(alert.symbol, condition));
    } catch {
      matches.push(false);
    }
  }
  const fired = alert.logic === "OR" ? matches.some(Boolean) : matches.every(Boolean);
  return { fired, matches };
}

function computeReturnsFromCloses(closes, maxPoints = 90) {
  const out = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = Number(closes[i - 1]);
    const next = Number(closes[i]);
    if (!Number.isFinite(prev) || !Number.isFinite(next) || prev === 0) continue;
    out.push((next - prev) / prev);
  }
  if (out.length > maxPoints) return out.slice(-maxPoints);
  return out;
}

function stdDev(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(Math.max(variance, 0));
}

function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  const denom = Math.sqrt(vx * vy);
  if (!Number.isFinite(denom) || denom <= 1e-12) return 0;
  return cov / denom;
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) return 0;
  const idx = Math.min(sortedValues.length - 1, Math.max(0, Math.floor(q * sortedValues.length)));
  return sortedValues[idx];
}

function impactFromHeadline(text) {
  const t = String(text || "").toLowerCase();
  const high = ["fomc", "earnings", "guidance", "sec", "lawsuit", "acquisition", "downgrade", "upgrade"];
  const medium = ["inflation", "gdp", "rate", "forecast", "ceo", "buyback", "dividend"];
  if (high.some((k) => t.includes(k))) return "high";
  if (medium.some((k) => t.includes(k))) return "medium";
  return "low";
}

function normalizeSymbolsList(raw, limit = 12) {
  const list = String(raw || "")
    .split(",")
    .map((x) => cleanSymbolInput(x))
    .filter(Boolean)
    .slice(0, limit);
  return Array.from(new Set(list));
}

function emaSeries(values, period) {
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;

  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += values[i];
  let ema = seed / period;
  out[period - 1] = ema;

  for (let i = period; i < values.length; i += 1) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }

  return out;
}

function resolveSeriesNulls(series, fallback) {
  const out = [];
  let last = Number.isFinite(fallback?.[0]) ? fallback[0] : 0;
  for (let i = 0; i < series.length; i += 1) {
    const v = Number(series[i]);
    if (Number.isFinite(v)) {
      out.push(v);
      last = v;
      continue;
    }
    const fb = Number(fallback?.[i]);
    if (Number.isFinite(fb)) {
      out.push(fb);
      last = fb;
    } else {
      out.push(last);
    }
  }
  return out;
}

function normalizeToPctSeries(values) {
  const first = Number(values.find((v) => Number.isFinite(v)));
  const base = Number.isFinite(first) && Math.abs(first) > 1e-9 ? first : 1;
  return values.map((v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Number((((n - base) / base) * 100).toFixed(2));
  });
}

function backtestEmaCross(closes) {
  const fast = emaSeries(closes, 9);
  const slow = emaSeries(closes, 21);

  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  let trades = 0;
  let wins = 0;
  let entry = null;

  for (let i = 0; i < closes.length; i += 1) {
    if (!Number.isFinite(fast[i]) || !Number.isFinite(slow[i])) continue;

    const bullish = fast[i] > slow[i];

    if (entry === null && bullish) {
      entry = closes[i];
    } else if (entry !== null && !bullish) {
      const ret = (closes[i] - entry) / entry;
      equity *= 1 + ret;
      trades += 1;
      if (ret > 0) wins += 1;
      entry = null;
    }

    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  if (entry !== null) {
    const last = closes[closes.length - 1];
    const ret = (last - entry) / entry;
    equity *= 1 + ret;
    trades += 1;
    if (ret > 0) wins += 1;
  }

  return {
    trades,
    winRate: trades ? toFixedNumber((wins / trades) * 100, 1) : 0,
    profitPct: toFixedNumber((equity - 1) * 100, 2),
    maxDrawdownPct: toFixedNumber(maxDrawdown * 100, 2)
  };
}

function computeAiPayload(rows, tf, strategy, newsSentiment, marketCap, symbolInfo) {
  const closes = rows.map((r) => r.close);
  const highs = rows.map((r) => (Number.isFinite(r.high) ? r.high : r.close));
  const lows = rows.map((r) => (Number.isFinite(r.low) ? r.low : r.close));
  const volumes = rows.map((r) => (Number.isFinite(r.volume) ? r.volume : 0));

  const latest = rows[rows.length - 1];
  const bars24h = (TIMEFRAME_CONFIG[tf] || TIMEFRAME_CONFIG["1D"]).bars24h;
  const past24hIndex = Math.max(0, rows.length - 1 - bars24h);
  const close24hAgo = closes[past24hIndex] || closes[rows.length - 2] || latest.close;
  const change24h = ((latest.close - close24hAgo) / close24hAgo) * 100;

  const rangeRows = rows.slice(Math.max(0, rows.length - bars24h));
  const high24h = Math.max(...rangeRows.map((r) => r.high || r.close));
  const low24h = Math.min(...rangeRows.map((r) => r.low || r.close));

  const avgVolume20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
  const volumeNow = volumes[volumes.length - 1] || 0;
  const volumeRatio = avgVolume20 ? volumeNow / avgVolume20 : 1;

  const rsiArr = RSI.calculate({ values: closes, period: 14 });
  const rsi = rsiArr[rsiArr.length - 1];

  const emaFastArr = EMA.calculate({ values: closes, period: 9 });
  const emaSlowArr = EMA.calculate({ values: closes, period: 21 });
  const emaFast = emaFastArr[emaFastArr.length - 1];
  const emaSlow = emaSlowArr[emaSlowArr.length - 1];
  const emaState = emaFast > emaSlow ? "Bullish crossover" : "Bearish crossover";

  const macdArr = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
  const macd = macdArr[macdArr.length - 1] || {};
  const macdState = (macd.histogram || 0) >= 0 ? "Bullish" : "Bearish";

  const bbArr = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
  const bb = bbArr[bbArr.length - 1] || {};
  let bbState = "Neutral";
  if (Number.isFinite(bb.upper) && latest.close > bb.upper) bbState = "Overbought";
  if (Number.isFinite(bb.lower) && latest.close < bb.lower) bbState = "Oversold";

  const atrArr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
  const atr = atrArr[atrArr.length - 1] || latest.close * 0.01;

  const recent20 = closes.slice(-21, -1);
  const previousHigh = Math.max(...recent20);
  const previousLow = Math.min(...recent20);

  let marketMode = "Sideways";
  if (latest.close > previousHigh * 1.002 && volumeRatio > 1.2) marketMode = "Breakout";
  else if (latest.close > previousHigh * 1.002 && volumeRatio <= 1.2) marketMode = "Fake breakout";
  else if (emaFast > emaSlow && (macd.histogram || 0) > 0) marketMode = "Trending";

  let riskLevel = "Medium";
  let riskEmoji = "??";
  if (Math.abs(change24h) > 5 || rsi > 75 || rsi < 25) {
    riskLevel = "High";
    riskEmoji = "??";
  } else if (Math.abs(change24h) < 2 && rsi >= 40 && rsi <= 65) {
    riskLevel = "Low";
    riskEmoji = "??";
  }

  const rsiScore = Number.isFinite(rsi) ? clamp(100 - Math.abs(rsi - 55) * 2.2, 15, 95) : 50;
  const emaScore = emaFast > emaSlow ? 82 : 34;
  const macdScore = (macd.histogram || 0) >= 0 ? 78 : 36;
  const volumeScore = clamp(45 + volumeRatio * 25, 20, 95);
  const newsScore = newsSentiment.score;

  const confidence = Math.round(
    rsiScore * 0.2 +
    emaScore * 0.25 +
    macdScore * 0.2 +
    volumeScore * 0.15 +
    newsScore * 0.2
  );

  let action = "HOLD";
  if (confidence >= 68) action = "BUY";
  if (confidence <= 38) action = "SELL";

  const strategyKey = (strategy || "swing").toLowerCase();
  const strategyMap = {
    scalping: { sl: 1.1, tp: 1.6 },
    swing: { sl: 1.8, tp: 2.8 },
    "long-term": { sl: 2.6, tp: 4.2 }
  };
  const plan = strategyMap[strategyKey] || strategyMap.swing;

  let entry = latest.close;
  let stopLoss = latest.close - atr * plan.sl;
  let target = latest.close + atr * plan.tp;
  if (action === "SELL") {
    stopLoss = latest.close + atr * plan.sl;
    target = latest.close - atr * plan.tp;
  }

  const backtest = backtestEmaCross(closes);
  const growthCloses = closes.slice(-48);
  const growthEmaFast = resolveSeriesNulls(emaSeries(growthCloses, 9), growthCloses);
  const growthEmaSlow = resolveSeriesNulls(emaSeries(growthCloses, 21), growthCloses);
  const growth = {
    labels: growthCloses.map((_, i) => i + 1),
    pricePct: normalizeToPctSeries(growthCloses),
    emaFastPct: normalizeToPctSeries(growthEmaFast),
    emaSlowPct: normalizeToPctSeries(growthEmaSlow)
  };

  return {
    symbol: symbolInfo.original,
    timeframe: tf,
    strategy: strategyKey,
    metrics: {
      realtimePrice: toFixedNumber(latest.close, 4),
      change24hPct: toFixedNumber(change24h, 2),
      volume: toFixedNumber(volumeNow, 0),
      high24h: toFixedNumber(high24h, 4),
      low24h: toFixedNumber(low24h, 4),
      marketCap: marketCap
    },
    indicators: {
      rsi: toFixedNumber(rsi, 2),
      emaFast: toFixedNumber(emaFast, 4),
      emaSlow: toFixedNumber(emaSlow, 4),
      emaCrossover: emaState,
      macd: {
        value: toFixedNumber(macd.MACD, 4),
        signal: toFixedNumber(macd.signal, 4),
        histogram: toFixedNumber(macd.histogram, 4),
        state: macdState
      },
      bollinger: {
        upper: toFixedNumber(bb.upper, 4),
        middle: toFixedNumber(bb.middle, 4),
        lower: toFixedNumber(bb.lower, 4),
        state: bbState
      },
      volumeSignal: volumeRatio > 1.2 ? "Strong" : volumeRatio < 0.8 ? "Weak" : "Normal"
    },
    risk: {
      level: riskLevel,
      emoji: riskEmoji
    },
    marketMode,
    confidence: {
      score: confidence,
      components: {
        rsi: { score: Math.round(rsiScore), weight: 20 },
        ema: { score: Math.round(emaScore), weight: 25 },
        macd: { score: Math.round(macdScore), weight: 20 },
        volume: { score: Math.round(volumeScore), weight: 15 },
        news: { score: Math.round(newsScore), weight: 20 }
      }
    },
    sentiment: newsSentiment,
    suggestion: {
      action,
      entry: toFixedNumber(entry, 4),
      stopLoss: toFixedNumber(stopLoss, 4),
      target: toFixedNumber(target, 4)
    },
    backtest,
    growth
  };
}

app.post("/api/auth/login", (req, res) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const db = readDb();
    const user = db.users.find((u) => String(u.username || "").toLowerCase() === username);
    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    ensureUserFeatureState(db, user.id);
    pushActivityLog(db, user.id, { type: "login_success" });
    writeDb(db);

    const tokens = issueTokens(user.id, user.username, user.role || "user");
    res.json({
      ...tokens,
      user: sanitizeUser(user),
      watchlist: db.watchlists[user.id] || [],
      preferences: db.preferences[user.id] || {}
    });
  } catch (error) {
    console.log("Login Error:", error.message);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/auth/register", (req, res) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const displayNameRaw = String(req.body?.displayName || "").trim();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const validationError = validateRegistrationInput(username, password);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const db = readDb();
    const exists = db.users.some((u) => String(u.username || "").toLowerCase() === username);
    if (exists) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const newUser = {
      id: createUserId(),
      username,
      passwordHash: hashPassword(password),
      role: "user",
      displayName: displayNameRaw || username
    };

    db.users.push(newUser);
    db.watchlists[newUser.id] = [];
    db.preferences[newUser.id] = {
      defaultStrategy: "swing",
      defaultAiTf: "1D",
      theme: "dark",
      activeWorkspaceId: "ws-default",
      workspaces: [
        {
          id: "ws-default",
          name: "Default Workspace",
          layout: { dashboardPanels: ["watchlist", "risk-heatmap", "planning-tools"], density: "comfortable" },
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]
    };
    ensureUserFeatureState(db, newUser.id);
    pushActivityLog(db, newUser.id, { type: "account_created", username: newUser.username });
    writeDb(db);
    appendRegistrationExport(newUser);

    const tokens = issueTokens(newUser.id, newUser.username, newUser.role);
    res.status(201).json({
      ...tokens,
      user: sanitizeUser(newUser),
      watchlist: db.watchlists[newUser.id],
      preferences: db.preferences[newUser.id]
    });
  } catch (error) {
    console.log("Register Error:", error.message);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/social", async (req, res) => {
  try {
    const provider = normalizeSocialProvider(req.body?.provider);
    const idToken = String(req.body?.idToken || "");
    if (!provider) return res.status(400).json({ error: "Supported providers: google, apple" });
    if (!idToken) return res.status(400).json({ error: "idToken is required" });

    const firebaseUser = await verifyFirebaseIdToken(idToken);
    if (!firebaseProviderMatches(firebaseUser, provider)) {
      return res.status(401).json({ error: "Provider mismatch for token" });
    }

    const db = readDb();
    const user = ensureSocialUser(db, provider, firebaseUser);
    ensureUserFeatureState(db, user.id);
    pushActivityLog(db, user.id, { type: "social_login_success", provider });
    writeDb(db);

    const tokens = issueTokens(user.id, user.username, user.role || "user");
    res.json({
      ...tokens,
      user: sanitizeUser(user),
      watchlist: db.watchlists[user.id] || [],
      preferences: db.preferences[user.id] || {}
    });
  } catch (error) {
    const apiError = String(error.response?.data?.error?.message || error.message || "Social login failed");
    console.log("Social Login Error:", apiError);
    res.status(401).json({ error: apiError });
  }
});

app.post("/api/auth/refresh", (req, res) => {
  try {
    const refreshToken = String(req.body?.refreshToken || "");
    if (!refreshToken) return res.status(400).json({ error: "Refresh token is required" });
    if (revokedRefreshTokens.has(refreshToken)) return res.status(401).json({ error: "Refresh token revoked" });

    const payload = verifyToken(refreshToken);
    if (!payload || payload.tokenType !== "refresh") return res.status(401).json({ error: "Invalid refresh token" });

    const db = readDb();
    const user = db.users.find((u) => u.id === payload.sub);
    if (!user) return res.status(401).json({ error: "User not found" });

    const accessToken = signToken(
      { sub: user.id, username: user.username, role: user.role || "user", tokenType: "access" },
      ACCESS_TTL_SECONDS
    );
    res.json({ accessToken, expiresIn: ACCESS_TTL_SECONDS });
  } catch (error) {
    console.log("Refresh Error:", error.message);
    res.status(500).json({ error: "Token refresh failed" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const refreshToken = String(req.body?.refreshToken || "");
  if (refreshToken) revokedRefreshTokens.add(refreshToken);
  const payload = verifyToken(getBearerToken(req));
  if (payload?.sub) {
    try {
      const db = readDb();
      pushActivityLog(db, payload.sub, { type: "logout" });
      writeDb(db);
    } catch (error) {
      console.log("Logout activity warning:", error.message);
    }
  }
  res.json({ ok: true });
});

app.get("/api/auth/me", authRequired, (req, res) => {
  const db = readDb();
  const user = db.users.find((u) => u.id === req.user.sub);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    user: sanitizeUser(user),
    watchlist: db.watchlists[user.id] || [],
    preferences: db.preferences[user.id] || {}
  });
});

app.get("/api/watchlist", authRequired, (req, res) => {
  const db = readDb();
  res.json({ watchlist: db.watchlists[req.user.sub] || [] });
});

app.put("/api/watchlist", authRequired, (req, res) => {
  const incoming = Array.isArray(req.body?.watchlist) ? req.body.watchlist : [];
  const normalized = incoming
    .map((item) => String(item || "").trim().toUpperCase())
    .filter((item) => item.length > 0)
    .slice(0, 50);

  const db = readDb();
  db.watchlists[req.user.sub] = normalized;
  writeDb(db);
  res.json({ watchlist: normalized });
});

app.get("/api/preferences", authRequired, (req, res) => {
  const db = readDb();
  res.json({ preferences: db.preferences[req.user.sub] || {} });
});

app.put("/api/preferences", authRequired, (req, res) => {
  const prefs = req.body?.preferences && typeof req.body.preferences === "object" ? req.body.preferences : {};
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  db.preferences[req.user.sub] = {
    ...(db.preferences[req.user.sub] || {}),
    ...prefs
  };
  pushActivityLog(db, req.user.sub, { type: "preferences_updated", keys: Object.keys(prefs || {}) });
  writeDb(db);
  res.json({ preferences: db.preferences[req.user.sub] });
});

app.get("/api/theme", authRequired, (req, res) => {
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  res.json({ theme: db.preferences[req.user.sub]?.theme || "dark" });
});

app.put("/api/theme", authRequired, (req, res) => {
  const themeRaw = String(req.body?.theme || "dark").toLowerCase();
  const theme = ["dark", "light", "neon"].includes(themeRaw) ? themeRaw : "dark";
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  db.preferences[req.user.sub].theme = theme;
  pushActivityLog(db, req.user.sub, { type: "theme_changed", theme });
  writeDb(db);
  res.json({ theme });
});

app.get("/api/workspaces", authRequired, (req, res) => {
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  res.json({
    activeWorkspaceId: db.preferences[req.user.sub].activeWorkspaceId,
    workspaces: db.preferences[req.user.sub].workspaces || []
  });
});

app.post("/api/workspaces", authRequired, (req, res) => {
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  const userPrefs = db.preferences[req.user.sub];
  const current = Array.isArray(userPrefs.workspaces) ? userPrefs.workspaces : [];

  const id = String(req.body?.id || createEntityId("ws"));
  const name = String(req.body?.name || "Workspace").trim().slice(0, 50) || "Workspace";
  const layout = req.body?.layout && typeof req.body.layout === "object" ? req.body.layout : {};
  const now = Date.now();

  const idx = current.findIndex((w) => w.id === id);
  if (idx >= 0) {
    current[idx] = { ...current[idx], name, layout, updatedAt: now };
  } else {
    current.push({ id, name, layout, createdAt: now, updatedAt: now });
  }
  userPrefs.workspaces = current.slice(-20);
  userPrefs.activeWorkspaceId = id;
  pushActivityLog(db, req.user.sub, { type: idx >= 0 ? "workspace_updated" : "workspace_created", workspaceId: id, name });
  writeDb(db);
  res.json({ activeWorkspaceId: userPrefs.activeWorkspaceId, workspaces: userPrefs.workspaces });
});

app.put("/api/workspaces/active", authRequired, (req, res) => {
  const id = String(req.body?.id || "").trim();
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  const workspaces = db.preferences[req.user.sub].workspaces || [];
  if (!workspaces.find((w) => w.id === id)) return res.status(404).json({ error: "Workspace not found" });
  db.preferences[req.user.sub].activeWorkspaceId = id;
  pushActivityLog(db, req.user.sub, { type: "workspace_activated", workspaceId: id });
  writeDb(db);
  res.json({ activeWorkspaceId: id });
});

app.delete("/api/workspaces/:id", authRequired, (req, res) => {
  const id = String(req.params.id || "");
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  const before = db.preferences[req.user.sub].workspaces.length;
  db.preferences[req.user.sub].workspaces = db.preferences[req.user.sub].workspaces.filter((w) => w.id !== id);
  if (db.preferences[req.user.sub].activeWorkspaceId === id) {
    db.preferences[req.user.sub].activeWorkspaceId = db.preferences[req.user.sub].workspaces[0]?.id || "";
  }
  const removed = before - db.preferences[req.user.sub].workspaces.length;
  if (removed > 0) pushActivityLog(db, req.user.sub, { type: "workspace_deleted", workspaceId: id });
  writeDb(db);
  res.json({ removed, activeWorkspaceId: db.preferences[req.user.sub].activeWorkspaceId });
});

app.get("/api/audit/logs", authRequired, (req, res) => {
  const limit = Math.max(10, Math.min(500, Number(req.query?.limit || 120)));
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  const items = (db.activityLogs[req.user.sub] || []).slice(-limit).reverse();
  res.json({ items, count: items.length });
});

app.get("/api/paper/summary", authRequired, async (req, res) => {
  try {
    const db = readDb();
    ensureUserFeatureState(db, req.user.sub);
    const state = db.paperTrading[req.user.sub];
    const prices = await runPaperAutomation(state);
    writeDb(db);
    res.json({
      summary: computePaperSummary(state, prices),
      positions: Object.values(state.positions || {}),
      openOrders: (state.orders || []).filter((o) => o.status === "open")
    });
  } catch (error) {
    console.log("Paper summary error:", error.message);
    res.status(500).json({ error: "Paper summary failed" });
  }
});

app.get("/api/paper/orders", authRequired, (req, res) => {
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  const state = db.paperTrading[req.user.sub];
  res.json({ orders: (state.orders || []).slice().reverse() });
});

app.get("/api/paper/positions", authRequired, (req, res) => {
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  const state = db.paperTrading[req.user.sub];
  res.json({ positions: Object.values(state.positions || {}) });
});

app.post("/api/paper/order", authRequired, async (req, res) => {
  try {
    const symbol = cleanSymbolInput(req.body?.symbol);
    const side = String(req.body?.side || "").toLowerCase();
    const quantity = toPositiveInt(req.body?.quantity, 0);
    const orderType = String(req.body?.orderType || "market").toLowerCase() === "limit" ? "limit" : "market";
    const limitPrice = toOptionalNumber(req.body?.limitPrice);
    const stopLoss = toOptionalNumber(req.body?.stopLoss);
    const takeProfit = toOptionalNumber(req.body?.takeProfit);

    if (!symbol || !["buy", "sell"].includes(side) || quantity <= 0) {
      return res.status(400).json({ error: "Invalid order payload" });
    }
    if (orderType === "limit" && !Number.isFinite(limitPrice)) {
      return res.status(400).json({ error: "limitPrice is required for limit orders" });
    }

    const db = readDb();
    ensureUserFeatureState(db, req.user.sub);
    const state = db.paperTrading[req.user.sub];

    let marketPrice;
    try {
      marketPrice = await fetchLatestPriceForSymbol(symbol);
    } catch {
      marketPrice = null;
    }
    if (!Number.isFinite(marketPrice)) {
      return res.status(400).json({ error: "Could not fetch market price for symbol" });
    }

    const order = {
      id: createEntityId("ord"),
      symbol,
      side,
      quantity,
      orderType,
      limitPrice: Number.isFinite(limitPrice) ? limitPrice : null,
      stopLoss: Number.isFinite(stopLoss) ? stopLoss : null,
      takeProfit: Number.isFinite(takeProfit) ? takeProfit : null,
      status: "open",
      createdAt: Date.now()
    };
    state.orders.push(order);

    if (orderType === "market" || evaluateLimitFill(order, marketPrice)) {
      fillPaperOrder(state, order, marketPrice, orderType === "market" ? "market_fill" : "limit_hit");
    }

    await runPaperAutomation(state);
    state.updatedAt = Date.now();
    writeDb(db);
    res.json({ order, summary: computePaperSummary(state, { [symbol]: marketPrice }) });
  } catch (error) {
    console.log("Paper order error:", error.message);
    res.status(500).json({ error: "Paper order failed" });
  }
});

app.post("/api/paper/position/protect", authRequired, (req, res) => {
  const symbol = cleanSymbolInput(req.body?.symbol);
  const stopLoss = toOptionalNumber(req.body?.stopLoss);
  const takeProfit = toOptionalNumber(req.body?.takeProfit);
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  const state = db.paperTrading[req.user.sub];
  const pos = state.positions[symbol];
  if (!pos) return res.status(404).json({ error: "Position not found" });
  pos.stopLoss = Number.isFinite(stopLoss) ? stopLoss : pos.stopLoss;
  pos.takeProfit = Number.isFinite(takeProfit) ? takeProfit : pos.takeProfit;
  state.updatedAt = Date.now();
  writeDb(db);
  res.json({ position: pos });
});

app.delete("/api/paper/order/:id", authRequired, (req, res) => {
  const id = String(req.params.id || "");
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  const state = db.paperTrading[req.user.sub];
  const order = (state.orders || []).find((o) => o.id === id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status !== "open") return res.status(400).json({ error: "Only open orders can be canceled" });
  order.status = "canceled";
  order.reason = "user_canceled";
  order.updatedAt = Date.now();
  writeDb(db);
  res.json({ order });
});

app.get("/api/broker/sandbox", authRequired, (req, res) => {
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  const broker = db.brokerSandbox[req.user.sub];
  const cred = providerCredentialsStatus(normalizeBrokerProvider(broker.provider));
  res.json({ broker: safeBrokerView(broker), providerCredentials: cred });
});

app.get("/api/broker/sandbox/providers", authRequired, (req, res) => {
  res.json({
    providers: [
      { id: "paper-broker", label: "paper-broker", credentials: { ok: true, missing: [] } },
      { id: "alpaca-sandbox", label: "alpaca-sandbox", credentials: providerCredentialsStatus("alpaca-sandbox") },
      { id: "oanda-sandbox", label: "oanda-sandbox", credentials: providerCredentialsStatus("oanda-sandbox") }
    ]
  });
});

app.post("/api/broker/sandbox/connect", authRequired, (req, res) => {
  const provider = normalizeBrokerProvider(req.body?.provider);
  const accountDefault = provider === "oanda-sandbox" ? OANDA_SANDBOX_ACCOUNT_ID : `sbx-${req.user.sub}`;
  const accountId = String(req.body?.accountId || accountDefault).trim().slice(0, 40) || `sbx-${req.user.sub}`;
  const buyingPower = Number(req.body?.buyingPower);
  const maxOrderValuePct = Number(req.body?.maxOrderValuePct);
  const cred = providerCredentialsStatus(provider);
  if (!cred.ok) {
    return res.status(400).json({
      error: `Missing provider credentials: ${cred.missing.join(", ")}`,
      provider,
      missing: cred.missing
    });
  }

  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  const broker = db.brokerSandbox[req.user.sub];
  broker.connected = true;
  broker.provider = provider;
  broker.accountId = accountId;
  broker.status = "connected";
  if (Number.isFinite(buyingPower) && buyingPower > 0) broker.buyingPower = buyingPower;
  if (Number.isFinite(maxOrderValuePct) && maxOrderValuePct >= 1 && maxOrderValuePct <= 100) {
    broker.maxOrderValuePct = maxOrderValuePct;
  }
  broker.updatedAt = Date.now();
  pushActivityLog(db, req.user.sub, { type: "broker_connected", provider, accountId });
  writeDb(db);
  res.json({ broker: safeBrokerView(broker), providerCredentials: cred });
});

app.post("/api/broker/sandbox/disconnect", authRequired, (req, res) => {
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  const broker = db.brokerSandbox[req.user.sub];
  broker.connected = false;
  broker.status = "disconnected";
  broker.updatedAt = Date.now();
  pushActivityLog(db, req.user.sub, { type: "broker_disconnected", provider: broker.provider });
  writeDb(db);
  res.json({ broker: safeBrokerView(broker) });
});

app.post("/api/broker/sandbox/preview", authRequired, async (req, res) => {
  try {
    const db = readDb();
    const preview = await buildBrokerRiskPreview(db, req.user.sub, req.body || {});
    res.json(preview);
  } catch (error) {
    res.status(400).json({ error: error.message || "Preview failed" });
  }
});

app.post("/api/broker/sandbox/execute", authRequired, async (req, res) => {
  try {
    const requireConfirm = req.body?.confirm === true;
    const db = readDb();
    ensureUserFeatureState(db, req.user.sub);
    const broker = db.brokerSandbox[req.user.sub];

    const preview = await buildBrokerRiskPreview(db, req.user.sub, req.body || {});
    if (!preview.ok) return res.status(400).json({ error: "Risk checks failed", preview });
    if (!requireConfirm) return res.status(400).json({ error: "Confirmation required", preview });

    const paper = db.paperTrading[req.user.sub];
    const symbol = preview.symbol;
    const side = preview.side;
    const quantity = preview.quantity;
    const stopLoss = toOptionalNumber(req.body?.stopLoss);
    const takeProfit = toOptionalNumber(req.body?.takeProfit);
    const provider = normalizeBrokerProvider(broker.provider);
    let external = { providerOrderId: "", rawStatus: "simulated", accepted: true };
    if (provider !== "paper-broker") {
      external = await placeExternalSandboxOrder(provider, broker, { symbol, side, quantity });
    }
    const providerInternalStatus = mapProviderStatusToInternal(external.rawStatus);

    const order = {
      id: createEntityId("ord"),
      symbol,
      side,
      quantity,
      orderType: "market",
      limitPrice: null,
      stopLoss: Number.isFinite(stopLoss) ? stopLoss : null,
      takeProfit: Number.isFinite(takeProfit) ? takeProfit : null,
      status: "open",
      createdAt: Date.now()
    };
    paper.orders.push(order);
    if (provider === "paper-broker" || providerInternalStatus === "filled") {
      fillPaperOrder(paper, order, Number(preview.marketPrice), provider === "paper-broker" ? "broker_sandbox_fill" : "broker_external_fill");
    } else {
      order.reason = "awaiting_provider_fill";
    }

    const brokerOrder = {
      id: createEntityId("sbxord"),
      provider,
      providerOrderId: external.providerOrderId || "",
      providerStatus: external.rawStatus || "",
      paperOrderId: order.id,
      symbol,
      side,
      quantity,
      filledPrice: Number(preview.marketPrice),
      orderValue: Number(preview.orderValue),
      status: order.status === "filled" ? "filled" : (order.status === "open" ? "pending" : "rejected"),
      reason: order.reason || "",
      accountingApplied: provider === "paper-broker" && order.status === "filled",
      requestedPrice: Number(preview.marketPrice),
      createdAt: Date.now()
    };
    broker.orderHistory.push(brokerOrder);
    broker.orderHistory = broker.orderHistory.slice(-400);
    if (brokerOrder.status === "filled") applyBrokerAccounting(broker, brokerOrder, side, Number(preview.orderValue));
    await runPaperAutomation(paper);
    broker.updatedAt = Date.now();
    pushActivityLog(db, req.user.sub, {
      type: "broker_order_executed",
      symbol,
      side,
      quantity,
      status: brokerOrder.status
    });
    writeDb(db);

    res.json({
      confirmation: {
        status: brokerOrder.status,
        brokerOrderId: brokerOrder.id,
        providerOrderId: external.providerOrderId || null,
        providerStatus: external.rawStatus || null,
        provider,
        symbol,
        side,
        quantity,
        filledPrice: toFixedNumber(brokerOrder.filledPrice, 6),
        orderValue: toFixedNumber(brokerOrder.orderValue, 2),
        reason: brokerOrder.reason || null
      },
      broker: safeBrokerView(broker),
      paperSummary: computePaperSummary(paper, { [symbol]: Number(preview.marketPrice) })
    });
  } catch (error) {
    console.log("Broker sandbox execute error:", error.message);
    res.status(500).json({ error: "Sandbox execution failed" });
  }
});

app.post("/api/broker/sandbox/sync", authRequired, async (req, res) => {
  try {
    const db = readDb();
    ensureUserFeatureState(db, req.user.sub);
    const broker = db.brokerSandbox[req.user.sub];
    const provider = normalizeBrokerProvider(broker.provider);
    if (!broker.connected) return res.status(400).json({ error: "Sandbox broker is not connected" });
    if (provider === "paper-broker") return res.json({ synced: 0, updated: 0, provider });

    const pending = (broker.orderHistory || []).filter((o) => o.status === "pending" && o.provider === provider && o.providerOrderId).slice(-40);
    let updated = 0;
    for (const item of pending) {
      try {
        const status = await fetchExternalOrderStatus(provider, broker, item.providerOrderId);
        const before = item.status;
        applyProviderFillToPaperAndBroker(db, req.user.sub, item, status.providerStatus, status.filledPrice, status.reason);
        if (item.status !== before) updated += 1;
      } catch {
        // Keep as pending if provider call fails.
      }
    }
    broker.updatedAt = Date.now();
    writeDb(db);
    res.json({ provider, synced: pending.length, updated, broker: safeBrokerView(broker) });
  } catch (error) {
    console.log("Broker sync error:", error.message);
    res.status(500).json({ error: "Broker sync failed" });
  }
});

app.post("/api/broker/sandbox/webhook/:provider", async (req, res) => {
  try {
    if (!BROKER_WEBHOOK_SECRET) {
      return res.status(400).json({ error: "Webhook secret is not configured" });
    }
    const secret = String(req.headers["x-broker-webhook-secret"] || "");
    if (secret !== BROKER_WEBHOOK_SECRET) return res.status(401).json({ error: "Invalid webhook secret" });

    const provider = normalizeBrokerProvider(req.params.provider);
    const providerOrderId = String(req.body?.providerOrderId || "").trim();
    const brokerOrderId = String(req.body?.brokerOrderId || "").trim();
    const status = String(req.body?.status || "").trim();
    const filledPrice = Number(req.body?.filledPrice);
    const reason = String(req.body?.reason || "").trim();
    if (!status || (!providerOrderId && !brokerOrderId)) {
      return res.status(400).json({ error: "status and providerOrderId or brokerOrderId are required" });
    }

    const db = readDb();
    let updates = 0;
    for (const user of db.users) {
      ensureUserFeatureState(db, user.id);
      const broker = db.brokerSandbox[user.id];
      for (const order of broker.orderHistory || []) {
        const matchProvider = provider === normalizeBrokerProvider(order.provider);
        const matchOrder = (providerOrderId && order.providerOrderId === providerOrderId) || (brokerOrderId && order.id === brokerOrderId);
        if (!matchProvider || !matchOrder) continue;
        applyProviderFillToPaperAndBroker(db, user.id, order, status, filledPrice, reason);
        broker.updatedAt = Date.now();
        pushActivityLog(db, user.id, {
          type: "broker_webhook_update",
          provider,
          brokerOrderId: order.id,
          providerOrderId: order.providerOrderId || "",
          status: order.status
        });
        updates += 1;
      }
    }
    writeDb(db);
    res.json({ ok: true, provider, updates });
  } catch (error) {
    console.log("Broker webhook error:", error.message);
    res.status(500).json({ error: "Broker webhook handling failed" });
  }
});

app.get("/api/alerts", authRequired, (req, res) => {
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  res.json({
    alerts: db.alerts[req.user.sub] || [],
    events: (db.alertEvents[req.user.sub] || []).slice(-50).reverse()
  });
});

app.post("/api/alerts", authRequired, (req, res) => {
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  const incoming = normalizeAlert(req.body || {});
  const list = db.alerts[req.user.sub];
  const idx = list.findIndex((a) => a.id === incoming.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...incoming, updatedAt: Date.now() };
  else list.push({ ...incoming, createdAt: Date.now(), updatedAt: Date.now() });
  writeDb(db);
  res.json({ alert: list[idx >= 0 ? idx : list.length - 1] });
});

app.delete("/api/alerts/:id", authRequired, (req, res) => {
  const id = String(req.params.id || "");
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  const before = db.alerts[req.user.sub].length;
  db.alerts[req.user.sub] = db.alerts[req.user.sub].filter((a) => a.id !== id);
  writeDb(db);
  res.json({ removed: before - db.alerts[req.user.sub].length });
});

app.post("/api/alerts/evaluate", authRequired, async (req, res) => {
  try {
    const db = readDb();
    ensureUserFeatureState(db, req.user.sub);
    const alerts = db.alerts[req.user.sub] || [];
    const now = Date.now();
    const triggered = [];

    for (const alert of alerts) {
      if (!alert.isActive) continue;
      const last = Number(alert.lastTriggeredAt || 0);
      const cooldownMs = Math.max(30, Number(alert.cooldownSec || 300)) * 1000;
      if (now - last < cooldownMs) continue;

      const result = await evaluateAlertRule(alert);
      if (!result.fired) continue;

      alert.lastTriggeredAt = now;
      const event = {
        id: createEntityId("alrtevt"),
        alertId: alert.id,
        name: alert.name,
        symbol: alert.symbol,
        triggeredAt: now,
        channels: {
          inApp: alert.channels?.inApp !== false ? "delivered" : "disabled",
          email: alert.channels?.email ? (process.env.SMTP_HOST ? "queued" : "not_configured") : "disabled",
          telegram: alert.channels?.telegram ? (process.env.TELEGRAM_BOT_TOKEN ? "queued" : "not_configured") : "disabled",
          whatsapp: alert.channels?.whatsapp ? (process.env.WHATSAPP_WEBHOOK_URL ? "queued" : "not_configured") : "disabled"
        }
      };
      db.alertEvents[req.user.sub].push(event);
      triggered.push(event);
    }

    db.alertEvents[req.user.sub] = (db.alertEvents[req.user.sub] || []).slice(-300);
    writeDb(db);
    res.json({ triggered, count: triggered.length });
  } catch (error) {
    console.log("Alert evaluate error:", error.message);
    res.status(500).json({ error: "Alert evaluation failed" });
  }
});

app.post("/api/backtest/run", authRequired, async (req, res) => {
  try {
    const symbol = cleanSymbolInput(req.body?.symbol);
    const tfRaw = String(req.body?.timeframe || "1D");
    const strategy = String(req.body?.strategy || "ema_cross").toLowerCase();
    if (!symbol) return res.status(400).json({ error: "symbol is required" });
    const tfMap = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1D": "1D", "1d": "1D" };
    const tf = tfMap[tfRaw] || "1D";

    const symbolInfo = splitSymbol(symbol);
    const yahooTicker = toYahooTicker(symbolInfo);
    const { rows } = await fetchYahooCandles(yahooTicker, tf);
    const closes = rows.map((r) => r.close);

    let details;
    if (strategy === "rsi_reversion") {
      details = runBacktestRsiReversion(
        closes,
        Number(req.body?.params?.rsiPeriod || 14),
        Number(req.body?.params?.entryRsi || 30),
        Number(req.body?.params?.exitRsi || 55)
      );
    } else {
      details = runBacktestEmaCrossDetailed(
        closes,
        Number(req.body?.params?.fastPeriod || 9),
        Number(req.body?.params?.slowPeriod || 21)
      );
    }

    const metrics = summarizeBacktest(details.trades, details.equityCurve);
    const result = {
      id: createEntityId("bt"),
      createdAt: Date.now(),
      symbol,
      timeframe: tf,
      strategy,
      params: req.body?.params || {},
      metrics,
      trades: details.trades.slice(-500),
      equityCurve: details.equityCurve.slice(-800)
    };

    const db = readDb();
    ensureUserFeatureState(db, req.user.sub);
    db.backtests[req.user.sub].push(result);
    db.backtests[req.user.sub] = db.backtests[req.user.sub].slice(-120);
    writeDb(db);
    res.json(result);
  } catch (error) {
    console.log("Backtest run error:", error.message);
    res.status(500).json({ error: "Backtest failed" });
  }
});

app.get("/api/backtest/history", authRequired, (req, res) => {
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  res.json({ items: (db.backtests[req.user.sub] || []).slice().reverse() });
});

app.get("/api/backtest/:id/export.csv", authRequired, (req, res) => {
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  const item = (db.backtests[req.user.sub] || []).find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Backtest not found" });

  const header = ["trade_no", "entry_index", "exit_index", "entry_price", "exit_price", "return_pct"].join(",");
  const lines = item.trades.map((t, i) =>
    [i + 1, t.entryIndex, t.exitIndex, t.entryPrice, t.exitPrice, toFixedNumber(t.returnPct, 4)].join(",")
  );
  const content = [header, ...lines].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=backtest-${item.id}.csv`);
  res.send(content);
});

app.get("/api/backtest/:id/export.pdf", authRequired, (req, res) => {
  const db = readDb();
  ensureUserFeatureState(db, req.user.sub);
  const item = (db.backtests[req.user.sub] || []).find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Backtest not found" });

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  doc.on("end", () => {
    const pdfData = Buffer.concat(chunks);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=backtest-${item.id}.pdf`);
    res.send(pdfData);
  });

  doc.fontSize(18).text("TradePro AI Backtest Report");
  doc.moveDown(0.7);
  doc.fontSize(11).text(`ID: ${item.id}`);
  doc.text(`Symbol: ${item.symbol}`);
  doc.text(`Timeframe: ${item.timeframe}`);
  doc.text(`Strategy: ${item.strategy}`);
  doc.text(`Generated: ${new Date(item.createdAt).toISOString()}`);
  doc.moveDown(0.7);
  doc.text(`Trades: ${item.metrics.trades}`);
  doc.text(`Win rate: ${item.metrics.winRate}%`);
  doc.text(`Expectancy: ${item.metrics.expectancyPct}%`);
  doc.text(`Sharpe: ${item.metrics.sharpe}`);
  doc.text(`Max drawdown: ${item.metrics.maxDrawdownPct}%`);
  doc.text(`Ending equity: ${item.metrics.endingEquity}`);
  doc.moveDown(0.8);
  doc.text("Recent Trades:");
  item.trades.slice(-12).forEach((t, idx) => {
    doc.text(
      `${idx + 1}. Entry#${t.entryIndex} @ ${toFixedNumber(t.entryPrice, 4)} | Exit#${t.exitIndex} @ ${toFixedNumber(t.exitPrice, 4)} | Return ${toFixedNumber(t.returnPct, 3)}%`
    );
  });
  doc.end();
});

app.get("/api/live/health", authRequired, (req, res) => {
  const alive = Array.from(liveFeedState.clients.values()).filter((entry) => Date.now() - entry.startedAt < 24 * 60 * 60 * 1000).length;
  res.json({
    connectedClients: alive,
    lastTickAt: liveFeedState.lastTickAt || 0,
    status: alive > 0 ? "streaming" : "idle"
  });
});

app.get("/api/live/stream", async (req, res) => {
  const token = String(req.query?.token || getBearerToken(req));
  const payload = verifyToken(token);
  if (!payload || payload.tokenType !== "access") {
    return res.status(401).json({ error: "Unauthorized stream token" });
  }

  const symbols = normalizeSymbolsList(req.query?.symbols || "", 16);
  if (!symbols.length) return res.status(400).json({ error: "symbols query is required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const streamId = createEntityId("live");
  const push = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let closed = false;
  const tick = async () => {
    if (closed) return;
    const quotes = {};
    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          quotes[symbol] = await fetchLatestPriceForSymbol(symbol);
        } catch {
          quotes[symbol] = null;
        }
      })
    );
    liveFeedState.lastTickAt = Date.now();
    push("quotes", { ts: liveFeedState.lastTickAt, quotes });
  };

  push("ready", { streamId, symbols, ts: Date.now() });
  tick();
  const timer = setInterval(tick, 4500);
  liveFeedState.clients.set(streamId, { userId: payload.sub, symbols, startedAt: Date.now(), timer });

  req.on("close", () => {
    closed = true;
    clearInterval(timer);
    liveFeedState.clients.delete(streamId);
  });
});

app.get("/api/portfolio/analytics", authRequired, async (req, res) => {
  try {
    const db = readDb();
    ensureUserFeatureState(db, req.user.sub);
    const state = db.paperTrading[req.user.sub];
    const prices = await runPaperAutomation(state);
    writeDb(db);

    const positions = Object.values(state.positions || {}).filter((p) => Number(p.qty) > 0);
    if (!positions.length) {
      return res.json({
        allocation: [],
        marketAllocation: [],
        correlation: { symbols: [], matrix: [] },
        risk: { var95DailyPct: 0, volatilityDailyPct: 0, riskScore: 0, sampleDays: 0 },
        rebalance: [],
        exposure: { byMarket: {}, byCountry: {}, bySector: {} }
      });
    }

    const valuation = positions.map((p) => {
      const px = Number(prices[p.symbol]) || Number(p.avgPrice) || 0;
      const value = px * Number(p.qty || 0);
      const info = splitSymbol(p.symbol);
      return { symbol: p.symbol, marketType: info.marketType, exchange: info.exchange, value, qty: p.qty, price: px };
    });
    const totalValue = valuation.reduce((s, v) => s + Math.max(0, v.value), 0) || 1;
    const allocation = valuation.map((v) => ({
      symbol: v.symbol,
      value: toFixedNumber(v.value, 2),
      weightPct: toFixedNumber((v.value / totalValue) * 100, 2)
    }));

    const byMarket = {};
    const byCountry = {};
    const bySector = {};
    valuation.forEach((v) => {
      byMarket[v.marketType] = (byMarket[v.marketType] || 0) + v.value;
      const country = v.marketType === "stock" ? "US" : v.marketType === "crypto" ? "Global" : "Multi";
      byCountry[country] = (byCountry[country] || 0) + v.value;
      const sector = v.marketType === "crypto" ? "Digital Assets" : v.marketType === "forex" ? "FX" : v.marketType === "futures" ? "Derivatives" : "Equities";
      bySector[sector] = (bySector[sector] || 0) + v.value;
    });

    const corrSymbols = allocation
      .slice()
      .sort((a, b) => b.weightPct - a.weightPct)
      .slice(0, 6)
      .map((a) => a.symbol);
    const returnMap = {};
    await Promise.all(
      corrSymbols.map(async (symbol) => {
        try {
          const info = splitSymbol(symbol);
          const { rows } = await fetchYahooCandles(toYahooTicker(info), "1D");
          returnMap[symbol] = computeReturnsFromCloses(rows.map((r) => r.close), 120);
        } catch {
          returnMap[symbol] = [];
        }
      })
    );

    const matrix = corrSymbols.map((rowSymbol) =>
      corrSymbols.map((colSymbol) => toFixedNumber(correlation(returnMap[rowSymbol] || [], returnMap[colSymbol] || []), 3))
    );

    const portfolioReturns = [];
    const weights = Object.fromEntries(allocation.map((a) => [a.symbol, a.weightPct / 100]));
    const depth = Math.min(...corrSymbols.map((s) => (returnMap[s] || []).length).filter((n) => n > 0), 120);
    if (Number.isFinite(depth) && depth > 1) {
      for (let i = 0; i < depth; i += 1) {
        let dayRet = 0;
        for (const s of corrSymbols) {
          const arr = returnMap[s] || [];
          const idx = arr.length - depth + i;
          dayRet += (Number(weights[s]) || 0) * (Number(arr[idx]) || 0);
        }
        portfolioReturns.push(dayRet);
      }
    }
    const sorted = portfolioReturns.slice().sort((a, b) => a - b);
    const var95 = -quantile(sorted, 0.05) * 100;
    const volatility = stdDev(portfolioReturns) * 100;
    const concentration = Math.max(...allocation.map((a) => a.weightPct));
    const riskScore = clamp((var95 * 4) + (volatility * 2) + (concentration * 0.5), 0, 100);

    const rebalance = allocation
      .filter((a) => a.weightPct > 45)
      .map((a) => ({
        symbol: a.symbol,
        action: "trim",
        reason: "Position concentration above 45%",
        targetWeightPct: 30
      }));

    res.json({
      allocation,
      marketAllocation: Object.entries(byMarket).map(([market, value]) => ({
        market,
        value: toFixedNumber(value, 2),
        weightPct: toFixedNumber((value / totalValue) * 100, 2)
      })),
      correlation: { symbols: corrSymbols, matrix },
      risk: {
        var95DailyPct: toFixedNumber(var95, 2),
        volatilityDailyPct: toFixedNumber(volatility, 2),
        riskScore: toFixedNumber(riskScore, 1),
        sampleDays: portfolioReturns.length
      },
      rebalance,
      exposure: { byMarket, byCountry, bySector }
    });
  } catch (error) {
    console.log("Portfolio analytics error:", error.message);
    res.status(500).json({ error: "Portfolio analytics failed" });
  }
});

app.get("/api/news-intel/:symbol", authRequired, async (req, res) => {
  try {
    const symbol = cleanSymbolInput(req.params.symbol);
    if (!symbol) return res.status(400).json({ error: "symbol is required" });
    const news = await fetchFinnhubNews(splitSymbol(symbol));
    const sentiment = sentimentFromNews(news);
    const items = news.slice(0, 25).map((item) => ({
      headline: String(item.headline || ""),
      source: String(item.source || ""),
      datetime: Number(item.datetime || 0) * 1000,
      url: String(item.url || ""),
      impact: impactFromHeadline(item.headline || "")
    }));
    const impactCounts = items.reduce((acc, item) => {
      acc[item.impact] = (acc[item.impact] || 0) + 1;
      return acc;
    }, { high: 0, medium: 0, low: 0 });
    res.json({
      symbol,
      sentiment,
      impactCounts,
      events: items.slice(0, 12)
    });
  } catch (error) {
    console.log("News intel error:", error.message);
    res.status(500).json({ error: "News intelligence failed" });
  }
});

app.get("/api/news-intel/digest", authRequired, async (req, res) => {
  try {
    const db = readDb();
    const fallbackWatchlist = db.watchlists[req.user.sub] || [];
    const symbols = normalizeSymbolsList(req.query?.symbols || fallbackWatchlist.join(","), 8);
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const digest = [];

    for (const symbol of symbols) {
      const news = await fetchFinnhubNews(splitSymbol(symbol));
      const sentiment = sentimentFromNews(news);
      const recent = news.filter((n) => Number(n.datetime || 0) * 1000 >= oneDayAgo);
      digest.push({
        symbol,
        sentiment,
        changedToday: recent.length > 0,
        headlinesToday: recent.length,
        topHeadline: String((recent[0] || news[0] || {}).headline || "No major change")
      });
    }
    res.json({ generatedAt: now, items: digest });
  } catch (error) {
    console.log("News digest error:", error.message);
    res.status(500).json({ error: "News digest failed" });
  }
});

app.get("/api/team/watchlists", authRequired, (req, res) => {
  const db = readDb();
  const userId = req.user.sub;
  const teams = Object.values(db.teamSpaces || {})
    .filter((team) => {
      ensureTeamShape(team);
      return Boolean(team.members[userId]);
    })
    .map((team) => ({
      id: team.id,
      name: team.name,
      role: team.members[userId],
      watchlist: team.watchlist || [],
      members: Object.keys(team.members || {}).length,
      updatedAt: team.updatedAt || 0
    }));
  res.json({ teams });
});

app.post("/api/team/watchlists", authRequired, (req, res) => {
  const db = readDb();
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  const id = createEntityId("team");
  db.teamSpaces[id] = {
    id,
    name,
    ownerId: req.user.sub,
    members: { [req.user.sub]: "admin" },
    watchlist: [],
    notes: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  writeDb(db);
  res.json({ team: db.teamSpaces[id] });
});

app.post("/api/team/watchlists/:id/members", authRequired, (req, res) => {
  const db = readDb();
  const access = resolveTeamAccess(db, String(req.params.id || ""), req.user.sub);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (access.role !== "admin") return res.status(403).json({ error: "Only admin can manage members" });

  const username = String(req.body?.username || "").trim();
  const roleRaw = String(req.body?.role || "viewer").toLowerCase();
  const role = ["admin", "trader", "viewer"].includes(roleRaw) ? roleRaw : "viewer";
  const user = findUserByUsername(db, username);
  if (!user) return res.status(404).json({ error: "User not found" });
  access.team.members[user.id] = role;
  access.team.updatedAt = Date.now();
  writeDb(db);
  res.json({ ok: true, members: access.team.members });
});

app.post("/api/team/watchlists/:id/items", authRequired, (req, res) => {
  const db = readDb();
  const access = resolveTeamAccess(db, String(req.params.id || ""), req.user.sub);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (!["admin", "trader"].includes(access.role)) return res.status(403).json({ error: "No write permission" });

  const symbol = cleanSymbolInput(req.body?.symbol);
  if (!symbol) return res.status(400).json({ error: "symbol is required" });
  if (!access.team.watchlist.includes(symbol)) access.team.watchlist.unshift(symbol);
  access.team.watchlist = access.team.watchlist.slice(0, 50);
  access.team.updatedAt = Date.now();
  writeDb(db);
  res.json({ watchlist: access.team.watchlist });
});

app.delete("/api/team/watchlists/:id/items/:symbol", authRequired, (req, res) => {
  const db = readDb();
  const access = resolveTeamAccess(db, String(req.params.id || ""), req.user.sub);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (!["admin", "trader"].includes(access.role)) return res.status(403).json({ error: "No write permission" });

  const symbol = cleanSymbolInput(req.params.symbol);
  access.team.watchlist = access.team.watchlist.filter((item) => item !== symbol);
  access.team.updatedAt = Date.now();
  writeDb(db);
  res.json({ watchlist: access.team.watchlist });
});

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "tradepro-ai-backend" });
});

app.get("/api/quote/:symbol", async (req, res) => {
  try {
    const symbolInfo = splitSymbol(req.params.symbol);
    const response = await axios.get("https://finnhub.io/api/v1/quote", {
      params: { symbol: symbolInfo.apiSymbol, token: FINNHUB_KEY },
      timeout: 10000
    });
    res.json(response.data || {});
  } catch (error) {
    console.log("Quote Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Quote API Error" });
  }
});

app.get("/api/history/:symbol", async (req, res) => {
  try {
    const symbolInfo = splitSymbol(req.params.symbol);
    const to = Math.floor(Date.now() / 1000);
    const from = to - 100 * 24 * 60 * 60;

    const response = await axios.get("https://finnhub.io/api/v1/indicator", {
      params: {
        symbol: symbolInfo.apiSymbol,
        resolution: "D",
        from,
        to,
        indicator: "rsi",
        timeperiod: 14,
        token: FINNHUB_KEY
      },
      timeout: 10000
    });

    const rsi = response.data?.rsi;
    if (Array.isArray(rsi) && rsi.length > 0) {
      return res.json({ latestRSI: rsi[rsi.length - 1], source: "finnhub" });
    }

    res.json({ latestRSI: 50, source: "fallback" });
  } catch (error) {
    console.log("History Warning:", error.response?.data || error.message);
    res.json({ latestRSI: 50, source: "fallback" });
  }
});

app.get("/api/news/:symbol", async (req, res) => {
  const symbolInfo = splitSymbol(req.params.symbol);
  const news = await fetchFinnhubNews(symbolInfo);
  res.json(news);
});

app.get("/api/profile/:symbol", async (req, res) => {
  try {
    const symbolInfo = splitSymbol(req.params.symbol);
    const marketType = symbolInfo.marketType;
    const ticker = toYahooTicker(symbolInfo);

    if (!FINNHUB_KEY || (marketType !== "stock" && marketType !== "options")) {
      return res.json({
        symbol: symbolInfo.original,
        ticker,
        name: ticker,
        logo: "",
        marketType
      });
    }

    const response = await axios.get("https://finnhub.io/api/v1/stock/profile2", {
      params: {
        symbol: ticker,
        token: FINNHUB_KEY
      },
      timeout: 10000
    });

    const profile = response.data && typeof response.data === "object" ? response.data : {};
    return res.json({
      symbol: symbolInfo.original,
      ticker,
      name: String(profile.name || ticker),
      logo: String(profile.logo || ""),
      marketType
    });
  } catch (error) {
    const symbolInfo = splitSymbol(req.params.symbol);
    const ticker = toYahooTicker(symbolInfo);
    console.log("Profile Warning:", error.response?.data || error.message);
    return res.json({
      symbol: symbolInfo.original,
      ticker,
      name: ticker,
      logo: "",
      marketType: symbolInfo.marketType
    });
  }
});
app.get("/api/ai/:symbol", async (req, res) => {
  try {
    const symbolInfo = splitSymbol(req.params.symbol);
    const rawTf = String(req.query.tf || "1D").trim();
    const tfMap = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1D", "1D": "1D" };
    const tf = tfMap[rawTf] || "1D";
    const strategy = String(req.query.strategy || "swing").toLowerCase();

    const yahooTicker = toYahooTicker(symbolInfo);
    const [{ rows }, marketCap, news] = await Promise.all([
      fetchYahooCandles(yahooTicker, tf),
      fetchMarketCap(yahooTicker, symbolInfo.marketType),
      fetchFinnhubNews(symbolInfo)
    ]);

    const sentiment = sentimentFromNews(news);
    const payload = computeAiPayload(rows, tf, strategy, sentiment, marketCap, symbolInfo);

    res.json(payload);
  } catch (error) {
    console.log("AI Error:", error.response?.data || error.message);
    res.status(500).json({ error: "AI analytics failed" });
  }
});

function normalizeAssistantSymbol(input) {
  let symbol = String(input || "")
    .toUpperCase()
    .trim()
    .replace(/[.,!?;:]+$/g, "")
    .replace(/\s+/g, "")
    .replace(/\//g, "");

  if (!symbol) return "";
  if (/^(BTC|ETH|SOL|XRP|BNB|ADA|DOGE|LTC)$/.test(symbol)) symbol = `${symbol}USDT`;
  if (/^(BTC|ETH|SOL|XRP|BNB|ADA|DOGE|LTC)USD$/.test(symbol)) symbol = `${symbol}T`;
  if (/^([A-Z0-9]{2,10})(USDT|USDC|BUSD|USD)$/.test(symbol)) {
    return symbol.replace(/(USDT|USDC|BUSD|USD)$/i, "/$1");
  }
  return symbol;
}

function extractAssistantJson(content) {
  const text = String(content || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting first JSON object.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parseAssistantCommandRuleBased(text) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();
  if (!raw) {
    return { action: "chat", reply: "Please say a command so I can help." };
  }

  if (/dashboard|open dashboard|go dashboard/.test(lower)) {
    return { action: "dashboard", reply: "Opening dashboard." };
  }

  if (/portfolio/.test(lower)) {
    return { action: "chat", reply: "Portfolio feature is disabled." };
  }

  const compareMatch = raw.match(/compare\s+(.+?)\s+(?:and|vs)\s+(.+)$/i);
  if (compareMatch) {
    const first = normalizeAssistantSymbol(compareMatch[1]);
    const second = normalizeAssistantSymbol(compareMatch[2]);
    if (first && second) {
      return { action: "compare", first, second, reply: `Comparing ${first} and ${second}.` };
    }
  }

  const symbolMatch = raw.match(/([A-Z]{1,8}:[A-Z0-9!./-]+|[A-Z]{1,6}\d{6}[CP]\d{8}|[A-Z]{1,12}(?:\/(?:USDT|USDC|BUSD|USD))?)/i);
  const symbol = normalizeAssistantSymbol(symbolMatch?.[1] || "");

  if (/(price|quote|analyze|analysis|chart)/.test(lower) && symbol) {
    return { action: "analyze", symbol, reply: `Analyzing ${symbol}.` };
  }
  if (symbol) {
    return { action: "analyze", symbol, reply: `Analyzing ${symbol}.` };
  }

  return {
    action: "chat",
    reply: "Try: analyze AAPL, show price of BTCUSDT, compare NVDA and MSFT, or open dashboard."
  };
}

async function parseAssistantWithOpenAI(text, page) {
  const systemPrompt = [
    "You are a trading voice command parser.",
    "Return ONLY valid JSON with keys:",
    "action: one of dashboard, analyze, compare, chat",
    "symbol: string or empty",
    "first: string or empty",
    "second: string or empty",
    "reply: short helpful response",
    "Parse user command for a trading web app.",
    "If command is ambiguous, action=chat.",
    "If compare command found, set action=compare and fill first/second.",
    "If stock/crypto/forex/options symbol found, action=analyze and fill symbol."
  ].join(" ");

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: OPENAI_MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `page=${String(page || "").slice(0, 40)}\ncommand=${text}`
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 15000
    }
  );

  const content = response.data?.choices?.[0]?.message?.content || "";
  const parsed = extractAssistantJson(content);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid assistant JSON response");
  }

  const action = String(parsed.action || "chat").toLowerCase();
  const payload = {
    action: ["dashboard", "analyze", "compare", "chat"].includes(action) ? action : "chat",
    symbol: normalizeAssistantSymbol(parsed.symbol || ""),
    first: normalizeAssistantSymbol(parsed.first || ""),
    second: normalizeAssistantSymbol(parsed.second || ""),
    reply: String(parsed.reply || "Done.")
  };

  if (payload.action === "compare" && (!payload.first || !payload.second)) {
    return parseAssistantCommandRuleBased(text);
  }
  if (payload.action === "analyze" && !payload.symbol) {
    return parseAssistantCommandRuleBased(text);
  }
  return payload;
}

app.post("/api/assistant/respond", async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    const page = String(req.body?.page || "").trim().toLowerCase();
    if (!text) {
      return res.status(400).json({ action: "chat", reply: "Please say a command so I can help." });
    }

    let result;
    if (OPENAI_API_KEY) {
      try {
        result = await parseAssistantWithOpenAI(text, page);
      } catch (error) {
        console.log("Assistant OpenAI Warning:", error.response?.data || error.message);
        result = parseAssistantCommandRuleBased(text);
      }
    } else {
      result = parseAssistantCommandRuleBased(text);
    }

    return res.json(result);
  } catch (error) {
    console.log("Assistant Error:", error.message);
    return res.status(500).json({ action: "chat", reply: "Assistant is temporarily unavailable." });
  }
});

function toPositiveNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function getEffectiveAnnualReturn(annualReturnPct, inflationRatePct, useInflation) {
  const annual = toPositiveNumber(annualReturnPct, 0) / 100;
  const inflation = toPositiveNumber(inflationRatePct, 0) / 100;
  if (!useInflation) return annual;
  return (1 + annual) / (1 + inflation) - 1;
}

function sipFutureValue(monthlyInvestment, annualReturnPct, durationYears, inflationRatePct = 0, useInflation = false) {
  const P = toPositiveNumber(monthlyInvestment, 0);
  const years = toPositiveNumber(durationYears, 0);
  const n = Math.round(years * 12);
  const annual = getEffectiveAnnualReturn(annualReturnPct, inflationRatePct, useInflation);
  const r = annual / 12;

  if (n <= 0 || P <= 0) {
    return { futureValue: 0, totalInvested: 0, profit: 0, annual, monthlyRate: r };
  }

  const fv = Math.abs(r) < 1e-12
    ? P * n
    : P * (((Math.pow(1 + r, n) - 1) / r) * (1 + r));
  const totalInvested = P * n;
  const profit = fv - totalInvested;

  return {
    futureValue: toFixedNumber(fv, 2),
    totalInvested: toFixedNumber(totalInvested, 2),
    profit: toFixedNumber(profit, 2),
    annual,
    monthlyRate: r
  };
}

function sipProjectionByYear(monthlyInvestment, annualReturnPct, durationYears, inflationRatePct = 0, useInflation = false) {
  const years = Math.max(1, Math.floor(toPositiveNumber(durationYears, 0)));
  const points = [];
  for (let y = 1; y <= years; y += 1) {
    const result = sipFutureValue(monthlyInvestment, annualReturnPct, y, inflationRatePct, useInflation);
    points.push({
      year: y,
      projectedValue: result.futureValue,
      totalInvested: result.totalInvested
    });
  }
  return points;
}

function requiredMonthlyForGoal(targetAmount, annualReturnPct, durationYears, inflationRatePct = 0, useInflation = false) {
  const target = toPositiveNumber(targetAmount, 0);
  const years = toPositiveNumber(durationYears, 0);
  const n = Math.round(years * 12);
  const annual = getEffectiveAnnualReturn(annualReturnPct, inflationRatePct, useInflation);
  const r = annual / 12;

  if (target <= 0 || n <= 0) {
    return { requiredMonthlyInvestment: 0, annual };
  }

  let monthly = 0;
  if (Math.abs(r) < 1e-12) {
    monthly = target / n;
  } else {
    const factor = ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
    monthly = target / factor;
  }

  return { requiredMonthlyInvestment: toFixedNumber(monthly, 2), annual };
}

app.post("/api/sip-calculate", (req, res) => {
  try {
    const monthlyInvestment = toPositiveNumber(req.body?.monthlyInvestment, 0);
    const annualReturn = toPositiveNumber(req.body?.annualReturn, 0);
    const durationYears = toPositiveNumber(req.body?.durationYears, 0);
    const inflationRate = toPositiveNumber(req.body?.inflationRate, 0);
    const useInflation = Boolean(req.body?.useInflation);

    const result = sipFutureValue(monthlyInvestment, annualReturn, durationYears, inflationRate, useInflation);
    const projection = sipProjectionByYear(monthlyInvestment, annualReturn, durationYears, inflationRate, useInflation);

    res.json({
      monthlyInvestment,
      annualReturn,
      durationYears,
      inflationRate,
      usedInflation: useInflation,
      realAnnualReturnPct: toFixedNumber(result.annual * 100, 4),
      totalInvested: result.totalInvested,
      futureValue: result.futureValue,
      profit: result.profit,
      projection
    });
  } catch (error) {
    console.log("SIP Calculate Error:", error.message);
    res.status(500).json({ error: "SIP calculation failed" });
  }
});

app.post("/api/sip-goal", (req, res) => {
  try {
    const targetAmount = toPositiveNumber(req.body?.targetAmount, 0);
    const annualReturn = toPositiveNumber(req.body?.annualReturn, 0);
    const durationYears = toPositiveNumber(req.body?.durationYears, 0);
    const inflationRate = toPositiveNumber(req.body?.inflationRate, 0);
    const useInflation = Boolean(req.body?.useInflation);

    const result = requiredMonthlyForGoal(targetAmount, annualReturn, durationYears, inflationRate, useInflation);

    res.json({
      targetAmount,
      annualReturn,
      durationYears,
      inflationRate,
      usedInflation: useInflation,
      realAnnualReturnPct: toFixedNumber(result.annual * 100, 4),
      requiredMonthlyInvestment: result.requiredMonthlyInvestment
    });
  } catch (error) {
    console.log("SIP Goal Error:", error.message);
    res.status(500).json({ error: "SIP goal calculation failed" });
  }
});

app.post("/api/sip-pdf", (req, res) => {
  try {
    const monthlyInvestment = toPositiveNumber(req.body?.monthlyInvestment, 0);
    const annualReturn = toPositiveNumber(req.body?.annualReturn, 0);
    const durationYears = toPositiveNumber(req.body?.durationYears, 0);
    const inflationRate = toPositiveNumber(req.body?.inflationRate, 0);
    const useInflation = Boolean(req.body?.useInflation);

    const result = sipFutureValue(monthlyInvestment, annualReturn, durationYears, inflationRate, useInflation);

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const pdfData = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=sip-plan-report.pdf");
      res.send(pdfData);
    });

    doc.fontSize(20).text("TradePro AI - Smart SIP Planner Report", { align: "left" });
    doc.moveDown(1);
    doc.fontSize(12);
    doc.text(`Monthly Investment: INR ${monthlyInvestment.toLocaleString()}`);
    doc.text(`Total Invested: INR ${Number(result.totalInvested || 0).toLocaleString()}`);
    doc.text(`Estimated Future Value: INR ${Number(result.futureValue || 0).toLocaleString()}`);
    doc.text(`Estimated Profit: INR ${Number(result.profit || 0).toLocaleString()}`);
    doc.text(`Investment Duration: ${durationYears} years`);
    doc.text(`Expected Annual Return: ${annualReturn}%`);
    doc.text(`Inflation Rate: ${inflationRate}%`);
    doc.text(`Inflation Adjustment Used: ${useInflation ? "Yes" : "No"}`);
    doc.text(`Effective Annual Return Used: ${Number(result.annual * 100).toFixed(4)}%`);
    doc.moveDown(1);
    doc.text(`Generated On: ${new Date().toISOString()}`);
    doc.end();
  } catch (error) {
    console.log("SIP PDF Error:", error.message);
    res.status(500).json({ error: "SIP PDF generation failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


