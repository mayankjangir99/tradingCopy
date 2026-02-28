(function () {
  const API_BASE = "http://localhost:3000";
  const ACCESS_KEY = "tp_access_token";
  const REFRESH_KEY = "tp_refresh_token";
  const USER_KEY = "tp_user";
  const THEME_KEY = "tp_theme";
  const CURRENCY_KEY = "tp_currency";
  const CURRENCY_RATES_KEY = "tp_currency_rates_usd";
  const RELOAD_MARKER_KEY = "tp_pending_reload";
  const SUPPORTED_CURRENCIES = ["USD", "EUR", "INR", "GBP", "JPY", "AUD", "CAD", "AED", "SGD", "CHF"];
  const FALLBACK_USD_RATES = {
    USD: 1,
    EUR: 0.92,
    INR: 83.0,
    GBP: 0.79,
    JPY: 150.0,
    AUD: 1.52,
    CAD: 1.36,
    AED: 3.67,
    SGD: 1.35,
    CHF: 0.88
  };
  let currencyCode = "USD";
  let usdRates = { ...FALLBACK_USD_RATES };
  let reloadScheduled = false;

  function readStorage(key) {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || "";
  }

  function writeStorage(key, value, persist) {
    const target = persist ? localStorage : sessionStorage;
    const secondary = persist ? sessionStorage : localStorage;
    if (value === null || value === undefined || value === "") {
      target.removeItem(key);
      secondary.removeItem(key);
      return;
    }
    target.setItem(key, String(value));
    secondary.removeItem(key);
  }

  function setSession(tokens, persist) {
    writeStorage(ACCESS_KEY, tokens.accessToken, persist);
    writeStorage(REFRESH_KEY, tokens.refreshToken, persist);
  }

  function getAccessToken() {
    return readStorage(ACCESS_KEY);
  }

  function clearSession() {
    writeStorage(ACCESS_KEY, "", true);
    writeStorage(REFRESH_KEY, "", true);
    writeStorage(USER_KEY, "", true);
    localStorage.removeItem("auth");
    sessionStorage.removeItem("auth");
  }

  function markLegacyAuth(persist) {
    if (persist) localStorage.setItem("auth", "true");
    else sessionStorage.setItem("auth", "true");
  }

  async function parseApiError(response, fallbackMessage) {
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (payload && payload.error) return String(payload.error);
    if (response.status === 404) {
      return `Auth service not found at ${API_BASE}. Start backend server or check port.`;
    }
    return fallbackMessage;
  }

  async function login(username, password, persist) {
    let response;
    try {
      response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
    } catch {
      throw new Error(`Cannot reach backend at ${API_BASE}.`);
    }
    if (!response.ok) {
      throw new Error(await parseApiError(response, "Login failed"));
    }
    const data = await response.json();
    setSession(data, persist);
    writeStorage(USER_KEY, JSON.stringify(data.user || {}), persist);
    markLegacyAuth(persist);
    return data;
  }

  async function socialLogin(provider, idToken, persist) {
    let response;
    try {
      response = await fetch(`${API_BASE}/api/auth/social`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, idToken })
      });
    } catch {
      throw new Error(`Cannot reach backend at ${API_BASE}.`);
    }
    if (!response.ok) {
      throw new Error(await parseApiError(response, "Social login failed"));
    }
    const data = await response.json();
    setSession(data, persist);
    writeStorage(USER_KEY, JSON.stringify(data.user || {}), persist);
    markLegacyAuth(persist);
    return data;
  }

  async function register(displayName, username, password, persist) {
    let response;
    try {
      response = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, username, password })
      });
    } catch {
      throw new Error(`Cannot reach backend at ${API_BASE}.`);
    }
    if (!response.ok) {
      throw new Error(await parseApiError(response, "Registration failed"));
    }
    const data = await response.json();
    setSession(data, persist);
    writeStorage(USER_KEY, JSON.stringify(data.user || {}), persist);
    markLegacyAuth(persist);
    return data;
  }

  async function refreshAccessToken() {
    const refreshToken = readStorage(REFRESH_KEY);
    if (!refreshToken) throw new Error("No refresh token");

    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    if (!response.ok) {
      clearSession();
      throw new Error("Session expired");
    }
    const data = await response.json();
    const persist = Boolean(localStorage.getItem(REFRESH_KEY));
    writeStorage(ACCESS_KEY, data.accessToken, persist);
    markLegacyAuth(persist);
    return data.accessToken;
  }

  async function apiFetch(endpoint, options) {
    const requestOptions = options ? { ...options } : {};
    requestOptions.headers = { ...(requestOptions.headers || {}) };
    let accessToken = readStorage(ACCESS_KEY);

    if (!accessToken && readStorage(REFRESH_KEY)) {
      accessToken = await refreshAccessToken();
    }

    if (accessToken) {
      requestOptions.headers.Authorization = `Bearer ${accessToken}`;
    }

    let response = await fetch(`${API_BASE}${endpoint}`, requestOptions);
    if (response.status === 401 && readStorage(REFRESH_KEY)) {
      accessToken = await refreshAccessToken();
      requestOptions.headers.Authorization = `Bearer ${accessToken}`;
      response = await fetch(`${API_BASE}${endpoint}`, requestOptions);
    }
    return response;
  }

  async function ensureAuthenticated() {
    const accessToken = readStorage(ACCESS_KEY);
    const refreshToken = readStorage(REFRESH_KEY);
    if (!accessToken && !refreshToken) throw new Error("No active session");

    const response = await apiFetch("/api/auth/me");
    if (!response.ok) {
      if (response.status === 401) {
        clearSession();
        throw new Error("Authentication failed");
      }
      throw new Error(`Auth check failed (${response.status})`);
    }
    return response.json();
  }

  async function logout() {
    const refreshToken = readStorage(REFRESH_KEY);
    try {
      if (refreshToken) {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken })
        });
      }
    } catch {
      // Best effort only.
    } finally {
      clearSession();
    }
  }

  function getUser() {
    try {
      return JSON.parse(readStorage(USER_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function normalizeCurrency(input) {
    const code = String(input || "").toUpperCase().trim();
    return SUPPORTED_CURRENCIES.includes(code) ? code : "USD";
  }

  function readCachedRates() {
    try {
      const raw = localStorage.getItem(CURRENCY_RATES_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || typeof parsed.rates !== "object") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeCachedRates(rates) {
    try {
      localStorage.setItem(CURRENCY_RATES_KEY, JSON.stringify({ ts: Date.now(), rates }));
    } catch {
      // Ignore storage errors.
    }
  }

  async function refreshCurrencyRates() {
    try {
      const symbols = SUPPORTED_CURRENCIES.join(",");
      const response = await fetch(`https://api.exchangerate.host/latest?base=USD&symbols=${symbols}`);
      if (!response.ok) return usdRates;
      const data = await response.json();
      const nextRates = data && data.rates && typeof data.rates === "object" ? data.rates : null;
      if (!nextRates || !Number.isFinite(Number(nextRates.USD || 1))) return usdRates;
      usdRates = { ...FALLBACK_USD_RATES, ...nextRates, USD: 1 };
      writeCachedRates(usdRates);
      return usdRates;
    } catch {
      return usdRates;
    }
  }

  function getCurrency() {
    return currencyCode;
  }

  function ensureGlobalLoader() {
    if (!document.body) return null;
    let styleTag = document.getElementById("tp-global-loader-style");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "tp-global-loader-style";
      styleTag.textContent = `
        .tp-global-loader {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: none;
          align-items: center;
          justify-content: center;
          background: rgba(8, 16, 30, 0.35);
          backdrop-filter: blur(6px);
        }
        .tp-global-loader.show {
          display: flex;
        }
        .tp-global-loader-card {
          min-width: 220px;
          max-width: min(92vw, 420px);
          border: 1px solid rgba(122, 180, 255, 0.32);
          border-radius: 14px;
          background: rgba(10, 20, 38, 0.9);
          color: #e8f0ff;
          padding: 16px 18px;
          text-align: center;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
        }
        .tp-global-loader-spinner {
          width: 34px;
          height: 34px;
          margin: 2px auto 10px;
          border: 3px solid rgba(122, 180, 255, 0.3);
          border-top-color: #57b6ff;
          border-radius: 50%;
          animation: tpLoaderSpin 0.8s linear infinite;
        }
        .tp-global-loader-text {
          font-size: 14px;
          letter-spacing: 0.2px;
        }
        .tp-hard-refresh-btn.tp-inline {
          white-space: nowrap;
        }
        .tp-hard-refresh-btn.tp-fallback {
          position: fixed;
          right: 12px;
          top: 12px;
          z-index: 99950;
          border: 1px solid rgba(122, 180, 255, 0.42);
          border-radius: 999px;
          background: rgba(10, 20, 38, 0.9);
          color: #e8f0ff;
          min-height: 34px;
          padding: 7px 10px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.2px;
          cursor: pointer;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
        }
        @keyframes tpLoaderSpin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(styleTag);
    }

    let overlay = document.getElementById("tp-global-loader");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "tp-global-loader";
      overlay.className = "tp-global-loader";
      overlay.innerHTML = `
        <div class="tp-global-loader-card" role="status" aria-live="polite" aria-label="Loading">
          <div class="tp-global-loader-spinner"></div>
          <div class="tp-global-loader-text" id="tp-global-loader-text">Loading...</div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function showGlobalLoader(text) {
    const overlay = ensureGlobalLoader();
    if (!overlay) return;
    const textEl = document.getElementById("tp-global-loader-text");
    if (textEl) textEl.textContent = text || "Loading...";
    overlay.classList.add("show");
  }

  function hideGlobalLoader() {
    const overlay = document.getElementById("tp-global-loader");
    if (overlay) overlay.classList.remove("show");
  }

  async function hardRefreshNow() {
    if (reloadScheduled) return;
    reloadScheduled = true;
    try {
      sessionStorage.setItem(RELOAD_MARKER_KEY, JSON.stringify({ reason: "hard-refresh", ts: Date.now() }));
    } catch {
      // Ignore storage errors.
    }
    showGlobalLoader("Hard refreshing...");
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {
      // Ignore cache clear errors.
    }
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("_r");
    nextUrl.searchParams.delete("_hr");
    nextUrl.searchParams.set("_hr", String(Date.now()));
    setTimeout(() => {
      window.location.replace(nextUrl.toString());
    }, 180);
  }

  function injectHardRefreshButton() {
    if (!document.body) return;
    let btn = document.getElementById("tp-hard-refresh-btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "tp-hard-refresh-btn";
      btn.type = "button";
      btn.textContent = "Hard Refresh";
      btn.setAttribute("aria-label", "Hard Refresh (Ctrl+F5)");
      btn.title = "Hard Refresh (Ctrl+F5)";
      btn.addEventListener("click", () => {
        btn.disabled = true;
        btn.textContent = "Refreshing...";
        hardRefreshNow().catch(() => {
          window.location.reload();
        });
      });
    }

    const existingActions = document.querySelector(".page-head .page-actions");
    if (existingActions) {
      btn.className = "btn ghost btn-auto tp-hard-refresh-btn tp-inline";
      existingActions.prepend(btn);
      return;
    }

    const pageHead = document.querySelector(".page-head");
    if (pageHead) {
      let actions = pageHead.querySelector(".page-actions");
      if (!actions) {
        actions = document.createElement("div");
        actions.className = "page-actions";
        pageHead.appendChild(actions);
      }
      btn.className = "btn ghost btn-auto tp-hard-refresh-btn tp-inline";
      actions.prepend(btn);
      return;
    }

    btn.className = "tp-hard-refresh-btn tp-fallback";
    if (!btn.parentElement) {
      document.body.appendChild(btn);
    }
  }

  function installHardRefreshShortcut() {
    window.addEventListener("keydown", (event) => {
      const key = String(event.key || "").toLowerCase();
      const trigger = (event.ctrlKey && key === "f5") || (event.ctrlKey && event.shiftKey && key === "r");
      if (!trigger) return;
      event.preventDefault();
      hardRefreshNow().catch(() => {
        window.location.reload();
      });
    });
  }

  function forceReloadWithLoader(reason) {
    if (reloadScheduled) return;
    reloadScheduled = true;
    const label = reason === "theme" ? "Applying theme..." : reason === "currency" ? "Applying currency..." : "Refreshing page...";
    try {
      sessionStorage.setItem(RELOAD_MARKER_KEY, JSON.stringify({ reason, ts: Date.now() }));
    } catch {
      // Ignore storage errors.
    }
    showGlobalLoader(label);
    setTimeout(() => {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("_r", String(Date.now()));
      window.location.replace(nextUrl.toString());
    }, 240);
  }

  function bootPendingReloadOverlay() {
    let pending = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(RELOAD_MARKER_KEY) || "null");
    } catch {
      pending = null;
    }
    if (!pending || typeof pending !== "object") return;

    const now = Date.now();
    if (!Number.isFinite(Number(pending.ts)) || now - Number(pending.ts) > 7000) {
      sessionStorage.removeItem(RELOAD_MARKER_KEY);
      return;
    }

    const label = pending.reason === "theme"
      ? "Theme updated. Reloading..."
      : pending.reason === "currency"
        ? "Currency updated. Reloading..."
        : "Loading...";
    const show = () => showGlobalLoader(label);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", show, { once: true });
    } else {
      show();
    }

    const clear = () => {
      setTimeout(() => {
        hideGlobalLoader();
        sessionStorage.removeItem(RELOAD_MARKER_KEY);
      }, 320);
    };
    if (document.readyState === "complete") clear();
    else window.addEventListener("load", clear, { once: true });
  }

  function updateCurrencyBadges() {
    const badges = document.querySelectorAll("[data-currency-badge]");
    badges.forEach((node) => {
      node.textContent = `Currency: ${currencyCode}`;
    });
  }

  function convertFromUSD(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return Number.NaN;
    const rate = Number(usdRates[currencyCode] || 1);
    if (!Number.isFinite(rate) || rate <= 0) return n;
    return n * rate;
  }

  function formatMoney(value, options = {}) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    const digits = Number.isFinite(Number(options.digits)) ? Number(options.digits) : 2;
    const assumeUSD = options.assumeUSD !== false;
    const converted = assumeUSD ? convertFromUSD(n) : n;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
        maximumFractionDigits: digits
      }).format(converted);
    } catch {
      return `${currencyCode} ${converted.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
    }
  }

  async function setCurrency(nextCode) {
    currencyCode = normalizeCurrency(nextCode);
    localStorage.setItem(CURRENCY_KEY, currencyCode);
    updateCurrencyBadges();
    if (hasSession()) {
      try {
        await apiFetch("/api/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferences: { currency: currencyCode } })
        });
      } catch (error) {
        console.log("Currency sync warning:", error.message);
      }
    }
    window.dispatchEvent(new CustomEvent("tp:currency-changed", { detail: { currency: currencyCode, source: "local" } }));
    return currencyCode;
  }

  async function hydrateCurrency() {
    const cached = normalizeCurrency(localStorage.getItem(CURRENCY_KEY) || "USD");
    currencyCode = cached;
    const storedRates = readCachedRates();
    if (storedRates?.rates) {
      usdRates = { ...FALLBACK_USD_RATES, ...storedRates.rates, USD: 1 };
    }
    refreshCurrencyRates();

    if (!hasSession()) return currencyCode;
    try {
      const response = await apiFetch("/api/preferences");
      if (!response.ok) return currencyCode;
      const data = await response.json();
      const serverCurrency = normalizeCurrency(data?.preferences?.currency || currencyCode);
      currencyCode = serverCurrency;
      localStorage.setItem(CURRENCY_KEY, currencyCode);
    } catch (error) {
      console.log("Currency hydrate warning:", error.message);
    }
    updateCurrencyBadges();
    return currencyCode;
  }

  function applyTheme(theme) {
    const safeTheme = ["dark", "light", "neon"].includes(String(theme || "").toLowerCase())
      ? String(theme || "").toLowerCase()
      : "dark";
    document.documentElement.setAttribute("data-theme", safeTheme);
    localStorage.setItem(THEME_KEY, safeTheme);
    return safeTheme;
  }

  async function setTheme(theme) {
    const safeTheme = applyTheme(theme);
    if (!hasSession()) {
      window.dispatchEvent(new CustomEvent("tp:theme-changed", { detail: { theme: safeTheme, source: "local" } }));
      return safeTheme;
    }
    try {
      await apiFetch("/api/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: safeTheme })
      });
    } catch (error) {
      console.log("Theme sync warning:", error.message);
    }
    window.dispatchEvent(new CustomEvent("tp:theme-changed", { detail: { theme: safeTheme, source: "local" } }));
    return safeTheme;
  }

  async function hydrateTheme() {
    const cached = localStorage.getItem(THEME_KEY);
    if (cached) applyTheme(cached);
    if (!hasSession()) return;
    try {
      const response = await apiFetch("/api/theme");
      if (!response.ok) return;
      const data = await response.json();
      if (data && data.theme) applyTheme(data.theme);
    } catch (error) {
      console.log("Theme hydrate warning:", error.message);
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.log("SW register warning:", error.message);
      });
    });
  }

  function hasSession() {
    return Boolean(readStorage(ACCESS_KEY) || readStorage(REFRESH_KEY));
  }

  window.TradeProCore = {
    API_BASE,
    login,
    register,
    socialLogin,
    logout,
    apiFetch,
    ensureAuthenticated,
    getUser,
    getAccessToken,
    hasSession,
    applyTheme,
    setTheme,
    hydrateTheme,
    registerServiceWorker,
    getCurrency,
    setCurrency,
    hydrateCurrency,
    formatMoney,
    convertFromUSD,
    refreshCurrencyRates
  };

  window.addEventListener("storage", (event) => {
    if (event.key === CURRENCY_KEY) {
      currencyCode = normalizeCurrency(event.newValue || "USD");
      updateCurrencyBadges();
      window.dispatchEvent(new CustomEvent("tp:currency-changed", { detail: { currency: currencyCode, source: "storage" } }));
      return;
    }
    if (event.key === THEME_KEY) {
      const nextTheme = String(event.newValue || "dark");
      applyTheme(nextTheme);
      window.dispatchEvent(new CustomEvent("tp:theme-changed", { detail: { theme: nextTheme, source: "storage" } }));
    }
  });

  window.addEventListener("tp:currency-changed", (event) => {
    const source = String(event?.detail?.source || "local");
    if (source !== "local" && source !== "storage") return;
    forceReloadWithLoader("currency");
  });

  window.addEventListener("tp:theme-changed", (event) => {
    const source = String(event?.detail?.source || "local");
    if (source !== "local" && source !== "storage") return;
    forceReloadWithLoader("theme");
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      ensureGlobalLoader();
      injectHardRefreshButton();
    }, { once: true });
  } else {
    ensureGlobalLoader();
    injectHardRefreshButton();
  }
  installHardRefreshShortcut();
  bootPendingReloadOverlay();
  hydrateTheme();
  hydrateCurrency();
  updateCurrencyBadges();
  registerServiceWorker();
})();

